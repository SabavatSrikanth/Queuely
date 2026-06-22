/**
 * Generate a sequential, service-prefixed ticket number
 * Format: {SERVICE_CODE}-{ZERO_PADDED_NUMBER}
 * e.g. CON-0042, GEN-0001
 *
 * @param {string} serviceCode - Short code for the service (e.g. "CON")
 * @param {number} count - Current queue count for this service today
 * @returns {string} Ticket number
 */
const generateTicketNumber = (serviceCode, count) => {
  const code = (serviceCode || 'Q').toUpperCase().slice(0, 4);
  const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;
  const num = String(safeCount + 1).padStart(4, '0');
  return `${code}-${num}`;
};

module.exports = { generateTicketNumber };
