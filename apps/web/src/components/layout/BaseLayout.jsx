import { Outlet, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth, useAuthDispatch } from '../../core/context/AuthContext';
import { Sun, Moon } from 'lucide-react';

export function BaseLayout() {
  const user = useAuth();
  const { logout } = useAuthDispatch();
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: 'var(--space-4) var(--space-8)',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
          <Link to="/" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>
            AuctionHouse
          </Link>
          <nav style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
            <Link to="/auctions" className="nav-link">Browse</Link>
            <button 
              onClick={() => setIsDark(!isDark)}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--color-text-secondary)', 
                display: 'flex', 
                alignItems: 'center',
                padding: 'var(--space-1)'
              }}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </nav>
        </div>
        
        <div>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                {user.email}
              </span>
              <button 
                onClick={logout}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border-strong)',
                  color: 'var(--color-text-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-2) var(--space-4)',
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Link to="/auth/login" className="nav-link" style={{ padding: 'var(--space-2)' }}>Login</Link>
              <Link 
                to="/auth/register" 
                className="btn-primary"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, padding: 'var(--space-8)' }}>
        <Outlet />
      </main>
    </div>
  );
}
