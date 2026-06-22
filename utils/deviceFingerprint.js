const crypto = require('crypto');

/**
 * Generate a lightweight device fingerprint from request headers.
 * Uses SHA-256 of (user-agent + ip + accept-language).
 * No PII stored — just a consistency signal for abuse detection.
 *
 * @param {object} req - Express request object
 * @returns {string} 16-char hex fingerprint
 */
const generateFingerprint = (req) => {
  const raw = [
    req.ip || '',
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
};

module.exports = { generateFingerprint };
