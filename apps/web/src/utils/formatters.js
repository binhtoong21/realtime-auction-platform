/**
 * Format a number as VND currency.
 * @param {number} amount
 * @returns {string} Formatted string
 */
export function formatCurrency(amount) {
  if (amount == null) return '';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

/**
 * Converts a local datetime-local string to a UTC ISO string.
 * This relies on the browser's native Date parsing, which treats
 * a bare datetime string (like "2026-07-08T10:00") as local wall-clock time.
 * We then output it as a UTC ISO string safely without manual offset math.
 * 
 * @param {string} localDateString e.g. "2026-07-08T10:00"
 * @returns {string} e.g. "2026-07-08T03:00:00.000Z" (if in GMT+7)
 */
export function parseLocalToUTC(localDateString) {
  if (!localDateString) return null;
  const dateObj = new Date(localDateString);
  if (Number.isNaN(dateObj.getTime())) return null;
  return dateObj.toISOString();
}
