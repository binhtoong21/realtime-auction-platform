import { pool } from '../config/database.js';

/**
 * Lấy danh sách toàn bộ danh mục (categories).
 * Không cần phân trang vì số lượng category thường ít (vài chục - vài trăm).
 */
export const getCategories = async () => {
  const result = await pool.query(
    'SELECT id, name, slug, description, created_at FROM categories ORDER BY name ASC'
  );
  return result.rows;
};
