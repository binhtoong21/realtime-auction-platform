import { useState } from 'react';
import { usePaymentHistory, useConfirmDelivery, useRetryPayment } from '../hooks/useBuyerActions';
import { DisputeModal } from '../components/DisputeModal';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../core/context/ToastContext';
import './PaymentHistoryPage.css';

const STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'authorized', label: 'Đang giữ tiền' },
  { value: 'captured', label: 'Đã thanh toán' },
  { value: 'transferred', label: 'Đã chuyển tiền' },
  { value: 'frozen', label: 'Đang tranh chấp' },
  { value: 'refunded', label: 'Đã hoàn tiền' }
];

export function PaymentHistoryPage() {
  const [activeTab, setActiveTab] = useState('');
  const [currentCursor, setCurrentCursor] = useState(null);
  
  // Need to use currentCursor in usePaymentHistory
  const { payments: currentPayments, nextCursor: currentNextCursor, isLoading: isPaymentsLoading, error: paymentsError, refetch: refetchPayments } = usePaymentHistory(activeTab, currentCursor);
  
  const { confirm, isLoading: isConfirming } = useConfirmDelivery();
  const { retry, isLoading: isRetrying } = useRetryPayment();
  const { showSuccess, showError } = useToast();

  const handleRetryPayment = async (paymentId) => {
    try {
      await retry(paymentId);
      showSuccess('Đã yêu cầu thử lại thanh toán thành công. Đang chờ xác nhận từ Stripe.');
      refetchPayments();
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = err.response.headers['retry-after'];
        const waitTime = retryAfter ? `${retryAfter} giây` : '5 phút';
        showError(`Vui lòng chờ ${waitTime} trước khi thử lại.`);
      } else {
        showError(err.response?.data?.error?.message || 'Có lỗi xảy ra khi thử lại thanh toán');
      }
    }
  };

  const [disputePayment, setDisputePayment] = useState(null);

  const handleConfirmDelivery = async (auctionId) => {
    if (!window.confirm('Bạn có chắc chắn đã nhận được hàng và muốn giải phóng tiền cho người bán? Hành động này không thể hoàn tác.')) {
      return;
    }
    try {
      await confirm(auctionId);
      showSuccess('Đã xác nhận nhận hàng thành công.');
      refetchPayments();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Có lỗi xảy ra khi xác nhận nhận hàng');
    }
  };

  const handleDisputeSuccess = () => {
    setDisputePayment(null);
    refetchPayments();
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentCursor(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="payment-history-page">
      <div className="page-header">
        <div>
          <h1>Lịch sử Thanh toán & Đơn hàng</h1>
          <p className="subtitle">Quản lý các khoản thanh toán ký quỹ và xác nhận nhận hàng.</p>
        </div>
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

      <div className="payments-content">
        {isPaymentsLoading && !currentPayments.length ? (
          <div className="loading-state">Đang tải danh sách...</div>
        ) : paymentsError ? (
          <div className="error-state">
            <p>Có lỗi xảy ra khi tải dữ liệu.</p>
            <button className="btn-secondary" onClick={refetchPayments}>Thử lại</button>
          </div>
        ) : currentPayments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <h3>Không có giao dịch nào</h3>
            <p>Bạn chưa có khoản thanh toán nào trong trạng thái này.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="payments-table">
              <thead>
                <tr>
                  <th>Mã GD</th>
                  <th>Sản phẩm</th>
                  <th>Số tiền</th>
                  <th>Trạng thái thanh toán</th>
                  <th>Ngày tạo</th>
                  <th className="text-right">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {currentPayments.map(payment => (
                  <tr key={payment.id}>
                    <td><span className="payment-id">#{payment.id.substring(0, 8)}</span></td>
                    <td>
                      <span className="auction-title">{payment.auctionTitle}</span>
                      {payment.auctionStatus && (
                        <div className="auction-status-hint">
                          Trạng thái ĐG: {payment.auctionStatus.toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="price-cell">{formatCurrency(payment.amount)}</td>
                    <td><StatusBadge status={payment.status} type="payment" /></td>
                    <td className="date-cell">{formatDate(payment.created_at)}</td>
                    <td className="actions-cell">
                      {payment.status === 'authorized' && (
                        <div className="action-buttons">
                          {payment.auctionStatus === 'shipped' ? (
                            <button 
                              className="btn-primary btn-sm"
                              onClick={() => handleConfirmDelivery(payment.auctionId)}
                              disabled={isConfirming}
                            >
                              Đã nhận hàng
                            </button>
                          ) : null}
                          
                          <button 
                            className="btn-link danger"
                            onClick={() => setDisputePayment(payment)}
                          >
                            Khiếu nại
                          </button>
                        </div>
                      )}
                      {payment.status === 'grace_period' && (
                        <div className="action-buttons">
                          <button 
                            className="btn-primary btn-sm"
                            onClick={() => handleRetryPayment(payment.id)}
                            disabled={isRetrying}
                          >
                            Thử lại thanh toán
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {currentNextCursor && (
              <div className="load-more-container" style={{ textAlign: 'center', padding: '16px' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => setCurrentCursor(currentNextCursor)}
                  disabled={isPaymentsLoading}
                >
                  {isPaymentsLoading ? 'Đang tải...' : 'Trang tiếp theo'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {disputePayment && (
        <DisputeModal
          payment={disputePayment}
          onClose={() => setDisputePayment(null)}
          onSuccess={handleDisputeSuccess}
        />
      )}
    </div>
  );
}
