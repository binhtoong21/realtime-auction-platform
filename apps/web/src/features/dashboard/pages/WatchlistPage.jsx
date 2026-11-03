import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, AlertCircle } from 'lucide-react';
import { useWatchlistAuctions } from '../hooks/useWatchlist';
import { AuctionCard } from '../../auctions/components/AuctionCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import './WatchlistPage.css';

export function WatchlistPage() {
  const [page, setPage] = useState(1);
  const limit = 12;

  const { auctions, meta, error, isLoading, refetch } = useWatchlistAuctions({
    page,
    limit,
  });

  const totalPages = meta?.totalPages || 1;
  const total = meta?.total || 0;

  const handlePrevPage = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  };

  return (
    <div className="watchlist-page">
      <div className="watchlist-page__header">
        <div>
          <h1>My Watchlist</h1>
          <p className="subtitle">
            {total > 0
              ? `You are watching ${total} auction${total === 1 ? '' : 's'}.`
              : 'Auctions and items you have bookmarked for quick access.'}
          </p>
        </div>
        <Link to="/auctions" className="btn btn--md btn--primary">
          Explore Auctions
        </Link>
      </div>

      <div className="watchlist-page__content">
        {error && (
          <EmptyState
            icon={AlertCircle}
            heading="Failed to load watchlist"
            subtext="An error occurred while fetching your saved auctions. Please try again."
            cta={{ label: 'Retry', onClick: refetch }}
          />
        )}

        {!isLoading && !error && auctions.length === 0 && (
          <EmptyState
            icon={Bookmark}
            heading="Your watchlist is empty"
            subtext="You haven't saved any auctions yet. Click the bookmark icon on any auction card to track it here."
            cta={{ label: 'Explore Auctions', to: '/auctions' }}
          />
        )}

        <div className="watchlist-grid">
          {auctions.map((auction) => (
            <div key={auction.id}>
              <AuctionCard
                auction={auction}
                isWatched={true}
                onWatchlistToggle={refetch}
              />
            </div>
          ))}

          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`watchlist-skeleton-${i}`} className="skeleton-card" />
            ))}
        </div>

        {totalPages > 1 && (
          <div className="watchlist-pagination">
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={handlePrevPage}
              disabled={page <= 1 || isLoading}
            >
              Previous
            </button>
            <span className="watchlist-pagination__info">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={handleNextPage}
              disabled={page >= totalPages || isLoading}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
