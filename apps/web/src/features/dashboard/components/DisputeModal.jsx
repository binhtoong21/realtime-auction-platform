import { useState } from 'react';
import PropTypes from 'prop-types';
import { useOpenDispute } from '../hooks/useBuyerActions';
import { useToast } from '../../../core/context/ToastContext';
import './DisputeModal.css';

const REASONS = [
  { value: 'ITEM_NOT_AS_DESCRIBED', label: 'Item not as described' },
  { value: 'ITEM_DAMAGED', label: 'Item damaged' },
  { value: 'ITEM_NOT_RECEIVED', label: 'Item not received' },
  { value: 'COUNTERFEIT_ITEM', label: 'Counterfeit item' },
  { value: 'OTHER', label: 'Other reason' }
];

export function DisputeModal({ payment, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState(['']);

  const { open, isLoading, error } = useOpenDispute();
  const { showSuccess, showError } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || !description) return;

    try {
      const filteredUrls = evidenceUrls.filter(url => url.trim() !== '');
      await open({
        paymentId: payment.id,
        reason,
        description,
        evidenceUrls: filteredUrls
      });
      showSuccess('Dispute submitted successfully. An admin will review it.');
      onSuccess();
    } catch (err) {
      // Handle 403 Cooldown Message
      if (err.response?.status === 403 && err.response?.data?.error?.code === 'DISPUTE_COOLDOWN') {
        const canOpenAt = err.response.data.error.canOpenAt;
        const formattedDate = new Date(canOpenAt).toLocaleString('en-US');
        showError(`You cannot open a dispute yet. Please try again after: ${formattedDate}`);
      } else if (err.response?.status === 429) {
        showError(err.response?.data?.error?.message || 'Too many requests. Please try again later.');
      } else {
        showError(err.response?.data?.error?.message || 'An error occurred while submitting the dispute');
      }
    }
  };

  return (
    <div className="dispute-modal-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="dispute-modal-content" onClick={e => e.stopPropagation()}>
        <div className="dispute-modal-header">
          <h2>File a dispute</h2>
          <button className="close-btn" type="button" onClick={onClose} disabled={isLoading}>&times;</button>
        </div>

        <div className="modal-subtitle">
          Auction: {payment.auctionTitle} · ${parseFloat(payment.amount / 100).toFixed(2)}
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="form-error">
              {error.response?.data?.error?.message || 'An error occurred'}
            </div>
          )}

          <div className="warning-banner">
            <span className="warning-icon">!</span>
            <span className="warning-text">Opening a dispute freezes escrow funds until an admin resolves it.</span>
          </div>

          <div className="form-group">
            <label htmlFor="reason">Reason</label>
            <select
              id="reason"
              className="custom-select"
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              disabled={isLoading}
            >
              <option value="">Select a reason</option>
              {REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Provide details about the issue you encountered..."
              required
              rows={4}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Evidence URLs</label>
            {evidenceUrls.map((url, index) => (
              <div key={index} className="evidence-url-row">
                <input
                  type="url"
                  value={url}
                  onChange={e => {
                    const newUrls = [...evidenceUrls];
                    newUrls[index] = e.target.value;
                    setEvidenceUrls(newUrls);
                  }}
                  placeholder="https://..."
                  disabled={isLoading}
                />
                {evidenceUrls.length > 1 && (
                  <button 
                    type="button" 
                    className="remove-url-btn"
                    onClick={() => setEvidenceUrls(evidenceUrls.filter((_, i) => i !== index))}
                    disabled={isLoading}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            {evidenceUrls.length < 5 && (
              <button 
                type="button" 
                className="add-url-link"
                onClick={() => setEvidenceUrls([...evidenceUrls, ''])}
                disabled={isLoading}
              >
                + Add another URL
              </button>
            )}
          </div>

          <div className="dispute-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || !reason || !description}>
              {isLoading ? 'Submitting...' : 'Submit dispute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

DisputeModal.propTypes = {
  payment: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};
