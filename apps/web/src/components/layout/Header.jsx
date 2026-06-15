import { Link, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth, useAuthDispatch } from '../../core/context/AuthContext';
import { Sun, Moon } from 'lucide-react';
import './Header.css';

/**
 * Site header with navigation, theme toggle, auth controls, and connection status.
 */
export function Header() {
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
    <header className="header" id="site-header">
      <div className="header__inner">
        <div className="header__left">
          <Link to="/" className="header__logo">
            AuctionHouse
          </Link>
          <nav className="header__nav">
            <NavLink
              to="/auctions"
              className={({ isActive }) =>
                `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
              }
            >
              Browse
            </NavLink>
            {user && (
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
                }
              >
                Dashboard
              </NavLink>
            )}
          </nav>
        </div>

        <div className="header__right">
          <button
            onClick={() => setIsDark(!isDark)}
            className="header__theme-toggle"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Connection status dot — mock for now, wired in Phase 3 */}
          <span
            className="header__connection-dot header__connection-dot--offline"
            title="Disconnected"
          />

          {user ? (() => {
            const displayEmail = typeof user.email === 'string' ? user.email : '';
            const displayLabel = typeof user.displayName === 'string' ? user.displayName : (displayEmail || 'User');
            
            return (
              <div className="header__user">
                <span className="header__user-email" title={displayEmail}>
                  {displayLabel}
                </span>
                <button onClick={logout} className="header__logout-btn">
                  Logout
                </button>
              </div>
            );
          })() : (
            <div className="header__auth">
              <Link to="/auth/login" className="header__nav-link">
                Login
              </Link>
              <Link to="/auth/register" className="btn-primary">
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
