import { NavLink, Outlet } from 'react-router-dom';

export function DashboardLayout() {
  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <aside className="dashboard-sidebar">
        <nav className="dashboard-nav">
          <NavLink to="/dashboard" end className={({ isActive }) => isActive ? 'active' : ''}>
            Overview
          </NavLink>
          <NavLink to="/dashboard/bids" className={({ isActive }) => isActive ? 'active' : ''}>
            My Bids
          </NavLink>
          <NavLink to="/dashboard/auctions" className={({ isActive }) => isActive ? 'active' : ''}>
            My Auctions (Selling)
          </NavLink>
          <NavLink to="/dashboard/payments" className={({ isActive }) => isActive ? 'active' : ''}>
            Payments & Escrow
          </NavLink>
          <NavLink to="/dashboard/notifications" className={({ isActive }) => isActive ? 'active' : ''}>
            Notifications
          </NavLink>
          
          <div className="nav-divider">Settings</div>
          <NavLink to="/dashboard/settings/profile" className={({ isActive }) => isActive ? 'active' : ''}>
            Profile
          </NavLink>
          <NavLink to="/dashboard/settings/payment-methods" className={({ isActive }) => isActive ? 'active' : ''}>
            Cards & Payment
          </NavLink>
          <NavLink to="/dashboard/settings/kyc" className={({ isActive }) => isActive ? 'active' : ''}>
            KYC Verification
          </NavLink>
        </nav>
      </aside>

      {/* Main Content Pane */}
      <main className="dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
