import { useState } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import './AdminUserModals.css';

export function BanUserModal({ isOpen, onClose, onConfirm, user, isLoading }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !user) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('A valid reason is required (minimum 5 characters)');
      return;
    }
    setError('');
    onConfirm(user.id, reason.trim());
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <AlertTriangle size={18} className="text-danger" />
            <h3 className="admin-modal-title">Ban User Account</h3>
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
          You are about to permanently ban <strong>{user.displayName || user.email}</strong> (<span className="font-mono">{user.email}</span>).
        </p>

        <div className="admin-modal-warning admin-modal-warning--danger">
          <strong>Immediate Impact:</strong> Banning will immediately revoke all active sessions, cancel all ongoing auctions created by this trader, and prevent any future sign-ins.
        </div>

        {error && <div className="admin-modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="ban-reason" className="admin-form-label">
              Reason for Ban <span className="text-danger">*</span>
            </label>
            <textarea
              id="ban-reason"
              className="admin-form-textarea"
              rows={3}
              placeholder="e.g. Fraudulent listings, bid shilling, or violation of Terms of Service"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="admin-modal-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--destructive"
              disabled={isLoading}
            >
              {isLoading ? 'Banning...' : 'Confirm Ban'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

BanUserModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  user: PropTypes.object,
  isLoading: PropTypes.bool,
};

export function SuspendUserModal({ isOpen, onClose, onConfirm, user, isLoading }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !user) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('A valid reason is required (minimum 5 characters)');
      return;
    }
    setError('');
    onConfirm(user.id, reason.trim());
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <AlertTriangle size={18} className="text-warning" />
            <h3 className="admin-modal-title">Suspend User Account</h3>
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
          Temporarily suspend <strong>{user.displayName || user.email}</strong> (<span className="font-mono">{user.email}</span>).
        </p>

        <div className="admin-modal-warning admin-modal-warning--amber">
          <strong>Account Hold:</strong> Suspended users cannot place bids, create new auctions, or initiate payouts until reactivated.
        </div>

        {error && <div className="admin-modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="suspend-reason" className="admin-form-label">
              Suspension Reason <span className="text-danger">*</span>
            </label>
            <textarea
              id="suspend-reason"
              className="admin-form-textarea"
              rows={3}
              placeholder="e.g. Under investigation for suspicious bidding activity"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="admin-modal-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isLoading}
            >
              {isLoading ? 'Suspending...' : 'Confirm Suspension'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

SuspendUserModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  user: PropTypes.object,
  isLoading: PropTypes.bool,
};

export function ReactivateUserModal({ isOpen, onClose, onConfirm, user, isLoading }) {
  if (!isOpen || !user) return null;

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <CheckCircle2 size={18} className="text-success" />
            <h3 className="admin-modal-title">Reactivate User Account</h3>
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
          Restore normal trading status for <strong>{user.displayName || user.email}</strong> (<span className="font-mono">{user.email}</span>).
        </p>

        <div className="admin-modal-warning admin-modal-warning--success">
          <strong>Privilege Restoration:</strong> The account status will be reset to Active, re-enabling bidding and auction creation.
        </div>

        <div className="admin-modal-actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onConfirm(user.id)}
            disabled={isLoading}
          >
            {isLoading ? 'Reactivating...' : 'Confirm Reactivation'}
          </button>
        </div>
      </div>
    </div>
  );
}

ReactivateUserModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  user: PropTypes.object,
  isLoading: PropTypes.bool,
};

export function KycOverrideModal({ isOpen, onClose, onConfirm, user, isLoading }) {
  const [note, setNote] = useState('');

  if (!isOpen || !user) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(user.id, note.trim());
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <ShieldCheck size={18} className="text-brand" />
            <h3 className="admin-modal-title">Manual KYC Verification Override</h3>
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
          Manually approve KYC identity verification for <strong>{user.displayName || user.email}</strong> (<span className="font-mono">{user.email}</span>).
        </p>

        <div className="admin-modal-warning admin-modal-warning--amber">
          <strong>Administrative Override:</strong> This directly marks the trader as KYC Verified, granting full high-volume selling capabilities without third-party document processing.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="kyc-note" className="admin-form-label">
              Administrative Audit Note (Optional)
            </label>
            <textarea
              id="kyc-note"
              className="admin-form-textarea"
              rows={3}
              placeholder="e.g. Verified via manual passport scan and verified enterprise documents"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="admin-modal-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Grant KYC Verified'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

KycOverrideModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  user: PropTypes.object,
  isLoading: PropTypes.bool,
};
