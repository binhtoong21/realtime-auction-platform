import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../core/context/AuthContext';

/**
 * Route Guard for role-based authorization.
 * Redirects unauthenticated users to /auth/login with return URL.
 * Redirects authenticated users with insufficient role to /403 Forbidden.
 */
export function RequireRole({ role = 'admin', children }) {
  const user = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location.pathname + location.search }} replace />;
  }

  if (user.role !== role) {
    return <Navigate to="/403" replace />;
  }

  return children;
}
