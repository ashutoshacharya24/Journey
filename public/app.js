// SPA State Store
let currentCurrency = 'INR';
let currentAmount = 500;
let currentPaymentTab = 'upi';
let activeTxnId = null;

// Presets by Currency
const currencyPresets = {
  INR: [500, 1500, 5000],
  USD: [10, 50, 100],
  EUR: [10, 45, 90],
  GBP: [8, 40, 80]
};

const currencySymbols = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£'
};

// --------------------------------------------------
// SPA Navigation
// --------------------------------------------------
window.showSection = function(sectionId) {
  const pages = document.querySelectorAll('.spa-page');
  pages.forEach(p => p.classList.add('hidden'));

  const target = document.getElementById(`${sectionId}-section`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('spa-page');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// Mobile Nav Toggle
window.toggleMobileNav = function() {
  const mobileNav = document.getElementById('mobileNav');
  if (mobileNav) {
    mobileNav.classList.toggle('-translate-x-full');
  }
};

// --------------------------------------------------
// Currency & Donation Amount Engine
// --------------------------------------------------
window.renderPresets = function() {
  const container = document.getElementById('preset-container');
  const symbol = currencySymbols[currentCurrency];
  const presets = currencyPresets[currentCurrency];

  if (!container) return;

  container.innerHTML = presets
    .map(
      amt => `
    <button onclick="window.setPresetAmount(${amt})" class="preset-btn p-4 rounded-xl border ${
        amt === currentAmount
          ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-white'
          : 'border-white/10 bg-[#131315] text-on-surface-variant hover:text-white'
      } font-bold text-sm text-center transition-all">
      ${symbol}${amt}
    </button>
  `
    )
    .join('');

  const symbolEl = document.getElementById('currency-symbol');
  if (symbolEl) symbolEl.innerText = symbol;
};

window.setCurrency = function(curr) {
  currentCurrency = curr;
  currentAmount = currencyPresets[curr][0];

  document.querySelectorAll('.curr-btn').forEach(btn => {
    btn.classList.remove('bg-[#bec6e0]', 'text-[#0F172A]');
    btn.classList.add('text-on-surface-variant');
  });

  const activeBtn = document.getElementById(`curr-${curr}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-[#bec6e0]', 'text-[#0F172A]');
    activeBtn.classList.remove('text-on-surface-variant');
  }

  const customInput = document.getElementById('custom-amount-input');
  if (customInput) customInput.value = '';
  window.renderPresets();
  if (currentPaymentTab === 'upi') window.initiateUpiSession();
};

window.setPresetAmount = function(amt) {
  currentAmount = amt;
  const customInput = document.getElementById('custom-amount-input');
  if (customInput) customInput.value = '';
  window.renderPresets();
  if (currentPaymentTab === 'upi') window.initiateUpiSession();
};

window.setCustomAmount = function(amt) {
  currentAmount = parseFloat(amt);
  window.renderPresets();
  if (currentPaymentTab === 'upi') window.initiateUpiSession();
};

// --------------------------------------------------
// Payment Method Tabs
// --------------------------------------------------
window.setPaymentTab = function(tab) {
  currentPaymentTab = tab;

  document.querySelectorAll('.pay-tab').forEach(b => {
    b.classList.remove('border-[#F59E0B]', 'bg-[#F59E0B]/10', 'text-white');
    b.classList.add('border-white/10', 'bg-[#131315]', 'text-on-surface-variant');
  });

  const activeTab = document.getElementById(`tab-${tab}`);
  if (activeTab) {
    activeTab.classList.add('border-[#F59E0B]', 'bg-[#F59E0B]/10', 'text-white');
    activeTab.classList.remove('border-white/10', 'bg-[#131315]', 'text-on-surface-variant');
  }

  document.querySelectorAll('.payment-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.classList.remove('hidden');

  if (tab === 'upi') window.initiateUpiSession();
};

// --------------------------------------------------
// UPI & QR Code Backend Integration
// --------------------------------------------------
window.initiateUpiSession = async function() {
  const qrImage = document.getElementById('qr-image');
  const qrPlaceholder = document.getElementById('qr-placeholder');

  if (qrPlaceholder) {
    qrPlaceholder.innerText = 'Generating Dynamic QR...';
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
      activeTxnId = data.transactionId;
      if (qrImage) {
        qrImage.src = data.qrDataUrl;
        qrImage.classList.remove('hidden');
      }
      if (qrPlaceholder) qrPlaceholder.classList.add('hidden');

      const vpaDisplay = document.getElementById('upi-vpa-display');
      if (vpaDisplay) vpaDisplay.innerText = data.upiVpa;

      // Mobile Intent Links
      const gpay = document.getElementById('intent-gpay');
      const phonepe = document.getElementById('intent-phonepe');
      const paytm = document.getElementById('intent-paytm');

      if (gpay) gpay.href = data.intentLinks.gpay;
      if (phonepe) phonepe.href = data.intentLinks.phonepe;
      if (paytm) paytm.href = data.intentLinks.paytm;
    }
  } catch (err) {
    console.error('Failed to generate UPI QR:', err);
    if (qrPlaceholder) qrPlaceholder.innerText = 'Error generating QR code.';
  }
};

window.copyVPA = function() {
  const vpaEl = document.getElementById('upi-vpa-display');
  const vpa = vpaEl ? vpaEl.innerText : 'ashutosh@upi';
  navigator.clipboard.writeText(vpa);
  alert(`UPI ID "${vpa}" copied to clipboard!`);
};

window.verifyUtr = async function() {
  const utrInput = document.getElementById('utr-input');
  const utr = utrInput ? utrInput.value.trim() : '';
  if (!utr) {
    alert('Please enter your 12-digit UPI UTR reference number.');
    return;
  }

  try {
    const res = await fetch('/api/donate/verify-upi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: activeTxnId,
        utr
      })
    });

    const data = await res.json();
    if (data.success) {
      document.getElementById('modal-txn-id').innerText = `${data.transaction.id} (UTR: ${utr})`;
      document.getElementById('success-modal').classList.remove('hidden');
    } else {
      alert(data.error || 'Verification failed. Please check your UTR.');
    }
  } catch (err) {
    alert('Error connecting to verification server.');
  }
};

// --------------------------------------------------
// International Card Payment Handler
// --------------------------------------------------
window.processCardPayment = async function() {
  const name = document.getElementById('card-name').value.trim();
  const email = document.getElementById('card-email').value.trim();
  const number = document.getElementById('card-number').value.replace(/\s+/g, '');
  const expiry = document.getElementById('card-expiry').value.trim();
  const cvc = document.getElementById('card-cvc').value.trim();

  if (!name || !email || !number || !expiry || !cvc) {
    alert('Please fill in all credit/debit card fields.');
    return;
  }

  if (number.length < 13) {
    alert('Please enter a valid card number.');
    return;
  }

  try {
    const simulatedCardToken = `tok_client_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const res = await fetch('/api/donate/international', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: currentAmount,
        currency: currentCurrency,
        donorName: name,
        email: email,
        cardToken: simulatedCardToken,
        paymentMethod: 'CARD_INTERNATIONAL'
      })
    });

    const data = await res.json();
    if (data.success) {
      document.getElementById('modal-txn-id').innerText = data.transaction.id;
      document.getElementById('success-modal').classList.remove('hidden');
    } else {
      alert(data.error || 'Card processing failed.');
    }
  } catch (err) {
    alert('Network error while processing international payment.');
  }
};

window.processPaypalPayment = function() {
  alert('Redirecting to PayPal Checkout... Thank you for your support!');
};

window.closeModal = function() {
  document.getElementById('success-modal').classList.add('hidden');
};

// --------------------------------------------------
// Lightbox Gallery
// --------------------------------------------------
window.openLightbox = function(src, title) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');

  if (modal && img && caption) {
    img.src = src;
    caption.innerText = title;
    modal.classList.remove('hidden');
  }
};

window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) modal.classList.add('hidden');
};

// Format Card Number Input automatically
document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menuBtn');
  const closeNavBtn = document.getElementById('closeNavBtn');
  if (menuBtn) menuBtn.addEventListener('click', window.toggleMobileNav);
  if (closeNavBtn) closeNavBtn.addEventListener('click', window.toggleMobileNav);

  const customInput = document.getElementById('custom-amount-input');
  if (customInput) {
    customInput.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        currentAmount = val;
        window.renderPresets();
        if (currentPaymentTab === 'upi') window.initiateUpiSession();
      }
    });
  }

  const cardNumInput = document.getElementById('card-number');
  if (cardNumInput) {
    cardNumInput.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '');
      val = val.substring(0, 16);
      e.target.value = val.replace(/(.{4})/g, '$1 ').trim();
    });
  }

  window.renderPresets();
  window.initiateUpiSession();
});
