import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  X,
} from 'lucide-react';
import { useAdminUsers, useAdminUserActions } from '../hooks';
import {
  BanUserModal,
  SuspendUserModal,
  ReactivateUserModal,
  KycOverrideModal,
} from '../components/AdminUserModals';
import './AdminUsersPage.css';

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'seller', label: 'Sellers' },
  { value: 'admin', label: 'Admins' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
];

const KYC_OPTIONS = [
  { value: '', label: 'All KYC Statuses' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'rejected', label: 'Rejected' },
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [identityStatus, setIdentityStatus] = useState('');

  const [activeModal, setActiveModal] = useState(null); // 'ban' | 'suspend' | 'reactivate' | 'kyc' | null
  const [targetUser, setTargetUser] = useState(null);
  const [successToast, setSuccessToast] = useState('');
  const [actionErrorToast, setActionErrorToast] = useState('');

  // Fetch users with current query parameters
  const { users, meta, isLoading, error, refetch } = useAdminUsers({
    page,
    limit: 15,
    search: debouncedSearch,
    role,
    status,
    identityStatus,
  });

  const {
    banUser,
    suspendUser,
    reactivateUser,
    overrideKyc,
    isActionLoading,
  } = useAdminUserActions();

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => clearTimeout(handler);
  }, [search]);

  // Auto-dismiss success toast after 4s
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => {
      setSuccessToast('');
    }, 4000);
    return () => clearTimeout(timer);
  }, [successToast]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setTargetUser(null);
    setActionErrorToast('');
  }, []);

  const handleOpenModal = useCallback((type, user) => {
    setTargetUser(user);
    setActiveModal(type);
    setActionErrorToast('');
  }, []);

  const handleConfirmBan = useCallback(async (userId, reason) => {
    try {
      await banUser(userId, reason);
      setSuccessToast(`User account permanently banned.`);
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to ban user.');
    }
  }, [banUser, closeModal, refetch]);

  const handleConfirmSuspend = useCallback(async (userId, reason) => {
    try {
      await suspendUser(userId, reason);
      setSuccessToast(`User account suspended.`);
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to suspend user.');
    }
  }, [suspendUser, closeModal, refetch]);

  const handleConfirmReactivate = useCallback(async (userId) => {
    try {
      await reactivateUser(userId);
      setSuccessToast(`User account reactivated.`);
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to reactivate user.');
    }
  }, [reactivateUser, closeModal, refetch]);

  const handleConfirmKyc = useCallback(async (userId, note) => {
    try {
      await overrideKyc(userId, note);
      setSuccessToast(`Identity status updated to Verified.`);
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to override KYC.');
    }
  }, [overrideKyc, closeModal, refetch]);

  const handleResetFilters = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setRole('');
    setStatus('');
    setIdentityStatus('');
    setPage(1);
  }, []);

  const isFiltering = useMemo(() => {
    return Boolean(debouncedSearch || role || status || identityStatus);
  }, [debouncedSearch, role, status, identityStatus]);

  const paginationInfo = useMemo(() => {
    const total = meta.total || 0;
    const start = total === 0 ? 0 : (page - 1) * meta.limit + 1;
    const end = Math.min(page * meta.limit, total);
    return { start, end, total, totalPages: meta.totalPages || 1 };
  }, [meta, page]);

  return (
    <div className="admin-users-page">
      {/* Page Header */}
      <header className="admin-users-header">
        <div>
          <div className="admin-users-badge">ACCESS CONTROL</div>
          <h1 className="admin-page-title">Trader & Account Directory</h1>
          <p className="admin-page-subtitle">
            Search registered accounts, enforce suspensions, inspect dispute histories, and audit trader permissions
          </p>
        </div>

        <div className="admin-users-header-actions">
          <div className="admin-meta-stat">
            Total Traders: <strong>{meta.total ?? '—'}</strong>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={refetch}
            disabled={isLoading}
            title="Refresh directory"
          >
            <RotateCw size={13} className={isLoading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Notifications */}
      {successToast && (
        <div className="admin-toast-banner admin-toast-banner--success" role="status">
          <CheckCircle2 size={16} />
          <span>{successToast}</span>
          <button type="button" className="admin-toast-dismiss" onClick={() => setSuccessToast('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {actionErrorToast && (
        <div className="admin-toast-banner admin-toast-banner--danger" role="alert">
          <AlertCircle size={16} />
          <span>{actionErrorToast}</span>
          <button type="button" className="admin-toast-dismiss" onClick={() => setActionErrorToast('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="admin-toast-banner admin-toast-banner--danger" role="alert">
          <AlertCircle size={16} />
          <span>Failed to load traders: {error}</span>
          <button type="button" className="btn btn--xs btn--secondary" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <section className="admin-filter-bar">
        {/* Search input */}
        <div className="admin-search-wrap">
          <Search size={14} className="admin-search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by name or email address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="admin-filter-dropdowns">
          <select
            className="admin-select"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            className="admin-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            className="admin-select"
            value={identityStatus}
            onChange={(e) => {
              setIdentityStatus(e.target.value);
              setPage(1);
            }}
          >
            {KYC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {isFiltering && (
            <button
              type="button"
              className="btn btn--xs btn--secondary admin-filter-reset"
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* Traders Table */}
      <section className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Trader</th>
              <th>Role</th>
              <th>Status</th>
              <th>KYC</th>
              <th className="text-right">Activity</th>
              <th>Member Since</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td colSpan={7}>
                    <div className="admin-skeleton-row" />
                  </td>
                </tr>
              ))
            ) : users.length > 0 ? (
              users.map((u) => {
                const initials = (u.displayName || u.email || 'U').charAt(0).toUpperCase();

                return (
                  <tr key={u.id} className="admin-table-row">
                    {/* Trader Name & Email */}
                    <td>
                      <div className="admin-trader-cell">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="admin-avatar-img" />
                        ) : (
                          <div className="admin-avatar-initials font-mono">{initials}</div>
                        )}
                        <div className="admin-trader-info">
                          <Link to={`/admin/users/${u.id}`} className="admin-trader-name">
                            {u.displayName || 'Unnamed Trader'}
                          </Link>
                          <span className="admin-trader-email font-mono">{u.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td>
                      <span className={`admin-pill admin-pill--role-${u.role}`}>
                        {u.role}
                      </span>
                    </td>

                    {/* Account Status */}
                    <td>
                      <span className={`admin-pill admin-pill--status-${u.status}`}>
                        {u.status}
                      </span>
                    </td>

                    {/* KYC Status */}
                    <td>
                      <span className={`admin-pill admin-pill--kyc-${u.identityStatus}`}>
                        {u.identityStatus}
                      </span>
                    </td>

                    {/* Activity (Auctions & Bids) */}
                    <td className="text-right">
                      <div className="admin-activity-cell font-mono">
                        <span title="Created auctions">{u.auctionsCount ?? 0} auc</span>
                        <span className="text-disabled">·</span>
                        <span title="Placed bids">{u.bidsCount ?? 0} bids</span>
                      </div>
                    </td>

                    {/* Member Since */}
                    <td>
                      <span className="admin-date-cell font-mono">
                        {formatDate(u.createdAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="text-right">
                      <div className="admin-row-actions">
                        <Link
                          to={`/admin/users/${u.id}`}
                          className="btn btn--xs btn--secondary"
                          title="Inspect user profile"
                        >
                          <ExternalLink size={12} />
                          <span>Inspect</span>
                        </Link>

                        {/* Quick Moderation Button */}
                        {u.status === 'active' && (
                          <button
                            type="button"
                            className="btn btn--xs btn--secondary text-warning"
                            onClick={() => handleOpenModal('suspend', u)}
                            title="Suspend user"
                          >
                            <PauseCircle size={12} />
                            <span>Suspend</span>
                          </button>
                        )}

                        {u.status === 'suspended' && (
                          <button
                            type="button"
                            className="btn btn--xs btn--secondary text-success"
                            onClick={() => handleOpenModal('reactivate', u)}
                            title="Reactivate user"
                          >
                            <PlayCircle size={12} />
                            <span>Reactivate</span>
                          </button>
                        )}

                        {u.status !== 'banned' && (
                          <button
                            type="button"
                            className="btn btn--xs btn--destructive"
                            onClick={() => handleOpenModal('ban', u)}
                            title="Ban user"
                          >
                            <ShieldAlert size={12} />
                            <span>Ban</span>
                          </button>
                        )}

                        {u.identityStatus !== 'verified' && (
                          <button
                            type="button"
                            className="btn btn--xs btn--secondary text-brand"
                            onClick={() => handleOpenModal('kyc', u)}
                            title="Manual KYC override"
                          >
                            <ShieldCheck size={12} />
                            <span>KYC</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="text-center text-secondary py-5">
                  <div className="admin-empty-state">
                    <Users size={32} className="text-disabled mb-2" />
                    <p className="font-semibold">No traders found</p>
                    <p className="text-xs">
                      {isFiltering
                        ? 'Try adjusting your search criteria or resetting filters.'
                        : 'No registered traders in this system.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Pagination Footer */}
      {meta.totalPages > 1 && (
        <footer className="admin-pagination-bar">
          <div className="admin-pagination-info font-mono">
            Showing {paginationInfo.start}–{paginationInfo.end} of {paginationInfo.total} traders
          </div>

          <div className="admin-pagination-controls">
            <button
              type="button"
              className="btn btn--xs btn--secondary"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="admin-page-indicator font-mono">
              Page {page} of {meta.totalPages}
            </span>
            <button
              type="button"
              className="btn btn--xs btn--secondary"
              disabled={page >= meta.totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      )}

      {/* Modal Dialogs */}
      <BanUserModal
        isOpen={activeModal === 'ban'}
        onClose={closeModal}
        onConfirm={handleConfirmBan}
        user={targetUser}
        isLoading={isActionLoading}
      />

      <SuspendUserModal
        isOpen={activeModal === 'suspend'}
        onClose={closeModal}
        onConfirm={handleConfirmSuspend}
        user={targetUser}
        isLoading={isActionLoading}
      />

      <ReactivateUserModal
        isOpen={activeModal === 'reactivate'}
        onClose={closeModal}
        onConfirm={handleConfirmReactivate}
        user={targetUser}
        isLoading={isActionLoading}
      />

      <KycOverrideModal
        isOpen={activeModal === 'kyc'}
        onClose={closeModal}
        onConfirm={handleConfirmKyc}
        user={targetUser}
        isLoading={isActionLoading}
      />
    </div>
  );
}
