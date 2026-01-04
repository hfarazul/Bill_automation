/**
 * Invoice Form JavaScript - Handles dynamic rows, calculations, and form submission
 */

// Global variables
let productRowCounter = 0;
let statesData = {};
let productsData = [];
let companyData = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadStates();
    await loadProducts();
    await loadCompanyInfo();
    addProductRow(); // Add first row by default (after products loaded)
    setupEventListeners();
    setTodayDate();
    setupPdfExtraction(); // Initialize PDF extraction feature
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
        <td class="text-center" data-label="Sr. No.">${productRowCounter}</td>
        <td data-label="Product">
            <select class="form-select form-select-sm mb-1 product-select" onchange="fillProductDetails(this, ${productRowCounter})">
                <option value="">-- Select from Catalog --</option>
                ${productsData.map(p => `<option value="${p.id}" data-hsn="${p.hsn_code}">${p.name}</option>`).join('')}
            </select>
            <div class="input-group input-group-sm">
                <input type="text" class="form-control form-control-sm product-name" placeholder="Or enter manually" id="productName${productRowCounter}" oninput="toggleSaveButton(${productRowCounter})">
                <button type="button" class="btn btn-outline-success btn-sm save-to-catalog-btn" id="saveBtn${productRowCounter}" onclick="saveProductToCatalog(${productRowCounter})" title="Save to Catalog" style="display: none;">+</button>
            </div>
        </td>
        <td data-label="HSN Code">
            <input type="text" class="form-control form-control-sm hsn-code" id="hsnCode${productRowCounter}" value="44071020" oninput="toggleSaveButton(${productRowCounter})">
        </td>
        <td data-label="Quantity">
            <input type="number" class="form-control form-control-sm quantity" id="quantity${productRowCounter}" min="1" value="1" onchange="calculateRowAmount(${productRowCounter})">
        </td>
        <td data-label="Rate (₹)">
            <input type="number" class="form-control form-control-sm rate" id="rate${productRowCounter}" step="0.01" min="0" value="0" onchange="calculateRowAmount(${productRowCounter})">
        </td>
        <td data-label="Amount (₹)">
            <input type="number" class="form-control form-control-sm amount" id="amount${productRowCounter}" readonly value="0">
        </td>
        <td class="text-center" data-label="">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeProductRow(${productRowCounter})">Remove</button>
        </td>
    `;

    tbody.appendChild(row);

    // Auto-scroll to new row (smooth scroll for better UX on mobile)
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

/**
 * Show/hide save button based on manual input
 */
function toggleSaveButton(rowId) {
    const productName = document.getElementById(`productName${rowId}`).value.trim();
    const hsnCode = document.getElementById(`hsnCode${rowId}`).value.trim();
    const saveBtn = document.getElementById(`saveBtn${rowId}`);
    const productSelect = document.querySelector(`#productRow${rowId} .product-select`);

    // Show save button only if:
    // 1. Product name is manually entered (not empty, dropdown not selected)
    // 2. HSN code is present
    // 3. Product doesn't already exist in catalog
    const isManualEntry = productSelect.value === '' && productName.length > 0;
    const hasHsn = hsnCode.length > 0;
    const existsInCatalog = productsData.some(
        p => p.name.toLowerCase() === productName.toLowerCase()
    );

    if (isManualEntry && hasHsn && !existsInCatalog) {
        saveBtn.style.display = 'inline-block';
    } else {
        saveBtn.style.display = 'none';
    }
}

/**
 * Save product to catalog via API
 */
async function saveProductToCatalog(rowId) {
    const productName = document.getElementById(`productName${rowId}`).value.trim();
    const hsnCode = document.getElementById(`hsnCode${rowId}`).value.trim();
    const saveBtn = document.getElementById(`saveBtn${rowId}`);

    // Validate
    if (!productName) {
        showToast('Please enter a product name', 'error');
        return;
    }
    if (!hsnCode) {
        showToast('Please enter an HSN code', 'error');
        return;
    }

    // Check for duplicate in local data first
    if (productsData.some(p => p.name.toLowerCase() === productName.toLowerCase())) {
        showToast('This product already exists in the catalog', 'warning');
        return;
    }

    // Disable button and show loading
    saveBtn.disabled = true;
    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '...';

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: productName,
                hsn_code: hsnCode
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to save product');
        }

        // Add new product to local data
        productsData.push(result.product);

        // Refresh all dropdowns
        refreshAllProductDropdowns();

        // Hide save button (product now in catalog)
        saveBtn.style.display = 'none';

        // Show success message
        showToast(`"${productName}" saved to catalog!`, 'success');

    } catch (error) {
        console.error('Error saving product:', error);
        showToast(error.message, 'error');

        // Re-enable button
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalContent;
    }
}

/**
 * Refresh all product dropdowns in the form
 */
function refreshAllProductDropdowns() {
    const allSelects = document.querySelectorAll('.product-select');

    allSelects.forEach(select => {
        // Preserve current selection
        const currentValue = select.value;

        // Rebuild options
        select.innerHTML = `
            <option value="">-- Select from Catalog --</option>
            ${productsData.map(p =>
                `<option value="${p.id}" data-hsn="${p.hsn_code}">${p.name}</option>`
            ).join('')}
        `;

        // Restore selection if it still exists
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

/**
 * Display toast notification
 */
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }

    // Map type to Bootstrap class
    const bgClass = {
        'success': 'bg-success',
        'error': 'bg-danger',
        'warning': 'bg-warning',
        'info': 'bg-info'
    }[type] || 'bg-info';

    const textClass = type === 'warning' ? 'text-dark' : 'text-white';

    // Create toast element
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="toast ${bgClass} ${textClass}" role="alert">
            <div class="toast-body d-flex justify-content-between align-items-center">
                ${message}
                <button type="button" class="btn-close btn-close-white ms-2" onclick="this.parentElement.parentElement.remove()"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);

    // Show toast and auto-hide after 3 seconds
    const toastElement = document.getElementById(toastId);
    toastElement.classList.add('show');

    setTimeout(() => {
        toastElement.classList.remove('show');
        setTimeout(() => toastElement.remove(), 300);
    }, 3000);
}

// ==========================================
// PDF Extraction Feature
// ==========================================

let extractedData = null;

/**
 * Initialize PDF extraction handlers
 */
function setupPdfExtraction() {
    const pdfInput = document.getElementById('pdfUpload');
    const extractBtn = document.getElementById('extractPdfBtn');

    if (!pdfInput || !extractBtn) return;

    // Enable button when file selected
    pdfInput.addEventListener('change', function() {
        extractBtn.disabled = !this.files.length;
    });

    // Handle extraction button click
    extractBtn.addEventListener('click', extractPdfData);

    // Preview modal handlers
    const sameAsBillingCheck = document.getElementById('previewSameAsBilling');
    if (sameAsBillingCheck) {
        sameAsBillingCheck.addEventListener('change', function() {
            document.getElementById('previewShippingFields').style.display =
                this.checked ? 'none' : 'block';
        });
    }

    const addProductBtn = document.getElementById('addPreviewProductBtn');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', function() {
            addPreviewProductRow();
        });
    }

    const applyBtn = document.getElementById('applyExtractedDataBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyExtractedData);
    }

    // Populate state dropdowns in preview modal
    populatePreviewStateDropdowns();
}

/**
 * Populate state dropdowns in the preview modal
 */
function populatePreviewStateDropdowns() {
    const billingSelect = document.getElementById('previewBillingState');
    const shippingSelect = document.getElementById('previewShippingState');

    if (!billingSelect || !shippingSelect) return;

    billingSelect.innerHTML = '<option value="">Select State</option>';
    shippingSelect.innerHTML = '<option value="">Select State</option>';

    for (const [stateName, stateCode] of Object.entries(statesData)) {
        const option1 = document.createElement('option');
        option1.value = stateName;
        option1.textContent = stateName;
        billingSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = stateName;
        option2.textContent = stateName;
        shippingSelect.appendChild(option2);
    }
}

/**
 * Extract data from uploaded PDF
 */
async function extractPdfData() {
    const pdfInput = document.getElementById('pdfUpload');
    const extractBtn = document.getElementById('extractPdfBtn');
    const spinner = document.getElementById('extractSpinner');
    const btnText = document.getElementById('extractBtnText');

    if (!pdfInput.files.length) {
        showToast('Please select a PDF file', 'warning');
        return;
    }

    const file = pdfInput.files[0];

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
        showToast('PDF file too large. Maximum size is 10MB.', 'error');
        return;
    }

    // Show loading state
    extractBtn.disabled = true;
    spinner.classList.remove('d-none');
    btnText.textContent = 'Extracting...';

    try {
        const formData = new FormData();
        formData.append('pdf', file);

        const response = await fetch('/api/extract-pdf', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Extraction failed');
        }

        // Store extracted data and show preview
        extractedData = result.data;
        showPreviewModal(extractedData);

    } catch (error) {
        console.error('PDF extraction error:', error);
        showToast(`Extraction failed: ${error.message}`, 'error');
    } finally {
        // Reset button state
        extractBtn.disabled = false;
        spinner.classList.add('d-none');
        btnText.textContent = 'Extract Data';
    }
}

/**
 * Show preview modal with extracted data
 */
function showPreviewModal(data) {
    // Set confidence badge
    const confidence = data.extraction_confidence || 'medium';
    const confidenceBadge = document.getElementById('confidenceBadge');
    confidenceBadge.textContent = confidence.toUpperCase();
    confidenceBadge.className = 'badge ' + {
        'high': 'bg-success',
        'medium': 'bg-warning text-dark',
        'low': 'bg-danger'
    }[confidence];

    // Set notes if any
    document.getElementById('extractionNotes').textContent = data.notes || '';

    // Document info
    document.getElementById('previewDocType').value =
        (data.document_type || 'unknown').replace(/_/g, ' ').toUpperCase();
    document.getElementById('previewPO').value = data.po || '';
    document.getElementById('previewDate').value = data.invoice_date || '';

    // Billing details
    const billing = data.billing || {};
    document.getElementById('previewBillingName').value = billing.name || '';
    document.getElementById('previewBillingAddress').value = billing.address || '';
    document.getElementById('previewBillingGstin').value = billing.gstin || '';
    document.getElementById('previewBillingState').value = billing.state || '';

    // Shipping details
    const shipping = data.shipping || {};

    // Check if billing and shipping are the same
    const isSameAsBilling =
        billing.name === shipping.name &&
        billing.address === shipping.address &&
        billing.gstin === shipping.gstin;

    document.getElementById('previewSameAsBilling').checked = isSameAsBilling;
    document.getElementById('previewShippingFields').style.display =
        isSameAsBilling ? 'none' : 'block';
    document.getElementById('previewShippingName').value = shipping.name || '';
    document.getElementById('previewShippingAddress').value = shipping.address || '';
    document.getElementById('previewShippingGstin').value = shipping.gstin || '';
    document.getElementById('previewShippingState').value = shipping.state || '';

    // Products
    const productsBody = document.getElementById('previewProductRows');
    productsBody.innerHTML = '';

    (data.products || []).forEach((product) => {
        addPreviewProductRow(product);
    });

    // Packing charges
    document.getElementById('previewPackingCharges').value = data.packing_charges || 0;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('previewModal'));
    modal.show();
}

/**
 * Add a product row to the preview table
 */
function addPreviewProductRow(product = null) {
    const tbody = document.getElementById('previewProductRows');
    const row = document.createElement('tr');

    row.innerHTML = `
        <td><input type="text" class="form-control form-control-sm preview-product-name" value="${escapeHtml(product?.name || '')}"></td>
        <td><input type="text" class="form-control form-control-sm preview-hsn" value="${escapeHtml(product?.hsn_code || '44071020')}"></td>
        <td><input type="number" class="form-control form-control-sm preview-qty" value="${product?.quantity || 1}" min="1"></td>
        <td><input type="number" class="form-control form-control-sm preview-rate" value="${product?.rate || 0}" step="0.01"></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">X</button></td>
    `;

    tbody.appendChild(row);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Apply extracted data to the main form
 */
function applyExtractedData() {
    // Get values from preview modal
    const po = document.getElementById('previewPO').value;
    const dateStr = document.getElementById('previewDate').value;

    // Set PO
    document.getElementById('po').value = po;

    // Parse and set date (convert DD/MM/YYYY to YYYY-MM-DD for input[type=date])
    if (dateStr) {
        const dateParts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (dateParts) {
            const isoDate = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`;
            document.getElementById('invoiceDate').value = isoDate;
        }
    }

    // Billing details
    document.getElementById('billingName').value = document.getElementById('previewBillingName').value;
    document.getElementById('billingAddress').value = document.getElementById('previewBillingAddress').value;
    document.getElementById('billingGstin').value = document.getElementById('previewBillingGstin').value;
    document.getElementById('billingState').value = document.getElementById('previewBillingState').value;
    updateStateCode('billing');

    // Shipping details
    const sameAsBilling = document.getElementById('previewSameAsBilling').checked;
    document.getElementById('sameAsBilling').checked = sameAsBilling;

    if (sameAsBilling) {
        copyBillingToShipping();
    } else {
        document.getElementById('shippingName').value = document.getElementById('previewShippingName').value;
        document.getElementById('shippingAddress').value = document.getElementById('previewShippingAddress').value;
        document.getElementById('shippingGstin').value = document.getElementById('previewShippingGstin').value;
        document.getElementById('shippingState').value = document.getElementById('previewShippingState').value;
        updateStateCode('shipping');
    }

    // Clear existing product rows
    document.getElementById('productRows').innerHTML = '';
    productRowCounter = 0;

    // Add products from preview
    const previewRows = document.querySelectorAll('#previewProductRows tr');
    previewRows.forEach(row => {
        const name = row.querySelector('.preview-product-name').value.trim();
        const hsn = row.querySelector('.preview-hsn').value.trim();
        const qty = parseInt(row.querySelector('.preview-qty').value) || 1;
        const rate = parseFloat(row.querySelector('.preview-rate').value) || 0;

        if (name) {
            addProductRow();
            const rowId = productRowCounter;
            document.getElementById(`productName${rowId}`).value = name;
            document.getElementById(`hsnCode${rowId}`).value = hsn;
            document.getElementById(`quantity${rowId}`).value = qty;
            document.getElementById(`rate${rowId}`).value = rate;
            calculateRowAmount(rowId);
        }
    });

    // If no products were added, add empty row
    if (document.getElementById('productRows').children.length === 0) {
        addProductRow();
    }

    // Packing charges
    document.getElementById('packingCharges').value =
        document.getElementById('previewPackingCharges').value || 0;

    // Recalculate totals
    calculateTotals();

    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('previewModal')).hide();

    // Show success message
    showToast('Data applied to form successfully!', 'success');

    // Clear file input
    document.getElementById('pdfUpload').value = '';
    document.getElementById('extractPdfBtn').disabled = true;

    // Scroll to invoice details section
    document.getElementById('invoiceForm').scrollIntoView({ behavior: 'smooth' });
}
