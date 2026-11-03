import { useState, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useDisputeDetails, useUserDisputeActions } from '../hooks/useUserDisputeActions';
import { CountdownTimer } from '../../auctions/components/CountdownTimer';
import { StatusBadge } from '../../../components/StatusBadge';
import { useToast } from '../../../core/context/ToastContext';
import { X, AlertTriangle, ShieldCheck, CheckCircle2, Upload, AlertCircle, FileText } from 'lucide-react';
import './UserDisputeDetailModal.css';

const REASON_LABELS = {
  ITEM_NOT_RECEIVED: 'Item Not Received',
  ITEM_DAMAGED: 'Item Damaged',
  ITEM_NOT_AS_DESCRIBED: 'Item Not As Described',
  COUNTERFEIT_ITEM: 'Counterfeit Item',
  OTHER: 'Other Reason',
};

export function UserDisputeDetailModal({ isOpen, onClose, disputeId, role = 'buyer', onUpdated }) {
  // 1. All hooks at the very top of component
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [activeLightboxImg, setActiveLightboxImg] = useState(null);
  const fileInputRef = useRef(null);

  const { dispute, isLoading, error: fetchError, refetch } = useDisputeDetails(isOpen ? disputeId : null);
  const { submitEvidence, withdrawDispute, isSubmitting, actionError, clearError } = useUserDisputeActions();
  const { showSuccess, showError } = useToast();

  const handleFileChange = useCallback((e) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
    }
  }, []);

  const handleSubmitEvidence = useCallback(async (e) => {
    e.preventDefault();
    if (!disputeId || selectedFiles.length === 0) return;

    try {
      await submitEvidence(disputeId, {
        files: selectedFiles,
        note: evidenceNote.trim(),
      });
      showSuccess('Evidence submitted successfully.');
      setSelectedFiles([]);
      setEvidenceNote('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      refetch();
      if (onUpdated) onUpdated();
    } catch (err) {
      showError(err.message || 'Failed to submit evidence.');
    }
  }, [disputeId, selectedFiles, evidenceNote, submitEvidence, showSuccess, showError, refetch, onUpdated]);

  const handleWithdraw = useCallback(async () => {
    if (!disputeId) return;

    try {
      await withdrawDispute(disputeId);
      showSuccess('Dispute has been successfully withdrawn.');
      setConfirmWithdraw(false);
      refetch();
      if (onUpdated) onUpdated();
    } catch (err) {
      showError(err.message || 'Failed to withdraw dispute.');
    }
  }, [disputeId, withdrawDispute, showSuccess, showError, refetch, onUpdated]);

  const handleClose = useCallback(() => {
    setSelectedFiles([]);
    setEvidenceNote('');
    setConfirmWithdraw(false);
    clearError();
    onClose();
  }, [clearError, onClose]);

  // 2. Early return AFTER all hooks
  if (!isOpen || !disputeId) return null;

  const isTerminal = ['resolved_buyer_wins', 'resolved_seller_wins', 'expired', 'withdrawn'].includes(dispute?.status);
  const existingCount = dispute?.evidenceUrls?.length || 0;
  const remainingFileSlots = Math.max(0, 3 - existingCount);

  const isSellerWindowActive =
    dispute?.sellerEvidenceDeadlineAt &&
    !isTerminal &&
    new Date() < new Date(dispute.sellerEvidenceDeadlineAt);

  const isSellerWindowExpired =
    dispute?.sellerEvidenceDeadlineAt &&
    !isTerminal &&
    new Date() >= new Date(dispute.sellerEvidenceDeadlineAt);

  return (
    <div className="user-dispute-modal-backdrop" role="dialog" aria-modal="true">
      <div className="user-dispute-modal-card">
        {/* Header */}
        <div className="user-dispute-modal-header">
          <div className="user-dispute-title-wrap">
            <h3 className="user-dispute-title">
              Dispute #{disputeId.slice(0, 8)}
            </h3>
            {dispute && <StatusBadge type="dispute" status={dispute.status} />}
          </div>
          <button
            type="button"
            className="user-dispute-close"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="user-dispute-skeleton-wrap">
            <div className="user-dispute-skeleton" />
            <div className="user-dispute-skeleton" />
          </div>
        ) : fetchError ? (
          <div className="user-dispute-banner user-dispute-banner--danger">
            <AlertCircle size={16} />
            <span>Failed to load dispute details: {fetchError.message || fetchError}</span>
          </div>
        ) : dispute ? (
          <div className="user-dispute-body">
            {/* Status / Outcome Banners */}
            {dispute.status === 'resolved_buyer_wins' && (
              <div className="user-dispute-banner user-dispute-banner--success">
                <CheckCircle2 size={18} />
                <div>
                  <strong>Outcome: Buyer Wins &mdash; Refund Issued</strong>
                  <p className="user-dispute-banner-sub">
                    {dispute.resolutionNote || 'The dispute was resolved in favor of the buyer.'}
                  </p>
                  {dispute.policyRule && (
                    <span className="user-dispute-tag">Policy: {dispute.policyRule}</span>
                  )}
                </div>
              </div>
            )}

            {dispute.status === 'resolved_seller_wins' && (
              <div className="user-dispute-banner user-dispute-banner--success">
                <CheckCircle2 size={18} />
                <div>
                  <strong>Outcome: Seller Wins &mdash; Payment Captured</strong>
                  <p className="user-dispute-banner-sub">
                    {dispute.resolutionNote || 'The dispute was resolved in favor of the seller.'}
                  </p>
                  {dispute.rejectionReason && (
                    <span className="user-dispute-tag">Ground: {dispute.rejectionReason}</span>
                  )}
                </div>
              </div>
            )}

            {dispute.status === 'withdrawn' && (
              <div className="user-dispute-banner user-dispute-banner--neutral">
                <FileText size={18} />
                <div>
                  <strong>Dispute Withdrawn</strong>
                  <p className="user-dispute-banner-sub">
                    The dispute was withdrawn by the buyer. Escrow funds will proceed according to standard order fulfillment.
                  </p>
                </div>
              </div>
            )}

            {/* Seller 72h Window Alert */}
            {role === 'seller' && isSellerWindowActive && (
              <div className="user-dispute-banner user-dispute-banner--warning">
                <AlertTriangle size={18} />
                <div className="user-dispute-banner-col">
                  <div className="user-dispute-countdown-row">
                    <strong>Seller 72h Evidence Window:</strong>
                    <CountdownTimer endAt={dispute.sellerEvidenceDeadlineAt} endedText="Window Expired" />
                  </div>
                  <p className="user-dispute-banner-sub">
                    Please provide proof of delivery or counter-evidence before the deadline. Without counter-evidence, claims may be resolved in favor of the buyer.
                  </p>
                </div>
              </div>
            )}

            {role === 'seller' && isSellerWindowExpired && (
              <div className="user-dispute-banner user-dispute-banner--neutral">
                <AlertCircle size={18} />
                <div>
                  <strong>Seller Evidence Window Expired</strong>
                  <p className="user-dispute-banner-sub">
                    The 72-hour window to provide counter-evidence has concluded. An administrator will resolve the claim based on recorded evidence and carrier tracking.
                  </p>
                </div>
              </div>
            )}

            {/* Dispute Summary Details */}
            <div className="user-dispute-details-grid">
              <div className="user-dispute-metric">
                <span className="user-dispute-metric-label">Item / Auction</span>
                <span className="user-dispute-metric-val">{dispute.auctionTitle || 'N/A'}</span>
              </div>
              <div className="user-dispute-metric">
                <span className="user-dispute-metric-label">Disputed Amount</span>
                <span className="user-dispute-metric-val font-mono">
                  ${(Number(dispute.amount || 0) / 100).toFixed(2)}
                </span>
              </div>
              <div className="user-dispute-metric">
                <span className="user-dispute-metric-label">Reason</span>
                <span className="user-dispute-metric-val">
                  {REASON_LABELS[dispute.reason] || dispute.reason}
                </span>
              </div>
              <div className="user-dispute-metric">
                <span className="user-dispute-metric-label">Filed By</span>
                <span className="user-dispute-metric-val">
                  {dispute.openedBy?.displayName || 'Claimant'}
                </span>
              </div>
            </div>

            {/* Buyer Claim Description */}
            <div className="user-dispute-section">
              <h4 className="user-dispute-section-title">Claim Statement</h4>
              <p className="user-dispute-description">
                {dispute.description || 'No detailed statement provided with this claim.'}
              </p>
            </div>

            {/* Evidence Gallery */}
            <div className="user-dispute-section">
              <div className="user-dispute-section-header">
                <h4 className="user-dispute-section-title">
                  Evidence Files ({existingCount} / 3)
                </h4>
              </div>

              {existingCount > 0 ? (
                <div className="user-dispute-gallery">
                  {dispute.evidenceUrls.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="user-dispute-evidence-thumb"
                      onClick={() => setActiveLightboxImg(url)}
                      title="View full evidence"
                    >
                      <img src={url} alt={`Evidence ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="user-dispute-empty-text">No evidence documents or photos attached yet.</p>
              )}
            </div>

            {/* Action Section: Evidence Submission Form */}
            {!isTerminal && remainingFileSlots > 0 && (
              (role === 'buyer' && dispute.status === 'open') ||
              (role === 'seller' && isSellerWindowActive)
            ) && (
              <form onSubmit={handleSubmitEvidence} className="user-dispute-form">
                <h4 className="user-dispute-section-title">
                  {role === 'seller' ? 'Submit Delivery Proof / Counter-Evidence' : 'Add Additional Evidence'}
                </h4>

                <div className="user-dispute-form-group">
                  <label htmlFor="evidence-files" className="user-dispute-form-label">
                    Upload Photos / Files (Max {remainingFileSlots} more file{remainingFileSlots > 1 ? 's' : ''})
                  </label>
                  <input
                    ref={fileInputRef}
                    id="evidence-files"
                    type="file"
                    className="user-dispute-file-input"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4"
                    onChange={handleFileChange}
                    disabled={isSubmitting}
                  />
                  <span className="user-dispute-form-hint">
                    Accepted: JPG, PNG, WebP, MP4 (Max 5MB per file)
                  </span>
                </div>

                <div className="user-dispute-form-group">
                  <label htmlFor="evidence-note" className="user-dispute-form-label">
                    Note / Explanation (Optional)
                  </label>
                  <textarea
                    id="evidence-note"
                    className="user-dispute-textarea"
                    rows={2}
                    placeholder={
                      role === 'seller'
                        ? 'e.g. Attached carrier delivery confirmation and receipt with signature.'
                        : 'e.g. Additional photo showing defective serial number.'
                    }
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                {actionError && (
                  <div className="user-dispute-error">{actionError}</div>
                )}

                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={isSubmitting || selectedFiles.length === 0}
                >
                  <Upload size={14} />
                  {isSubmitting ? 'Uploading...' : `Upload ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''} Evidence`}
                </button>
              </form>
            )}

            {/* Buyer Withdraw Dispute Section */}
            {role === 'buyer' && dispute.status === 'open' && (
              <div className="user-dispute-withdraw-box">
                <div className="user-dispute-withdraw-info">
                  <ShieldCheck size={18} className="text-secondary" />
                  <div>
                    <strong>Resolved directly with seller?</strong>
                    <p className="user-dispute-banner-sub">
                      You can withdraw this dispute at any time before admin review commences.
                    </p>
                  </div>
                </div>

                {confirmWithdraw ? (
                  <div className="user-dispute-withdraw-confirm">
                    <p className="user-dispute-confirm-msg">
                      Are you sure you want to withdraw this dispute? Escrow release to the seller will resume.
                    </p>
                    <div className="user-dispute-btn-row">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setConfirmWithdraw(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn--destructive btn--sm"
                        onClick={handleWithdraw}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Withdrawing...' : 'Yes, Withdraw Dispute'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setConfirmWithdraw(true)}
                    disabled={isSubmitting}
                  >
                    Withdraw Dispute
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="user-dispute-modal-footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Close
          </button>
        </div>

        {/* Lightbox Preview */}
        {activeLightboxImg && (
          <div
            className="user-dispute-lightbox-backdrop"
            onClick={() => setActiveLightboxImg(null)}
          >
            <div className="user-dispute-lightbox-wrap" onClick={(e) => e.stopPropagation()}>
              <img src={activeLightboxImg} alt="Evidence Full Preview" />
              <button
                type="button"
                className="user-dispute-lightbox-close"
                onClick={() => setActiveLightboxImg(null)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

UserDisputeDetailModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  disputeId: PropTypes.string,
  role: PropTypes.oneOf(['buyer', 'seller']),
  onUpdated: PropTypes.func,
};
