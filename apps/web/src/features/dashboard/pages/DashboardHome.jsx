import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Flag,
  Trophy,
  Bell,
  Gavel,
  Flame,
  Bookmark,
} from 'lucide-react';
import { AuctionStatus } from '@auction/shared-constants';
import { useFetch } from '../../../core/hooks/useFetch';
import { useWatchlistIds } from '../hooks/useWatchlist';
import './DashboardHome.css';

const WINNING_STATUSES = new Set([AuctionStatus.ACTIVE]);

// Statuses where the user's winning bid means they won the auction.
const WON_STATUSES = new Set([
  AuctionStatus.ENDED,
  AuctionStatus.PENDING_PAYMENT,
  AuctionStatus.AWAITING_SHIP,
  AuctionStatus.SHIPPED,
  AuctionStatus.COMPLETED,
  AuctionStatus.DISPUTED,
]);

/**
 * Dashboard Home Overview component.
 * Displays user operational metrics (Active Bids, Winning Bids, Won Auctions, Watchlist)
 * and recent platform notifications / activity log.
 * @returns {JSX.Element} The rendered component.
 */
export function DashboardHome() {
  // 1. Fetch active auctions user participated in
  // limit=100 approximates totals until the API exposes count endpoints.
  const {
    data: activeBidsRes,
    isLoading: loadingActive,
    error: errorActive,
  } = useFetch('/auctions?bidderId=me&status=active&limit=100');

  // 2. Fetch user bid history to derive winning bids and won auctions
  const {
    data: myBidsRes,
    isLoading: loadingMyBids,
    error: errorMyBids,
  } = useFetch('/users/me/bids?limit=100');

  // 3. Fetch user's watchlist item IDs
  const {
    watchedIds,
    isLoading: loadingWatchlist,
    error: errorWatchlist,
  } = useWatchlistIds();

  // 4. Fetch recent notifications
  const {
    data: notificationsRes,
    isLoading: loadingNotifs,
    error: errorNotifs,
  } = useFetch('/notifications?limit=8');

  // Derive counts
  const activeBidsCount = activeBidsRes?.data?.items?.length || 0;
  const myBids = useMemo(() => {
    return Array.isArray(myBidsRes?.data) ? myBidsRes.data : [];
  }, [myBidsRes]);

  const winningBidsCount = useMemo(() => {
    const winningActiveAuctionIds = new Set(
      myBids
        .filter((b) => b.isWinning && WINNING_STATUSES.has(b.auctionStatus))
        .map((b) => b.auctionId)
    );
    return winningActiveAuctionIds.size;
  }, [myBids]);

  const wonAuctionsCount = useMemo(() => {
    const wonAuctionIds = new Set(
      myBids
        .filter((b) => b.isWinning && WON_STATUSES.has(b.auctionStatus))
        .map((b) => b.auctionId)
    );
    return wonAuctionIds.size;
  }, [myBids]);

  const watchlistCount = watchedIds.length;

  const isLoading =
    loadingActive || loadingMyBids || loadingWatchlist || loadingNotifs;
  const hasError = errorActive || errorMyBids || errorWatchlist || errorNotifs;

  const isNewUser =
    !isLoading &&
    !hasError &&
    activeBidsCount === 0 &&
    winningBidsCount === 0 &&
    wonAuctionsCount === 0 &&
    watchlistCount === 0 &&
    (!notificationsRes?.data || notificationsRes?.data?.length === 0);

  /**
   * Formats ISO timestamp to human-friendly relative time string.
   * @param {string} isoString
   * @returns {string}
   */
  const formatRelativeTime = (isoString) => {
    if (!isoString) return '';
    // eslint-disable-next-line react-hooks/purity
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  /**
   * Returns corresponding icon element for notification type.
   * @param {string} type
   * @returns {JSX.Element}
   */
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

  /**
   * Returns human-readable notification description text.
   * @param {object} notif
   * @returns {string}
   */
  const getActivityText = (notif) => {
    if (notif.payload && notif.payload.message) return notif.payload.message;
    switch (notif.type) {
      case 'outbid':
        return 'Someone placed a higher bid on an auction you joined.';
      case 'won':
        return 'You won an auction! Please complete payment.';
      case 'lost':
        return 'An auction you participated in has ended.';
      default:
        return 'You have a new notification.';
    }
  };

  if (hasError) {
    return (
      <div className="dashboard-home-page">
        <div className="empty-state">
          <AlertCircle size={48} color="var(--color-danger)" />
          <p>Failed to load data. Please try again later.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="dashboard-home-page">
        <div className="metric-cards-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
        <div className="recent-activity-panel">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </div>
      </div>
    );
  }

  if (isNewUser) {
    return (
      <div className="dashboard-home-page">
        <div className="empty-state">
          <p>No activity yet. Start exploring the Market!</p>
          <Link to="/" className="btn btn-primary btn-lg">
            Go to Market
          </Link>
        </div>
      </div>
    );
  }

  const notifications = notificationsRes?.data || [];

  return (
    <div className="dashboard-home-page">
      <div className="metric-cards-grid">
        <Link
          to="/dashboard/bids"
          className="metric-card metric-card--interactive"
        >
          <div className="metric-card__header">
            <span className="metric-label">Active Bids</span>
            <span className="metric-icon metric-icon--secondary">
              <Gavel size={16} />
            </span>
          </div>
          <span className="metric-value">{activeBidsCount}</span>
          <span className="metric-subtext">Auctions in progress</span>
        </Link>

        <Link
          to="/dashboard/bids"
          className="metric-card metric-card--interactive"
        >
          <div className="metric-card__header">
            <span className="metric-label">Winning Bids</span>
            <span className="metric-icon metric-icon--warning">
              <Flame size={16} />
            </span>
          </div>
          <span className="metric-value metric-value--warning">
            {winningBidsCount}
          </span>
          <span className="metric-subtext">Highest bidder position</span>
        </Link>

        <Link
          to="/dashboard/bids"
          className="metric-card metric-card--interactive"
        >
          <div className="metric-card__header">
            <span className="metric-label">Won Auctions</span>
            <span className="metric-icon metric-icon--success">
              <Trophy size={16} />
            </span>
          </div>
          <span className="metric-value metric-value--success">
            {wonAuctionsCount}
          </span>
          <span className="metric-subtext">
            Pending payment, in delivery or settled
          </span>
        </Link>

        <Link
          to="/dashboard/watchlist"
          className="metric-card metric-card--interactive"
        >
          <div className="metric-card__header">
            <span className="metric-label">Watchlist</span>
            <span className="metric-icon metric-icon--brand">
              <Bookmark size={16} />
            </span>
          </div>
          <span className="metric-value">{watchlistCount}</span>
          <span className="metric-subtext">Bookmarked lots</span>
        </Link>
      </div>

      <div className="recent-activity-panel">
        <h3>Recent Activity</h3>
        <ul className="activity-list">
          {notifications.map((notif) => (
            <li key={notif.id} className="activity-item">
              <span
                className="activity-icon"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {getActivityIcon(notif.type)}
              </span>
              <span className="activity-text">{getActivityText(notif)}</span>
              <span className="activity-time">
                {formatRelativeTime(notif.created_at)}
              </span>
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
