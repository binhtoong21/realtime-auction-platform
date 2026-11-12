import { v7 as uuidv7 } from 'uuid';
import { pool } from '../../../src/config/database.js';

export async function resetDb() {
  await pool.query('TRUNCATE TABLE auctions, categories, users RESTART IDENTITY CASCADE');
}

export async function createUser({ email } = {}) {
  const id = uuidv7();
  await pool.query(
    `INSERT INTO users (id, email, auth_provider) VALUES ($1, $2, 'email')`,
    [id, email ?? `${id}@test.local`],
  );
  return id;
}

export async function createAuction({
  sellerId,
  title = 'Integration test auction',
  currentPrice = 100,
  endAt = new Date(Date.now() + 24 * 60 * 60 * 1000),
  status = 'active',
}) {
  const id = uuidv7();
  await pool.query(
    `INSERT INTO auctions (id, seller_id, title, current_price, bid_increment, end_at, status)
     VALUES ($1, $2, $3, $4, 1, $5, $6)`,
    [id, sellerId, title, currentPrice, endAt, status],
  );
  return id;
}
