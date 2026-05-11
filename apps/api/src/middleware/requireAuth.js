import { verifyAccessToken } from '../utils/jwt.js';
import { pool } from '../config/database.js';

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header'
      }
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);

    const result = await pool.query(
      'SELECT status, identity_status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User no longer exists' }
      });
    }

    const userRow = result.rows[0];

    if (userRow.status === 'banned') {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_BANNED', message: 'Account has been banned' }
      });
    }

    if (userRow.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Account is temporarily suspended' }
      });
    }

    req.user = {
      ...decoded,
      identity_status: userRow.identity_status,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED_OR_INVALID',
        message: 'Token is expired or invalid'
      }
    });
  }
};

export default requireAuth;
