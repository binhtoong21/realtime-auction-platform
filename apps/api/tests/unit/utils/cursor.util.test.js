import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../../../src/utils/cursor.util.js';

describe('cursor.util', () => {
  describe('encodeCursor', () => {
    it('should encode a payload into a base64url string', () => {
      const payload = { sort: 'newest', id: 'abc-123' };
      const cursor = encodeCursor(payload);

      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);
      // base64url should not contain +, /, or = (padding may exist as url-safe variant)
      expect(cursor).not.toMatch(/[+/]/);
    });

    it('should produce different cursors for different payloads', () => {
      const c1 = encodeCursor({ sort: 'newest', id: 'aaa' });
      const c2 = encodeCursor({ sort: 'newest', id: 'bbb' });
      expect(c1).not.toBe(c2);
    });
  });

  describe('decodeCursor', () => {
    it('should round-trip encode → decode for newest sort', () => {
      const payload = { sort: 'newest', id: 'uuid-v7-value' };
      const cursor = encodeCursor(payload);
      const decoded = decodeCursor(cursor, 'newest');

      expect(decoded).toEqual(payload);
    });

    it('should round-trip encode → decode for ending_soon sort', () => {
      const payload = { sort: 'ending_soon', end_at: '2026-04-01T20:00:00.000Z', id: 'uuid-v7' };
      const cursor = encodeCursor(payload);
      const decoded = decodeCursor(cursor, 'ending_soon');

      expect(decoded).toEqual(payload);
    });

    it('should round-trip encode → decode for price_asc sort', () => {
      const payload = { sort: 'price_asc', current_price: '150000', id: 'uuid-v7' };
      const cursor = encodeCursor(payload);
      const decoded = decodeCursor(cursor, 'price_asc');

      expect(decoded).toEqual(payload);
    });

    it('should round-trip encode → decode for price_desc sort', () => {
      const payload = { sort: 'price_desc', current_price: '99999', id: 'uuid-v7' };
      const cursor = encodeCursor(payload);
      const decoded = decodeCursor(cursor, 'price_desc');

      expect(decoded).toEqual(payload);
    });

    it('should throw INVALID_CURSOR for non-base64 string', () => {
      expect(() => decodeCursor('not-valid-base64!!!', 'newest'))
        .toThrow('Invalid cursor format');

      try {
        decodeCursor('not-valid-base64!!!', 'newest');
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.errorCode).toBe('INVALID_CURSOR');
      }
    });

    it('should throw INVALID_CURSOR for valid base64 but invalid JSON', () => {
      const notJson = Buffer.from('this is not json').toString('base64url');

      expect(() => decodeCursor(notJson, 'newest'))
        .toThrow('Invalid cursor format');
    });

    it('should throw INVALID_CURSOR when cursor sort does not match current sort', () => {
      const cursor = encodeCursor({ sort: 'price_asc', current_price: '100', id: 'abc' });

      expect(() => decodeCursor(cursor, 'ending_soon'))
        .toThrow('Cursor does not match current sort mode');

      try {
        decodeCursor(cursor, 'ending_soon');
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.errorCode).toBe('INVALID_CURSOR');
      }
    });

    it('should throw INVALID_CURSOR when payload is missing id field', () => {
      const badPayload = Buffer.from(JSON.stringify({ sort: 'newest' })).toString('base64url');

      expect(() => decodeCursor(badPayload, 'newest'))
        .toThrow('Cursor is missing required field: id');
    });

    it('should throw INVALID_CURSOR when id is not a string', () => {
      const badPayload = Buffer.from(JSON.stringify({ sort: 'newest', id: 12345 })).toString('base64url');

      expect(() => decodeCursor(badPayload, 'newest'))
        .toThrow('Cursor is missing required field: id');
    });

    it('should throw INVALID_CURSOR for empty string cursor', () => {
      expect(() => decodeCursor('', 'newest')).toThrow();
    });
  });
});
