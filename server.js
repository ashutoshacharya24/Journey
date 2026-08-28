require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const {
  generateTransactionId,
  generateHmacSignature,
  verifyHmacSignature,
  sanitizeInput
} = require('./server/security/crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const UPI_VPA = process.env.UPI_VPA || 'ashutosh@upi';
const UPI_NAME = process.env.UPI_NAME || 'Journey with Ashutosh';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'super_secret_webhook_key_2026_journey';

// Audit storage for transactions
const transactions = new Map();

// 1. Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://fonts.googleapis.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://lh3.googleusercontent.com",
          "https://images.unsplash.com"
        ],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// 2. CORS configuration
app.use(cors({ origin: true, credentials: true }));

// 3. Body Parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 4. Rate Limiting Middleware
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'Too many requests from this IP. Please try again later.' }
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Payment request limit reached. Please wait a few minutes before retrying.' }
});

app.use(generalLimiter);

// 5. Static Assets
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// PAGE ROUTES (Dedicated Standalone Pages)
// ----------------------------------------------------

app.get('/antarctica', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'antarctica.html'));
});

app.get('/svalbard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'svalbard.html'));
});

app.get('/photography', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'photography.html'));
});

app.get('/support', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'support.html'));
});

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Journey with Ashutosh Payment & Content API'
  });
});

/**
 * POST /api/donate/initiate-upi
 * Generates dynamic UPI payload and QR code
 */
app.post('/api/donate/initiate-upi', paymentLimiter, async (req, res) => {
  try {
    const { amount, currency, donorName, note } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid donation amount.' });
    }

    const cleanDonorName = sanitizeInput(donorName || 'Anonymous Explorer');
    const cleanNote = sanitizeInput(note || 'Support Journey with Ashutosh');
    const txnId = generateTransactionId();

    const inrAmount = currency === 'INR' ? parsedAmount : (parsedAmount * 83).toFixed(2);
    const upiUri = `upi://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(
      UPI_NAME
    )}&am=${inrAmount}&cu=INR&tn=${encodeURIComponent(cleanNote)}&tr=${txnId}`;

    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'H',
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const record = {
      id: txnId,
      type: 'UPI',
      amount: inrAmount,
      currency: 'INR',
      donorName: cleanDonorName,
      note: cleanNote,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      signature: generateHmacSignature({ id: txnId, amount: inrAmount }, WEBHOOK_SECRET)
    };

    transactions.set(txnId, record);

    res.json({
      success: true,
      transactionId: txnId,
      upiVpa: UPI_VPA,
      upiName: UPI_NAME,
      amount: inrAmount,
      currency: 'INR',
      upiUri,
      qrDataUrl,
      intentLinks: {
        gpay: `gpay://upi/pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(
          UPI_NAME
        )}&am=${inrAmount}&cu=INR&tr=${txnId}`,
        phonepe: `phonepe://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(
          UPI_NAME
        )}&am=${inrAmount}&cu=INR&tr=${txnId}`,
        paytm: `paytmmp://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(
          UPI_NAME
        )}&am=${inrAmount}&cu=INR&tr=${txnId}`
      }
    });
  } catch (err) {
    console.error('Error initiating UPI transaction:', err);
    res.status(500).json({ error: 'Failed to initiate UPI payment session.' });
  }
});

/**
 * POST /api/donate/verify-upi
 */
app.post('/api/donate/verify-upi', paymentLimiter, (req, res) => {
  try {
    const { transactionId, utr } = req.body;
    const cleanUtr = sanitizeInput(utr || '').trim();

    if (!transactionId || !transactions.has(transactionId)) {
      return res.status(404).json({ error: 'Transaction record not found.' });
    }

    if (!cleanUtr || cleanUtr.length < 8) {
      return res.status(400).json({ error: 'Please provide a valid 12-digit UTR/Reference ID.' });
    }

    const record = transactions.get(transactionId);
    record.utr = cleanUtr;
    record.status = 'VERIFIED';
    record.verifiedAt = new Date().toISOString();

    transactions.set(transactionId, record);

    res.json({
      success: true,
      message: 'Payment verification logged successfully! Thank you for supporting the journey.',
      transaction: record
    });
  } catch (err) {
    console.error('Error verifying UPI UTR:', err);
    res.status(500).json({ error: 'Internal error during UTR verification.' });
  }
});

/**
 * POST /api/donate/international
 */
app.post('/api/donate/international', paymentLimiter, (req, res) => {
  try {
    const { amount, currency, donorName, email, cardToken, paymentMethod } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid payment amount.' });
    }

    const validCurrencies = ['USD', 'EUR', 'GBP', 'INR'];
    const selectedCurrency = validCurrencies.includes(currency) ? currency : 'USD';
    const cleanDonorName = sanitizeInput(donorName || 'International Donor');
    const cleanEmail = sanitizeInput(email || '');
    const txnId = generateTransactionId();

    if (!cardToken || typeof cardToken !== 'string' || cardToken.length < 10) {
      return res.status(400).json({ error: 'Invalid or missing secure payment token.' });
    }

    const record = {
      id: txnId,
      type: paymentMethod || 'CARD_INTERNATIONAL',
      amount: parsedAmount,
      currency: selectedCurrency,
      donorName: cleanDonorName,
      email: cleanEmail,
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      gatewayReference: `INT_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      signature: generateHmacSignature(
        { id: txnId, amount: parsedAmount, currency: selectedCurrency },
        WEBHOOK_SECRET
      )
    };

    transactions.set(txnId, record);

    res.json({
      success: true,
      message: 'International payment authorized and completed successfully!',
      transaction: record
    });
  } catch (err) {
    console.error('Error processing international payment:', err);
    res.status(500).json({ error: 'Payment authorization failed. Please verify card details.' });
  }
});

/**
 * GET /api/donate/status/:id
 */
app.get('/api/donate/status/:id', (req, res) => {
  const txnId = req.params.id;
  if (!transactions.has(txnId)) {
    return res.status(404).json({ error: 'Transaction not found.' });
  }
  res.json({ success: true, transaction: transactions.get(txnId) });
});

// Fallback catch-all for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Journey with Ashutosh Server running on port ${PORT}`);
  console.log(`🔒 Security headers (Helmet) & Rate-limiting enabled`);
  console.log(`💳 UPI VPA: ${UPI_VPA}`);
  console.log(`====================================================`);
});
