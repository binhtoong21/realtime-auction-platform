import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../core/context/AuthContext';

export function RequireAuth({ children }) {
  const user = useAuth();
  const location = useLocation();

  if (!user) {
    // Redirect to login with the return URL
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/login?returnUrl=${returnUrl}`} replace />;
  }

  return children;
}
