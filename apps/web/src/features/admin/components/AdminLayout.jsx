import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../../core/context/AuthContext';
import './AdminLayout.css';

/**
 * Bloomberg / High-Density Terminal Admin Shell.
 * Provides consistent 180px navigation sidebar, status tags, and main workstation pane.
 */
export function AdminLayout() {
  const user = useAuth();

  return (
    <div className="admin-layout">
      {/* 180px Terminal Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div className="admin-badge">ADMIN DESK</div>
          <div className="admin-operator-info" title={user?.email || ''}>
            {user?.displayName || 'Operator'}
          </div>
        </div>

        <nav className="admin-nav">
          <div className="admin-nav-section">MANAGEMENT</div>
          <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Overview
          </NavLink>
          <NavLink to="/admin/disputes" className={({ isActive }) => (isActive ? 'active' : '')}>
            Disputes Queue
          </NavLink>

          <div className="admin-nav-section">SYSTEM</div>
          <NavLink to="/admin/auctions" className={({ isActive }) => (isActive ? 'active' : '')}>
            Auctions
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => (isActive ? 'active' : '')}>
            Users
          </NavLink>
          <NavLink to="/admin/categories" className={({ isActive }) => (isActive ? 'active' : '')}>
            Categories
          </NavLink>
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/dashboard" className="admin-exit-link">
            ← User Dashboard
          </Link>
        </div>
      </aside>

      {/* Main Admin Workspace Content */}
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
