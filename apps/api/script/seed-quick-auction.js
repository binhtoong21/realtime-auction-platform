import 'dotenv/config';
import { pool } from '../src/config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { scheduleAuctionEnd } from '../src/jobs/queue.js';

/**
 * Seed a test auction that ends in 30 seconds.
 * Used to test the BullMQ auction-end worker.
 * Usage: node script/seed-quick-auction.js
 */
async function seedQuickAuction() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get or create users
    let sellerResult = await client.query(`SELECT id FROM users WHERE email = 'seller@example.com'`);
    let bidderResult = await client.query(`SELECT id FROM users WHERE email = 'bidder@example.com'`);

    let sellerId, bidderId;

    if (sellerResult.rowCount === 0) {
      sellerId = uuidv7();
      bidderId = uuidv7();
      await client.query(
        `INSERT INTO users (id, email, auth_provider, kyc_status) VALUES ($1, $2, $3, $4)`,
        [sellerId, 'seller@example.com', 'email', 'verified']
      );
      await client.query(
        `INSERT INTO users (id, email, auth_provider, kyc_status) VALUES ($1, $2, $3, $4)`,
        [bidderId, 'bidder@example.com', 'email', 'verified']
      );
    } else {
      sellerId = sellerResult.rows[0].id;
      bidderId = bidderResult.rows[0].id;
    }

    // 2. Create auction ending in 30 seconds
    const auctionId = uuidv7();
    const endAt = new Date(Date.now() + 30 * 1000); // 30 seconds from now

    await client.query(
      `INSERT INTO auctions (id, seller_id, title, current_price, bid_increment, status, end_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [auctionId, sellerId, 'Quick Test Auction (30s)', 10000, 1000, 'active', endAt]
    );

    await client.query('COMMIT');

    // 3. Schedule auction-end job in BullMQ
    await scheduleAuctionEnd(auctionId, endAt);

    console.log('--- Quick Auction Seeded ---');
    console.log(`Auction ID : ${auctionId}`);
    console.log(`Seller ID  : ${sellerId}`);
    console.log(`Bidder ID  : ${bidderId}`);
    console.log(`Ends at    : ${endAt.toISOString()} (in ~30 seconds)`);
    console.log('----------------------------');
    console.log('Now start the server (npm run dev) and watch the worker process the auction-end job.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding:', error);
  } finally {
    client.release();
    pool.end();
    process.exit(0);
  }
}

seedQuickAuction();
