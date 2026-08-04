import { useState } from 'react';
import { usePaymentHistory, useConfirmDelivery, useRetryPayment } from '../hooks/useBuyerActions';
import { DisputeModal } from '../components/DisputeModal';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../core/context/ToastContext';
import './PaymentHistoryPage.css';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'authorized', label: 'Authorized' },
  { value: 'captured', label: 'Captured' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'frozen', label: 'Disputed' },
  { value: 'refunded', label: 'Refunded' }
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
      showSuccess('Payment retry requested successfully. Waiting for Stripe confirmation.');
      refetchPayments();
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = err.response.headers['retry-after'];
        const waitTime = retryAfter ? `${retryAfter} seconds` : '5 minutes';
        showError(`Please wait ${waitTime} before trying again.`);
      } else {
        showError(err.response?.data?.error?.message || 'Error occurred while retrying payment');
      }
    }
  };

  const [disputePayment, setDisputePayment] = useState(null);

  const handleConfirmDelivery = async (auctionId) => {
    if (!window.confirm('Are you sure you have received the item and want to release funds to the seller? This action cannot be undone.')) {
      return;
    }
    try {
      await confirm(auctionId);
      showSuccess('Delivery confirmed successfully.');
      refetchPayments();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Error occurred while confirming delivery');
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
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="payment-history-page">
      <div className="page-header">
        <div>
          <h1>Payment & Order History</h1>
          <p className="subtitle">Manage escrow payments and confirm deliveries.</p>
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
          <div className="loading-state">Loading payments...</div>
        ) : paymentsError ? (
          <div className="error-state">
            <p>An error occurred while loading data.</p>
            <button className="btn-secondary" onClick={refetchPayments}>Retry</button>
          </div>
        ) : currentPayments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <h3>No transactions found</h3>
            <p>You do not have any payments in this status.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="payments-table">
              <thead>
                <tr>
                  <th>Tx ID</th>
                  <th>Product</th>
                  <th>Amount</th>
                  <th>Payment Status</th>
                  <th>Date</th>
                  <th className="text-right">Actions</th>
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
                          Auction: {payment.auctionStatus.toUpperCase()}
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
                              Confirm Delivery
                            </button>
                          ) : null}
                          
                          <button 
                            className="btn-link danger"
                            onClick={() => setDisputePayment(payment)}
                            disabled={isConfirming}
                          >
                            Dispute
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
                            Retry Payment
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {currentNextCursor && (
              <div className="load-more-container">
                <button 
                  className="btn-secondary" 
                  onClick={() => setCurrentCursor(currentNextCursor)}
                  disabled={isPaymentsLoading}
                >
                  {isPaymentsLoading ? 'Loading...' : 'Load More'}
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
