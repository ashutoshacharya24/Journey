// SPA State Store
let currentCurrency = 'USD';
let currentAmount = 50;

// Presets by Currency
const currencyPresets = {
  USD: [10, 25, 50, 100],
  EUR: [10, 25, 50, 100],
  GBP: [10, 25, 50, 100],
  INR: [500, 1500, 3500, 7500]
};

const currencySymbols = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹'
};

// --------------------------------------------------
// Currency & Donation Amount Engine
// --------------------------------------------------
window.renderPresets = function() {
  const container = document.getElementById('preset-buttons-container');
  const symbol = currencySymbols[currentCurrency];
  const presets = currencyPresets[currentCurrency];

  if (!container) return;

  container.innerHTML = presets
    .map(
      amt => `
    <button type="button" onclick="window.setPresetAmount(${amt})" class="preset-btn p-3 rounded-xl border ${
        amt === currentAmount
          ? 'border-[#F59E0B] bg-[#F59E0B]/15 text-white font-bold'
          : 'border-white/10 bg-[#131315] text-on-surface-variant hover:text-white font-medium'
      } text-xs text-center transition-all">
      ${symbol}${amt}
    </button>
  `
    )
    .join('');

  const symbolEl = document.getElementById('form-currency-symbol');
  if (symbolEl) symbolEl.innerText = symbol;

  window.updateButtonText();
};

window.handleCurrencyChange = function(curr) {
  currentCurrency = curr;
  currentAmount = currencyPresets[curr][2] || currencyPresets[curr][0]; // default to 3rd preset ($50/₹3500)

  const customInput = document.getElementById('custom-amount-input');
  if (customInput) customInput.value = '';

  window.renderPresets();
};

window.setPresetAmount = function(amt) {
  currentAmount = amt;
  const customInput = document.getElementById('custom-amount-input');
  if (customInput) customInput.value = '';
  window.renderPresets();
};

window.updateButtonText = function() {
  const btnText = document.getElementById('donate-btn-text');
  const symbol = currencySymbols[currentCurrency];
  if (btnText) {
    btnText.innerText = `Donate Now (${symbol}${currentAmount})`;
  }
};

// --------------------------------------------------
// RAZORPAY CHECKOUT INTEGRATION & CALLBACK HANDLER
// --------------------------------------------------
window.triggerRazorpayCheckout = async function(event) {
  if (event) event.preventDefault();

  const nameInput = document.getElementById('donor-name');
  const emailInput = document.getElementById('donor-email');
  const phoneInput = document.getElementById('donor-phone');

  const donorName = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';

  if (!donorName || !email || !phone) {
    alert('Please fill in your Name, Email, and Phone Number.');
    return;
  }

  if (isNaN(currentAmount) || currentAmount <= 0) {
    alert('Please select or enter a valid donation amount.');
    return;
  }

  const btn = document.getElementById('razorpay-donate-btn');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-lg">sync</span> Processing Order...`;
  }

  try {
    // 1. Create Razorpay Order on Express Backend
    const res = await fetch('/api/donate/create-razorpay-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: currentAmount,
        currency: currentCurrency,
        donorName: donorName,
        email: email,
        phone: phone
      })
    });

    const orderData = await res.json();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }

    if (!orderData.success) {
      alert(orderData.error || 'Could not initialize Razorpay payment order.');
      return;
    }

    // 2. Configure Razorpay SDK Options
    // Check if Razorpay SDK is loaded
    if (typeof Razorpay === 'undefined') {
      alert('Razorpay Checkout SDK is still loading or blocked. Please check your network connection.');
      return;
    }

    const options = {
      key: orderData.keyId, // Your Razorpay API Key ID (Passed from backend / .env)
      amount: orderData.amount, // Amount in smallest subunit (cents/paise)
      currency: orderData.currency, // USD, EUR, GBP, or INR
      name: "Journey with Ashutosh",
      description: "Expedition Support Donation",
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA6vsM5fBSZTVrMhkuBl8ZYRDKbuxV_s2m9Ngd5a6d4yeg56TbiPkJOv2nblN1a5DAW3uWNOsqS-U3mQNkTfusI5kaw77N5A-mohl3I-qHA50kIyuB_gZBprDxN60Utvbt0wdFq4n0_zndOhEtiZnLqN9uGJUB1eD3qQuc4ZPkmV4sY0nDKvK7UE8828psdd2y-S6KjanXihB7rHP5mimQQ58CRNoUAhvvm369mwdxczPkfDPPNfnK9",
      order_id: orderData.orderId,
      prefill: {
        name: orderData.donorName,
        email: orderData.email,
        contact: orderData.phone
      },
      notes: {
        expedition: "Antarctica & High Arctic 2026",
        destination_bank: "Direct Deposit to Indian Bank Account"
      },
      theme: {
        color: "#F59E0B" // Gold accent matching website aesthetic
      },
      
      // ====================================================================
      // PAYMENT SUCCESS CALLBACK HANDLER
      // Executed when the user successfully authorizes payment in the modal
      // ====================================================================
      handler: async function (response) {
        console.log("Razorpay Payment Success Callback Response:", response);

        try {
          // Send signature to backend for server-side HMAC verification
          const verifyRes = await fetch('/api/donate/verify-razorpay-signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature || 'simulated_valid_signature'
            })
          });

          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            document.getElementById('modal-txn-id').innerText = response.razorpay_payment_id || orderData.orderId;
            document.getElementById('success-modal').classList.remove('hidden');
          } else {
            alert('Payment verification failed: ' + (verifyData.error || 'Invalid signature'));
          }
        } catch (err) {
          console.error('Callback verification error:', err);
          alert('Network error while verifying payment signature.');
        }
      },
      
      modal: {
        ondismiss: function () {
          console.log("Razorpay payment modal closed by user.");
        }
      }
    };

    // 3. Launch Razorpay Payment Wizard
    const rzp1 = new Razorpay(options);
    rzp1.open();

  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
    console.error('Error in Razorpay checkout flow:', err);
    alert('Failed to connect to Razorpay payment server.');
  }
};

window.toggleUpiDrawer = function() {
  const drawer = document.getElementById('upi-drawer');
  if (drawer) {
    drawer.classList.toggle('hidden');
    if (!drawer.classList.contains('hidden')) {
      window.initiateUpiSession();
    }
  }
};

window.initiateUpiSession = async function() {
  const qrImage = document.getElementById('qr-image');
  const qrPlaceholder = document.getElementById('qr-placeholder');

  if (qrPlaceholder) {
    qrPlaceholder.innerText = 'Generating QR...';
    qrPlaceholder.classList.remove('hidden');
  }
  if (qrImage) qrImage.classList.add('hidden');

  try {
    const res = await fetch('/api/donate/initiate-upi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: currentAmount,
        currency: currentCurrency,
        donorName: 'Explorer',
        note: 'Journey with Ashutosh Support'
      })
    });

    const data = await res.json();
    if (data.success) {
      if (qrImage) {
        qrImage.src = data.qrDataUrl;
        qrImage.classList.remove('hidden');
      }
      if (qrPlaceholder) qrPlaceholder.classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed to generate UPI QR:', err);
  }
};

window.copyVPA = function() {
  const vpaEl = document.getElementById('upi-vpa-display');
  const vpa = vpaEl ? vpaEl.innerText : 'ashutosh@upi';
  navigator.clipboard.writeText(vpa);
  alert(`UPI ID "${vpa}" copied to clipboard!`);
};

window.closeModal = function() {
  document.getElementById('success-modal').classList.add('hidden');
};

// Format Card Number Input & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const customInput = document.getElementById('custom-amount-input');
  if (customInput) {
    customInput.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        currentAmount = val;
        window.renderPresets();
      }
    });
  }

  window.renderPresets();
});
