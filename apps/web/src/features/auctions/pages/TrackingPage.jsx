import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTracking } from '../hooks/useTracking';
import { StatusBadge } from '../../../components/StatusBadge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ConfirmDeliveryModal } from '../../dashboard/components/ConfirmDeliveryModal';
import { ExtendDeliveryModal } from '../../dashboard/components/ExtendDeliveryModal';
import { EditTrackingModal } from '../../dashboard/components/EditTrackingModal';
import { DisputeModal } from '../../dashboard/components/DisputeModal';
import { CARRIER_LABELS, getCarrierTrackingUrl } from '../../../utils/carriers';
import { useToast } from '../../../core/context/ToastContext';
import { ExternalLink, Copy, Check, ArrowLeft } from 'lucide-react';
import './TrackingPage.css';

export function TrackingPage() {
  const { id: auctionId } = useParams();
  const { tracking, isLoading, error, refetch } = useTracking(auctionId);
  const { showSuccess } = useToast();

  const [copied, setCopied] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'confirm' | 'extend' | 'edit' | 'dispute'

  const handleCopy = () => {
    if (!tracking?.trackingNumber) return;
    navigator.clipboard.writeText(tracking.trackingNumber);
    setCopied(true);
    showSuccess('Tracking number copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleModalSuccess = () => {
    setActiveModal(null);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="tracking-page">
        <div className="tracking-card">
          <p>Loading shipment details...</p>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="tracking-page">
        <Link to="/dashboard/bids" className="tracking-page__back-link">
          <ArrowLeft size={16} /> Back to My Bids
        </Link>
        <EmptyState
          title="Shipment information not found"
          description={
            error?.response?.data?.error?.message ||
            'This auction has either not been shipped yet or you do not have permission to view its tracking details.'
          }
          actionLabel="Try again"
          onAction={refetch}
        />
      </div>
    );
  }

  const trackingUrl = tracking.trackingUrl || getCarrierTrackingUrl(tracking.carrier, tracking.trackingNumber);
  const carrierName = CARRIER_LABELS[tracking.carrier] || tracking.carrier || 'Carrier';

  const shippedDate = tracking.shippedAt
    ? new Date(tracking.shippedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Pending';

  const deadlineDate = tracking.deliveryDeadlineAt
    ? new Date(tracking.deliveryDeadlineAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="tracking-page">
      <Link to="/dashboard/bids" className="tracking-page__back-link">
        <ArrowLeft size={16} /> Back to My Bids
      </Link>

      <div className="tracking-card">
        <div className="tracking-card__header">
          <div>
            <h1 className="tracking-card__title">Shipment Tracking</h1>
            <p className="tracking-card__subtitle">Auction ID: {auctionId}</p>
          </div>
          <StatusBadge domain="auction" status={tracking.status || 'shipped'} />
        </div>

        <div className="tracking-meta-grid">
          <div className="tracking-meta-item">
            <span className="tracking-meta-label">Shipping Carrier</span>
            <span className="tracking-meta-value">{carrierName}</span>
          </div>

          <div className="tracking-meta-item">
            <span className="tracking-meta-label">Tracking Number</span>
            <div className="tracking-number-badge">
              <span>{tracking.trackingNumber}</span>
              <button
                type="button"
                onClick={handleCopy}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                title="Copy tracking number"
              >
                {copied ? <Check size={14} color="var(--color-action)" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {trackingUrl && (
            <div className="tracking-meta-item">
              <span className="tracking-meta-label">Carrier Link</span>
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--sm btn--secondary"
                style={{ width: 'fit-content', gap: '4px' }}
              >
                Track on {carrierName} <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        <div className="tracking-timeline">
          <div className="tracking-timeline__item">
            <div className="tracking-timeline__dot" />
            <div className="tracking-timeline__content">
              <h4 className="tracking-timeline__title">Item Shipped</h4>
              <span className="tracking-timeline__date">{shippedDate}</span>
            </div>
          </div>

          <div className="tracking-timeline__item">
            <div className="tracking-timeline__dot tracking-timeline__dot--future" />
            <div className="tracking-timeline__content">
              <h4 className="tracking-timeline__title">Confirmation Deadline</h4>
              <span className="tracking-timeline__date">
                {deadlineDate ? `${deadlineDate} (Auto-confirms if no dispute filed)` : 'Calculated upon shipment'}
              </span>
              {tracking.isExtended && (
                <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-brand)' }}>
                  * Deadline was extended once by 7 days.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="tracking-actions">
          {tracking.status === 'shipped' && (
            <>
              <button
                type="button"
                className="btn btn--md btn--primary"
                onClick={() => setActiveModal('confirm')}
              >
                Confirm Delivery
              </button>

              {!tracking.isExtended && (
                <button
                  type="button"
                  className="btn btn--md btn--secondary"
                  onClick={() => setActiveModal('extend')}
                >
                  Extend Delivery (+7d)
                </button>
              )}

              <button
                type="button"
                className="btn btn--md btn--secondary"
                onClick={() => setActiveModal('edit')}
              >
                Update Tracking
              </button>

              <button
                type="button"
                className="btn btn--md btn--secondary"
                style={{ color: 'var(--color-danger)' }}
                onClick={() => setActiveModal('dispute')}
              >
                File Dispute
              </button>
            </>
          )}
        </div>
      </div>

      {activeModal === 'confirm' && (
        <ConfirmDeliveryModal
          auctionId={auctionId}
          onClose={() => setActiveModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {activeModal === 'extend' && (
        <ExtendDeliveryModal
          auctionId={auctionId}
          onClose={() => setActiveModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {activeModal === 'edit' && (
        <EditTrackingModal
          auctionId={auctionId}
          initialCarrier={tracking.carrier}
          initialTrackingNumber={tracking.trackingNumber}
          onClose={() => setActiveModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {activeModal === 'dispute' && (
        <DisputeModal
          paymentId={tracking.paymentId || auctionId}
          onClose={() => setActiveModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
