import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { axiosClient } from '../api/axiosClient';
import { clearAccessToken } from '../api/tokenManager';

const AuthStateContext = createContext(undefined);
const AuthDispatchContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap logic: Fetch user profile on mount
  // If the user has a valid session (HttpOnly refresh token), this request
  // might trigger a 401 initially, but our axios interceptor will intercept it,
  // call /auth/refresh, get a new access token, and retry the /auth/me request successfully.
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const data = await axiosClient.get('/auth/me');
        if (mounted) {
          setUser(data.data || data);
        }
      } catch (err) {
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    const handleLogout = () => {
      setUser(null);
    };
    window.addEventListener('auth:logout', handleLogout);

    return () => {
      mounted = false;
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const login = useCallback((userData) => {
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await axiosClient.post('/auth/logout');
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const dispatchValue = useMemo(() => ({ login, logout }), [login, logout]);

  if (isLoading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <AuthStateContext.Provider value={user}>
      <AuthDispatchContext.Provider value={dispatchValue}>
        {children}
      </AuthDispatchContext.Provider>
    </AuthStateContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthStateContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthDispatch() {
  const context = useContext(AuthDispatchContext);
  if (context === undefined) {
    throw new Error('useAuthDispatch must be used within an AuthProvider');
  }
  return context;
}
