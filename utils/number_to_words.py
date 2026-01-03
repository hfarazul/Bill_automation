"""Convert numbers to words for invoice amounts"""

from num2words import num2words

def amount_to_words(amount):
    """
    Convert amount to Indian rupees format words.

    Args:
        amount: Float (e.g., 23456.78)

    Returns:
        String: "Rupees Twenty-Three Thousand Four Hundred Fifty-Six and Paise Seventy-Eight Only"
    """
    try:
        # Split into rupees and paise
        rupees = int(amount)
        paise = round((amount - rupees) * 100)

        # Convert rupees to words using Indian English
        words = "Rupees " + num2words(rupees, lang='en_IN').title()

        # Add paise if present
        if paise > 0:
            words += " and Paise " + num2words(paise, lang='en_IN').title()

        words += " Only"
        return words

    except Exception as e:
        # Fallback in case of any error
        return f"Rupees {amount:.2f} Only"
