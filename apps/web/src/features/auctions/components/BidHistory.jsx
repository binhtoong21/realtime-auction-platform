import { useState, useRef, useEffect } from 'react';
import './BidHistory.css';

/**
 * Masks bidder display name to protect privacy in the public bid room.
 * Shows the first and last few characters of the display name.
 */
const maskName = (name) => {
  if (!name) return '***';
  if (name.length <= 3) return name[0] + '***';
  
  // Show max 3 chars at start, max 2 chars at end
  const visibleStart = Math.min(3, Math.ceil(name.length / 3));
  const visibleEnd = Math.min(2, Math.floor(name.length / 3));
  
  return name.slice(0, visibleStart) + '***' + name.slice(-visibleEnd);
};

/**
 * Formats a timestamp into relative time (e.g., "2 mins ago").
 */
const formatRelativeTime = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Formats amount in cents to currency display.
 */
const formatAmount = (cents) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((cents || 0) / 100);
};

/**
 * Renders a live-updating bid history list.
 * New bids appear at the top with slide-in animation.
 */
export function BidHistory({ bids, isLoading, error }) {
  const [newBidId, setNewBidId] = useState(null);
  const topBidIdRef = useRef(null);

  useEffect(() => {
    if (bids && bids.length > 0) {
      const currentTopId = bids[0].id;
      // If we already had bids, and the top bid is new
      if (topBidIdRef.current && topBidIdRef.current !== currentTopId) {
        setNewBidId(currentTopId);
        // Clear the new status after animation duration (e.g. 1s)
        const timer = setTimeout(() => setNewBidId(null), 1000);
        return () => clearTimeout(timer);
      }
      topBidIdRef.current = currentTopId;
    }
  }, [bids]);

  if (isLoading) {
    return (
      <div className="bid-history-skeleton">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bid-history-skeleton-row">
            <div className="skeleton-line" style={{ width: '15%' }} />
            <div className="skeleton-line" style={{ width: '30%' }} />
            <div className="skeleton-line" style={{ width: '20%' }} />
            <div className="skeleton-line" style={{ width: '25%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bid-history-error">
        <p>Failed to load bid history.</p>
        <p className="error-details">{error.message || String(error)}</p>
      </div>
    );
  }

  if (!bids || bids.length === 0) {
    return (
      <div className="bid-history-empty">
        <p>No bids yet. Be the first to place a bid!</p>
      </div>
    );
  }

  return (
    <div className="bid-history-list">
      {bids.map((bid) => (
        <div
          key={bid.id}
          className={`bid-history-item ${
            bid.id === newBidId ? 'new-bid' : ''
          }`}
        >
          <span className="bid-user">{maskName(bid.bidder_name)}</span>
          <span className="bid-amount">{formatAmount(bid.amount)}</span>
          <span className="bid-time">{formatRelativeTime(bid.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
