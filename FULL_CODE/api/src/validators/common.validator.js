/**
 * Common validation utilities for StoreGrid request payloads and query parameters
 */

function isValidUuid(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function isValidIsoDate(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim();
}

module.exports = {
  isValidUuid,
  isValidIsoDate,
  sanitizeString,
};
