import { pool } from '../config/database.js';

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
