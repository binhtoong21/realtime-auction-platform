import { Link, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth, useAuthDispatch } from '../../core/context/AuthContext';
import { useSocketStatus } from '../../core/contexts/SocketContext';
import { useNotifications } from '../../features/dashboard/hooks/useNotifications';
import { Sun, Moon, Bell } from 'lucide-react';
import './Header.css';

/**
 * Site header with high-density styling (48px height), navigation,
 * connection status indicator, and user profile avatar.
 */
export function Header() {
  const user = useAuth();
  const { logout } = useAuthDispatch();
  const { isConnected } = useSocketStatus();
  const { unreadCount } = useNotifications({ limit: 1 });
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
    if (name.includes('@')) return name.substring(0, 2).toUpperCase();
    return name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
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
                  to="/dashboard/bids"
                  className={({ isActive }) =>
                    `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
                  }
                >
                  My Bids
                </NavLink>
                {user.role === 'admin' && (
                  <NavLink
                    to="/admin/disputes"
                    className={({ isActive }) =>
                      `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
                    }
                  >
                    Admin Desk
                  </NavLink>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="header__right">
          {user && (
            <Link to="/dashboard/auctions/create" className="btn btn--sm header__create-btn">
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

          {user ? (
            <div className="header__user">
              <span
                className={`header__connection-dot header__connection-dot--${isConnected ? 'online' : 'offline'}`}
                title={isConnected ? 'Realtime connected' : 'Disconnected'}
              />
              <Link
                to="/dashboard/notifications"
                className="header__icon-btn header__notification-btn"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="header__notification-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              {/* Profile Avatar: 28px round, initials or uploaded avatar */}
              <Link
                to="/dashboard/settings/profile"
                className="header__avatar-link"
                title={user.displayName || user.email}
              >
                <div className="header__avatar">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName || 'Avatar'}
                      className="header__avatar-img"
                    />
                  ) : (
                    getInitials()
                  )}
                </div>
              </Link>
              <button onClick={logout} className="btn btn--sm btn--secondary">
                Logout
              </button>
            </div>
          ) : (
            <div className="header__auth">
              <Link to="/auth/login" className="header__nav-link">
                Login
              </Link>
              <Link to="/auth/register" className="btn btn--sm btn--primary">
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
