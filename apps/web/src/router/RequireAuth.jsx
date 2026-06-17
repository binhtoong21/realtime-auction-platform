import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../core/context/AuthContext';

export function RequireAuth({ children }) {
  const user = useAuth();
  const location = useLocation();

  if (!user) {
    // Redirect to login with the return URL in state
    return <Navigate to="/auth/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return children;
}
