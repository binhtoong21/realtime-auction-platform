import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { useAuth } from '../../../core/context/AuthContext';
import { useToast } from '../../../core/context/ToastContext';
import { useWatchlistIds, useToggleWatchlist } from '../../dashboard/hooks/useWatchlist';
import './WatchlistButton.css';

/**
 * Reusable Watchlist bookmark button.
 * Can be rendered as icon-only (e.g. on AuctionCard) or detailed (e.g. on AuctionDetailPage).
 *
 * @param {Object} props
 * @param {string} props.auctionId
 * @param {boolean} [props.isWatched] - Optional controlled watched state
 * @param {Function} [props.onToggle] - Callback (inWatchlist: boolean, auctionId: string) => void
 * @param {'icon-only' | 'detailed'} [props.variant='icon-only']
 * @param {number} [props.size=16]
 * @param {string} [props.className='']
 */
export function WatchlistButton({
  auctionId,
  isWatched: isWatchedProp,
  onToggle,
  variant = 'icon-only',
  size = 16,
  className = '',
}) {
  const user = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError, showInfo } = useToast();
  const { watchedIdsSet, refetchWatchedIds } = useWatchlistIds();
  const { toggle, isToggling } = useToggleWatchlist();

  const effectiveWatched =
    typeof isWatchedProp === 'boolean'
      ? isWatchedProp
      : watchedIdsSet.has(auctionId);

  const [optimisticWatched, setOptimisticWatched] = useState(null);

  const isWatched =
    optimisticWatched !== null ? optimisticWatched : effectiveWatched;

  const handleClick = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!user) {
        showInfo('Please log in to save auctions to your watchlist');
        navigate('/auth/login');
        return;
      }

      if (isToggling) return;

      const nextState = !isWatched;

      // Optimistic update
      setOptimisticWatched(nextState);

      try {
        const result = await toggle(auctionId);
        const resolvedState = result?.inWatchlist ?? nextState;
        setOptimisticWatched(resolvedState);
        if (resolvedState) {
          showSuccess('Saved to watchlist');
        } else {
          showInfo('Removed from watchlist');
        }
        refetchWatchedIds();
        if (onToggle) {
          onToggle(resolvedState, auctionId);
        }
      } catch (err) {
        setOptimisticWatched(null);
        showError(err.message || 'Failed to update watchlist');
      }
    },
    [
      user,
      isToggling,
      isWatched,
      auctionId,
      toggle,
      showSuccess,
      showInfo,
      showError,
      refetchWatchedIds,
      onToggle,
      navigate,
    ]
  );

  const isDetailed = variant === 'detailed';

  return (
    <button
      type="button"
      className={`watchlist-btn watchlist-btn--${variant} ${
        isWatched ? 'watchlist-btn--active' : ''
      } ${className}`}
      onClick={handleClick}
      disabled={isToggling}
      title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
      aria-label={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
      aria-pressed={isWatched}
    >
      <Bookmark
        size={size}
        className="watchlist-btn__icon"
        fill={isWatched ? 'currentColor' : 'none'}
      />
      {isDetailed && (
        <span className="watchlist-btn__label">
          {isWatched ? 'Watching' : 'Watch'}
        </span>
      )}
    </button>
  );
}
