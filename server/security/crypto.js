const crypto = require('crypto');

/**
 * Generate unique transaction reference ID for donations
 */
function generateTransactionId() {
  const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 8);
  const randomBytes = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TXN_${dateStr}_${randomBytes}`;
}

/**
 * Compute HMAC-SHA256 signature for payment payloads
 */
function generateHmacSignature(payload, secret) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC-SHA256 signature using timing safe equal
 */
function verifyHmacSignature(payload, signature, secret) {
  try {
    const expected = generateHmacSignature(payload, secret);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    return false;
  }
}

/**
 * Basic XSS / HTML input sanitizer
 */
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

module.exports = {
  generateTransactionId,
  generateHmacSignature,
  verifyHmacSignature,
  sanitizeInput
};
