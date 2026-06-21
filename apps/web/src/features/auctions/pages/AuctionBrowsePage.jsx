import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuctions } from '../hooks/useAuctions';
import { FilterSidebar } from '../components/FilterSidebar';
import { AuctionCard } from '../components/AuctionCard';
import './AuctionBrowsePage.css';

/**
 * Auction Browse Page component.
 * Allows users to browse, filter, and view a paginated list of auctions.
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
  };

  const { auctions, nextCursor, hasMore, isLoading, error } = useAuctions({
    ...filters,
    cursor,
    limit: 12
  });

  // Whenever filters change, reset cursor and data
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllAuctions([]);
  }, [filters.categoryId, filters.minPrice, filters.maxPrice, filters.status]);

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
        const existingIds = new Set(prev.map(a => a.id));
        const newAuctions = auctions.filter(a => !existingIds.has(a.id));
        if (newAuctions.length === 0) return prev;
        return [...prev, ...newAuctions];
      }
    });
  }, [auctions, cursor]);

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

  return (
    <div className="auction-browse-page container">
      <h1 className="browse-title">Browse Auctions</h1>
      
      <div className="browse-layout">
        <aside className="browse-sidebar">
          <FilterSidebar filters={filters} onChange={handleFilterChange} />
        </aside>

        <main className="browse-main">
          {error && (
            <div className="error-state">
              <p>Failed to load auctions. Please try again.</p>
            </div>
          )}

          {!isLoading && allAuctions.length === 0 && !error && (
            <div className="empty-state">
              <p>No auctions found matching your criteria.</p>
            </div>
          )}

          <div 
            className="browse-grid"
            style={{ 
              opacity: isLoading && !cursor ? 0.5 : 1, 
              transition: 'opacity 0.2s',
              pointerEvents: isLoading && !cursor ? 'none' : 'auto' 
            }}
          >
            {allAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} variant="list" />
            ))}
            
            {/* Skeleton for initial load or load more */}
            {isLoading && (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="skeleton-card"></div>
              ))
            )}
          </div>

          {hasMore && (
            <div className="load-more-container">
              <button 
                type="button" 
                className="btn btn-outline btn-lg" 
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
