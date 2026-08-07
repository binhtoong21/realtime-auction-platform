import { useFetch } from '../../../core/hooks/useFetch';
import { useAuth } from '../../../core/context/AuthContext';
import { Link } from 'react-router-dom';
import { AlertCircle, Flag, Trophy, Bell } from 'lucide-react';
import './DashboardHome.css';

export function DashboardHome() {
  const { user } = useAuth();

  // Fetch summary data
  const { data: activeBidsRes, isLoading: loadingActive, error: errorActive } = useFetch('/auctions?bidder_id=me&status=active');
  const { data: winningBidsRes, isLoading: loadingWinning, error: errorWinning } = useFetch('/bids?user_id=me&is_winning=true');
  const { data: notificationsRes, isLoading: loadingNotifs, error: errorNotifs } = useFetch('/notifications?limit=8');

  const isLoading = loadingActive || loadingWinning || loadingNotifs;
  const hasError = errorActive || errorWinning || errorNotifs;

  const isNewUser = !isLoading && !hasError &&
    activeBidsRes?.data?.items?.length === 0 && 
    winningBidsRes?.data?.length === 0 && 
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
      case 'outbid':
      case 'lost':
        return <AlertCircle size={16} />;
      case 'ended': 
        return <Flag size={16} />;
      case 'won': 
        return <Trophy size={16} />;
      default: 
        return <Bell size={16} />;
    }
  };

  const getActivityText = (notif) => {
    // Backend returns JSON payload, we attempt to read message or fallback
    if (notif.payload && notif.payload.message) return notif.payload.message;
    switch (notif.type) {
      case 'outbid': return 'Someone placed a higher bid on an auction you joined.';
      case 'won': return 'You won an auction! Please complete payment.';
      case 'lost': return 'An auction you participated in has ended.';
      default: return 'You have a new notification.';
    }
  };

  if (hasError) {
    return (
      <div className="dashboard-home-page">
        <div className="empty-state">
          <AlertCircle size={48} color="var(--color-danger)" />
          <p>Lỗi tải dữ liệu. Vui lòng thử lại sau.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="dashboard-home-page">
        <div className="metric-cards-grid">
          {[1, 2].map(i => <div key={i} className="skeleton-card"></div>)}
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

  // getAuctions cursor paginated returns data: { items, nextCursor }
  const activeBidsCount = activeBidsRes?.data?.items?.length || 0;
  // getBids by user returns array directly in data
  const winningBidsCount = winningBidsRes?.data?.length || 0;
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
      </div>

      <div className="recent-activity-panel">
        <h3>Recent Activity</h3>
        <ul className="activity-list">
          {notifications.map((notif) => (
            <li key={notif.id} className="activity-item">
              <span className="activity-icon" style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                {getActivityIcon(notif.type)}
              </span>
              <span className="activity-text">{getActivityText(notif)}</span>
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
