# Globel Interiors India - Invoice Automation System

A Flask-based web application for automating furniture invoice generation, replacing manual Excel processes.

## Features

- 📄 **Automated Invoice Generation** - Generate professional GST-compliant invoices
- 🧮 **Smart Tax Calculation** - Automatic CGST/SGST (same state) or IGST (interstate) calculation
- 📦 **Product Catalog** - Pre-configured furniture products with HSN codes
- 🌍 **State Management** - All Indian states with GST state codes
- ✍️ **Digital Signature** - Integrated signature support
- 📅 **Date Format** - DD/MM/YYYY format with calendar picker
- 💾 **PDF Export** - Generate and download invoices as PDF

## Tech Stack

- **Backend:** Flask (Python)
- **Frontend:** HTML5, Bootstrap 5, Vanilla JavaScript
- **PDF Generation:** WeasyPrint (with HTML fallback)
- **Deployment:** Railway-ready with Gunicorn

## Local Setup

### Prerequisites
- Python 3.8+
- pip

### Installation

1. Clone the repository:
```bash
git clone https://github.com/hfarazul/Bill_automation.git
cd Bill_automation
```

2. Create virtual environment:
```bash
python -m venv venv
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Linux/Mac
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the application:
```bash
python app.py
```

5. Access the application at [http://localhost:5000](http://localhost:5000)

## Deployment to Railway

### Method 1: Direct from GitHub

1. Push code to GitHub (if not already done)
2. Go to [Railway](https://railway.app/)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect the `Procfile` and deploy

### Method 2: Railway CLI

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Initialize and deploy:
```bash
railway init
railway up
```

### Environment Variables

No environment variables required for basic deployment. Railway automatically sets `PORT`.

## Project Structure

```
Bill Automation/
├── app.py                      # Main Flask application
├── requirements.txt            # Python dependencies
├── Procfile                    # Railway deployment config
├── .gitignore                  # Git ignore rules
├── config/
│   ├── company_info.json      # Company details (GSTIN, bank info)
│   ├── product_catalog.json   # Furniture product catalog
│   └── state_codes.json       # Indian states with GST codes
├── static/
│   ├── css/styles.css         # Custom styling
│   ├── js/invoice_form.js     # Form logic and calculations
│   └── images/signature.png   # Digital signature
├── templates/
│   ├── index.html             # Main invoice form
│   └── invoice_template.html # PDF/HTML invoice template
└── utils/
    ├── pdf_generator.py       # PDF generation logic
    ├── tax_calculator.py      # GST tax calculations
    └── number_to_words.py     # Amount to words converter
```

## GST Tax Calculation

The system automatically calculates GST based on supplier and customer states:

- **Same State Transaction:** CGST @ 9% + SGST @ 9% = 18%
  - Example: Delhi → Delhi
- **Interstate Transaction:** IGST @ 18%
  - Example: Delhi → Punjab

Supplier state is configured in `config/company_info.json`.

## Usage

1. Fill in invoice details (Invoice No, Date, PO)
2. Enter billing and shipping information
3. Add products (use catalog or manual entry)
4. Review tax calculations (automatically computed)
5. Click "Generate Invoice PDF"
6. Invoice opens in new tab - use "Save as PDF" button or Ctrl+P

## Configuration

### Company Information
Edit `config/company_info.json`:
```json
{
  "company_name": "GLOBEL INTERIORS INDIA",
  "state": "Delhi",
  "gstin": "07AWXPS9168G1ZG",
  "bank_name": "State Bank of India",
  "bank_account": "34424962680",
  ...
}
```

### Product Catalog
Edit `config/product_catalog.json` to add/modify products:
```json
{
  "products": [
    {
      "id": 1,
      "name": "Centre Table-Rubber Wood laquer Polish",
      "hsn_code": "44071020"
    }
  ]
}
```

## Testing

Run tax calculation tests:
```bash
python test_calculations.py
```

## Troubleshooting

### PDF Generation Issues
If WeasyPrint fails to install (Windows), the app falls back to HTML mode. Invoices will open in browser where you can use Ctrl+P to save as PDF.

### Port Already in Use
Change the port in `app.py` or set environment variable:
```bash
export PORT=8080  # Linux/Mac
set PORT=8080     # Windows
```

## License

Proprietary - Globel Interiors India

## Author

Built with [Claude Code](https://claude.com/claude-code)

---

**Note:** This is an internal tool for Globel Interiors India invoice generation.
