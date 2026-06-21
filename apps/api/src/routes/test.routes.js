import { Router } from 'express';
import { pool } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';
import { generateAccessToken } from '../utils/jwt.js';

const router = Router();

router.use((req, res, next) => {
  const dbName = process.env.DB_NAME || '';
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbName.includes('test') && !dbUrl.includes('test') && !dbUrl.includes('e2e')) {
    return next(new Error('Test routes are only allowed on test databases.'));
  }
  next();
});

let cachedHash = null;
const getPasswordHash = async () => {
  if (!cachedHash) {
    const salt = await bcrypt.genSalt(10);
    cachedHash = await bcrypt.hash('password123', salt);
  }
  return cachedHash;
};

router.post('/reset', async (req, res, next) => {
  try {
    await pool.query('TRUNCATE disputes, payments, auction_participants, payment_methods, bids, auctions, users, financial_audit_logs, webhook_events CASCADE');
    res.status(200).json({ success: true, message: 'Database reset successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/seed', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await getPasswordHash();

    // 0. Clean database
    await client.query('TRUNCATE disputes, payments, auction_participants, payment_methods, bids, auctions, users, financial_audit_logs, webhook_events CASCADE');

    // 1. Create Default Users
    const sellerId = uuidv7();
    const bidder1Id = uuidv7();
    const bidder2Id = uuidv7();
    const unverifiedId = uuidv7();
    const adminId = uuidv7();

    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, auth_provider, identity_status, connect_status, status, role) 
       VALUES 
       ($1, 'seller@example.com', $6, 'Seller Account', 'email', 'verified', 'payouts_enabled', 'active', 'user'),
       ($2, 'bidder1@example.com', $6, 'Bidder 1', 'email', 'verified', 'not_started', 'active', 'user'),
       ($3, 'bidder2@example.com', $6, 'Bidder 2', 'email', 'verified', 'not_started', 'active', 'user'),
       ($4, 'unverified@example.com', $6, 'Unverified User', 'email', 'not_started', 'not_started', 'unverified', 'user'),
       ($5, 'admin@example.com', $6, 'Admin User', 'email', 'verified', 'not_started', 'active', 'admin')`,
      [sellerId, bidder1Id, bidder2Id, unverifiedId, adminId, passwordHash]
    );

    const sellerToken = generateAccessToken({ id: sellerId, role: 'user' });
    const bidder1Token = generateAccessToken({ id: bidder1Id, role: 'user' });
    const bidder2Token = generateAccessToken({ id: bidder2Id, role: 'user' });
    const unverifiedToken = generateAccessToken({ id: unverifiedId, role: 'user' });
    const adminToken = generateAccessToken({ id: adminId, role: 'admin' });

    const responseData = {
      users: {
        seller: { id: sellerId, token: sellerToken, email: 'seller@example.com' },
        bidder1: { id: bidder1Id, token: bidder1Token, email: 'bidder1@example.com' },
        bidder2: { id: bidder2Id, token: bidder2Token, email: 'bidder2@example.com' },
        unverified: { id: unverifiedId, token: unverifiedToken, email: 'unverified@example.com' },
        admin: { id: adminId, token: adminToken, email: 'admin@example.com' },
      }
    };

    // 2. Custom Seeding if provided
    const { 
      auctions, 
      bids, 
      payment_methods, 
      auction_participants, 
      payments, 
      disputes 
    } = req.body;

    // A. Seed Auctions
    if (auctions && Array.isArray(auctions)) {
      for (const a of auctions) {
        const sId = a.seller_id === 'seller' ? sellerId : (a.seller_id || sellerId);
        await client.query(
          `INSERT INTO auctions (id, seller_id, title, current_price, bid_increment, status, end_at, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), COALESCE($9, NOW()))`,
          [a.id, sId, a.title, a.current_price, a.bid_increment, a.status || 'active', a.end_at, a.created_at, a.updated_at]
        );
      }
    }

    // B. Seed Payment Methods
    if (payment_methods && Array.isArray(payment_methods)) {
      for (const pm of payment_methods) {
        let uId = pm.user_id;
        if (uId === 'bidder1') uId = bidder1Id;
        else if (uId === 'bidder2') uId = bidder2Id;
        else if (uId === 'seller') uId = sellerId;
        await client.query(
          `INSERT INTO payment_methods (id, user_id, stripe_pm_id, last4, brand, is_default, expires_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [pm.id, uId, pm.stripe_pm_id, pm.last4, pm.brand, pm.is_default || false, pm.expires_at]
        );
      }
    }

    // C. Seed Auction Participants
    if (auction_participants && Array.isArray(auction_participants)) {
      for (const ap of auction_participants) {
        let uId = ap.user_id;
        if (uId === 'bidder1') uId = bidder1Id;
        else if (uId === 'bidder2') uId = bidder2Id;
        else if (uId === 'seller') uId = sellerId;
        await client.query(
          `INSERT INTO auction_participants (id, auction_id, user_id, stripe_si_id, payment_method_id, joined_at) 
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))`,
          [ap.id, ap.auction_id, uId, ap.stripe_si_id, ap.payment_method_id, ap.joined_at]
        );
      }
    }

    // D. Seed Bids
    if (bids && Array.isArray(bids)) {
      for (const b of bids) {
        let uId = b.bidder_id;
        if (uId === 'bidder1') uId = bidder1Id;
        else if (uId === 'bidder2') uId = bidder2Id;
        else if (uId === 'seller') uId = sellerId;
        await client.query(
          `INSERT INTO bids (id, auction_id, bidder_id, amount, created_at) 
           VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))`,
          [b.id, b.auction_id, uId, b.amount, b.created_at]
        );
      }
    }

    // E. Seed Payments
    if (payments && Array.isArray(payments)) {
      for (const p of payments) {
        let buyId = p.buyer_id;
        if (buyId === 'bidder1') buyId = bidder1Id;
        else if (buyId === 'bidder2') buyId = bidder2Id;
        let sellId = p.seller_id;
        if (sellId === 'seller') sellId = sellerId;
        await client.query(
          `INSERT INTO payments (id, auction_id, buyer_id, seller_id, amount, platform_fee_amount, stripe_pi_id, payment_method_id, status, grace_expires_at, capture_attempts) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [p.id, p.auction_id, buyId, sellId, p.amount, p.platform_fee_amount || 0, p.stripe_pi_id, p.payment_method_id, p.status || 'hold_pending', p.grace_expires_at, p.capture_attempts || 0]
        );
      }
    }

    // F. Seed Disputes
    if (disputes && Array.isArray(disputes)) {
      for (const d of disputes) {
        let openedBy = d.opened_by;
        if (openedBy === 'bidder1') openedBy = bidder1Id;
        else if (openedBy === 'bidder2') openedBy = bidder2Id;
        await client.query(
          `INSERT INTO disputes (id, payment_id, auction_id, opened_by, reason, description, status, deadline_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [d.id, d.payment_id, d.auction_id, openedBy, d.reason, d.description, d.status || 'open', d.deadline_at || new Date(Date.now() + 24 * 60 * 60 * 1000)]
        );
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

export default router;
