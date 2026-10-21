import { pool } from '../config/database.js';
import * as s3Service from './s3.service.js';
import { v7 as uuidv7 } from 'uuid';

/**
 * Update user profile details (displayName, avatar)
 */
export const updateProfile = async ({ userId, displayName, file }) => {
  let avatarUrl = null;

  if (file) {
    const ext = file.detectedExt || 'jpg';
    const s3Key = `avatars/${userId}/${Date.now()}-${uuidv7()}.${ext}`;
    avatarUrl = await s3Service.uploadFile(file.buffer, file.detectedMime || file.mimetype, s3Key);
  }

  const updates = [];
  const params = [userId];

  if (displayName !== undefined && displayName !== null && displayName.trim() !== '') {
    params.push(displayName.trim());
    updates.push(`display_name = $${params.length}`);
  }

  if (avatarUrl) {
    params.push(avatarUrl);
    updates.push(`avatar_url = $${params.length}`);
  }

  if (updates.length === 0) {
    const current = await pool.query(
      'SELECT id, email, display_name, avatar_url, role, status FROM users WHERE id = $1',
      [userId]
    );
    const row = current.rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      role: row.role,
      status: row.status,
    };
  }

  const query = `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, email, display_name, avatar_url, role, status
  `;

  const result = await pool.query(query, params);
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
  };
};

/**
 * Retrieve public seller profile with stats and auctions
 */
export const getPublicProfile = async (userId) => {
  const userRes = await pool.query(
    `SELECT id, display_name, avatar_url, role, identity_status, created_at
     FROM users
     WHERE id = $1 AND status != 'banned'`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const user = userRes.rows[0];

  const statsRes = await pool.query(
    `SELECT 
       COUNT(*)::int as total_auctions,
       COUNT(*) FILTER (WHERE status = 'active')::int as active_auctions,
       COUNT(*) FILTER (WHERE status = 'completed')::int as completed_sales,
       COUNT(*) FILTER (WHERE status = 'disputed')::int as dispute_count,
       COALESCE(SUM(current_price) FILTER (WHERE status = 'completed'), 0)::numeric as total_sales_volume
     FROM auctions
     WHERE seller_id = $1`,
    [userId]
  );

  const stats = statsRes.rows[0];
  const completedSales = parseInt(stats.completed_sales, 10) || 0;
  const disputeCount = parseInt(stats.dispute_count, 10) || 0;
  const totalConcluded = completedSales + disputeCount;

  const completionRate =
    totalConcluded > 0 ? Math.round((completedSales / totalConcluded) * 1000) / 10 : 100;

  const isKycVerified = user.identity_status === 'verified';
  const reputationScore = Math.min(
    100,
    Math.round(completionRate * 0.8 + (isKycVerified ? 20 : 10))
  );

  const [activeAuctionsRes, completedAuctionsRes] = await Promise.all([
    pool.query(
      `SELECT id, title, current_price, images, end_at, status, created_at
       FROM auctions
       WHERE seller_id = $1 AND status = 'active'
       ORDER BY end_at ASC
       LIMIT 10`,
      [userId]
    ),
    pool.query(
      `SELECT id, title, current_price, images, end_at, status, created_at
       FROM auctions
       WHERE seller_id = $1 AND status = 'completed'
       ORDER BY end_at DESC
       LIMIT 10`,
      [userId]
    ),
  ]);

  return {
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role,
      identityStatus: user.identity_status,
      joinedAt: user.created_at,
    },
    stats: {
      totalAuctions: parseInt(stats.total_auctions, 10) || 0,
      activeAuctions: parseInt(stats.active_auctions, 10) || 0,
      completedSales,
      completionRate,
      reputationScore,
      totalSalesVolume: parseFloat(stats.total_sales_volume) || 0,
    },
    activeAuctions: activeAuctionsRes.rows.map((a) => ({
      id: a.id,
      title: a.title,
      currentPrice: parseFloat(a.current_price),
      images: a.images,
      endAt: a.end_at,
      status: a.status,
    })),
    completedAuctions: completedAuctionsRes.rows.map((a) => ({
      id: a.id,
      title: a.title,
      currentPrice: parseFloat(a.current_price),
      images: a.images,
      endAt: a.end_at,
      status: a.status,
    })),
  };
};
