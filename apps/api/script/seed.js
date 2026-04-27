import 'dotenv/config';
import { pool } from '../src/config/database.js';
import { v7 as uuidv7 } from 'uuid';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create Users
    const sellerId = uuidv7();
    const bidderId = uuidv7();
    
    await client.query(
      `INSERT INTO users (id, email, auth_provider, kyc_status) VALUES ($1, $2, $3, $4)`,
      [sellerId, 'seller@example.com', 'email', 'verified']
    );
    
    await client.query(
      `INSERT INTO users (id, email, auth_provider, kyc_status) VALUES ($1, $2, $3, $4)`,
      [bidderId, 'bidder@example.com', 'email', 'verified']
    );

    // 2. Create Auction
    const auctionId = uuidv7();
    // End time is 2 hours from now
    const endAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    
    await client.query(
      `INSERT INTO auctions (id, seller_id, title, current_price, bid_increment, status, end_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [auctionId, sellerId, 'Vintage Rolex Submariner', 5000.00, 100.00, 'active', endAt]
    );

    await client.query('COMMIT');
    console.log('--- Seed Data Inserted Successfully ---');
    console.log(`Seller ID  : ${sellerId}`);
    console.log(`Bidder ID  : ${bidderId}`);
    console.log(`Auction ID : ${auctionId}`);
    console.log('---------------------------------------');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', error);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
