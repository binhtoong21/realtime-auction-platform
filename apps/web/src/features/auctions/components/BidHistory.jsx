import { useRef, useEffect } from 'react';
import './BidHistory.css';

/**
 * Masks bidder display name — show first 40% (max 5 chars), hide the rest.
 * Vietnamese names have the given name (most identifying) at the end,
 * so masking the end protects privacy better.
 */
const maskName = (name) => {
  if (!name || name.length <= 3) return '***';
  const visibleCount = Math.min(Math.ceil(name.length * 0.4), 5);
  return name.slice(0, visibleCount) + '***';
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
export function BidHistory({ bids, isLoading }) {
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

  if (!bids || bids.length === 0) {
    return (
      <div className="bid-history-empty">
        <p>No bids yet. Be the first to place a bid!</p>
      </div>
    );
  }

  return (
    <div className="bid-history">
      <table className="bid-history-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Bidder</th>
            <th>Amount</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((bid, index) => (
            <tr
              key={bid.id}
              className={`bid-history-row ${
                bid.id === newBidId ? 'bid-entry-new' : ''
              } ${bid.is_winning ? 'winning-bid' : ''}`}
            >
              <td className="bid-rank">{index + 1}</td>
              <td className="bid-bidder">{maskName(bid.bidder_name)}</td>
              <td className="bid-amount">{formatAmount(bid.amount)}</td>
              <td className="bid-time">{formatRelativeTime(bid.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
