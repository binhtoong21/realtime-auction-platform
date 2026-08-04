import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSellerAuctions } from '../hooks/useSellerActions';
import { ShipModal } from '../components/ShipModal';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatCurrency } from '../../../utils/formatters';
import './MyAuctionsPage.css';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'awaiting_ship', label: 'Awaiting Ship' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'ended', label: 'Ended' },
  { value: 'no_sale', label: 'No Sale' }
];

export function MyAuctionsPage() {
  const [activeTab, setActiveTab] = useState('');
  const [currentCursor, setCurrentCursor] = useState(null);

  const { auctions, nextCursor, isLoading, error, refetch } = useSellerAuctions(activeTab, currentCursor);
  
  const [shippingAuctionId, setShippingAuctionId] = useState(null);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentCursor(null);
  };

  const handleShipSuccess = () => {
    setShippingAuctionId(null);
    refetch();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="my-auctions-page">
      <div className="page-header">
        <div>
          <h1>My Auctions & Orders</h1>
          <p className="subtitle">Manage the items you are selling and shipping.</p>
        </div>
        <Link to="/dashboard/auctions/create" className="btn-primary">
          + Create Auction
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

      <div className="auctions-content">
        {isLoading ? (
          <div className="loading-state">Loading auctions...</div>
        ) : error ? (
          <div className="error-state">
            <p>An error occurred while loading data.</p>
            <button className="btn-secondary" onClick={refetch}>Retry</button>
          </div>
        ) : auctions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No items found</h3>
            <p>You do not have any auctions in this status.</p>
            {activeTab === '' && (
              <Link to="/dashboard/auctions/create" className="btn-primary mt-4">
                Start Selling
              </Link>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="auctions-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Current Price</th>
                  <th>Bids</th>
                  <th>Ends At</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {auctions.map(auction => (
                  <tr key={auction.id}>
                    <td>
                      <div className="auction-product">
                        {auction.images && auction.images[0] ? (
                          <img src={auction.images[0]} alt={auction.title} className="auction-thumb" />
                        ) : (
                          <div className="auction-thumb-placeholder">No Image</div>
                        )}
                        <span className="auction-title" title={auction.title}>{auction.title}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={auction.status} type="auction" /></td>
                    <td className="price-cell">
                      {formatCurrency(auction.current_price || auction.starting_price)}
                    </td>
                    <td>{auction.bid_count || 0}</td>
                    <td className="date-cell">{formatDate(auction.end_at)}</td>
                    <td className="actions-cell">
                      {/* Active/Draft actions */}
                      {(auction.status === 'active' || auction.status === 'draft') && Number(auction.bid_count) === 0 && (
                        <div className="action-buttons">
                          <Link to={`/dashboard/auctions/${auction.id}/edit`} className="btn-link">Edit</Link>
                          {/* Cancel logic not fully implemented in API yet */}
                          <button className="btn-link danger" disabled title="Cancel feature is under development">Cancel</button>
                        </div>
                      )}
                      
                      {/* Shipping actions */}
                      {auction.status === 'awaiting_ship' && (
                        <button 
                          className="btn-primary btn-sm"
                          onClick={() => setShippingAuctionId(auction.id)}
                        >
                          Ship Now
                        </button>
                      )}

                      {auction.status === 'shipped' && (
                        <div className="tracking-info">
                          <span className="tracking-number">{auction.carrier}: {auction.tracking_number}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {nextCursor && (
              <div className="load-more-container">
                <button 
                  className="btn-secondary" 
                  onClick={() => setCurrentCursor(nextCursor)}
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {shippingAuctionId && (
        <ShipModal
          auctionId={shippingAuctionId}
          onClose={() => setShippingAuctionId(null)}
          onSuccess={handleShipSuccess}
        />
      )}
    </div>
  );
}
