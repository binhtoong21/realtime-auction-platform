import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame,
  Search,
  X,
  RotateCw,
  ExternalLink,
  Ban,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useAdminAuctions } from '../hooks/useAdminAuctions';
import { useAdminCategories } from '../hooks/useAdminCategories';
import { useAdminAuctionActions } from '../hooks/useAdminAuctionActions';
import { AdminCancelAuctionModal } from '../components/AdminAuctionModals';
import { AuctionStatus } from '@auction/shared-constants';
import './AdminAuctionsPage.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active (Live)' },
  { value: 'scheduled', label: 'Scheduled (Upcoming)' },
  { value: 'ended', label: 'Ended (Concluded)' },
  { value: 'awaiting_ship', label: 'Awaiting Shipment' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ADMIN_CANCELLABLE_STATUSES = new Set([AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE]);

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeRemaining(endAtIso, status) {
  if (status !== 'active') return null;
  const diff = new Date(endAtIso).getTime() - Date.now();
  if (diff <= 0) return 'Ending soon';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  return `${hours}h ${mins}m left`;
}

export function AdminAuctionsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [selectedAuction, setSelectedAuction] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const { auctions, meta, isLoading, error, refetch } = useAdminAuctions({
    page,
    limit: 20,
    search: searchInput,
    status,
    categoryId,
  });

  const { categories } = useAdminCategories();
  const { cancelAuction, isActionLoading } = useAdminAuctionActions();

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setPage(1);
  };

  const handleStatusChange = (e) => {
    setStatus(e.target.value);
    setPage(1);
  };

  const handleCategoryChange = (e) => {
    setCategoryId(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setStatus('');
    setCategoryId('');
    setPage(1);
  };

  const openCancelModal = (auction) => {
    setSelectedAuction(auction);
    setIsCancelModalOpen(true);
  };

  const closeCancelModal = () => {
    setSelectedAuction(null);
    setIsCancelModalOpen(false);
  };

  const handleConfirmCancel = useCallback(
    async (auctionId, reason) => {
      try {
        await cancelAuction(auctionId, reason);
        closeCancelModal();
        setToastMessage({
          type: 'success',
          text: `Auction #${auctionId.slice(0, 8)} successfully cancelled.`,
        });
        await refetch();
      } catch (err) {
        setToastMessage({
          type: 'danger',
          text: err.response?.data?.error?.message || err.message || 'Failed to cancel auction.',
        });
      }
    },
    [cancelAuction, refetch]
  );

  return (
    <div className="admin-auctions-page">
      {/* Header */}
      <header className="admin-auctions-header">
        <div>
          <div className="admin-auctions-badge">OPERATIONAL OVERSIGHT</div>
          <h1 className="admin-page-title">Marketplace Auctions & Lots</h1>
          <p className="admin-page-subtitle">
            Inspect bidding book status, monitor lots across taxonomies, and execute emergency cancellations
          </p>
        </div>

        <div className="admin-auctions-header-actions">
          <div className="admin-meta-stat">
            Total Lots: <strong>{meta?.total ?? 0}</strong>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={refetch}
            disabled={isLoading}
            title="Refresh auctions index"
          >
            <RotateCw size={13} className={isLoading ? 'admin-spinner' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* Notifications / Toast Banner */}
      {toastMessage && (
        <div className={`admin-toast-banner admin-toast-banner--${toastMessage.type}`} role="status">
          {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toastMessage.text}</span>
          <button
            type="button"
            className="admin-toast-dismiss"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss toast"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <section className="admin-filter-bar">
        <div className="admin-search-wrap">
          <Search size={14} className="admin-search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by lot title..."
            value={searchInput}
            onChange={handleSearchChange}
          />
          {searchInput && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={handleClearSearch}
              aria-label="Clear search input"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="admin-filter-dropdowns">
          <select
            className="admin-select"
            value={status}
            onChange={handleStatusChange}
            aria-label="Filter by Status"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            className="admin-select"
            value={categoryId}
            onChange={handleCategoryChange}
            aria-label="Filter by Category"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {(searchInput || status || categoryId) && (
            <button
              type="button"
              className="btn btn--xs btn--secondary admin-filter-reset"
              onClick={handleResetFilters}
            >
              <Filter size={11} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </section>

      {/* Data Table */}
      <section className="admin-table-container">
        {isLoading && auctions.length === 0 ? (
          <div className="admin-state-box">
            <RotateCw size={24} className="admin-spinner" style={{ margin: '0 auto 8px' }} />
            <p>Querying marketplace lots...</p>
          </div>
        ) : error ? (
          <div className="admin-state-box">
            <AlertTriangle size={24} className="text-danger" style={{ margin: '0 auto 8px' }} />
            <p className="text-danger">Failed to load marketplace auctions: {error}</p>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={refetch}
              style={{ marginTop: '8px' }}
            >
              Retry Sync
            </button>
          </div>
        ) : auctions.length === 0 ? (
          <div className="admin-state-box">
            <Flame size={24} style={{ margin: '0 auto 8px', color: 'var(--color-text-disabled)' }} />
            <p>No auction listings match the active filter criteria.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Auction Lot / Reference</th>
                <th>Seller</th>
                <th>Category</th>
                <th>Current Price</th>
                <th>State</th>
                <th>Timeline</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {auctions.map((auction) => {
                const canCancel = ADMIN_CANCELLABLE_STATUSES.has(auction.status);
                const timeRemaining = formatTimeRemaining(auction.endAt, auction.status);

                return (
                  <tr key={auction.id}>
                    <td>
                      <div className="admin-item-cell">
                        <Link
                          to={`/auctions/${auction.id}`}
                          className="admin-item-title-link"
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open public bid room"
                        >
                          <span>{auction.title}</span>
                          <ExternalLink size={11} className="text-secondary" />
                        </Link>
                        <span className="admin-item-id font-mono">{auction.id}</span>
                      </div>
                    </td>

                    <td>
                      <Link
                        to={`/admin/users/${auction.sellerId}`}
                        className="admin-trader-link"
                        title="View seller administration record"
                      >
                        {auction.sellerName || 'Anonymous Seller'}
                      </Link>
                    </td>

                    <td>
                      <span className="admin-category-badge">
                        {auction.categoryName || 'Unassigned'}
                      </span>
                    </td>

                    <td className="font-mono" style={{ fontWeight: 600 }}>
                      {formatCurrency(auction.currentPrice)}
                    </td>

                    <td>
                      <span className={`admin-status-badge admin-status-badge--${auction.status}`}>
                        {auction.status}
                      </span>
                    </td>

                    <td>
                      <div className="admin-timeline-cell">
                        <span className="admin-timeline-end">
                          Closes: {formatDate(auction.endAt)}
                        </span>
                        {timeRemaining && (
                          <span className="admin-timeline-sub font-mono text-warning">
                            {timeRemaining}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="admin-table-actions" style={{ justifyContent: 'flex-end' }}>
                        <Link
                          to={`/auctions/${auction.id}`}
                          className="btn btn--xs btn--secondary admin-btn-action"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Inspect
                        </Link>
                        <button
                          type="button"
                          className="btn btn--xs btn--danger admin-btn-action"
                          disabled={!canCancel || isActionLoading}
                          onClick={() => openCancelModal(auction)}
                          title={
                            canCancel
                              ? 'Force cancel this auction'
                              : 'Only scheduled or live auctions can be force-cancelled'
                          }
                        >
                          <Ban size={11} />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Pagination Bar */}
      {meta && meta.totalPages > 1 && (
        <footer className="admin-pagination">
          <div>
            Showing <span className="font-mono">{(meta.page - 1) * meta.limit + 1}</span> to{' '}
            <span className="font-mono">{Math.min(meta.page * meta.limit, meta.total)}</span> of{' '}
            <span className="font-mono">{meta.total}</span> listings
          </div>

          <div className="admin-pagination-btns">
            <button
              type="button"
              className="btn btn--xs btn--secondary"
              disabled={meta.page <= 1 || isLoading}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              <ChevronLeft size={13} />
              <span>Previous</span>
            </button>
            <span className="font-mono">
              {meta.page} / {meta.totalPages}
            </span>
            <button
              type="button"
              className="btn btn--xs btn--secondary"
              disabled={meta.page >= meta.totalPages || isLoading}
              onClick={() => setPage((prev) => Math.min(prev + 1, meta.totalPages))}
            >
              <span>Next</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </footer>
      )}

      {/* Cancel Modal */}
      <AdminCancelAuctionModal
        isOpen={isCancelModalOpen}
        onClose={closeCancelModal}
        onConfirm={handleConfirmCancel}
        auction={selectedAuction}
        isLoading={isActionLoading}
      />
    </div>
  );
}
