"""
PDF Invoice Data Extraction using OpenAI GPT-4 Vision

This module extracts structured data from PDF invoices/POs using GPT-4V.
"""

import base64
import json
import os
import re
from io import BytesIO
from typing import Optional, Tuple

# Try PyMuPDF first (no system dependencies), fallback to pdf2image
try:
    import fitz  # PyMuPDF
    PDF_LIBRARY = "pymupdf"
except ImportError:
    PDF_LIBRARY = None

from PIL import Image
from openai import OpenAI


def load_state_mapping() -> dict:
    """Load state name to code mapping for normalization"""
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                               'config', 'state_codes.json')
    with open(config_path, 'r') as f:
        data = json.load(f)
    return data['states']


def normalize_state_name(state_input: str, state_mapping: dict) -> Tuple[Optional[str], Optional[str]]:
    """
    Normalize state name to match dropdown values.
    Returns (state_name, state_code) tuple.

    Handles variations like:
    - "UP-09" -> "Uttar Pradesh", "09"
    - "UP" -> "Uttar Pradesh", "09"
    - "Uttar Pradesh" -> "Uttar Pradesh", "09"
    - State code "09" -> "Uttar Pradesh", "09"
    """
    if not state_input:
        return None, None

    state_input = state_input.strip()

    # Common abbreviations mapping
    abbreviations = {
        'UP': 'Uttar Pradesh',
        'DL': 'Delhi',
        'HR': 'Haryana',
        'PB': 'Punjab',
        'RJ': 'Rajasthan',
        'MH': 'Maharashtra',
        'GJ': 'Gujarat',
        'KA': 'Karnataka',
        'TN': 'Tamil Nadu',
        'WB': 'West Bengal',
        'MP': 'Madhya Pradesh',
        'AP': 'Andhra Pradesh',
        'TS': 'Telangana',
        'KL': 'Kerala',
        'BR': 'Bihar',
        'JH': 'Jharkhand',
        'OR': 'Odisha',
        'OD': 'Odisha',
        'CG': 'Chhattisgarh',
        'UK': 'Uttarakhand',
        'HP': 'Himachal Pradesh',
        'JK': 'Jammu and Kashmir',
        'GA': 'Goa',
        'AS': 'Assam',
        'CH': 'Chandigarh',
        'SK': 'Sikkim',
        'MN': 'Manipur',
        'ML': 'Meghalaya',
        'MZ': 'Mizoram',
        'NL': 'Nagaland',
        'TR': 'Tripura',
        'AR': 'Arunachal Pradesh',
        'PY': 'Puducherry',
    }

    # Check for format like "UP-09" or "DL-07"
    match = re.match(r'^([A-Z]{2})-?(\d{2})$', state_input.upper())
    if match:
        abbr = match.group(1)
        if abbr in abbreviations:
            state_name = abbreviations[abbr]
            return state_name, state_mapping.get(state_name)

    # Check if it's just a state code (2 digits)
    if re.match(r'^\d{2}$', state_input):
        for name, code in state_mapping.items():
            if code == state_input:
                return name, code
        return None, state_input

    # Check abbreviation
    upper_input = state_input.upper()
    if upper_input in abbreviations:
        state_name = abbreviations[upper_input]
        return state_name, state_mapping.get(state_name)

    # Direct match (case-insensitive)
    for name, code in state_mapping.items():
        if name.lower() == state_input.lower():
            return name, code

    # Partial match
    for name, code in state_mapping.items():
        if state_input.lower() in name.lower():
            return name, code

    return state_input, None


def pdf_to_images(pdf_bytes: bytes, max_pages: int = 2) -> list:
    """
    Convert PDF bytes to list of PIL Images.
    Returns list of (page_number, image) tuples.
    """
    images = []

    if PDF_LIBRARY == "pymupdf":
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for page_num in range(min(len(doc), max_pages)):
            page = doc[page_num]
            # Render at 200 DPI for better text clarity (especially for small text)
            mat = fitz.Matrix(200/72, 200/72)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append((page_num + 1, img))
        doc.close()
    else:
        raise ImportError("PyMuPDF not available. Install with: pip install PyMuPDF")

    return images


def extract_text_from_pdf(pdf_bytes: bytes, max_pages: int = 2) -> str:
    """
    Extract raw text from PDF using PyMuPDF.
    This provides accurate text without OCR errors.
    """
    if PDF_LIBRARY != "pymupdf":
        raise ImportError("PyMuPDF not available. Install with: pip install PyMuPDF")

    text_content = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page_num in range(min(len(doc), max_pages)):
        page = doc[page_num]
        text = page.get_text("text")
        text_content.append(f"--- PAGE {page_num + 1} ---\n{text}")

    doc.close()
    return "\n\n".join(text_content)


def image_to_base64(image: Image.Image, max_size: int = 1568) -> str:
    """
    Convert PIL Image to base64 string, resizing if needed.
    OpenAI recommends images under 1568x1568 for efficiency.
    """
    # Resize if too large
    if image.width > max_size or image.height > max_size:
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    # Convert to RGB if necessary
    if image.mode != 'RGB':
        image = image.convert('RGB')

    # Encode to base64
    buffer = BytesIO()
    image.save(buffer, format='JPEG', quality=85)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def build_extraction_prompt(include_text_instructions: bool = False) -> str:
    """
    Build the system prompt for GPT-4V to extract invoice/PO data.
    """
    text_instructions = ""
    if include_text_instructions:
        text_instructions = """
IMPORTANT - HYBRID EXTRACTION MODE:
You are receiving BOTH:
1. EXTRACTED TEXT from the PDF (100% accurate - use this for exact values)
2. IMAGE of the document (use this to understand layout/structure)

For product names, quantities, rates, GSTIN, addresses - ALWAYS use the EXTRACTED TEXT.
The image helps you understand which text belongs to which field (billing vs shipping, etc.)
"""

    return f"""You are an expert at extracting structured data from Indian business documents (invoices, purchase orders, quotations).
{text_instructions}
IMPORTANT CONTEXT:
- This document is being processed by Globel Interiors India (GSTIN: 07AWXPS9168G1ZG, Delhi)
- If this is a Purchase Order, Globel Interiors is the VENDOR/SUPPLIER receiving the order
- The CUSTOMER/BUYER details should be extracted as billing/shipping info
- DO NOT extract Globel Interiors' own details as billing/shipping

EXTRACTION RULES:
1. Extract the CUSTOMER/BUYER information (the party PLACING the order or RECEIVING the invoice)
2. For Purchase Orders: "Bill To" section at the TOP = customer's billing address (this is the company that issued the PO)
3. For Purchase Orders: "Ship To" section = delivery destination
4. Extract PO number, date, and all product line items
5. For state codes like "UP-09" or "09", provide BOTH the full state name AND the code
6. Prices should be the BASE RATE before tax (not the tax-inclusive amount)
7. Do NOT include packing/cartage unless explicitly listed as a separate line item
8. For dates, use DD/MM/YYYY format

CRITICAL TABLE READING RULES (for product/item tables):
1. Read the product table ROW BY ROW using the Sr. No. column as your guide
2. Each Sr. No. = ONE product entry - NEVER merge multiple rows into one product
3. Product descriptions may WRAP to multiple lines within the same cell - capture the COMPLETE text
4. Preserve ALL characters including: quotes ("), dimensions (x), parentheses (), fractions
5. If a cell spans multiple lines, combine them into one product name (e.g., "Corner table steel stand folding with glass top (2x2)")
6. COUNT your products - your output count MUST match the number of Sr. No. entries in the table
7. Use the Price/Rate column (before tax) for the rate field, NOT the Total Amount column

COMMON MISTAKES TO AVOID:
- Don't truncate names: "Office Table 3\" x 1.5\"" not "Office Table 3"
- Don't confuse characters: (2x2) is NOT (32), read carefully
- Don't merge adjacent rows: row 4 and row 5 are SEPARATE products
- Don't skip rows: if there are 5 Sr. No. entries, output exactly 5 products

OUTPUT FORMAT (JSON only, no markdown):
{{
  "document_type": "purchase_order" | "invoice" | "quotation",
  "po": "PO number if present",
  "invoice_date": "DD/MM/YYYY format",
  "billing": {{
    "name": "Company/Person name",
    "address": "Full address on one line",
    "gstin": "15-character GSTIN if present",
    "state": "Full state name (e.g., Uttar Pradesh, not UP)",
    "state_code": "2-digit code (e.g., 09)"
  }},
  "shipping": {{
    "name": "Company/Person name",
    "address": "Full address on one line",
    "gstin": "GSTIN if present (often same as billing)",
    "state": "Full state name",
    "state_code": "2-digit code"
  }},
  "products": [
    {{
      "name": "Product description",
      "hsn_code": "HSN/SAC code",
      "quantity": 1,
      "rate": 1000.00
    }}
  ],
  "packing_charges": 0,
  "extraction_confidence": "high" | "medium" | "low",
  "notes": "Any issues or uncertainties"
}}

If billing and shipping are the same, still populate both with the same values.
If a field cannot be determined, use null.
Respond with ONLY the JSON object, no explanations."""


def extract_data_from_pdf(pdf_bytes: bytes, api_key: str) -> dict:
    """
    Main function to extract invoice data from PDF using GPT-4 Vision.
    Uses HYBRID approach: extracted text (accurate) + image (for layout).

    Args:
        pdf_bytes: Raw PDF file bytes
        api_key: OpenAI API key

    Returns:
        dict with extracted data or error information
    """
    raw_response = None

    try:
        # Extract text directly from PDF (100% accurate - no OCR errors)
        extracted_text = extract_text_from_pdf(pdf_bytes, max_pages=2)

        # Convert PDF to images (for layout understanding)
        images = pdf_to_images(pdf_bytes, max_pages=2)

        if not images:
            return {"success": False, "error": "Could not convert PDF to images"}

        # Prepare image content for API
        image_content = []
        for page_num, img in images:
            b64_image = image_to_base64(img)
            image_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{b64_image}",
                    "detail": "high"
                }
            })

        # Initialize OpenAI client
        client = OpenAI(api_key=api_key)

        # Build user message with both extracted text and images
        # Note: Using string concatenation instead of f-string to avoid issues with { } in extracted text
        user_message = (
            "Extract the invoice/PO data from this document.\n\n"
            "=== EXTRACTED TEXT (use this for accurate values) ===\n"
            + extracted_text +
            "\n=== END EXTRACTED TEXT ===\n\n"
            "The images below show the document layout to help you understand the structure:"
        )

        # Make API call with hybrid approach
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": build_extraction_prompt(include_text_instructions=True)
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_message},
                        *image_content
                    ]
                }
            ],
            max_tokens=2000,
            temperature=0.1  # Low temperature for consistent extraction
        )

        # Parse response
        raw_response = response.choices[0].message.content.strip()

        # Clean up response (remove markdown code blocks if present)
        if raw_response.startswith("```"):
            raw_response = re.sub(r'^```json?\n?', '', raw_response)
            raw_response = re.sub(r'\n?```$', '', raw_response)

        extracted_data = json.loads(raw_response)

        # Post-process: normalize state names
        state_mapping = load_state_mapping()

        if extracted_data.get('billing', {}).get('state'):
            state_name, state_code = normalize_state_name(
                extracted_data['billing']['state'],
                state_mapping
            )
            extracted_data['billing']['state'] = state_name
            if state_code:
                extracted_data['billing']['state_code'] = state_code

        if extracted_data.get('shipping', {}).get('state'):
            state_name, state_code = normalize_state_name(
                extracted_data['shipping']['state'],
                state_mapping
            )
            extracted_data['shipping']['state'] = state_name
            if state_code:
                extracted_data['shipping']['state_code'] = state_code

        return {
            "success": True,
            "data": extracted_data
        }

    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Failed to parse GPT response as JSON: {str(e)}",
            "raw_response": raw_response
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
