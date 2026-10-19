import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAdminDisputes, useDisputeReview } from '../hooks';
import { StatusBadge } from '../../../components/StatusBadge';
import { CountdownTimer } from '../../auctions/components/CountdownTimer';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useToast } from '../../../core/context/ToastContext';
import './AdminDisputeListPage.css';

const TABS = [
  { key: 'all', label: 'All Disputes' },
  { key: 'open', label: 'Open' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'resolved_buyer_wins', label: 'Buyer Wins' },
  { key: 'resolved_seller_wins', label: 'Seller Wins' },
  { key: 'expired', label: 'Expired' },
];

const REASON_LABELS = {
  ITEM_NOT_RECEIVED: 'Item Not Received',
  ITEM_DAMAGED: 'Item Damaged',
  ITEM_NOT_AS_DESCRIBED: 'Item Not As Described',
  COUNTERFEIT_ITEM: 'Counterfeit Item',
};

export function AdminDisputeListPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [actioningId, setActioningId] = useState(null);

  const { showSuccess, showError } = useToast();
  const { startReview } = useDisputeReview();

  const { disputes, meta, isLoading, error, refetch } = useAdminDisputes({
    status: activeTab === 'all' ? '' : activeTab,
    page: currentPage,
    limit: 15,
  });

  const handleTabChange = useCallback((tabKey) => {
    setActiveTab(tabKey);
    setCurrentPage(1);
  }, []);

  const handleTakeReview = useCallback(
    async (disputeId) => {
      setActioningId(disputeId);
      try {
        await startReview(disputeId);
        showSuccess(`Dispute #${disputeId.slice(0, 8)} is now under review.`);
        refetch();
      } catch (err) {
        showError(err.message || 'Failed to start dispute review.');
      } finally {
        setActioningId(null);
      }
    },
    [startReview, showSuccess, showError, refetch]
  );

  return (
    <div className="admin-disputes-page">
      {/* Page Header */}
      <div className="admin-disputes-header">
        <div>
          <h1 className="admin-page-title">Dispute Desk</h1>
          <p className="admin-page-subtitle">
            Escrow exception queue and arbitration management
          </p>
        </div>
        <div className="admin-disputes-meta">
          <span className="admin-meta-stat">
            Total In Queue: <strong>{meta?.total ?? 0}</strong>
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="admin-tabs-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`admin-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Pane */}
      {isLoading ? (
        <div className="admin-disputes-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>AUCTION</th>
                <th>OPENED BY</th>
                <th>REASON</th>
                <th>STATUS</th>
                <th>SLA DEADLINE</th>
                <th className="text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((idx) => (
                <tr key={idx} className="admin-table-row--skeleton">
                  <td colSpan={7}>
                    <div className="admin-skeleton-row" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="admin-disputes-error">
          <p className="error-text">Failed to load dispute desk: {error}</p>
          <button type="button" onClick={() => refetch()} className="btn btn--sm btn--secondary">
            Retry Connection
          </button>
        </div>
      ) : disputes.length === 0 ? (
        <EmptyState
          heading="Queue is clear"
          subtext={
            activeTab === 'all'
              ? 'There are no active or historical disputes recorded in the system.'
              : `No disputes found under status "${activeTab}".`
          }
        />
      ) : (
        <>
          <div className="admin-disputes-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>AUCTION</th>
                  <th>OPENED BY</th>
                  <th>REASON</th>
                  <th>STATUS</th>
                  <th>SLA DEADLINE</th>
                  <th className="text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((dispute) => {
                  const isPendingReview = dispute.status === 'open';
                  const isActionLoading = actioningId === dispute.id;
                  const reasonLabel = REASON_LABELS[dispute.reason] || dispute.reason;

                  return (
                    <tr key={dispute.id} className="admin-table-row">
                      {/* ID */}
                      <td className="font-mono text-xs">
                        <Link to={`/admin/disputes/${dispute.id}`} className="admin-id-link">
                          #{dispute.id.slice(0, 8)}
                        </Link>
                      </td>

                      {/* AUCTION */}
                      <td className="admin-col-auction">
                        <Link
                          to={`/auctions/${dispute.auctionId}`}
                          className="admin-auction-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {dispute.auctionTitle || 'Auction Item'}
                        </Link>
                      </td>

                      {/* OPENED BY */}
                      <td className="admin-col-user">
                        {dispute.openedBy?.displayName || 'System'}
                      </td>

                      {/* REASON */}
                      <td>
                        <span className="admin-reason-tag" title={dispute.reason}>
                          {reasonLabel}
                        </span>
                      </td>

                      {/* STATUS */}
                      <td>
                        <StatusBadge type="dispute" status={dispute.status} />
                      </td>

                      {/* SLA DEADLINE */}
                      <td className="font-mono text-xs">
                        {['open', 'under_review'].includes(dispute.status) ? (
                          <CountdownTimer endAt={dispute.deadlineAt} endedText="Expired" />
                        ) : (
                          <span className="text-secondary">Closed</span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td className="text-right">
                        <div className="admin-row-actions">
                          {isPendingReview && (
                            <button
                              type="button"
                              className="btn btn--xs btn--primary"
                              disabled={isActionLoading}
                              onClick={() => handleTakeReview(dispute.id)}
                            >
                              {isActionLoading ? 'Starting...' : 'Take Review'}
                            </button>
                          )}
                          <Link
                            to={`/admin/disputes/${dispute.id}`}
                            className="btn btn--xs btn--secondary"
                          >
                            Inspect
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {meta?.totalPages > 1 && (
            <div className="admin-pagination">
              <button
                type="button"
                className="btn btn--xs btn--secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="admin-pagination-info font-mono">
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                type="button"
                className="btn btn--xs btn--secondary"
                disabled={currentPage >= meta.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(meta.totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
