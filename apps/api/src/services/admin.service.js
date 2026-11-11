import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { writeAuditLog } from './auditLogger.js';
import { AuctionStatus, IdentityStatus } from '@auction/shared-constants';

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
 * Preview blast radius and cascade impact before banning a user
 */
export const getBanPreview = async ({ userId, adminId }) => {
  if (adminId && adminId === userId) {
    const error = new Error('Admin cannot ban their own account');
    error.statusCode = 403;
    error.errorCode = 'CANNOT_BAN_SELF';
    throw error;
  }

  // 1. Fetch user
  const userRes = await pool.query(
    'SELECT id, email, display_name, status, role FROM users WHERE id = $1',
    [userId]
  );

  if (userRes.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const user = userRes.rows[0];

  // 2. Aggregate impact metrics across auctions, payments, bids, disputes sequentially
  // to avoid consuming multiple database pool connections simultaneously.
  // 1. Seller auctions by status
  const sellerAuctionsRes = await pool.query(
    `SELECT status, COUNT(*)::int as count
     FROM auctions
     WHERE seller_id = $1 AND status IN ('scheduled', 'active', 'paid', 'awaiting_ship', 'shipped')
     GROUP BY status`,
    [userId]
  );

  // 2. Total bids on active auctions of this seller
  const sellerBidsRes = await pool.query(
    `SELECT COUNT(*)::int as count
     FROM bids b
     JOIN auctions a ON a.id = b.auction_id
     WHERE a.seller_id = $1 AND a.status = 'active'`,
    [userId]
  );

  // 3. Open disputes where user is seller
  const sellerDisputesRes = await pool.query(
    `SELECT COUNT(*)::int as count
     FROM disputes d
     JOIN payments p ON p.id = d.payment_id
     WHERE p.seller_id = $1 AND d.status IN ('open', 'under_review')`,
    [userId]
  );

  // 4. Active auctions where user is winning bidder
  const buyerWinningBidsRes = await pool.query(
    `SELECT COUNT(DISTINCT a.id)::int as count
     FROM bids b
     JOIN auctions a ON a.id = b.auction_id
     WHERE b.bidder_id = $1 AND a.status = 'active' AND b.is_winning = true`,
    [userId]
  );

  // 5. Buyer active payments / holds
  const buyerPaymentsRes = await pool.query(
    `SELECT status, COUNT(*)::int as count, COALESCE(SUM(amount), 0)::bigint as total_amount
     FROM payments
     WHERE buyer_id = $1 AND status IN ('authorized', 'grace_period', 'frozen')
     GROUP BY status`,
    [userId]
  );

  // 6. Open disputes where user is buyer
  const buyerDisputesRes = await pool.query(
    `SELECT COUNT(*)::int as count
     FROM disputes d
     JOIN payments p ON p.id = d.payment_id
     WHERE p.buyer_id = $1 AND d.status IN ('open', 'under_review')`,
    [userId]
  );

  // 7. Seller payments in escrow / hold (joined with auctions to isolate awaiting ship orders)
  const sellerPaymentsRes = await pool.query(
    `SELECT 
       p.status, 
       COUNT(*)::int as count, 
       COALESCE(SUM(p.amount), 0)::bigint as total_amount,
       COUNT(CASE WHEN a.status = 'awaiting_ship' THEN 1 END)::int as awaiting_ship_count,
       COALESCE(SUM(CASE WHEN a.status = 'awaiting_ship' THEN p.amount ELSE 0 END), 0)::bigint as awaiting_ship_amount
     FROM payments p
     LEFT JOIN auctions a ON a.id = p.auction_id
     WHERE p.seller_id = $1 AND p.status IN ('authorized', 'grace_period')
     GROUP BY p.status`,
    [userId]
  );

  // Extract seller auction counts
  const auctionStatusCounts = {};
  sellerAuctionsRes.rows.forEach((r) => {
    auctionStatusCounts[r.status] = Number(r.count || 0);
  });

  const scheduledAuctions = auctionStatusCounts[AuctionStatus.SCHEDULED] || 0;
  const activeAuctions = auctionStatusCounts[AuctionStatus.ACTIVE] || 0;
  const paidAwaitingShip = auctionStatusCounts[AuctionStatus.AWAITING_SHIP] || 0;
  const shippedInTransit = auctionStatusCounts[AuctionStatus.SHIPPED] || 0;
  const activeBidsOnSellerAuctions = Number(sellerBidsRes.rows[0]?.count || 0);
  const sellerOpenDisputes = Number(sellerDisputesRes.rows[0]?.count || 0);

  // Extract buyer counts
  const winningActiveBids = Number(buyerWinningBidsRes.rows[0]?.count || 0);
  const buyerOpenDisputes = Number(buyerDisputesRes.rows[0]?.count || 0);

  let buyerHoldsCount = 0;
  let buyerHoldsAmount = 0n;
  buyerPaymentsRes.rows.forEach((r) => {
    buyerHoldsCount += Number(r.count || 0);
    buyerHoldsAmount += BigInt(r.total_amount || 0);
  });

  let sellerHoldsCount = 0;
  let sellerHoldsAmount = 0n;
  let awaitingShipHoldsCount = 0;
  let awaitingShipHoldsAmount = 0n;
  sellerPaymentsRes.rows.forEach((r) => {
    sellerHoldsCount += Number(r.count || 0);
    sellerHoldsAmount += BigInt(r.total_amount || 0);
    awaitingShipHoldsCount += Number(r.awaiting_ship_count || 0);
    awaitingShipHoldsAmount += BigInt(r.awaiting_ship_amount || 0);
  });

  const openDisputes = sellerOpenDisputes + buyerOpenDisputes;
  const authHoldsToRelease = buyerHoldsCount + sellerHoldsCount;
  const totalHoldAmount = Number(buyerHoldsAmount + sellerHoldsAmount);
  const refundsRequired = paidAwaitingShip + (buyerHoldsCount > 0 ? buyerHoldsCount : 0);

  const remainingHoldsCount = authHoldsToRelease - awaitingShipHoldsCount;
  const remainingHoldsAmount = totalHoldAmount - Number(awaitingShipHoldsAmount);

  // Generate actionable summary bullets
  const actions = [];
  if (user.status === 'banned') {
    actions.push('User is already banned. No active cascade needed.');
  } else {
    actions.push('Revoke all active login sessions and refresh tokens');

    const totalAuctionsToCancel = scheduledAuctions + activeAuctions;
    if (totalAuctionsToCancel > 0) {
      actions.push(
        `Cancel ${totalAuctionsToCancel} listing(s) (${activeAuctions} active, ${scheduledAuctions} scheduled)`
      );
    }

    if (activeBidsOnSellerAuctions > 0) {
      actions.push(`Notify bidders on ${activeAuctions} cancelled auction(s)`);
    }

    if (winningActiveBids > 0) {
      actions.push(`Recalculate winning bids on ${winningActiveBids} active auction(s) where user was leading`);
    }

    if (paidAwaitingShip > 0) {
      const amountNote = awaitingShipHoldsAmount > 0n
        ? ` totaling $${(Number(awaitingShipHoldsAmount) / 100).toFixed(2)}`
        : '';
      actions.push(
        `Release escrow holds and refund ${paidAwaitingShip} order(s) awaiting shipment${amountNote}`
      );
    }

    if (shippedInTransit > 0) {
      actions.push(`Freeze ${shippedInTransit} in-transit order(s) for delivery dispute investigation`);
    }

    if (remainingHoldsCount > 0) {
      const qualifier = paidAwaitingShip > 0 ? 'other ' : '';
      actions.push(
        `Release ${remainingHoldsCount} ${qualifier}active escrow hold(s) totaling $${(remainingHoldsAmount / 100).toFixed(2)}`
      );
    }

    if (openDisputes > 0) {
      actions.push(`Flag ${openDisputes} active dispute(s) with banned user status for priority admin review`);
    }
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      status: user.status,
      role: user.role,
    },
    impact: {
      scheduledAuctions,
      activeAuctions,
      paidAwaitingShip,
      shippedInTransit,
      winningActiveBids,
      openDisputes,
      authHoldsToRelease,
      totalHoldAmount,
      refundsRequired,
    },
    actions,
  };
};

/**
 * Ban user and cancel their active auctions
 */
export const banUser = async ({ userId, adminId, reason, ipAddress = null }) => {
  if (adminId && adminId === userId) {
    const error = new Error('Admin cannot ban their own account');
    error.statusCode = 403;
    error.errorCode = 'CANNOT_BAN_SELF';
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT id, email, status FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (checkRes.rowCount === 0) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const user = checkRes.rows[0];

    // Idempotency: if already banned, commit and return without duplicate cascade
    if (user.status === 'banned') {
      await client.query('COMMIT');
      return user;
    }

    const userRes = await client.query(
      `UPDATE users
       SET status = 'banned', banned_at = NOW(), ban_reason = $2
       WHERE id = $1
       RETURNING id, email, status, banned_at, ban_reason`,
      [userId, reason || null]
    );

    // Cancel any active or scheduled auctions created by this seller
    await client.query(
      `UPDATE auctions
       SET status = 'cancelled', updated_at = NOW()
       WHERE seller_id = $1 AND status IN ('active', 'scheduled')`,
      [userId]
    );

    // Revoke all active refresh tokens for the banned user
    await client.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [userId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      referenceId: userId,
      referenceType: 'user',
      action: 'admin_user_banned',
      deltaState: {
        previousStatus: user.status,
        newStatus: 'banned',
        reason: reason || null,
      },
      actorId: adminId || null,
      ipAddress: ipAddress || null,
    });

    return userRes.rows[0];
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Suspend user
 */
export const suspendUser = async ({ userId, adminId, reason, ipAddress = null }) => {
  if (adminId && adminId === userId) {
    const error = new Error('Admin cannot suspend their own account');
    error.statusCode = 403;
    error.errorCode = 'CANNOT_SUSPEND_SELF';
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT id, email, status FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (checkRes.rowCount === 0) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const user = checkRes.rows[0];

    // Idempotency: if already suspended, return early
    if (user.status === 'suspended') {
      await client.query('COMMIT');
      return user;
    }

    const res = await client.query(
      `UPDATE users
       SET status = 'suspended'
       WHERE id = $1
       RETURNING id, email, status`,
      [userId]
    );

    // Revoke active refresh tokens
    await client.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [userId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      referenceId: userId,
      referenceType: 'user',
      action: 'admin_user_suspended',
      deltaState: {
        previousStatus: user.status,
        newStatus: 'suspended',
        reason: reason || null,
      },
      actorId: adminId || null,
      ipAddress: ipAddress || null,
    });

    return res.rows[0];
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Reactivate suspended or banned user
 */
export const reactivateUser = async ({ userId, adminId, ipAddress = null }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT id, email, status FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (checkRes.rowCount === 0) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const user = checkRes.rows[0];

    // Idempotency: if already active, return early
    if (user.status === 'active') {
      await client.query('COMMIT');
      return user;
    }

    const res = await client.query(
      `UPDATE users
       SET status = 'active', banned_at = NULL, ban_reason = NULL
       WHERE id = $1
       RETURNING id, email, status`,
      [userId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      referenceId: userId,
      referenceType: 'user',
      action: 'admin_user_reactivated',
      deltaState: {
        previousStatus: user.status,
        newStatus: 'active',
      },
      actorId: adminId || null,
      ipAddress: ipAddress || null,
    });

    return res.rows[0];
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Admin manual KYC override
 */
export const overrideKyc = async ({ userId, adminId, note, ipAddress = null }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT id, email, identity_status FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (checkRes.rowCount === 0) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const user = checkRes.rows[0];

    // Idempotency: if already verified, return early
    if (user.identity_status === IdentityStatus.VERIFIED) {
      await client.query('COMMIT');
      return user;
    }

    const res = await client.query(
      `UPDATE users
       SET identity_status = 'verified', identity_verified_at = NOW(), identity_failure_reason = NULL
       WHERE id = $1
       RETURNING id, email, identity_status, identity_verified_at`,
      [userId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      referenceId: userId,
      referenceType: 'user',
      action: 'admin_kyc_override',
      deltaState: {
        previousIdentityStatus: user.identity_status,
        newIdentityStatus: IdentityStatus.VERIFIED,
        note: note || null,
      },
      actorId: adminId || null,
      ipAddress: ipAddress || null,
    });

    return res.rows[0];
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
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

// Force-cancel only before any payment exists; later states need the refund/dispute flows.
const ADMIN_CANCELLABLE_STATUSES = new Set([AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE]);

/**
 * Force cancel an auction
 */
export const cancelAuction = async ({ auctionId, adminId, reason, ipAddress = null }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT id, title, status FROM auctions WHERE id = $1 FOR UPDATE',
      [auctionId]
    );

    if (checkRes.rowCount === 0) {
      const error = new Error('Auction not found');
      error.statusCode = 404;
      throw error;
    }

    const auction = checkRes.rows[0];

    // Idempotency: if already cancelled, return early
    if (auction.status === AuctionStatus.CANCELLED) {
      await client.query('COMMIT');
      return auction;
    }

    if (!ADMIN_CANCELLABLE_STATUSES.has(auction.status)) {
      const error = new Error(
        `Cannot force-cancel auction in status '${auction.status}'. Only scheduled or active auctions can be cancelled; use the refund or dispute flow instead.`
      );
      error.statusCode = 409;
      error.errorCode = 'INVALID_AUCTION_STATE';
      throw error;
    }

    const res = await client.query(
      `UPDATE auctions
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status IN ('scheduled', 'active')
       RETURNING id, title, status`,
      [auctionId]
    );

    if (res.rowCount === 0) {
      const error = new Error(
        `Cannot force-cancel auction in status '${auction.status}'. Only scheduled or active auctions can be cancelled; use the refund or dispute flow instead.`
      );
      error.statusCode = 409;
      error.errorCode = 'INVALID_AUCTION_STATE';
      throw error;
    }

    await client.query('COMMIT');

    await writeAuditLog({
      referenceId: auctionId,
      referenceType: 'auction',
      action: 'admin_auction_force_cancelled',
      deltaState: {
        previousStatus: auction.status,
        newStatus: AuctionStatus.CANCELLED,
        reason: reason || null,
      },
      actorId: adminId || null,
      ipAddress: ipAddress || null,
    });

    return res.rows[0];
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
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
export const mergeCategories = async ({
  sourceCategoryId,
  targetCategoryId,
  adminId = null,
  ipAddress = null,
}) => {
  if (sourceCategoryId === targetCategoryId) {
    const error = new Error('Source and target category cannot be the same');
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceRes = await client.query(
      'SELECT id, name FROM categories WHERE id = $1 FOR UPDATE',
      [sourceCategoryId]
    );
    if (sourceRes.rowCount === 0) {
      const error = new Error('Source category not found');
      error.statusCode = 404;
      throw error;
    }

    const targetRes = await client.query(
      'SELECT id, name FROM categories WHERE id = $1 FOR UPDATE',
      [targetCategoryId]
    );
    if (targetRes.rowCount === 0) {
      const error = new Error('Target category not found');
      error.statusCode = 404;
      throw error;
    }

    // 1. Move all auctions to target category
    const updateRes = await client.query(
      `UPDATE auctions
       SET category_id = $1, updated_at = NOW()
       WHERE category_id = $2`,
      [targetCategoryId, sourceCategoryId]
    );

    // 2. Delete source category
    await client.query('DELETE FROM categories WHERE id = $1', [sourceCategoryId]);

    await client.query('COMMIT');

    await writeAuditLog({
      referenceId: sourceCategoryId,
      referenceType: 'category',
      action: 'admin_category_merged',
      deltaState: {
        sourceCategoryId,
        targetCategoryId,
        sourceCategoryName: sourceRes.rows[0].name,
        targetCategoryName: targetRes.rows[0].name,
        reassignedAuctionsCount: updateRes.rowCount,
      },
      actorId: adminId || null,
      ipAddress: ipAddress || null,
    });

    return {
      sourceCategoryId,
      targetCategoryId,
      reassignedAuctionsCount: updateRes.rowCount,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
};
