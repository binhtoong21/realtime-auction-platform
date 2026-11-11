import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../src/config/database.js';
import { getAuctions } from '../../src/services/auction.service.js';
import { resetDb, createUser, createAuction } from './helpers/db.js';

const SORTS = ['newest', 'ending_soon', 'price_asc', 'price_desc'];
const TIED_END = new Date('2030-01-01T00:00:00.000Z');
const ids = [];

beforeAll(async () => {
  await resetDb();
  const sellerId = await createUser();
  // 5 auctions share the same price and end time (tie-breaker must use id)
  for (let i = 0; i < 5; i++) {
    ids.push(await createAuction({ sellerId, currentPrice: 100, endAt: TIED_END }));
  }
  ids.push(await createAuction({ sellerId, currentPrice: 50, endAt: new Date('2029-06-01T00:00:00.000Z') }));
  ids.push(await createAuction({ sellerId, currentPrice: 200, endAt: new Date('2031-01-01T00:00:00.000Z') }));
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
    seen.push(...items.map((a) => a.id));
    cursor = nextCursor;
    pages += 1;
  } while (cursor && pages < 20);
  return seen;
}

describe.each(SORTS)('getAuctions cursor pagination (sort=%s)', (sort) => {
  it.each([1, 2, 3])('returns every auction exactly once with limit=%i', async (limit) => {
    const seen = await collectAllPages(sort, limit);
    expect(seen).toHaveLength(ids.length);
    expect(new Set(seen).size).toBe(ids.length);
    expect([...seen].sort()).toEqual([...ids].sort());
  });
});
