import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDisputeDetail, useDisputeReview, useDisputeResolve } from '../hooks';
import { StatusBadge } from '../../../components/StatusBadge';
import { CountdownTimer } from '../../auctions/components/CountdownTimer';
import { useToast } from '../../../core/context/ToastContext';
import { DisputeOutcome, DisputePolicyRule, DisputeRejectionReason } from '@auction/shared-constants';
import './AdminDisputeDetailPage.css';

const REASON_LABELS = {
  ITEM_NOT_RECEIVED: 'Item Not Received',
  ITEM_DAMAGED: 'Item Damaged',
  ITEM_NOT_AS_DESCRIBED: 'Item Not As Described',
  COUNTERFEIT_ITEM: 'Counterfeit Item',
};

const POLICY_RULE_OPTIONS = [
  { value: DisputePolicyRule.ITEM_NOT_AS_DESCRIBED, label: 'Item Not As Described' },
  { value: DisputePolicyRule.ITEM_DAMAGED, label: 'Item Arrived Damaged' },
  { value: DisputePolicyRule.ITEM_NOT_RECEIVED, label: 'Item Never Received' },
  { value: DisputePolicyRule.COUNTERFEIT_ITEM, label: 'Counterfeit / Replica Item' },
  { value: DisputePolicyRule.OTHER, label: 'Other Policy Violation' },
];

const REJECTION_REASON_OPTIONS = [
  { value: DisputeRejectionReason.INSUFFICIENT_EVIDENCE, label: 'Insufficient Evidence Provided' },
  { value: DisputeRejectionReason.OUTSIDE_POLICY_WINDOW, label: 'Outside Claim Policy Window' },
  { value: DisputeRejectionReason.BUYER_REMORSE, label: 'Buyer Remorse / Not Covered' },
  { value: DisputeRejectionReason.DUPLICATE_CLAIM, label: 'Duplicate Claim Filed' },
  { value: DisputeRejectionReason.OTHER, label: 'Other Operational Ground' },
];

export function AdminDisputeDetailPage() {
  const { id } = useParams();
  const { dispute, isLoading, error, refetch } = useDisputeDetail(id);
  const { startReview, isLoading: isStartingReview } = useDisputeReview(id);
  const { resolveDispute, isLoading: isResolving } = useDisputeResolve(id);
  const { showSuccess, showError } = useToast();

  // Resolution Form State
  const [outcome, setOutcome] = useState(DisputeOutcome.BUYER_WINS);
  const [policyRule, setPolicyRule] = useState(DisputePolicyRule.ITEM_NOT_AS_DESCRIBED);
  const [rejectionReason, setRejectionReason] = useState(DisputeRejectionReason.INSUFFICIENT_EVIDENCE);
  const [resolutionNote, setResolutionNote] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Lightbox Modal for evidence images
  const [activeLightboxImg, setActiveLightboxImg] = useState(null);

  // Take Review action
  const handleStartReview = useCallback(async () => {
    try {
      await startReview();
      showSuccess(`Dispute #${id.slice(0, 8)} transitioned to Under Review.`);
      refetch();
    } catch (err) {
      showError(err.message || 'Failed to start review.');
    }
  }, [id, startReview, showSuccess, showError, refetch]);

  // Execute Resolution
  const handleConfirmResolve = useCallback(async () => {
    if (resolutionNote.trim().length < 20) {
      showError('Resolution note must be at least 20 characters.');
      return;
    }

    try {
      await resolveDispute({
        outcome,
        resolutionNote: resolutionNote.trim(),
        policyRule: outcome === DisputeOutcome.BUYER_WINS ? policyRule : undefined,
        rejectionReason: outcome === DisputeOutcome.SELLER_WINS ? rejectionReason : undefined,
      });

      showSuccess(`Dispute resolved successfully: ${outcome === DisputeOutcome.BUYER_WINS ? 'Buyer Wins' : 'Seller Wins'}.`);
      setShowConfirmModal(false);
      refetch();
    } catch (err) {
      showError(err.message || 'Failed to resolve dispute.');
    }
  }, [outcome, resolutionNote, policyRule, rejectionReason, resolveDispute, showSuccess, showError, refetch]);

  if (isLoading) {
    return (
      <div className="admin-dispute-detail">
        <div className="admin-detail-loading">
          <div className="admin-skeleton-row" style={{ width: '200px', marginBottom: '16px' }} />
          <div className="admin-skeleton-row" style={{ height: '120px' }} />
        </div>
      </div>
    );
  }

  if (error || !dispute) {
    return (
      <div className="admin-dispute-detail">
        <Link to="/admin/disputes" className="admin-back-link">
          ← Back to Disputes Queue
        </Link>
        <div className="admin-disputes-error" style={{ marginTop: '16px' }}>
          <p className="error-text">Failed to load dispute details: {error || 'Dispute not found'}</p>
          <button type="button" onClick={() => refetch()} className="btn btn--sm btn--secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isTerminal = ['resolved_buyer_wins', 'resolved_seller_wins', 'expired', 'withdrawn'].includes(dispute.status);
  const isUnderReview = dispute.status === 'under_review';
  const isOpen = dispute.status === 'open';

  return (
    <div className="admin-dispute-detail">
      {/* Top Navigation & Status Bar */}
      <div className="admin-detail-topbar">
        <Link to="/admin/disputes" className="admin-back-link">
          ← Back to Disputes Queue
        </Link>
        <div className="admin-detail-id-wrap">
          <span className="admin-detail-id font-mono">DISPUTE #{dispute.id}</span>
          <StatusBadge type="dispute" status={dispute.status} />
        </div>
      </div>

      {/* 2-Column Main Workspace */}
      <div className="admin-detail-grid">
        {/* Left Column: Context & Metadata */}
        <div className="admin-detail-left">
          {/* Auction Summary Card */}
          <section className="admin-detail-card">
            <h2 className="admin-card-title">Auction Details</h2>
            <div className="admin-card-row">
              <span className="admin-card-label">Title</span>
              <span className="admin-card-val font-semibold">{dispute.auctionTitle}</span>
            </div>
            <div className="admin-card-row">
              <span className="admin-card-label">Auction ID</span>
              <span className="admin-card-val font-mono text-xs">
                <Link to={`/auctions/${dispute.auctionId}`} target="_blank" rel="noreferrer" className="admin-link">
                  {dispute.auctionId}
                </Link>
              </span>
            </div>
            <div className="admin-card-row">
              <span className="admin-card-label">Tracking</span>
              <span className="admin-card-val">
                <Link to={`/auctions/${dispute.auctionId}/tracking`} target="_blank" rel="noreferrer" className="admin-link">
                  View Shipping Timeline →
                </Link>
              </span>
            </div>
          </section>

          {/* Payment & Escrow Card */}
          <section className="admin-detail-card">
            <h2 className="admin-card-title">Escrow & Financials</h2>
            <div className="admin-card-row">
              <span className="admin-card-label">Payment ID</span>
              <span className="admin-card-val font-mono text-xs">{dispute.paymentId}</span>
            </div>
            <div className="admin-card-row">
              <span className="admin-card-label">Escrow State</span>
              <span className="admin-card-val">
                <StatusBadge type="payment" status={isTerminal ? 'CAPTURED' : 'FROZEN'} />
              </span>
            </div>
          </section>

          {/* Complainant & Counterparty Card */}
          <section className="admin-detail-card">
            <h2 className="admin-card-title">Parties Involved</h2>
            <div className="admin-card-row">
              <span className="admin-card-label">Opened By</span>
              <span className="admin-card-val">{dispute.openedBy?.displayName || 'System'}</span>
            </div>
            <div className="admin-card-row">
              <span className="admin-card-label">User ID</span>
              <span className="admin-card-val font-mono text-xs">{dispute.openedBy?.id || 'N/A'}</span>
            </div>
          </section>

          {/* SLA & Timeline Card */}
          <section className="admin-detail-card">
            <h2 className="admin-card-title">SLA & Audit Log</h2>
            <div className="admin-card-row">
              <span className="admin-card-label">Opened At</span>
              <span className="admin-card-val font-mono text-xs">
                {new Date(dispute.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="admin-card-row">
              <span className="admin-card-label">SLA Deadline</span>
              <span className="admin-card-val font-mono text-xs">
                {!isTerminal ? (
                  <CountdownTimer endAt={dispute.deadlineAt} endedText="Expired" />
                ) : (
                  <span>Concluded</span>
                )}
              </span>
            </div>
            {dispute.resolvedAt && (
              <div className="admin-card-row">
                <span className="admin-card-label">Resolved At</span>
                <span className="admin-card-val font-mono text-xs">
                  {new Date(dispute.resolvedAt).toLocaleString()}
                </span>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Evidence & Resolution Console */}
        <div className="admin-detail-right">
          {/* Claim & Evidence Card */}
          <section className="admin-detail-card">
            <h2 className="admin-card-title">Claim & Evidence Dossier</h2>
            <div className="admin-claim-reason">
              <span className="admin-card-label">Reason Filed:</span>
              <span className="admin-reason-badge">
                {REASON_LABELS[dispute.reason] || dispute.reason}
              </span>
            </div>

            <div className="admin-claim-statement">
              <span className="admin-card-label">Statement:</span>
              <p className="admin-statement-body">
                {dispute.description || 'No statement was provided by the complainant.'}
              </p>
            </div>

            <div className="admin-evidence-section">
              <span className="admin-card-label">
                Submitted Files ({dispute.evidenceUrls?.length || 0}):
              </span>
              {dispute.evidenceUrls && dispute.evidenceUrls.length > 0 ? (
                <div className="admin-evidence-gallery">
                  {dispute.evidenceUrls.map((url, idx) => {
                    const isImg = /\.(jpg|jpeg|png|webp|avif|gif)($|\?)/i.test(url);
                    return isImg ? (
                      <button
                        key={idx}
                        type="button"
                        className="admin-evidence-thumb"
                        onClick={() => setActiveLightboxImg(url)}
                      >
                        <img src={url} alt={`Evidence #${idx + 1}`} loading="lazy" />
                        <span className="admin-thumb-overlay">Enlarge</span>
                      </button>
                    ) : (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-evidence-file-link"
                      >
                        Document #{idx + 1} ↗
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="admin-empty-evidence">No external evidence files attached.</p>
              )}
            </div>
          </section>

          {/* Resolution Console */}
          <section className="admin-detail-card admin-resolution-console">
            <h2 className="admin-card-title">Resolution Console</h2>

            {isOpen && (
              <div className="admin-open-state-panel">
                <p className="admin-console-notice">
                  This dispute is currently <strong>Open</strong>. Review must be formally acknowledged before final adjudication.
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={isStartingReview}
                  onClick={handleStartReview}
                >
                  {isStartingReview ? 'Starting Review...' : 'Take Review & Lock Queue'}
                </button>
              </div>
            )}

            {isUnderReview && (
              <form
                className="admin-resolution-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (resolutionNote.trim().length >= 20) {
                    setShowConfirmModal(true);
                  }
                }}
              >
                <div className="admin-form-group">
                  <label className="admin-form-label">Adjudication Outcome</label>
                  <div className="admin-outcome-toggle">
                    <button
                      type="button"
                      className={`admin-toggle-btn admin-toggle-btn--buyer ${
                        outcome === DisputeOutcome.BUYER_WINS ? 'active' : ''
                      }`}
                      onClick={() => setOutcome(DisputeOutcome.BUYER_WINS)}
                    >
                      Buyer Wins (Refund)
                    </button>
                    <button
                      type="button"
                      className={`admin-toggle-btn admin-toggle-btn--seller ${
                        outcome === DisputeOutcome.SELLER_WINS ? 'active' : ''
                      }`}
                      onClick={() => setOutcome(DisputeOutcome.SELLER_WINS)}
                    >
                      Seller Wins (Payout)
                    </button>
                  </div>
                </div>

                {outcome === DisputeOutcome.BUYER_WINS ? (
                  <div className="admin-form-group">
                    <label className="admin-form-label">Policy Rule Applied</label>
                    <select
                      className="admin-select"
                      value={policyRule}
                      onChange={(e) => setPolicyRule(e.target.value)}
                    >
                      {POLICY_RULE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="admin-form-group">
                    <label className="admin-form-label">Rejection Reason Applied</label>
                    <select
                      className="admin-select"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    >
                      {REJECTION_REASON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="admin-form-group">
                  <div className="admin-label-row">
                    <label className="admin-form-label">Resolution Statement (Note)</label>
                    <span
                      className={`admin-char-count font-mono ${
                        resolutionNote.trim().length < 20 ? 'admin-char-count--warn' : 'admin-char-count--ok'
                      }`}
                    >
                      {resolutionNote.trim().length} / 2000 (min 20)
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    className="admin-textarea"
                    placeholder="Provide a comprehensive operational explanation justifying this decision..."
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn--primary admin-submit-btn"
                  disabled={resolutionNote.trim().length < 20 || isResolving}
                >
                  Confirm Determination...
                </button>
              </form>
            )}

            {isTerminal && (
              <div className="admin-terminal-summary">
                <div className="admin-terminal-badge-wrap">
                  <span className="admin-card-label">Final Outcome:</span>
                  <StatusBadge type="dispute" status={dispute.status} />
                </div>
                {dispute.policyRule && (
                  <div className="admin-card-row">
                    <span className="admin-card-label">Policy Reference:</span>
                    <span className="admin-card-val font-mono">{dispute.policyRule}</span>
                  </div>
                )}
                <div className="admin-card-row admin-card-row--col">
                  <span className="admin-card-label">Admin Resolution Statement:</span>
                  <p className="admin-resolved-note">
                    {dispute.resolutionNote || 'No recorded resolution statement.'}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal-card">
            <h3 className="admin-modal-title">Confirm Irreversible Determination</h3>
            <p className="admin-modal-desc">
              You are about to resolve Dispute <strong>#{dispute.id.slice(0, 8)}</strong> with outcome{' '}
              <strong>{outcome === DisputeOutcome.BUYER_WINS ? 'BUYER WINS' : 'SELLER WINS'}</strong>.
            </p>
            <div className="admin-modal-warning">
              {outcome === DisputeOutcome.BUYER_WINS ? (
                <span>⚠️ This will immediately trigger an automated full Stripe refund to the buyer.</span>
              ) : (
                <span>⚠️ This will capture escrow and release payout funds to the seller.</span>
              )}
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={isResolving}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={isResolving}
                onClick={handleConfirmResolve}
              >
                {isResolving ? 'Executing...' : 'Execute Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxImg && (
        <div className="admin-lightbox-backdrop" onClick={() => setActiveLightboxImg(null)}>
          <div className="admin-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={activeLightboxImg} alt="Enlarged Evidence" className="admin-lightbox-img" />
            <button
              type="button"
              className="admin-lightbox-close"
              onClick={() => setActiveLightboxImg(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
