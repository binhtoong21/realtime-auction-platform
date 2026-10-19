import { useState } from 'react';
import PropTypes from 'prop-types';
import { useShipAuction } from '../hooks/useSellerActions';
import { useToast } from '../../../core/context/ToastContext';
import { CARRIERS } from '@auction/shared-constants';
import { CARRIER_LABELS, TRACKING_HINTS, validateTrackingNumber } from '../../../utils/carriers';
import './ShipModal.css';

export function ShipModal({ auctionId, onClose, onSuccess }) {
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const { ship, isLoading, error } = useShipAuction();
  const { showSuccess, showError } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!carrier || !trackingNumber) return;

    if (!validateTrackingNumber(carrier, trackingNumber)) {
      showError('Tracking number format does not match the selected carrier');
      return;
    }


    try {
      await ship(auctionId, carrier, trackingNumber);
      showSuccess('Shipping information updated successfully');
      onSuccess();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'An error occurred while updating shipping info');
    }
  };

  return (
    <div className="ship-modal-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="ship-modal-content" onClick={e => e.stopPropagation()}>
        <div className="ship-modal-header">
          <h2>Ship item</h2>
          <button className="close-btn" type="button" onClick={onClose} disabled={isLoading}>&times;</button>
        </div>
        
        <div className="modal-subtitle">
          Enter carrier and tracking info for the buyer.
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="form-error">
              {error.response?.data?.error?.message || 'An error occurred'}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="carrier">Carrier</label>
            <select
              id="carrier"
              className="custom-select"
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
              required
              disabled={isLoading}
            >
              <option value="">Select a carrier</option>
              {Object.values(CARRIERS).map(c => (
                <option key={c} value={c}>{CARRIER_LABELS[c] || c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="trackingNumber">Tracking Number</label>
            <input
              type="text"
              id="trackingNumber"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="e.g. 1234567890"
              required
              disabled={isLoading}
            />
            <span className="help-text">
              {carrier ? TRACKING_HINTS[carrier] : 'Select a carrier first'}
            </span>
          </div>

          <div className="ship-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || !carrier || !trackingNumber}>
              {isLoading ? 'Saving...' : 'Mark as shipped'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

ShipModal.propTypes = {
  auctionId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};
