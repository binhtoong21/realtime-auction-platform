import { pool } from '../config/database.js';

/**
 * Toggle an auction in the user's watchlist.
 * If already watched, removes it. If not, adds it.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.auctionId
 * @returns {Promise<{ inWatchlist: boolean, auctionId: string }>}
 */
export const toggleWatchlist = async ({ userId, auctionId }) => {
  // 1. Verify auction exists
  const auctionCheck = await pool.query(
    'SELECT id FROM auctions WHERE id = $1',
    [auctionId]
  );

  if (auctionCheck.rows.length === 0) {
    const error = new Error('Auction not found');
    error.statusCode = 404;
    error.errorCode = 'AUCTION_NOT_FOUND';
    throw error;
  }

  // 2. Check if currently watched
  const existing = await pool.query(
    'SELECT 1 FROM watchlist WHERE user_id = $1 AND auction_id = $2',
    [userId, auctionId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'DELETE FROM watchlist WHERE user_id = $1 AND auction_id = $2',
      [userId, auctionId]
    );
    return { inWatchlist: false, auctionId };
  }

  await pool.query(
    'INSERT INTO watchlist (user_id, auction_id) VALUES ($1, $2)',
    [userId, auctionId]
  );
  return { inWatchlist: true, auctionId };
};

/**
 * Retrieve paginated watchlist items for the authenticated user.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @returns {Promise<{ items: Array, meta: { total: number, page: number, limit: number, totalPages: number } }>}
 */
export const getMyWatchlist = async ({ userId, page = 1, limit = 20 }) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM watchlist WHERE user_id = $1',
    [userId]
  );
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  const query = `
    SELECT a.id, a.title, a.current_price, a.status, a.start_at, a.end_at, a.images, a.created_at,
           c.name AS category_name, c.slug AS category_slug,
           w.created_at AS saved_at,
           (SELECT COUNT(*)::int FROM bids b WHERE b.auction_id = a.id) AS bid_count
    FROM watchlist w
    JOIN auctions a ON w.auction_id = a.id
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE w.user_id = $1
    ORDER BY w.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const itemsResult = await pool.query(query, [userId, limitNum, offset]);

  return {
    items: itemsResult.rows,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    },
  };
};

/**
 * Retrieve all auction IDs saved in the authenticated user's watchlist.
 * Enables O(1) bookmark lookup on browse pages.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @returns {Promise<string[]>}
 */
export const getMyWatchlistIds = async ({ userId }) => {
  const result = await pool.query(
    'SELECT auction_id FROM watchlist WHERE user_id = $1',
    [userId]
  );

  return result.rows.map((row) => row.auction_id);
};
