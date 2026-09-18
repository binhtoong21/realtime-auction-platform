import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMyBids } from '../hooks/useBuyerActions';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatCurrency } from '../../../utils/formatters';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Gavel } from 'lucide-react';
import './MyBidsPage.css';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'winning', label: 'Winning' },
  { value: 'outbid', label: 'Outbid' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' }
];

export function MyBidsPage() {
  const [activeTab, setActiveTab] = useState('');
  const [currentCursor, setCurrentCursor] = useState(null);
  
  const { bids: currentBids, nextCursor: currentNextCursor, isLoading: isBidsLoading, error: bidsError, refetch: refetchBids } = useMyBids(activeTab, currentCursor);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentCursor(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getBidOutcome = (bid) => {
    const isWinning = bid.is_winning;
    const status = bid.auction_status?.toLowerCase();
    
    if (status === 'active' || status === 'scheduled') {
      return isWinning ? 'WINNING' : 'OUTBID';
    } else {
      return isWinning ? 'WON' : 'LOST';
    }
  };

  return (
    <div className="my-bids-page">
      <div className="page-header">
        <div>
          <h1>My Bids</h1>
          <p className="subtitle">Track your bidding history and outcomes.</p>
        </div>
        <Link to="/auctions" className="btn-primary">
          Browse Auctions
        </Link>
      </div>

      <div className="status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            className={`tab-btn ${activeTab === tab.value ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bids-content">
        {isBidsLoading && !currentBids.length ? (
          <div className="loading-state">Loading bids...</div>
        ) : bidsError ? (
          <div className="error-state">
            <p>An error occurred while loading data. (API may not be ready yet)</p>
            <button className="btn-secondary" onClick={refetchBids}>Retry</button>
          </div>
        ) : currentBids.length === 0 ? (
          <EmptyState
            icon={Gavel}
            heading="No bids found"
            subtext="You haven't placed any bids that match this filter."
            cta={{ label: 'Start Bidding', to: '/auctions' }}
          />
        ) : (
          <div className="table-responsive">
            <table className="bids-table">
              <thead>
                <tr>
                  <th>Auction</th>
                  <th>My Bid</th>
                  <th>Current Price</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {currentBids.map(bid => {
                  const outcome = getBidOutcome(bid);
                  return (
                    <tr key={bid.id}>
                      <td>
                        <Link to={`/auctions/${bid.auction_id}`} className="auction-product">
                          {bid.auction_image ? (
                            <img src={bid.auction_image} alt={bid.auction_title} className="auction-thumb" />
                          ) : (
                            <div className="auction-thumb-placeholder">No Image</div>
                          )}
                          <span className="auction-title" title={bid.auction_title}>{bid.auction_title}</span>
                        </Link>
                      </td>
                      <td className="price-cell my-bid-amount">{formatCurrency(bid.amount)}</td>
                      <td className="price-cell">{formatCurrency(bid.auction_current_price)}</td>
                      <td><StatusBadge status={outcome} type="bidOutcome" /></td>
                      <td className="date-cell">{formatDate(bid.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {currentNextCursor && (
              <div className="load-more-container">
                <button 
                  className="btn-secondary" 
                  onClick={() => setCurrentCursor(currentNextCursor)}
                  disabled={isBidsLoading}
                >
                  {isBidsLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
