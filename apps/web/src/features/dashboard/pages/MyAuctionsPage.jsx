import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSellerAuctions } from '../hooks/useSellerActions';
import { ShipModal } from '../components/ShipModal';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatCurrency } from '../../../utils/formatters';
import './MyAuctionsPage.css';

const STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'draft', label: 'Bản nháp' },
  { value: 'active', label: 'Đang diễn ra' },
  { value: 'awaiting_ship', label: 'Chờ giao hàng' },
  { value: 'shipped', label: 'Đang giao hàng' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'ended', label: 'Đã kết thúc' },
  { value: 'no_sale', label: 'Không bán được' }
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
    return new Date(dateString).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="my-auctions-page">
      <div className="page-header">
        <div>
          <h1>Đơn hàng & Đấu giá của tôi</h1>
          <p className="subtitle">Quản lý các sản phẩm bạn đang bán và giao hàng.</p>
        </div>
        <Link to="/dashboard/auctions/create" className="btn-primary">
          + Tạo phiên đấu giá
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
          <div className="loading-state">Đang tải danh sách...</div>
        ) : error ? (
          <div className="error-state">
            <p>Có lỗi xảy ra khi tải dữ liệu.</p>
            <button className="btn-secondary" onClick={refetch}>Thử lại</button>
          </div>
        ) : auctions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>Chưa có sản phẩm nào</h3>
            <p>Bạn chưa có phiên đấu giá nào trong trạng thái này.</p>
            {activeTab === '' && (
              <Link to="/dashboard/auctions/create" className="btn-primary mt-4">
                Bắt đầu bán hàng
              </Link>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="auctions-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Trạng thái</th>
                  <th>Giá hiện tại</th>
                  <th>Lượt đặt giá</th>
                  <th>Kết thúc lúc</th>
                  <th className="text-right">Hành động</th>
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
                          <Link to={`/dashboard/auctions/${auction.id}/edit`} className="btn-link">Sửa</Link>
                          {/* Cancel logic not fully implemented in API yet */}
                          <button className="btn-link danger" disabled title="Tính năng hủy đang được phát triển">Hủy</button>
                        </div>
                      )}
                      
                      {/* Shipping actions */}
                      {auction.status === 'awaiting_ship' && (
                        <button 
                          className="btn-primary btn-sm"
                          onClick={() => setShippingAuctionId(auction.id)}
                        >
                          Giao hàng
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
                  {isLoading ? 'Đang tải...' : 'Trang tiếp theo'}
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
