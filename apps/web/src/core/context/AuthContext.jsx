import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { axiosClient } from '../api/axiosClient';
import { clearAccessToken } from '../api/tokenManager';

const AuthStateContext = createContext(undefined);
const AuthDispatchContext = createContext(undefined);

export function AuthProvider({ children }) {
  // Public API for user-initiated logout (calls backend)
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

  // Internal handler for session-expired events (no backend call)
  const handleSessionExpired = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

  // Bootstrap logic: Fetch user profile on mount
  // If the user has a valid session (HttpOnly refresh token), this request
  // might trigger a 401 initially, but our axios interceptor will intercept it,
  // call /auth/refresh, get a new access token, and retry the /auth/me request successfully.
  useEffect(() => {
    let mounted = true;
    
    // Fallback timeout to prevent infinite loading if backend hangs
    const fallbackTimer = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 5000);

    const initAuth = async () => {
      try {
        const response = await axiosClient.get('/auth/me');
        if (mounted) {
          // axiosClient.get returns the raw axios response
          // response.data is the server payload { success, data: { user } }
          setUser(response.data?.data?.user || null);
        }
      } catch (err) {
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          clearTimeout(fallbackTimer);
          setIsLoading(false);
        }
      }
    };

    initAuth();

    window.addEventListener('auth:logout', handleSessionExpired);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      window.removeEventListener('auth:logout', handleSessionExpired);
    };
  }, [handleSessionExpired]);

  const login = useCallback((userData) => {
    setUser(userData);
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
