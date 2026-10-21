import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';

/**
 * Fetch paginated notifications for a user with cursor pagination
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.cursor] - ISO datetime string
 * @param {number} [params.limit=20]
 * @param {boolean} [params.unreadOnly=false]
 */
export const getUserNotifications = async ({ userId, cursor, limit = 20, unreadOnly = false }) => {
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const whereClauses = ['user_id = $1'];
  const params = [userId];

  if (unreadOnly) {
    whereClauses.push('is_read = FALSE');
  }

  if (cursor) {
    params.push(cursor);
    whereClauses.push(`created_at < $${params.length}`);
  }

  params.push(limitNum + 1);
  const query = `
    SELECT id, type, title, message, reference_id, reference_type, payload, is_read, created_at
    FROM notifications
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `;

  const [res, countRes] = await Promise.all([
    pool.query(query, params),
    pool.query(
      'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    ),
  ]);

  const rows = res.rows;
  const hasMore = rows.length > limitNum;
  const items = hasMore ? rows.slice(0, limitNum) : rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;
  const unreadCount = countRes.rows[0]?.count || 0;

  const notifications = items.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    referenceId: row.reference_id,
    referenceType: row.reference_type,
    payload: row.payload,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));

  return {
    notifications,
    meta: {
      nextCursor,
      hasMore,
      unreadCount,
    },
  };
};

/**
 * Mark a single notification as read
 */
export const markNotificationAsRead = async ({ notificationId, userId }) => {
  const res = await pool.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_read`,
    [notificationId, userId]
  );

  if (res.rowCount === 0) {
    const error = new Error('Notification not found');
    error.statusCode = 404;
    throw error;
  }

  return { id: res.rows[0].id, isRead: res.rows[0].is_read };
};

/**
 * Mark all notifications for a user as read
 */
export const markAllNotificationsAsRead = async ({ userId }) => {
  const res = await pool.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = $1 AND is_read = FALSE
     RETURNING id`,
    [userId]
  );

  return { updatedCount: res.rowCount };
};

/**
 * Get total unread notifications count for a user
 */
export const getUnreadCount = async ({ userId }) => {
  const res = await pool.query(
    'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return { unreadCount: res.rows[0]?.count || 0 };
};

/**
 * Create a new notification for a user
 */
export const createNotification = async ({
  userId,
  type,
  title,
  message,
  referenceId = null,
  referenceType = null,
  payload = null,
}) => {
  const id = uuidv7();
  const res = await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, message, reference_id, reference_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, type, title, message, reference_id, reference_type, payload, is_read, created_at`,
    [
      id,
      userId,
      type,
      title,
      message,
      referenceId,
      referenceType,
      payload ? JSON.stringify(payload) : null,
    ]
  );
  const row = res.rows[0];
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    referenceId: row.reference_id,
    referenceType: row.reference_type,
    payload: row.payload,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
};
