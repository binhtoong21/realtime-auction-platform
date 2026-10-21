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
