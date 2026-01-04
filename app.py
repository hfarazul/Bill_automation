"""
Flask application for Globel Interiors India Invoice Automation
"""

from flask import Flask, render_template, request, send_file, jsonify, Response
import json
import os
from dotenv import load_dotenv
from utils.pdf_generator import generate_invoice_pdf, WEASYPRINT_AVAILABLE
from utils.tax_calculator import calculate_tax
from utils.number_to_words import amount_to_words
from utils.pdf_extractor import extract_data_from_pdf

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Load configuration files
def load_json_config(filename):
    """Load JSON configuration file"""
    filepath = os.path.join('config', filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.route('/')
def index():
    """Serve main invoice form"""
    return render_template('index.html')

@app.route('/api/products')
def get_products():
    """Return product catalog"""
    try:
        products = load_json_config('product_catalog.json')
        return jsonify(products)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products', methods=['POST'])
def add_product():
    """Add a new product to the catalog"""
    try:
        data = request.get_json()

        # Validate required fields
        if not data.get('name') or not data.get('name').strip():
            return jsonify({'error': 'Product name is required'}), 400

        if not data.get('hsn_code') or not data.get('hsn_code').strip():
            return jsonify({'error': 'HSN code is required'}), 400

        # Load existing catalog
        filepath = os.path.join('config', 'product_catalog.json')
        with open(filepath, 'r', encoding='utf-8') as f:
            catalog = json.load(f)

        # Check for duplicate names (case-insensitive)
        new_name = data['name'].strip()
        existing_names = [p['name'].lower() for p in catalog['products']]
        if new_name.lower() in existing_names:
            return jsonify({'error': 'A product with this name already exists'}), 409

        # Generate new ID
        max_id = max([p['id'] for p in catalog['products']], default=0)
        new_id = max_id + 1

        # Create new product
        new_product = {
            'id': new_id,
            'name': new_name,
            'hsn_code': data['hsn_code'].strip()
        }

        # Add to catalog and save
        catalog['products'].append(new_product)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(catalog, f, indent=2, ensure_ascii=False)

        return jsonify({
            'success': True,
            'message': 'Product saved to catalog',
            'product': new_product
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/states')
def get_states():
    """Return state codes"""
    try:
        states = load_json_config('state_codes.json')
        return jsonify(states)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/company')
def get_company_info():
    """Return company information"""
    try:
        company = load_json_config('company_info.json')
        return jsonify(company)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/extract-pdf', methods=['POST'])
def extract_pdf_data():
    """
    Extract invoice/PO data from uploaded PDF using GPT-4 Vision.

    Expects: multipart/form-data with 'pdf' file
    Returns: JSON with extracted data or error
    """
    try:
        # Check for file in request
        if 'pdf' not in request.files:
            return jsonify({'error': 'No PDF file provided'}), 400

        pdf_file = request.files['pdf']

        if pdf_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type
        if not pdf_file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'File must be a PDF'}), 400

        # Check file size (max 10MB)
        pdf_file.seek(0, 2)  # Seek to end
        file_size = pdf_file.tell()
        pdf_file.seek(0)  # Seek back to start

        if file_size > 10 * 1024 * 1024:
            return jsonify({'error': 'PDF file too large (max 10MB)'}), 400

        # Get API key
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key or api_key == 'sk-your-api-key-here':
            return jsonify({'error': 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env file'}), 500

        # Read PDF bytes
        pdf_bytes = pdf_file.read()

        # Extract data
        result = extract_data_from_pdf(pdf_bytes, api_key)

        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400

    except Exception as e:
        print(f"Error in PDF extraction: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/generate-invoice', methods=['POST'])
def generate_invoice():
    """
    Process form data and generate PDF invoice.

    Expected JSON payload:
    {
        'invoice_no': str,
        'po': str,
        'date': str,
        'mb_number': str,
        'billing': {
            'name': str,
            'address': str,
            'gstin': str,
            'state': str,
            'state_code': str
        },
        'shipping': {
            'name': str,
            'address': str,
            'gstin': str,
            'state': str,
            'state_code': str
        },
        'products': [{
            'name': str,
            'hsn_code': str,
            'quantity': int,
            'rate': float,
            'amount': float
        }],
        'packing_charges': float
    }
    """
    try:
        # Get JSON data from request
        data = request.get_json()

        # Validate required fields
        required_fields = ['invoice_no', 'date', 'billing', 'shipping', 'products']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Calculate subtotal from products
        subtotal = sum([float(p.get('amount', 0)) for p in data['products']])

        # Add packing charges
        packing_charges = float(data.get('packing_charges', 0))
        total_before_tax = subtotal + packing_charges

        # Load company information to get supplier state
        company_info = load_json_config('company_info.json')

        # Calculate tax based on SUPPLIER state vs CUSTOMER (billing) state
        # This is the correct GST rule: Delhi (supplier) vs Punjab (customer) = IGST
        tax_info = calculate_tax(
            company_info['state'],  # Supplier state (Delhi)
            data['billing']['state'],  # Customer/Billing state (e.g., Punjab)
            total_before_tax
        )

        # Convert total amount to words
        amount_words = amount_to_words(tax_info['total_after_tax'])

        # Prepare template data
        template_data = {
            'invoice_no': data['invoice_no'],
            'po': data.get('po', ''),
            'date': data['date'],
            'mb_number': data.get('mb_number', ''),
            'billing': data['billing'],
            'shipping': data['shipping'],
            'products': data['products'],
            'packing_charges': packing_charges,
            'subtotal': subtotal,
            'total_before_tax': total_before_tax,
            'tax_type': tax_info['tax_type'],
            'cgst': tax_info['cgst'],
            'sgst': tax_info['sgst'],
            'igst': tax_info['igst'],
            'total_tax': tax_info['total_tax'],
            'total_after_tax': tax_info['total_after_tax'],
            'amount_in_words': amount_words,
            'company_info': company_info
        }

        # Generate PDF (or HTML if WeasyPrint not available)
        pdf_bytes = generate_invoice_pdf(template_data)

        # Return file with appropriate mimetype
        if WEASYPRINT_AVAILABLE:
            return send_file(
                pdf_bytes,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"Invoice_{data['invoice_no']}.pdf"
            )
        else:
            # Return HTML directly in browser (testing mode without WeasyPrint)
            html_content = pdf_bytes.read().decode('utf-8')

            # Save HTML to local file
            invoice_dir = 'generated_invoices'
            os.makedirs(invoice_dir, exist_ok=True)  # Create directory if it doesn't exist

            invoice_filename = f"Invoice_{data['invoice_no']}.html"
            save_path = os.path.join(invoice_dir, invoice_filename)

            with open(save_path, 'w', encoding='utf-8') as f:
                f.write(html_content)

            print(f"[OK] Invoice saved to: {save_path}")

            return Response(html_content, mimetype='text/html')

    except Exception as e:
        print(f"Error generating invoice: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Run Flask application
    port = int(os.environ.get('PORT', 5000))
    print("Starting Globel Interiors India Invoice Automation System...")
    print(f"Access the application at: http://localhost:{port}")
    app.run(debug=False, host='0.0.0.0', port=port)
