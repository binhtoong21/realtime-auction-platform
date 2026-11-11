import { Link } from 'react-router-dom';
import { AuctionStatus } from '@auction/shared-constants';
import { CountdownTimer } from './CountdownTimer';
import { WatchlistButton } from './WatchlistButton';
import './AuctionCard.css';

/**
 * Pure component to render an auction card in high-density grid.
 * @param {Object} props
 * @param {Object} props.auction - The auction data.
 * @param {boolean} [props.isWatched] - Whether auction is in user's watchlist.
 * @param {Function} [props.onWatchlistToggle] - Callback when watchlist state changes.
 */
export function AuctionCard({ auction, isWatched, onWatchlistToggle }) {
  if (!auction || !auction.id) {
    return null;
  }

  const { 
    id, 
    title = 'Untitled Auction', 
    currentPrice,
    current_price, 
    endAt,
    end_at, 
    bidCount,
    bid_count, 
    images 
  } = auction;

  const price = currentPrice ?? current_price ?? 0;
  const endDate = endAt ?? end_at;
  const bids = bidCount ?? bid_count ?? 0;
  const imageUrl = images?.[0] || '';

  // Format currency
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price / 100);


  return (
    <Link to={`/auctions/${id}`} className="auction-card">
      <div className="auction-card-image-wrapper">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="auction-card-image" loading="lazy" />
        ) : (
          <span className="auction-card-image-placeholder">No Image</span>
        )}
        <div className="auction-card-watchlist">
          <WatchlistButton
            auctionId={id}
            isWatched={isWatched}
            onToggle={onWatchlistToggle}
            size={16}
          />
        </div>
      </div>
      
      <div className="auction-card-info">
        <h3 className="auction-card-title">{title}</h3>
        <span className="auction-card-price">{formattedPrice}</span>

        <div className="auction-card-footer">
          <div className="auction-card-countdown">
            {auction.status === AuctionStatus.SCHEDULED ? (
              <>
                <span className="auction-card-countdown-label">Starts in:</span>
                <CountdownTimer endAt={auction.start_at || auction.startAt} endedText="Starting..." />
              </>
            ) : auction.status === AuctionStatus.ACTIVE ? (
              <CountdownTimer endAt={endDate} />
            ) : (
              <span className="auction-card-status-text">{auction.status}</span>
            )}
          </div>
          <span className="auction-card-bid-count">
            {bids} {bids === 1 ? 'bid' : 'bids'}
          </span>
        </div>
      </div>
    </Link>
  );
}
