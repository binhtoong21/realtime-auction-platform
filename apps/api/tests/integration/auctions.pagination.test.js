import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../src/config/database.js';
import { getAuctions } from '../../src/services/auction.service.js';
import { resetDb, createUser, createAuction } from './helpers/db.js';

const TIED_END = new Date('2030-01-01T00:00:00.000Z');
const fixtures = [];

const cmpId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Expected ordering per sort mode, mirroring the ORDER BY in getAuctions
const EXPECTED_ORDER = {
  newest: (a, b) => -cmpId(a, b),
  ending_soon: (a, b) => a.endAt - b.endAt || cmpId(a, b),
  price_asc: (a, b) => a.price - b.price || cmpId(a, b),
  price_desc: (a, b) => b.price - a.price || -cmpId(a, b),
};

async function addAuction(sellerId, price, endAt) {
  const id = await createAuction({ sellerId, currentPrice: price, endAt });
  fixtures.push({ id, price, endAt: endAt.getTime() });
}

beforeAll(async () => {
  await resetDb();
  const sellerId = await createUser();
  // 5 auctions share the same price and end time (tie-breaker must use id)
  for (let i = 0; i < 5; i++) {
    await addAuction(sellerId, 100, TIED_END);
  }
  await addAuction(sellerId, 50, new Date('2029-06-01T00:00:00.000Z'));
  await addAuction(sellerId, 200, new Date('2031-01-01T00:00:00.000Z'));
});

afterAll(async () => {
  await pool.end();
});

async function collectAllPages(sort, limit) {
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const { items, nextCursor } = await getAuctions({ sort, limit, cursor });
    expect(items.length).toBeLessThanOrEqual(limit);
    seen.push(...items.map((a) => a.id));
    cursor = nextCursor;
    pages += 1;
  } while (cursor && pages < 20);
  return seen;
}

describe.each(Object.keys(EXPECTED_ORDER))('getAuctions cursor pagination (sort=%s)', (sort) => {
  it.each([1, 2, 3])('returns every auction exactly once, in order, with limit=%i', async (limit) => {
    const seen = await collectAllPages(sort, limit);
    const expected = [...fixtures].sort(EXPECTED_ORDER[sort]).map((f) => f.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expected);
  });
});
