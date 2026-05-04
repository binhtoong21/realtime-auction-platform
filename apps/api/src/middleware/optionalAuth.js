import { verifyAccessToken } from '../utils/jwt.js';

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = verifyAccessToken(token);
      req.user = decoded;
    } catch (error) {
      // Ignored for optional auth
    }
  }
  
  next();
};

export default optionalAuth;
