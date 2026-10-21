import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';

/**
 * Calculate datetime threshold for period
 */
function getPeriodInterval(period) {
  switch (period) {
    case '1d':
      return "NOW() - INTERVAL '1 day'";
    case '7d':
      return "NOW() - INTERVAL '7 days'";
    case '30d':
      return "NOW() - INTERVAL '30 days'";
    case '90d':
      return "NOW() - INTERVAL '90 days'";
    default:
      return null;
  }
}

/**
 * Fetch platform overview statistics
 */
export const getStats = async ({ period = '7d' } = {}) => {
  const interval = getPeriodInterval(period);
  const periodCondition = interval ? `WHERE created_at >= ${interval}` : '';

  const [
    userStatsRes,
    auctionStatsRes,
    disputeStatsRes,
    paymentStatsRes,
    topCategoriesRes,
  ] = await Promise.all([
    pool.query(`
      SELECT 
        COUNT(*)::int as total_users,
        COUNT(*) FILTER (WHERE status = 'active')::int as active_users,
        COUNT(*) FILTER (WHERE ${interval ? `created_at >= ${interval}` : 'TRUE'})::int as new_users
      FROM users
    `),
    pool.query(`
      SELECT 
        COUNT(*)::int as total_auctions,
        COUNT(*) FILTER (WHERE status = 'active')::int as active_auctions,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed_auctions,
        COUNT(*) FILTER (WHERE status = 'scheduled')::int as scheduled_auctions
      FROM auctions
    `),
    pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status IN ('open', 'under_review'))::int as open_disputes,
        COUNT(*) FILTER (WHERE status LIKE 'resolved%')::int as resolved_disputes
      FROM disputes
    `),
    pool.query(`
      SELECT 
        COALESCE(SUM(amount) FILTER (WHERE status IN ('captured', 'transferred', 'released')), 0)::bigint as total_volume_cents,
        COALESCE(SUM(platform_fee_amount) FILTER (WHERE status IN ('transferred', 'released')), 0)::bigint as platform_revenue_cents
      FROM payments
      ${periodCondition}
    `),
    pool.query(`
      SELECT 
        c.id,
        c.name,
        c.slug,
        COUNT(a.id)::int as auction_count,
        COALESCE(SUM(a.current_price) FILTER (WHERE a.status = 'completed'), 0)::bigint as volume_cents
      FROM categories c
      LEFT JOIN auctions a ON a.category_id = c.id
      GROUP BY c.id, c.name, c.slug
      ORDER BY auction_count DESC, volume_cents DESC
      LIMIT 6
    `),
  ]);

  const userStats = userStatsRes.rows[0];
  const auctionStats = auctionStatsRes.rows[0];
  const disputeStats = disputeStatsRes.rows[0];
  const paymentStats = paymentStatsRes.rows[0];

  return {
    period,
    overview: {
      totalUsers: userStats.total_users || 0,
      activeUsers: userStats.active_users || 0,
      newUsers: userStats.new_users || 0,
      totalAuctions: auctionStats.total_auctions || 0,
      activeAuctions: auctionStats.active_auctions || 0,
      completedAuctions: auctionStats.completed_auctions || 0,
      scheduledAuctions: auctionStats.scheduled_auctions || 0,
      openDisputes: disputeStats.open_disputes || 0,
      resolvedDisputes: disputeStats.resolved_disputes || 0,
      totalVolumeCents: Number(paymentStats.total_volume_cents || 0),
      platformRevenueCents: Number(paymentStats.platform_revenue_cents || 0),
    },
    topCategories: topCategoriesRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      auctionCount: row.auction_count || 0,
      volumeCents: Number(row.volume_cents || 0),
    })),
  };
};

/**
 * Get paginated users for admin management
 */
export const getUsers = async ({
  page = 1,
  limit = 20,
  search = '',
  role = '',
  status = '',
  identityStatus = '',
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const whereClauses = ['1=1'];
  const params = [];

  if (search && search.trim() !== '') {
    params.push(`%${search.trim()}%`);
    whereClauses.push(`(u.email ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
  }

  if (role) {
    params.push(role);
    whereClauses.push(`u.role = $${params.length}`);
  }

  if (status) {
    params.push(status);
    whereClauses.push(`u.status = $${params.length}`);
  }

  if (identityStatus) {
    params.push(identityStatus);
    whereClauses.push(`u.identity_status = $${params.length}`);
  }

  const whereString = whereClauses.join(' AND ');

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM users u
    WHERE ${whereString}
  `;

  params.push(limitNum);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const dataQuery = `
    SELECT 
      u.id,
      u.email,
      u.display_name,
      u.avatar_url,
      u.role,
      u.status,
      u.identity_status,
      u.created_at,
      COUNT(DISTINCT a.id)::int as auctions_count,
      COUNT(DISTINCT b.id)::int as bids_count
    FROM users u
    LEFT JOIN auctions a ON a.seller_id = u.id
    LEFT JOIN bids b ON b.bidder_id = u.id
    WHERE ${whereString}
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const [countRes, dataRes] = await Promise.all([
    pool.query(countQuery, params.slice(0, limitIdx - 1)),
    pool.query(dataQuery, params),
  ]);

  const total = countRes.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limitNum);

  return {
    users: dataRes.rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      role: row.role,
      status: row.status,
      identityStatus: row.identity_status,
      createdAt: row.created_at,
      auctionsCount: row.auctions_count,
      bidsCount: row.bids_count,
    })),
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    },
  };
};

/**
 * Get detailed profile for an individual user
 */
export const getUserById = async (userId) => {
  const userRes = await pool.query(
    `SELECT id, email, display_name, avatar_url, role, status, identity_status, stripe_cus_id, stripe_acct_id, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const user = userRes.rows[0];

  const [auctionsRes, bidsRes, disputesRes] = await Promise.all([
    pool.query(
      `SELECT id, title, current_price, status, created_at
       FROM auctions
       WHERE seller_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    ),
    pool.query(
      `SELECT b.id, b.amount, b.created_at, a.id as auction_id, a.title as auction_title
       FROM bids b
       JOIN auctions a ON a.id = b.auction_id
       WHERE b.bidder_id = $1
       ORDER BY b.created_at DESC
       LIMIT 5`,
      [userId]
    ),
    pool.query(
      `SELECT id, reason, status, created_at
       FROM disputes
       WHERE opened_by = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    ),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role,
      status: user.status,
      identityStatus: user.identity_status,
      hasStripeCustomer: Boolean(user.stripe_cus_id),
      hasStripeConnect: Boolean(user.stripe_acct_id),
      createdAt: user.created_at,
    },
    recentAuctions: auctionsRes.rows,
    recentBids: bidsRes.rows,
    recentDisputes: disputesRes.rows,
  };
};

/**
 * Ban user and cancel their active auctions
 */
export const banUser = async ({ userId, adminId, reason }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `UPDATE users
       SET status = 'banned'
       WHERE id = $1
       RETURNING id, email, status`,
      [userId]
    );

    if (userRes.rowCount === 0) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Cancel any active or scheduled auctions created by this seller
    await client.query(
      `UPDATE auctions
       SET status = 'cancelled'
       WHERE seller_id = $1 AND status IN ('active', 'scheduled')`,
      [userId]
    );

    await client.query('COMMIT');
    return userRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Suspend user
 */
export const suspendUser = async ({ userId, adminId, reason }) => {
  const res = await pool.query(
    `UPDATE users
     SET status = 'suspended'
     WHERE id = $1
     RETURNING id, email, status`,
    [userId]
  );

  if (res.rowCount === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

/**
 * Reactivate suspended or banned user
 */
export const reactivateUser = async ({ userId, adminId }) => {
  const res = await pool.query(
    `UPDATE users
     SET status = 'active'
     WHERE id = $1
     RETURNING id, email, status`,
    [userId]
  );

  if (res.rowCount === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

/**
 * Admin manual KYC override
 */
export const overrideKyc = async ({ userId, adminId, note }) => {
  const res = await pool.query(
    `UPDATE users
     SET identity_status = 'verified'
     WHERE id = $1
     RETURNING id, email, identity_status`,
    [userId]
  );

  if (res.rowCount === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

/**
 * Get paginated auctions for admin oversight
 */
export const getAuctions = async ({
  page = 1,
  limit = 20,
  search = '',
  status = '',
  categoryId = '',
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const whereClauses = ['1=1'];
  const params = [];

  if (search && search.trim() !== '') {
    params.push(`%${search.trim()}%`);
    whereClauses.push(`a.title ILIKE $${params.length}`);
  }

  if (status) {
    params.push(status);
    whereClauses.push(`a.status = $${params.length}`);
  }

  if (categoryId) {
    params.push(categoryId);
    whereClauses.push(`a.category_id = $${params.length}`);
  }

  const whereString = whereClauses.join(' AND ');

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM auctions a
    WHERE ${whereString}
  `;

  params.push(limitNum);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const dataQuery = `
    SELECT 
      a.id,
      a.title,
      a.current_price,
      a.status,
      a.start_at,
      a.end_at,
      a.created_at,
      u.id as seller_id,
      u.display_name as seller_name,
      c.id as category_id,
      c.name as category_name
    FROM auctions a
    JOIN users u ON u.id = a.seller_id
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE ${whereString}
    ORDER BY a.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const [countRes, dataRes] = await Promise.all([
    pool.query(countQuery, params.slice(0, limitIdx - 1)),
    pool.query(dataQuery, params),
  ]);

  const total = countRes.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limitNum);

  return {
    auctions: dataRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      currentPrice: parseFloat(row.current_price),
      status: row.status,
      startAt: row.start_at,
      endAt: row.end_at,
      createdAt: row.created_at,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      categoryId: row.category_id,
      categoryName: row.category_name,
    })),
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    },
  };
};

/**
 * Force cancel an auction
 */
export const cancelAuction = async ({ auctionId, adminId, reason }) => {
  const res = await pool.query(
    `UPDATE auctions
     SET status = 'cancelled'
     WHERE id = $1 AND status != 'cancelled'
     RETURNING id, title, status`,
    [auctionId]
  );

  if (res.rowCount === 0) {
    const error = new Error('Auction not found or already cancelled');
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

/**
 * List categories with count of auctions
 */
export const getCategoriesWithStats = async () => {
  const res = await pool.query(`
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.description,
      c.created_at,
      COUNT(a.id)::int as auction_count
    FROM categories c
    LEFT JOIN auctions a ON a.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `);

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
    auctionCount: row.auction_count,
  }));
};

/**
 * Create a new category
 */
export const createCategory = async ({ name, slug, description }) => {
  const id = uuidv7();
  const res = await pool.query(
    `INSERT INTO categories (id, name, slug, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, slug, description, created_at`,
    [id, name, slug, description || null]
  );
  return res.rows[0];
};

/**
 * Update an existing category
 */
export const updateCategory = async ({ categoryId, name, slug, description }) => {
  const updates = [];
  const params = [categoryId];

  if (name !== undefined) {
    params.push(name);
    updates.push(`name = $${params.length}`);
  }
  if (slug !== undefined) {
    params.push(slug);
    updates.push(`slug = $${params.length}`);
  }
  if (description !== undefined) {
    params.push(description);
    updates.push(`description = $${params.length}`);
  }

  if (updates.length === 0) {
    const current = await pool.query('SELECT * FROM categories WHERE id = $1', [categoryId]);
    return current.rows[0];
  }

  const res = await pool.query(
    `UPDATE categories
     SET ${updates.join(', ')}
     WHERE id = $1
     RETURNING id, name, slug, description, created_at`,
    [...params]
  );

  if (res.rowCount === 0) {
    const error = new Error('Category not found');
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

/**
 * Delete a category (only if no auctions are linked)
 */
export const deleteCategory = async (categoryId) => {
  const check = await pool.query(
    'SELECT COUNT(*)::int as count FROM auctions WHERE category_id = $1',
    [categoryId]
  );

  if (check.rows[0].count > 0) {
    const error = new Error(
      'Cannot delete category with active or existing auctions. Use merge instead.'
    );
    error.statusCode = 400;
    throw error;
  }

  const res = await pool.query(
    'DELETE FROM categories WHERE id = $1 RETURNING id',
    [categoryId]
  );

  if (res.rowCount === 0) {
    const error = new Error('Category not found');
    error.statusCode = 404;
    throw error;
  }

  return { id: categoryId, deleted: true };
};

/**
 * Merge source category into target category and delete source
 */
export const mergeCategories = async ({ sourceCategoryId, targetCategoryId }) => {
  if (sourceCategoryId === targetCategoryId) {
    const error = new Error('Source and target category cannot be the same');
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Move all auctions to target category
    const updateRes = await client.query(
      `UPDATE auctions
       SET category_id = $1
       WHERE category_id = $2`,
      [targetCategoryId, sourceCategoryId]
    );

    // 2. Delete source category
    await client.query('DELETE FROM categories WHERE id = $1', [sourceCategoryId]);

    await client.query('COMMIT');
    return {
      sourceCategoryId,
      targetCategoryId,
      reassignedAuctionsCount: updateRes.rowCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
