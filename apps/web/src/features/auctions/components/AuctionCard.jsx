import { Link } from 'react-router-dom';
import { CountdownTimer } from './CountdownTimer';
import './AuctionCard.css';

/**
 * Pure component to render an auction card.
 * @param {Object} props
 * @param {Object} props.auction - The auction data.
 * @param {"featured" | "list"} props.variant - Layout variant: vertical (featured) or horizontal (list).
 */
export function AuctionCard({ auction, variant = 'list' }) {
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
    status = 'unknown', 
    seller, 
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

  // Status Badge mappings
  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return <span className="status-badge active">Active</span>;
      case 'ended':
        return <span className="status-badge ended">Ended</span>;
      default:
        return <span className="status-badge other">{status}</span>;
    }
  };

  return (
    <Link to={`/auctions/${id}`} className={`auction-card card-${variant}`}>
      <div className="auction-card-image-wrapper">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="auction-card-image" loading="lazy" />
        ) : (
          <span className="auction-card-image-placeholder">No Image</span>
        )}
      </div>
      
      <div className="auction-card-info">
        {getStatusBadge(status)}
        
        <h3 className="auction-card-title">{title}</h3>
        
        {seller?.displayName && (
          <p className="auction-card-seller">Seller: {seller.displayName}</p>
        )}

        <div className="auction-card-price-section">
          <span className="auction-card-price">{formattedPrice}</span>
        </div>

        <div className="auction-card-footer">
          <div className="auction-card-countdown">
            <CountdownTimer endAt={endDate} />
          </div>
          <span className="auction-card-bid-count">
            {bids} {bids === 1 ? 'bid' : 'bids'}
          </span>
        </div>
      </div>
    </Link>
  );
}
