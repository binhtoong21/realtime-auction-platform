import { Link, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth, useAuthDispatch } from '../../core/context/AuthContext';
import { Sun, Moon } from 'lucide-react';
import './Header.css';

/**
 * Site header with high-density styling (48px height), navigation,
 * connection status indicator, and user profile avatar.
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

  // Helper to extract user initials for the avatar badge
  const getInitials = () => {
    if (!user) return '';
    const name = user.displayName || user.email || 'U';
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="header" id="site-header">
      <div className="header__inner">
        <div className="header__left">
          <Link to="/" className="header__logo">
            AuctionHouse
          </Link>
          <nav className="header__nav">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
              }
            >
              Market
            </NavLink>
            {user && (
              <>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
                  }
                >
                  My Bids
                </NavLink>
                <NavLink
                  to="/watchlist"
                  className={({ isActive }) =>
                    `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
                  }
                >
                  Watchlist
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="header__right">
          {user && (
            <Link to="/auctions/new" className="header__create-btn">
              + Create auction
            </Link>
          )}

          <button
            onClick={() => setIsDark(!isDark)}
            className="header__theme-toggle"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Connection status dot — 6px real CSS dot */}
          <span
            className="header__connection-dot header__connection-dot--offline"
            title="Disconnected"
          />

          {user ? (
            <div className="header__user">
              {/* Profile Avatar: 28px round, initials */}
              <div className="header__avatar" title={user.displayName || user.email}>
                {getInitials()}
              </div>
              <button onClick={logout} className="header__logout-btn">
                Logout
              </button>
            </div>
          ) : (
            <div className="header__auth">
              <Link to="/auth/login" className="header__nav-link">
                Login
              </Link>
              <Link to="/auth/register" className="header__signup-btn">
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
