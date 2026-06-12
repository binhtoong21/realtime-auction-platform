/**
 * Role-based authorization middleware
 * @param  {...string} roles - Allowed roles (e.g. 'admin', 'user')
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User not authenticated or missing role' }
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Insufficient role' }
    });
  }
  next();
};

export default requireRole;
