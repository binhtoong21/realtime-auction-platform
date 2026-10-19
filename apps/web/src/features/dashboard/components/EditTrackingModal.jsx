import { useState } from 'react';
import PropTypes from 'prop-types';
import { useUpdateTracking } from '../hooks/useSellerActions';
import { useToast } from '../../../core/context/ToastContext';
import { CARRIERS } from '@auction/shared-constants';
import { CARRIER_LABELS, TRACKING_HINTS, validateTrackingNumber } from '../../../utils/carriers';
import './ShipModal.css';

export function EditTrackingModal({ auctionId, initialCarrier = '', initialTrackingNumber = '', onClose, onSuccess }) {
  const [carrier, setCarrier] = useState(initialCarrier);
  const [trackingNumber, setTrackingNumber] = useState(initialTrackingNumber);
  const { updateTracking, isLoading } = useUpdateTracking();
  const { showSuccess, showError } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!carrier || !trackingNumber) return;

    if (!validateTrackingNumber(carrier, trackingNumber)) {
      showError('Tracking number format does not match the selected carrier');
      return;
    }

    try {
      await updateTracking(auctionId, carrier, trackingNumber);
      showSuccess('Tracking information updated successfully');
      onSuccess();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Error occurred while updating tracking info');
    }
  };

  return (
    <div className="ship-modal-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="ship-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="ship-modal-header">
          <h2>Update tracking number</h2>
          <button className="close-btn" type="button" onClick={onClose} disabled={isLoading}>
            &times;
          </button>
        </div>

        <div className="warning-banner" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          Tracking details can only be modified once within 24 hours of shipment.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-carrier-select">Carrier</label>
            <select
              id="edit-carrier-select"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              disabled={isLoading}
              required
            >
              <option value="" disabled>Select a carrier</option>
              {Object.values(CARRIERS).map((c) => (
                <option key={c} value={c}>
                  {CARRIER_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="edit-tracking-input">Tracking number</label>
            <input
              id="edit-tracking-input"
              type="text"
              placeholder="e.g. EA123456789VN"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              disabled={isLoading}
              required
            />
            {carrier && TRACKING_HINTS[carrier] && (
              <span className="tracking-hint">{TRACKING_HINTS[carrier]}</span>
            )}
          </div>

          <div className="ship-modal-footer">
            <button type="button" className="btn btn--md btn--secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="btn btn--md btn--primary" disabled={isLoading || !carrier || !trackingNumber}>
              {isLoading ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

EditTrackingModal.propTypes = {
  auctionId: PropTypes.string.isRequired,
  initialCarrier: PropTypes.string,
  initialTrackingNumber: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};
