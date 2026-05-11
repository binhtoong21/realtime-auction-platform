import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { scheduleAuctionStart, scheduleAuctionEnd, removeAuctionJobs } from '../jobs/queue.js';
import stripe from '../config/stripe.js';
import { ensureStripeCustomer } from './kyc.service.js';
/**
 * Lấy danh sách auctions với Cursor-based Pagination
 * Cursor dựa trên created_at để tránh duplicate/skip khi có auction mới.
 */
export const getAuctions = async ({ status, categoryId, sellerId, cursor, limit = 20 }) => {
  let query = `
    SELECT a.id, a.title, a.current_price, a.status, a.end_at, a.images, a.created_at,
           c.name as category_name
    FROM auctions a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE 1=1
  `;
  const values = [];
  let paramCount = 1;

  if (status) {
    query += ` AND a.status = $${paramCount}`;
    values.push(status);
    paramCount++;
  }

  if (categoryId) {
    query += ` AND a.category_id = $${paramCount}`;
    values.push(categoryId);
    paramCount++;
  }

  if (sellerId) {
    // Nếu truyền chuỗi 'me', controller cần map 'me' thành user.id hiện tại.
    // Tạm thời ở layer DB chỉ nhận UUID hợp lệ.
    query += ` AND a.seller_id = $${paramCount}`;
    values.push(sellerId);
    paramCount++;
  }

  if (cursor) {
    // cursor là timestamp (created_at) của record cuối cùng ở page trước
    query += ` AND a.created_at < $${paramCount}`;
    values.push(new Date(cursor));
    paramCount++;
  }

  // Sắp xếp mới nhất lên đầu
  query += ` ORDER BY a.created_at DESC LIMIT $${paramCount}`;
  values.push(limit);

  const result = await pool.query(query, values);
  const items = result.rows;

  let nextCursor = null;
  if (items.length > 0 && items.length === Number(limit)) {
    nextCursor = items[items.length - 1].created_at.toISOString();
  }

  return {
    items,
    nextCursor,
  };
};

/**
 * Lấy chi tiết 1 phiên đấu giá
 */
export const getAuctionById = async (id) => {
  const query = `
    SELECT a.*, 
           c.name as category_name, c.slug as category_slug,
           u.display_name as seller_name,
           (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) as bid_count
    FROM auctions a
    LEFT JOIN categories c ON a.category_id = c.id
    JOIN users u ON a.seller_id = u.id
    WHERE a.id = $1
  `;
  const result = await pool.query(query, [id]);
  
  if (result.rows.length === 0) {
    const error = new Error('Auction not found');
    error.statusCode = 404;
    error.errorCode = 'AUCTION_NOT_FOUND';
    throw error;
  }
  
  return result.rows[0];
};

/**
 * Lấy lịch sử bid của 1 auction
 */
export const getBidsByAuctionId = async (auctionId, limit = 50) => {
  // Lịch sử bid chỉ cần limit 50 là đủ cho UI thông thường.
  // Sắp xếp bid cao nhất (hoặc mới nhất) lên đầu.
  const query = `
    SELECT b.id, b.amount, b.created_at, b.is_winning,
           u.display_name as bidder_name
    FROM bids b
    JOIN users u ON b.bidder_id = u.id
    WHERE b.auction_id = $1
    ORDER BY b.amount DESC, b.created_at ASC
    LIMIT $2
  `;
  const result = await pool.query(query, [auctionId, limit]);
  return result.rows;
};

/**
 * Tạo một phiên đấu giá mới
 */
export const createAuction = async (sellerId, data) => {
  const { title, description, images, starting_price, reserve_price, bid_increment, start_at, end_at, category_id } = data;

  // Validate category_id first
  const categoryResult = await pool.query('SELECT id FROM categories WHERE id = $1', [category_id]);
  if (categoryResult.rowCount === 0) {
    const error = new Error('Category not found');
    error.statusCode = 404;
    error.errorCode = 'CATEGORY_NOT_FOUND';
    throw error;
  }

  const id = uuidv7();

  const query = `
    INSERT INTO auctions (
      id, title, description, images, current_price, reserve_price, bid_increment,
      start_at, end_at, category_id, seller_id, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft'
    ) RETURNING *
  `;

  const values = [
    id, title, description, JSON.stringify(images), starting_price, reserve_price, bid_increment,
    start_at, end_at, category_id, sellerId
  ];

  const result = await pool.query(query, values);
  const auction = result.rows[0];

  // Schedule background jobs
  await scheduleAuctionStart(auction.id, auction.start_at);
  await scheduleAuctionEnd(auction.id, auction.end_at);

  return auction;
};

/**
 * Cập nhật phiên đấu giá
 */
export const updateAuction = async (id, sellerId, data) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    if (data.category_id) {
      const categoryResult = await client.query('SELECT id FROM categories WHERE id = $1', [data.category_id]);
      if (categoryResult.rowCount === 0) {
        const error = new Error('Category not found');
        error.statusCode = 404;
        error.errorCode = 'CATEGORY_NOT_FOUND';
        throw error;
      }
    }

    // Build UPDATE query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    const fields = ['title', 'description', 'images', 'reserve_price', 'bid_increment', 'start_at', 'end_at', 'category_id'];
    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(field === 'images' ? JSON.stringify(data[field]) : data[field]);
        paramCount++;
      }
    }

    if (data.starting_price !== undefined) {
      updates.push(`current_price = $${paramCount}`);
      values.push(data.starting_price);
      paramCount++;
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return (await pool.query('SELECT * FROM auctions WHERE id = $1', [id])).rows[0];
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, sellerId);

    const updateQuery = `
      UPDATE auctions a
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
        AND seller_id = $${paramCount + 1}
        AND status IN ('draft', 'active')
        AND NOT EXISTS (SELECT 1 FROM bids WHERE auction_id = a.id)
      RETURNING *
    `;
    
    const result = await client.query(updateQuery, values);
    
    if (result.rowCount === 0) {
      // Find out exact reason
      const checkResult = await client.query('SELECT status, (SELECT COUNT(*) FROM bids WHERE auction_id = $1) as bid_count FROM auctions WHERE id = $1 AND seller_id = $2', [id, sellerId]);
      if (checkResult.rowCount === 0) {
        const error = new Error('Auction not found or you do not have permission');
        error.statusCode = 404;
        error.errorCode = 'AUCTION_NOT_FOUND';
        throw error;
      }
      const auction = checkResult.rows[0];
      if (parseInt(auction.bid_count, 10) > 0) {
        const error = new Error('Cannot update auction after bids have been placed');
        error.statusCode = 403;
        error.errorCode = 'AUCTION_HAS_BIDS';
        throw error;
      }
      const error = new Error('Cannot update auction in current status');
      error.statusCode = 403;
      error.errorCode = 'INVALID_STATUS';
      throw error;
    }

    const updatedAuction = result.rows[0];
    
    // Reschedule jobs if time changed
    if (data.start_at || data.end_at) {
      await removeAuctionJobs(id);
      await scheduleAuctionStart(id, updatedAuction.start_at);
      await scheduleAuctionEnd(id, updatedAuction.end_at);
    }

    await client.query('COMMIT');
    return updatedAuction;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Hủy bỏ phiên đấu giá
 */
export const cancelAuction = async (id, sellerId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const updateQuery = `
      UPDATE auctions a
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 
        AND seller_id = $2
        AND status NOT IN ('ended', 'completed', 'cancelled')
        AND NOT EXISTS (SELECT 1 FROM bids WHERE auction_id = a.id)
      RETURNING *
    `;

    const result = await client.query(updateQuery, [id, sellerId]);

    if (result.rowCount === 0) {
      // Determine exactly why it failed
      const checkResult = await client.query('SELECT status, (SELECT COUNT(*) FROM bids WHERE auction_id = $1) as bid_count FROM auctions WHERE id = $1 AND seller_id = $2', [id, sellerId]);
      if (checkResult.rowCount === 0) {
        const error = new Error('Auction not found or you do not have permission');
        error.statusCode = 404;
        error.errorCode = 'AUCTION_NOT_FOUND';
        throw error;
      }
      const auction = checkResult.rows[0];
      if (parseInt(auction.bid_count, 10) > 0) {
        const error = new Error('Cannot cancel auction after bids have been placed');
        error.statusCode = 403;
        error.errorCode = 'AUCTION_HAS_BIDS';
        throw error;
      }
      const error = new Error('Auction cannot be cancelled in its current state');
      error.statusCode = 403;
      error.errorCode = 'INVALID_STATUS';
      throw error;
    }

    await removeAuctionJobs(id);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Join an auction — creates a Stripe SetupIntent for the buyer.
 * Handles 3 states: new join, already confirmed, pending-expired (re-create SI).
 */
export const joinAuction = async (userId, auctionId) => {
  // Validate auction exists and is active
  const auctionResult = await pool.query(
    'SELECT id, seller_id, status FROM auctions WHERE id = $1',
    [auctionId]
  );

  if (auctionResult.rows.length === 0) {
    const error = new Error('Auction not found');
    error.statusCode = 404;
    error.errorCode = 'AUCTION_NOT_FOUND';
    throw error;
  }

  const auction = auctionResult.rows[0];

  if (auction.status !== 'active') {
    const error = new Error('Auction is not active');
    error.statusCode = 400;
    error.errorCode = 'AUCTION_NOT_ACTIVE';
    throw error;
  }

  if (auction.seller_id === userId) {
    const error = new Error('Seller cannot join their own auction');
    error.statusCode = 403;
    error.errorCode = 'SELLER_CANNOT_BID';
    throw error;
  }

  // Check existing participant row
  const existingResult = await pool.query(
    'SELECT id, payment_method_id, stripe_si_id FROM auction_participants WHERE auction_id = $1 AND user_id = $2',
    [auctionId, userId]
  );

  // Case 2: Already joined and confirmed
  if (existingResult.rows.length > 0 && existingResult.rows[0].payment_method_id) {
    return { alreadyJoined: true };
  }

  // Ensure user has a Stripe Customer
  const user = await ensureStripeCustomer(userId);

  // Create a new SetupIntent
  const setupIntent = await stripe.setupIntents.create({
    customer: user.stripe_cus_id,
    usage: 'off_session',
    metadata: { auction_id: auctionId, user_id: userId },
  });

  if (existingResult.rows.length > 0) {
    // Case 3: Row exists but payment_method_id is NULL (SI expired or abandoned)
    await pool.query(
      'UPDATE auction_participants SET stripe_si_id = $1, joined_at = NOW() WHERE id = $2',
      [setupIntent.id, existingResult.rows[0].id]
    );
  } else {
    // Case 1: New participant
    await pool.query(
      `INSERT INTO auction_participants (id, auction_id, user_id, stripe_si_id)
       VALUES ($1, $2, $3, $4)`,
      [uuidv7(), auctionId, userId, setupIntent.id]
    );
  }

  return { clientSecret: setupIntent.client_secret };
};
