import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/config/database.js';
import { redisClient } from '../../src/config/redis.js';
import { resetDb, createUser, createAuction } from './helpers/db.js';

const TIED_END = new Date('2030-01-01T00:00:00.000Z');
const fixtures = [];

const cmpId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

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
  for (let i = 0; i < 5; i++) {
    await addAuction(sellerId, 100, TIED_END);
  }
  await addAuction(sellerId, 50, new Date('2029-06-01T00:00:00.000Z'));
  await addAuction(sellerId, 200, new Date('2031-01-01T00:00:00.000Z'));
});

afterAll(async () => {
  await pool.end();
  await redisClient.quit();
});

async function collectAllPagesHttp(sort, limit) {
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const query = { sort, limit };
    if (cursor) query.cursor = cursor;
    const res = await request(app).get('/auctions').query(query);
    expect(res.status).toBe(200);
    const { items, nextCursor } = res.body.data;
    expect(items.length).toBeLessThanOrEqual(limit);
    seen.push(...items.map((a) => a.id));
    cursor = nextCursor;
    pages += 1;
  } while (cursor && pages < 20);
  return seen;
}

describe.each(Object.keys(EXPECTED_ORDER))('GET /auctions cursor pagination (sort=%s)', (sort) => {
  it.each([1, 3])('returns every auction exactly once, in order, with limit=%i', async (limit) => {
    const seen = await collectAllPagesHttp(sort, limit);
    const expected = [...fixtures].sort(EXPECTED_ORDER[sort]).map((f) => f.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expected);
  });
});

describe('GET /auctions invalid cursor', () => {
  it('rejects a cursor with characters outside base64url', async () => {
    const res = await request(app).get('/auctions').query({ cursor: 'abc$%' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a cursor issued for a different sort', async () => {
    const first = await request(app).get('/auctions').query({ sort: 'newest', limit: 1 });
    const res = await request(app)
      .get('/auctions')
      .query({ sort: 'price_asc', limit: 1, cursor: first.body.data.nextCursor });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });
});
