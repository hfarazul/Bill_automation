/**
 * Invoice Form JavaScript - Handles dynamic rows, calculations, and form submission
 */

// Global variables
let productRowCounter = 0;
let statesData = {};
let productsData = [];
let companyData = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadStates();
    loadProducts();
    loadCompanyInfo();
    addProductRow(); // Add first row by default
    setupEventListeners();
    setTodayDate();
});

function setTodayDate() {
    // Set date in YYYY-MM-DD format for the date input
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invoiceDate').value = today;
}

function formatDateToDDMMYYYY(dateString) {
    // Convert YYYY-MM-DD to DD/MM/YYYY
    const [yyyy, mm, dd] = dateString.split('-');
    return `${dd}/${mm}/${yyyy}`;
}

function setupEventListeners() {
    // Copy billing to shipping checkbox
    document.getElementById('sameAsBilling').addEventListener('change', function() {
        if (this.checked) {
            copyBillingToShipping();
        }
    });

    // State change listeners
    document.getElementById('billingState').addEventListener('change', function() {
        updateStateCode('billing');
        calculateTotals();
    });

    document.getElementById('shippingState').addEventListener('change', function() {
        updateStateCode('shipping');
        calculateTotals();
    });

    // Form submission
    document.getElementById('invoiceForm').addEventListener('submit', function(e) {
        e.preventDefault();
        submitInvoice();
    });
}

async function loadStates() {
    try {
        const response = await fetch('/api/states');
        const data = await response.json();
        statesData = data.states;

        // Populate both state dropdowns
        populateStateDropdown('billingState', statesData);
        populateStateDropdown('shippingState', statesData);
    } catch (error) {
        console.error('Error loading states:', error);
        alert('Error loading states. Please refresh the page.');
    }
}

async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const data = await response.json();
        productsData = data.products;
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

async function loadCompanyInfo() {
    try {
        const response = await fetch('/api/company');
        const data = await response.json();
        companyData = data;
    } catch (error) {
        console.error('Error loading company info:', error);
    }
}

function populateStateDropdown(elementId, states) {
    const select = document.getElementById(elementId);
    for (const [stateName, stateCode] of Object.entries(states)) {
        const option = document.createElement('option');
        option.value = stateName;
        option.textContent = stateName;
        select.appendChild(option);
    }
}

function updateStateCode(type) {
    const stateSelect = document.getElementById(`${type}State`);
    const stateCodeInput = document.getElementById(`${type}StateCode`);
    const selectedState = stateSelect.value;

    if (selectedState && statesData[selectedState]) {
        stateCodeInput.value = statesData[selectedState];
    } else {
        stateCodeInput.value = '';
    }
}

function copyBillingToShipping() {
    document.getElementById('shippingName').value = document.getElementById('billingName').value;
    document.getElementById('shippingAddress').value = document.getElementById('billingAddress').value;
    document.getElementById('shippingGstin').value = document.getElementById('billingGstin').value;
    document.getElementById('shippingState').value = document.getElementById('billingState').value;
    updateStateCode('shipping');
    calculateTotals();
}

function addProductRow() {
    productRowCounter++;
    const tbody = document.getElementById('productRows');
    const row = document.createElement('tr');
    row.id = `productRow${productRowCounter}`;

    row.innerHTML = `
        <td class="text-center">${productRowCounter}</td>
        <td>
            <select class="form-select form-select-sm mb-1 product-select" onchange="fillProductDetails(this, ${productRowCounter})">
                <option value="">-- Select from Catalog --</option>
                ${productsData.map(p => `<option value="${p.id}" data-hsn="${p.hsn_code}">${p.name}</option>`).join('')}
            </select>
            <input type="text" class="form-control form-control-sm product-name" placeholder="Or enter product name manually" id="productName${productRowCounter}">
        </td>
        <td>
            <input type="text" class="form-control form-control-sm hsn-code" id="hsnCode${productRowCounter}" value="44071020">
        </td>
        <td>
            <input type="number" class="form-control form-control-sm quantity" id="quantity${productRowCounter}" min="1" value="1" onchange="calculateRowAmount(${productRowCounter})">
        </td>
        <td>
            <input type="number" class="form-control form-control-sm rate" id="rate${productRowCounter}" step="0.01" min="0" value="0" onchange="calculateRowAmount(${productRowCounter})">
        </td>
        <td>
            <input type="number" class="form-control form-control-sm amount" id="amount${productRowCounter}" readonly value="0">
        </td>
        <td class="text-center">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeProductRow(${productRowCounter})">×</button>
        </td>
    `;

    tbody.appendChild(row);
}

function fillProductDetails(selectElement, rowId) {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    if (selectedOption.value) {
        const product = productsData.find(p => p.id == selectedOption.value);
        if (product) {
            document.getElementById(`productName${rowId}`).value = product.name;
            document.getElementById(`hsnCode${rowId}`).value = product.hsn_code;
        }
    }
}

function removeProductRow(rowId) {
    const row = document.getElementById(`productRow${rowId}`);
    if (row) {
        row.remove();
        renumberRows();
        calculateTotals();
    }
}

function renumberRows() {
    const rows = document.getElementById('productRows').getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        rows[i].cells[0].textContent = i + 1;
    }
}

function calculateRowAmount(rowId) {
    const quantity = parseFloat(document.getElementById(`quantity${rowId}`).value) || 0;
    const rate = parseFloat(document.getElementById(`rate${rowId}`).value) || 0;
    const amount = quantity * rate;

    document.getElementById(`amount${rowId}`).value = amount.toFixed(2);
    calculateTotals();
}

function calculateTotals() {
    // Calculate subtotal from all product amounts
    let subtotal = 0;
    const amountInputs = document.querySelectorAll('.amount');
    amountInputs.forEach(input => {
        subtotal += parseFloat(input.value) || 0;
    });

    // Add packing charges
    const packingCharges = parseFloat(document.getElementById('packingCharges').value) || 0;
    const totalBeforeTax = subtotal + packingCharges;

    // Determine tax type based on SUPPLIER state vs CUSTOMER (billing) state
    // This matches GST rules: Delhi (supplier) vs Punjab (customer) = IGST
    const supplierState = companyData.state || 'Delhi'; // Supplier state from company info
    const customerState = document.getElementById('billingState').value; // Customer billing state

    let cgst = 0, sgst = 0, igst = 0, totalTax = 0;

    if (customerState) {
        if (supplierState.toLowerCase() === customerState.toLowerCase()) {
            // Same state - CGST + SGST
            cgst = totalBeforeTax * 0.09;
            sgst = totalBeforeTax * 0.09;
            totalTax = cgst + sgst;

            document.getElementById('cgstRow').style.display = 'table-row';
            document.getElementById('sgstRow').style.display = 'table-row';
            document.getElementById('igstRow').style.display = 'none';

            document.getElementById('cgstAmount').textContent = `₹${cgst.toFixed(2)}`;
            document.getElementById('sgstAmount').textContent = `₹${sgst.toFixed(2)}`;
        } else {
            // Different state - IGST (interstate)
            igst = totalBeforeTax * 0.18;
            totalTax = igst;

            document.getElementById('cgstRow').style.display = 'none';
            document.getElementById('sgstRow').style.display = 'none';
            document.getElementById('igstRow').style.display = 'table-row';

            document.getElementById('igstAmount').textContent = `₹${igst.toFixed(2)}`;
        }
    }

    const totalAfterTax = totalBeforeTax + totalTax;

    // Update display
    document.getElementById('totalBeforeTax').textContent = `₹${totalBeforeTax.toFixed(2)}`;
    document.getElementById('totalAfterTax').textContent = `₹${totalAfterTax.toFixed(2)}`;

    // Update amount in words (simplified for now)
    if (totalAfterTax > 0) {
        document.getElementById('amountInWords').textContent = `Total: ₹${totalAfterTax.toFixed(2)}`;
    }
}

async function submitInvoice() {
    // Validate form
    if (!document.getElementById('invoiceForm').checkValidity()) {
        alert('Please fill in all required fields.');
        return;
    }

    // Collect products data
    const products = [];
    const rows = document.getElementById('productRows').getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowId = row.id.replace('productRow', '');

        const productName = document.getElementById(`productName${rowId}`).value.trim();
        const hsnCode = document.getElementById(`hsnCode${rowId}`).value.trim();
        const quantity = parseInt(document.getElementById(`quantity${rowId}`).value);
        const rate = parseFloat(document.getElementById(`rate${rowId}`).value);
        const amount = parseFloat(document.getElementById(`amount${rowId}`).value);

        if (productName && quantity > 0 && rate > 0) {
            products.push({
                name: productName,
                hsn_code: hsnCode,
                quantity: quantity,
                rate: rate,
                amount: amount
            });
        }
    }

    if (products.length === 0) {
        alert('Please add at least one product with valid details.');
        return;
    }

    // Prepare invoice data
    const invoiceData = {
        invoice_no: document.getElementById('invoiceNo').value,
        po: document.getElementById('po').value,
        date: formatDateToDDMMYYYY(document.getElementById('invoiceDate').value),
        mb_number: document.getElementById('mbNumber').value,
        billing: {
            name: document.getElementById('billingName').value,
            address: document.getElementById('billingAddress').value,
            gstin: document.getElementById('billingGstin').value,
            state: document.getElementById('billingState').value,
            state_code: document.getElementById('billingStateCode').value
        },
        shipping: {
            name: document.getElementById('shippingName').value,
            address: document.getElementById('shippingAddress').value,
            gstin: document.getElementById('shippingGstin').value,
            state: document.getElementById('shippingState').value,
            state_code: document.getElementById('shippingStateCode').value
        },
        products: products,
        packing_charges: parseFloat(document.getElementById('packingCharges').value) || 0
    };

    try {
        // Show loading message
        const submitBtn = document.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Generating Invoice...';

        // Send request to generate invoice
        const response = await fetch('/generate-invoice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(invoiceData)
        });

        if (!response.ok) {
            throw new Error('Failed to generate invoice');
        }

        // Open invoice in new tab
        const htmlContent = await response.text();
        const newWindow = window.open('', '_blank');
        newWindow.document.write(htmlContent);
        newWindow.document.close();

        // Reset button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        alert('Invoice opened in new tab! Use Ctrl+P or the "Save as PDF" button to save.');

    } catch (error) {
        console.error('Error:', error);
        alert('Error generating invoice. Please try again.');

        // Reset button
        const submitBtn = document.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate Invoice PDF';
    }
}
