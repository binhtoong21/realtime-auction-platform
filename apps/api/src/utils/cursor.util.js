/**
 * Cursor utilities for opaque, sort-aware cursor-based pagination.
 *
 * Cursor payload is a JSON object encoded as a URL-safe Base64 string.
 * The `sort` field is embedded to detect mismatches when a client switches
 * sort mode but re-sends a stale cursor (e.g. browser back-button, cache).
 */

/**
 * Encode a cursor payload into an opaque Base64url string.
 * @param {Object} payload - Must include `sort` and sort-specific fields.
 * @returns {string} Base64url-encoded cursor string.
 */
export function encodeCursor(payload) {
  const json = JSON.stringify(payload);
  return Buffer.from(json).toString('base64url');
}

/**
 * Decode and validate a cursor string.
 * Verifies that the embedded `sort` matches the current request sort param.
 *
 * @param {string} cursorString - The opaque cursor from the client.
 * @param {string} currentSort - The current sort query param from the request.
 * @returns {Object} Decoded cursor payload.
 * @throws {Error} 400 INVALID_CURSOR if decoding fails or sort mismatches.
 */
export function decodeCursor(cursorString, currentSort) {
  let payload;

  try {
    const json = Buffer.from(cursorString, 'base64url').toString('utf-8');
    payload = JSON.parse(json);
  } catch {
    const error = new Error('Invalid cursor format');
    error.statusCode = 400;
    error.errorCode = 'INVALID_CURSOR';
    throw error;
  }

  if (!payload || typeof payload !== 'object') {
    const error = new Error('Invalid cursor payload');
    error.statusCode = 400;
    error.errorCode = 'INVALID_CURSOR';
    throw error;
  }

  if (payload.sort !== currentSort) {
    const error = new Error(
      'Cursor does not match current sort mode. Please start pagination from the beginning when changing sort order.'
    );
    error.statusCode = 400;
    error.errorCode = 'INVALID_CURSOR';
    throw error;
  }

  if (!payload.id || typeof payload.id !== 'string') {
    const error = new Error('Cursor is missing required field: id');
    error.statusCode = 400;
    error.errorCode = 'INVALID_CURSOR';
    throw error;
  }

  // Validate sort-specific fields to prevent SQL execution errors
  switch (currentSort) {
    case 'ending_soon':
      if (!payload.end_at || isNaN(new Date(payload.end_at).getTime())) {
        const error = new Error('Cursor is missing or has invalid field: end_at');
        error.statusCode = 400;
        error.errorCode = 'INVALID_CURSOR';
        throw error;
      }
      break;
    case 'price_asc':
    case 'price_desc':
      if (payload.current_price === undefined || isNaN(Number(payload.current_price))) {
        const error = new Error('Cursor is missing or has invalid field: current_price');
        error.statusCode = 400;
        error.errorCode = 'INVALID_CURSOR';
        throw error;
      }
      break;
  }

  return payload;
}
