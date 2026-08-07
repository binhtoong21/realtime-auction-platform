import { useFetch } from '../../../core/hooks/useFetch';
import { useAuth } from '../../../core/context/AuthContext';
import { Link } from 'react-router-dom';
import './DashboardHome.css';

export function DashboardHome() {
  const { user } = useAuth();

  // Fetch summary data
  const { data: activeBidsRes, isLoading: loadingActive } = useFetch('/auctions?bidder_id=me&status=active');
  const { data: winningBidsRes, isLoading: loadingWinning } = useFetch('/bids?user_id=me&is_winning=true');
  const { data: wonAuctionsRes, isLoading: loadingWon } = useFetch('/auctions?winner_id=me'); // Assuming winner_id exists based on pattern
  const { data: openDisputesRes, isLoading: loadingDisputes } = useFetch('/disputes?user_id=me&status=open'); // Assuming this exists

  // Fetch recent activity (notifications)
  const { data: notificationsRes, isLoading: loadingNotifs } = useFetch('/notifications?limit=8');

  const isLoading = loadingActive || loadingWinning || loadingWon || loadingDisputes || loadingNotifs;
  const isNewUser = !isLoading && 
    activeBidsRes?.data?.items?.length === 0 && 
    winningBidsRes?.data?.length === 0 && 
    wonAuctionsRes?.data?.items?.length === 0 && 
    (!notificationsRes?.data || notificationsRes?.data?.length === 0);

  const formatRelativeTime = (isoString) => {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'bid:outbid': return '🔴'; // Fallback icon, actual icon should be CSS/SVG
      case 'auction:ended': return '🏁';
      case 'auction:won': return '🏆';
      default: return '🔔';
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-home-page">
        <div className="metric-cards-grid">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-card"></div>)}
        </div>
        <div className="recent-activity-panel">
          <div className="skeleton-line"></div>
          <div className="skeleton-line"></div>
          <div className="skeleton-line"></div>
        </div>
      </div>
    );
  }

  if (isNewUser) {
    return (
      <div className="dashboard-home-page">
        <div className="empty-state">
          <p>Chưa có hoạt động nào. Bắt đầu khám phá Market!</p>
          <Link to="/" className="btn btn-primary btn-lg">Go to Market</Link>
        </div>
      </div>
    );
  }

  const activeBidsCount = activeBidsRes?.data?.items?.length || 0;
  const winningBidsCount = winningBidsRes?.data?.length || 0;
  const wonAuctionsCount = wonAuctionsRes?.data?.items?.length || 0;
  const openDisputesCount = openDisputesRes?.data?.length || 0;
  const notifications = notificationsRes?.data || [];

  return (
    <div className="dashboard-home-page">
      <div className="metric-cards-grid">
        <div className="metric-card">
          <span className="metric-label">Active Bids</span>
          <span className="metric-value">{activeBidsCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Winning Bids</span>
          <span className="metric-value">{winningBidsCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Won Auctions</span>
          <span className="metric-value">{wonAuctionsCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Open Disputes</span>
          <span className="metric-value">{openDisputesCount}</span>
        </div>
      </div>

      <div className="recent-activity-panel">
        <h3>Recent Activity</h3>
        <ul className="activity-list">
          {notifications.map((notif) => (
            <li key={notif.id} className="activity-item">
              <span className="activity-icon">{getActivityIcon(notif.type)}</span>
              <span className="activity-text">{notif.message}</span>
              <span className="activity-time">{formatRelativeTime(notif.created_at)}</span>
            </li>
          ))}
          {notifications.length === 0 && (
            <li className="activity-empty">No recent activity.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
