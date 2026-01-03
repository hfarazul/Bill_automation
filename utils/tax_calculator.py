"""Tax calculator for GST calculations"""

def calculate_tax(supplier_state, customer_state, subtotal):
    """
    Determines tax type and calculates amounts based on GST rules.

    GST Rule: Compare SUPPLIER state with CUSTOMER (billing) state
    - Same state: CGST @ 9% + SGST @ 9% = 18%
    - Different state: IGST @ 18%

    Args:
        supplier_state: String - State where supplier is located (e.g., "Delhi")
        customer_state: String - State where customer is located (e.g., "Punjab")
        subtotal: Float (total before tax)

    Returns:
        dict: {
            'tax_type': 'SGST' or 'IGST',
            'cgst': float (9% if same state, else 0),
            'sgst': float (9% if same state, else 0),
            'igst': float (18% if different state, else 0),
            'total_tax': float,
            'total_after_tax': float
        }
    """
    # Normalize state names for comparison
    supplier_normalized = supplier_state.strip().lower()
    customer_normalized = customer_state.strip().lower()

    if supplier_normalized == customer_normalized:
        # Same state = CGST + SGST (9% each)
        cgst = round(subtotal * 0.09, 2)
        sgst = round(subtotal * 0.09, 2)
        total_tax = cgst + sgst

        return {
            'tax_type': 'SGST',
            'cgst': cgst,
            'sgst': sgst,
            'igst': 0,
            'total_tax': total_tax,
            'total_after_tax': round(subtotal + total_tax, 2)
        }
    else:
        # Different state = IGST (18%)
        igst = round(subtotal * 0.18, 2)

        return {
            'tax_type': 'IGST',
            'cgst': 0,
            'sgst': 0,
            'igst': igst,
            'total_tax': igst,
            'total_after_tax': round(subtotal + igst, 2)
        }
