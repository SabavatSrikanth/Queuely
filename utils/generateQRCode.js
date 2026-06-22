const QRCode = require('qrcode');

/**
 * Generate a QR code as a data URL (base64 PNG)
 * @param {string} text - Content to encode (URL)
 * @returns {Promise<string>} Data URL string
 */
const generateQRDataURL = async (text) => {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width: 400,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  });
};

/**
 * Generate a QR code as a Buffer
 * @param {string} text - Content to encode
 * @returns {Promise<Buffer>} PNG buffer
 */
const generateQRBuffer = async (text) => {
  return await QRCode.toBuffer(text, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 400,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  });
};

module.exports = { generateQRDataURL, generateQRBuffer };
