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
            # Render at 150 DPI for good quality without huge size
            mat = fitz.Matrix(150/72, 150/72)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append((page_num + 1, img))
        doc.close()
    else:
        raise ImportError("PyMuPDF not available. Install with: pip install PyMuPDF")

    return images


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


def build_extraction_prompt() -> str:
    """
    Build the system prompt for GPT-4V to extract invoice/PO data.
    """
    return """You are an expert at extracting structured data from Indian business documents (invoices, purchase orders, quotations).

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

OUTPUT FORMAT (JSON only, no markdown):
{
  "document_type": "purchase_order" | "invoice" | "quotation",
  "po": "PO number if present",
  "invoice_date": "DD/MM/YYYY format",
  "billing": {
    "name": "Company/Person name",
    "address": "Full address on one line",
    "gstin": "15-character GSTIN if present",
    "state": "Full state name (e.g., Uttar Pradesh, not UP)",
    "state_code": "2-digit code (e.g., 09)"
  },
  "shipping": {
    "name": "Company/Person name",
    "address": "Full address on one line",
    "gstin": "GSTIN if present (often same as billing)",
    "state": "Full state name",
    "state_code": "2-digit code"
  },
  "products": [
    {
      "name": "Product description",
      "hsn_code": "HSN/SAC code",
      "quantity": 1,
      "rate": 1000.00
    }
  ],
  "packing_charges": 0,
  "extraction_confidence": "high" | "medium" | "low",
  "notes": "Any issues or uncertainties"
}

If billing and shipping are the same, still populate both with the same values.
If a field cannot be determined, use null.
Respond with ONLY the JSON object, no explanations."""


def extract_data_from_pdf(pdf_bytes: bytes, api_key: str) -> dict:
    """
    Main function to extract invoice data from PDF using GPT-4 Vision.

    Args:
        pdf_bytes: Raw PDF file bytes
        api_key: OpenAI API key

    Returns:
        dict with extracted data or error information
    """
    raw_response = None

    try:
        # Convert PDF to images
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

        # Make API call
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": build_extraction_prompt()
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the invoice/PO data from this document:"},
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
