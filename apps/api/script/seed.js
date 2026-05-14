import 'dotenv/config';
import { pool } from '../src/config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { generateAccessToken } from '../src/utils/jwt.js';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create Users
    const sellerId = uuidv7();
    const bidderId = uuidv7();
    const unverifiedId = uuidv7();
    
    // Seller - Fully KYC'd & Onboarded
    await client.query(
      `INSERT INTO users (id, email, auth_provider, identity_status, connect_status) 
       VALUES ($1, $2, $3, $4, $5)`,
      [sellerId, 'seller@example.com', 'email', 'verified', 'payouts_enabled']
    );
    
    // Bidder - Identity verified, Connect not started
    await client.query(
      `INSERT INTO users (id, email, auth_provider, identity_status, connect_status) 
       VALUES ($1, $2, $3, $4, $5)`,
      [bidderId, 'bidder@example.com', 'email', 'verified', 'not_started']
    );

    // Unverified User
    await client.query(
      `INSERT INTO users (id, email, auth_provider, identity_status, connect_status) 
       VALUES ($1, $2, $3, $4, $5)`,
      [unverifiedId, 'unverified@example.com', 'email', 'not_started', 'not_started']
    );

    // Generate Tokens
    // token expiration in generateAccessToken is 15m by default, 
    // but for seed testing we generate tokens valid for 24h
    const sellerToken = generateAccessToken({ id: sellerId, role: 'user' });
    const bidderToken = generateAccessToken({ id: bidderId, role: 'user' });
    const unverifiedToken = generateAccessToken({ id: unverifiedId, role: 'user' });

    // 2. Create Auction
    const auctionId = uuidv7();
    // End time is 2 hours from now
    const endAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    
    await client.query(
      `INSERT INTO auctions (id, seller_id, title, current_price, bid_increment, status, end_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [auctionId, sellerId, 'Vintage Rolex Submariner', 500000, 10000, 'active', endAt]
    );

    await client.query('COMMIT');
    console.log('--- Seed Data Inserted Successfully ---');
    console.log(`Seller ID        : ${sellerId}`);
    console.log(`Seller Token     : Bearer ${sellerToken}\n`);
    
    console.log(`Bidder ID        : ${bidderId}`);
    console.log(`Bidder Token     : Bearer ${bidderToken}\n`);

    console.log(`Unverified ID    : ${unverifiedId}`);
    console.log(`Unverified Token : Bearer ${unverifiedToken}\n`);

    console.log(`Auction ID       : ${auctionId}`);
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
