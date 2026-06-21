import 'dotenv/config';
import { pool } from '../src/config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { generateAccessToken } from '../src/utils/jwt.js';

import bcrypt from 'bcryptjs';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Error: Refusing to seed database in production environment.');
    process.exit(1);
  }

  // Default password for all seeded users: password123
  // Executing CPU-bound bcrypt operations before acquiring DB connection/transaction
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Clear existing data
    await client.query('TRUNCATE users, auctions, bids, payment_methods, auction_participants, payments CASCADE');

    // 1. Create Users
    const sellerId = uuidv7();
    const bidderId = uuidv7();
    const unverifiedId = uuidv7();
    
    // Seller - Fully KYC'd & Onboarded
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, auth_provider, identity_status, connect_status, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sellerId, 'seller@example.com', passwordHash, 'Seller Account', 'email', 'verified', 'payouts_enabled', 'active']
    );
    
    // Bidder - Identity verified, Connect not started
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, auth_provider, identity_status, connect_status, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [bidderId, 'bidder@example.com', passwordHash, 'Bidder Account', 'email', 'verified', 'not_started', 'active']
    );

    // Unverified User
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, auth_provider, identity_status, connect_status, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [unverifiedId, 'unverified@example.com', passwordHash, 'Unverified Account', 'email', 'not_started', 'not_started', 'unverified']
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
