import { useState } from 'react';
import PropTypes from 'prop-types';
import { useExtendShipping } from '../hooks/useSellerActions';
import { useToast } from '../../../core/context/ToastContext';
import './ShipModal.css';

export function ExtendShippingModal({ auctionId, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const { extendShipping, isLoading } = useExtendShipping();
  const { showSuccess, showError } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 10) {
      showError('Please provide a reason with at least 10 characters');
      return;
    }

    try {
      await extendShipping(auctionId, reason.trim());
      showSuccess('Shipping deadline extended by 3 days');
      onSuccess();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to extend shipping deadline');
    }
  };

  return (
    <div className="ship-modal-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="ship-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="ship-modal-header">
          <h2>Extend shipping deadline</h2>
          <button className="close-btn" type="button" onClick={onClose} disabled={isLoading}>
            &times;
          </button>
        </div>

        <div className="modal-subtitle" style={{ marginTop: 'var(--space-2)' }}>
          Request an additional 3 days to prepare and ship the item.
        </div>

        <div className="warning-banner" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          This extension can only be used once per auction order.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="shipping-extension-reason">Reason for extension (min 10 characters)</label>
            <textarea
              id="shipping-extension-reason"
              rows={4}
              placeholder="Explain why you need more time to ship (e.g. specialized packaging required, weather delays)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              required
              minLength={10}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
              }}
            />
            <span className="tracking-hint">
              {reason.trim().length}/10 minimum characters
            </span>
          </div>

          <div className="ship-modal-footer">
            <button type="button" className="btn btn--md btn--secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--md btn--primary"
              disabled={isLoading || reason.trim().length < 10}
            >
              {isLoading ? 'Extending...' : 'Confirm Extension (+3d)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

ExtendShippingModal.propTypes = {
  auctionId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};
