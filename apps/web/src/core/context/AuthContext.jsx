import { createContext, useContext, useState, useEffect } from 'react';
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
    const initAuth = async () => {
      try {
        const data = await axiosClient.get('/auth/me');
        // Assuming API returns { success: true, data: { user: {...} } } or similar
        // Adjust according to actual backend response structure.
        setUser(data.data || data);
      } catch (err) {
        // If it fails even after the interceptor attempts a refresh, 
        // the user is truly unauthenticated.
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen to custom logout event dispatched by interceptor or other parts of the app
    const handleLogout = () => {
      setUser(null);
    };
    window.addEventListener('auth:logout', handleLogout);

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await axiosClient.post('/auth/logout');
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      clearAccessToken();
      setUser(null);
    }
  };

  if (isLoading) {
    // Optionally return a full-screen loading spinner here
    // so we don't flash unauthenticated content
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <AuthStateContext.Provider value={user}>
      <AuthDispatchContext.Provider value={{ login, logout }}>
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
