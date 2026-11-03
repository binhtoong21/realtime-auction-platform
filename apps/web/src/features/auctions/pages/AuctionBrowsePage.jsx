import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuctions } from '../hooks/useAuctions';
import { useWatchlistIds } from '../../dashboard/hooks/useWatchlist';
import { FilterPills } from '../components/FilterPills';
import { AuctionCard } from '../components/AuctionCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import { AlertCircle, PackageSearch, Search, X } from 'lucide-react';
import './AuctionBrowsePage.css';

/**
 * Auction Browse Page component.
 * Allows users to browse, filter, search, and view a paginated list of auctions.
 * @returns {JSX.Element} The rendered component.
 */
export function AuctionBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allAuctions, setAllAuctions] = useState([]);
  const [cursor, setCursor] = useState(null);

  const filters = {
    categoryId: searchParams.get('categoryId') || '',
    minPrice: searchParams.get('minPrice') || null,
    maxPrice: searchParams.get('maxPrice') || null,
    status: searchParams.get('status') !== null ? searchParams.get('status') : 'active',
    search: searchParams.get('search') || '',
  };

  const [searchInput, setSearchInput] = useState(filters.search);

  const { auctions, nextCursor, hasMore, isLoading, error, refetch } = useAuctions({
    ...filters,
    cursor,
    limit: 12,
  });

  const { watchedIdsSet, refetchWatchedIds } = useWatchlistIds();

  // Whenever filters change, reset cursor and data
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(null);
    setAllAuctions([]);
  }, [filters.categoryId, filters.minPrice, filters.maxPrice, filters.status, filters.search]);

  // Accumulate or replace auctions when `auctions` array changes
  useEffect(() => {
    if (!auctions) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllAuctions((prev) => {
      if (!cursor) {
        // Fresh fetch (cursor is null) -> Replace
        return auctions;
      } else {
        // Load More -> Append
        const existingIds = new Set(prev.map((a) => a.id));
        const newAuctions = auctions.filter((a) => !existingIds.has(a.id));
        if (newAuctions.length === 0) return prev;
        return [...prev, ...newAuctions];
      }
    });
  }, [auctions, cursor]);

  // Debounce search input and sync with searchParams
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== (searchParams.get('search') || '')) {
        const newParams = new URLSearchParams(searchParams);
        if (trimmed) {
          newParams.set('search', trimmed);
        } else {
          newParams.delete('search');
        }
        setSearchParams(newParams);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, searchParams, setSearchParams]);

  const handleFilterChange = (newFilters) => {
    const newParams = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        newParams.set(key, value);
      } else if (key === 'status' && value === '') {
        newParams.set(key, '');
      }
    });
    setSearchParams(newParams);
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      setCursor(nextCursor);
    }
  };

  const handleCategoryChange = (categoryId) => {
    handleFilterChange({ ...filters, categoryId });
  };

  const handleStatusChange = (status) => {
    handleFilterChange({ ...filters, status });
  };

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      const trimmed = searchInput.trim();
      const newParams = new URLSearchParams(searchParams);
      if (trimmed) {
        newParams.set('search', trimmed);
      } else {
        newParams.delete('search');
      }
      setSearchParams(newParams);
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('search');
    setSearchParams(newParams);
  };

  return (
    <div className="auction-browse-page">
      <div className="browse-layout">
        <FilterPills
          activeCategory={filters.categoryId}
          onCategoryChange={handleCategoryChange}
        />

        <main className="browse-main">
          <div className="status-tabs-row">
            <div className="status-tabs">
              <button
                className={`status-tab ${filters.status === 'active' ? 'active' : ''}`}
                onClick={() => handleStatusChange('active')}
              >
                Active Auctions
              </button>
              <button
                className={`status-tab ${filters.status === 'scheduled' ? 'active' : ''}`}
                onClick={() => handleStatusChange('scheduled')}
              >
                Upcoming
              </button>
              <button
                className={`status-tab ${filters.status === 'ended' ? 'active' : ''}`}
                onClick={() => handleStatusChange('ended')}
              >
                Ended
              </button>
            </div>

            <div className="browse-search-wrap">
              <Search size={14} className="browse-search-icon" />
              <input
                type="text"
                className="browse-search-input"
                placeholder="Search by lot title or description..."
                value={searchInput}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search auctions"
              />
              {searchInput && (
                <button
                  type="button"
                  className="browse-search-clear"
                  onClick={handleClearSearch}
                  aria-label="Clear search input"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {error && (
            <EmptyState
              icon={AlertCircle}
              heading="Failed to load auctions"
              subtext="An error occurred while fetching data. Please try again."
              cta={{ label: 'Retry', onClick: refetch }}
            />
          )}

          {!isLoading && allAuctions.length === 0 && !error && (
            <EmptyState
              icon={PackageSearch}
              heading={filters.search ? 'No matching auctions' : 'No auctions found'}
              subtext={
                filters.search
                  ? `No auctions found matching "${filters.search}". Try adjusting your keywords or clearing the search filter.`
                  : 'There are no auctions matching your current filters.'
              }
              cta={
                filters.search
                  ? {
                      label: 'Clear Search',
                      onClick: handleClearSearch,
                    }
                  : undefined
              }
            />
          )}

          <div
            className="browse-grid"
            style={{
              opacity: isLoading && !cursor ? 0.5 : 1,
              transition: 'opacity 0.2s',
              pointerEvents: isLoading && !cursor ? 'none' : 'auto',
            }}
          >
            {allAuctions.map((auction) => (
              <div key={auction.id}>
                <AuctionCard
                  auction={auction}
                  isWatched={watchedIdsSet.has(auction.id)}
                  onWatchlistToggle={refetchWatchedIds}
                />
              </div>
            ))}

            {/* Skeleton for initial load or load more */}
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="skeleton-card" />
              ))}
          </div>

          {hasMore && (
            <div className="load-more-container">
              <button
                type="button"
                className="btn btn--lg btn--secondary"
                onClick={handleLoadMore}
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
