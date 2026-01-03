"""PDF generation using WeasyPrint"""

from flask import render_template
from io import BytesIO
import os

# Try to import WeasyPrint, but don't fail if it's not installed
try:
    from weasyprint import HTML
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False
    print("WeasyPrint not installed. PDF generation will return a placeholder.")

def generate_invoice_pdf(data):
    """
    Generate PDF from HTML template using WeasyPrint.

    Args:
        data: Dict containing all invoice data including:
            - invoice_no, po, date, mb_number
            - billing (name, address, gstin, state, state_code)
            - shipping (name, address, gstin, state, state_code)
            - products (list of dicts with name, hsn_code, quantity, rate, amount)
            - packing_charges
            - tax information (cgst, sgst, igst, etc.)
            - amount_in_words
            - company_info

    Returns:
        BytesIO: PDF file as bytes
    """
    try:
        # Get base path for static files
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        # Add paths to logo and signature images
        data['logo_path'] = os.path.join(base_path, 'static', 'images', 'logo.png')
        data['signature_path'] = os.path.join(base_path, 'static', 'images', 'signature.png')

        # Render HTML template with data
        html_string = render_template('invoice_template.html', **data)

        if WEASYPRINT_AVAILABLE:
            # Generate PDF using WeasyPrint
            pdf_file = BytesIO()
            HTML(string=html_string, base_url=base_path).write_pdf(pdf_file)
            pdf_file.seek(0)
            return pdf_file
        else:
            # Return HTML as placeholder for testing
            pdf_file = BytesIO()
            pdf_file.write(html_string.encode('utf-8'))
            pdf_file.seek(0)
            return pdf_file

    except Exception as e:
        print(f"Error generating PDF: {e}")
        raise
