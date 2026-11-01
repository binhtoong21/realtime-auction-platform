import { useState } from 'react';
import PropTypes from 'prop-types';
import { AlertOctagon, X, ShieldAlert } from 'lucide-react';
import './AdminAuctionModals.css';

const CANCELLATION_REASONS = [
  { value: 'POLICY_VIOLATION', label: 'Policy Violation (Prohibited content or misleading info)' },
  { value: 'ILLEGAL_ITEM', label: 'Counterfeit or Unverified Authenticity' },
  { value: 'SHILL_BIDDING', label: 'Shill Bidding / Fraudulent Activity' },
  { value: 'OTHER', label: 'Other Operational Intervention' },
];

export function AdminCancelAuctionModal({ isOpen, onClose, onConfirm, auction, isLoading }) {
  const [reasonCategory, setReasonCategory] = useState('POLICY_VIOLATION');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !auction) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!explanation.trim() || explanation.trim().length < 5) {
      setError('Please provide a specific justification (minimum 5 characters)');
      return;
    }
    setError('');
    const fullReason = `[${reasonCategory}] ${explanation.trim()}`;
    onConfirm(auction.id, fullReason);
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <AlertOctagon size={18} className="text-danger" />
            <h3 className="admin-modal-title">Force Cancel Auction</h3>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <p className="admin-modal-desc">
          You are about to administratively terminate the auction listing for{' '}
          <strong>{auction.title}</strong>.
        </p>

        <div className="admin-auction-preview">
          <div className="admin-auction-preview-row">
            <span className="admin-auction-preview-label">Auction ID:</span>
            <span className="admin-auction-preview-val font-mono">{auction.id}</span>
          </div>
          <div className="admin-auction-preview-row">
            <span className="admin-auction-preview-label">Seller:</span>
            <span className="admin-auction-preview-val">{auction.sellerName || 'N/A'}</span>
          </div>
          <div className="admin-auction-preview-row">
            <span className="admin-auction-preview-label">Current Lot Value:</span>
            <span className="admin-auction-preview-val font-mono">
              ${Number(auction.currentPrice || 0).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="admin-modal-warning admin-modal-warning--danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <ShieldAlert size={14} />
            <strong>Irreversible Action & Cascade:</strong>
          </div>
          Force cancellation terminates active bidding immediately and releases all authorized payment
          pre-holds back to bidders. An audit trail entry will be recorded with your administrator ID.
        </div>

        {error && <div className="admin-modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="cancel-category" className="admin-form-label">
              Primary Violation Type <span className="text-danger">*</span>
            </label>
            <select
              id="cancel-category"
              className="admin-form-select"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              disabled={isLoading}
            >
              {CANCELLATION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-form-group">
            <label htmlFor="cancel-explanation" className="admin-form-label">
              Operational Justification & Details <span className="text-danger">*</span>
            </label>
            <textarea
              id="cancel-explanation"
              className="admin-form-textarea"
              rows={3}
              placeholder="Detail the rationale, findings, or user reports prompting this termination..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              disabled={isLoading}
              maxLength={400}
            />
          </div>

          <div className="admin-modal-actions">
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Dismiss
            </button>
            <button
              type="submit"
              className="btn btn--sm btn--danger"
              disabled={isLoading}
            >
              {isLoading ? 'Cancelling...' : 'Execute Force Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

AdminCancelAuctionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  auction: PropTypes.shape({
    id: PropTypes.string,
    title: PropTypes.string,
    sellerName: PropTypes.string,
    currentPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  isLoading: PropTypes.bool,
};
