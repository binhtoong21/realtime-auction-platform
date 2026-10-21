import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  CreditCard,
  Building2,
  Flame,
  Gavel,
  X,
} from 'lucide-react';
import { useAdminUserDetail } from '../hooks';
import { useAdminUserActions } from '../hooks';
import {
  BanUserModal,
  SuspendUserModal,
  ReactivateUserModal,
  KycOverrideModal,
} from '../components/AdminUserModals';
import './AdminUserDetailPage.css';

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((cents || 0) / 100);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function AdminUserDetailPage() {
  const { id } = useParams();

  const [activeTab, setActiveTab] = useState('auctions'); // 'auctions' | 'bids' | 'disputes'
  const [activeModal, setActiveModal] = useState(null); // 'ban' | 'suspend' | 'reactivate' | 'kyc' | null
  const [successToast, setSuccessToast] = useState('');
  const [actionErrorToast, setActionErrorToast] = useState('');

  const {
    user,
    recentAuctions,
    recentBids,
    recentDisputes,
    isLoading,
    error,
    refetch,
  } = useAdminUserDetail(id);

  const {
    banUser,
    suspendUser,
    reactivateUser,
    overrideKyc,
    isActionLoading,
  } = useAdminUserActions();

  // Auto-dismiss success toast
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => {
      setSuccessToast('');
    }, 4000);
    return () => clearTimeout(timer);
  }, [successToast]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setActionErrorToast('');
  }, []);

  const handleConfirmBan = useCallback(async (userId, reason) => {
    try {
      await banUser(userId, reason);
      setSuccessToast('User account permanently banned.');
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to ban user.');
    }
  }, [banUser, closeModal, refetch]);

  const handleConfirmSuspend = useCallback(async (userId, reason) => {
    try {
      await suspendUser(userId, reason);
      setSuccessToast('User account suspended.');
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to suspend user.');
    }
  }, [suspendUser, closeModal, refetch]);

  const handleConfirmReactivate = useCallback(async (userId) => {
    try {
      await reactivateUser(userId);
      setSuccessToast('User account reactivated.');
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to reactivate user.');
    }
  }, [reactivateUser, closeModal, refetch]);

  const handleConfirmKyc = useCallback(async (userId, note) => {
    try {
      await overrideKyc(userId, note);
      setSuccessToast('Identity verification status granted.');
      closeModal();
      refetch();
    } catch (err) {
      setActionErrorToast(err.response?.data?.error?.message || err.message || 'Failed to override KYC.');
    }
  }, [overrideKyc, closeModal, refetch]);

  const initials = useMemo(() => {
    if (!user) return 'U';
    return (user.displayName || user.email || 'U').charAt(0).toUpperCase();
  }, [user]);

  if (isLoading && !user) {
    return (
      <div className="admin-detail-loading">
        <RotateCw size={24} className="spin-icon text-secondary" />
        <p className="font-mono text-xs text-secondary mt-2">Loading trader profile...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="admin-detail-error">
        <AlertCircle size={20} className="text-danger" />
        <h2 className="admin-page-title mt-2">Trader Record Not Found</h2>
        <p className="text-xs text-secondary mb-4">
          {error || 'The requested user profile does not exist or has been deleted.'}
        </p>
        <Link to="/admin/users" className="btn btn--sm btn--secondary">
          ← Return to Trader Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-user-detail-page">
      {/* Navigation Breadcrumb */}
      <nav className="admin-detail-nav">
        <Link to="/admin/users" className="admin-back-link">
          <ArrowLeft size={14} />
          <span>Back to Trader Directory</span>
        </Link>

        <div className="admin-detail-nav-actions">
          <button
            type="button"
            className="btn btn--xs btn--secondary"
            onClick={refetch}
            disabled={isLoading}
            title="Refresh profile"
          >
            <RotateCw size={12} className={isLoading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </nav>

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

      {/* User Hero Banner */}
      <section className="admin-hero-card">
        <div className="admin-hero-main">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="admin-hero-avatar-img" />
          ) : (
            <div className="admin-hero-avatar-initials font-mono">{initials}</div>
          )}

          <div className="admin-hero-meta">
            <div className="admin-hero-badges">
              <span className={`admin-pill admin-pill--role-${user.role}`}>{user.role}</span>
              <span className={`admin-pill admin-pill--status-${user.status}`}>{user.status}</span>
              <span className={`admin-pill admin-pill--kyc-${user.identityStatus}`}>
                KYC: {user.identityStatus}
              </span>
            </div>

            <h1 className="admin-hero-name">{user.displayName || 'Unnamed Trader'}</h1>
            <div className="admin-hero-subinfo font-mono">
              <span>{user.email}</span>
              <span className="text-disabled">·</span>
              <span className="text-secondary" title={user.id}>
                ID: {user.id.slice(0, 8)}...{user.id.slice(-4)}
              </span>
              <span className="text-disabled">·</span>
              <span className="text-secondary">Member since {formatDate(user.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Action Command Bar */}
        <div className="admin-hero-actions">
          {user.status === 'active' && (
            <button
              type="button"
              className="btn btn--sm btn--secondary text-warning"
              onClick={() => setActiveModal('suspend')}
              disabled={isActionLoading}
            >
              <PauseCircle size={14} />
              <span>Suspend Account</span>
            </button>
          )}

          {user.status === 'suspended' && (
            <button
              type="button"
              className="btn btn--sm btn--secondary text-success"
              onClick={() => setActiveModal('reactivate')}
              disabled={isActionLoading}
            >
              <PlayCircle size={14} />
              <span>Reactivate Account</span>
            </button>
          )}

          {user.status !== 'banned' && (
            <button
              type="button"
              className="btn btn--sm btn--destructive"
              onClick={() => setActiveModal('ban')}
              disabled={isActionLoading}
            >
              <ShieldAlert size={14} />
              <span>Ban Account</span>
            </button>
          )}

          {user.identityStatus !== 'verified' && (
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => setActiveModal('kyc')}
              disabled={isActionLoading}
            >
              <ShieldCheck size={14} />
              <span>Override KYC</span>
            </button>
          )}
        </div>
      </section>

      {/* Account Status Grid */}
      <section className="admin-detail-grid">
        <div className="admin-info-card">
          <div className="admin-info-card__header">
            <span className="admin-info-card__label">Account Status</span>
            <span className={`admin-pill admin-pill--status-${user.status}`}>{user.status}</span>
          </div>
          <div className="admin-info-card__desc">
            {user.status === 'active' && 'Account is fully in good standing and can participate in marketplace auctions.'}
            {user.status === 'suspended' && 'Trading privileges temporarily suspended. Active bids/listings held.'}
            {user.status === 'banned' && 'Account permanently terminated. Listings purged.'}
          </div>
        </div>

        <div className="admin-info-card">
          <div className="admin-info-card__header">
            <span className="admin-info-card__label">KYC Verification</span>
            <span className={`admin-pill admin-pill--kyc-${user.identityStatus}`}>{user.identityStatus}</span>
          </div>
          <div className="admin-info-card__desc">
            {user.identityStatus === 'verified' && 'Identity officially verified. Full seller limits unlocked.'}
            {user.identityStatus === 'pending' && 'Government identity documents pending compliance review.'}
            {user.identityStatus === 'unverified' && 'Standard trading privileges. Seller limits apply.'}
            {user.identityStatus === 'rejected' && 'Verification submission rejected due to document mismatch.'}
          </div>
        </div>

        <div className="admin-info-card">
          <div className="admin-info-card__header">
            <span className="admin-info-card__label">Stripe Customer Escrow</span>
            <CreditCard size={16} className={user.hasStripeCustomer ? 'text-success' : 'text-disabled'} />
          </div>
          <div className="admin-info-card__desc font-mono">
            {user.hasStripeCustomer ? 'SetupIntent Vault Configured' : 'No Payment Method Vaulted'}
          </div>
        </div>

        <div className="admin-info-card">
          <div className="admin-info-card__header">
            <span className="admin-info-card__label">Stripe Express Connect</span>
            <Building2 size={16} className={user.hasStripeConnect ? 'text-success' : 'text-disabled'} />
          </div>
          <div className="admin-info-card__desc font-mono">
            {user.hasStripeConnect ? 'Payout Account Linked' : 'Connect Account Not Initialized'}
          </div>
        </div>
      </section>

      {/* Activity History Tabs */}
      <section className="admin-activity-section">
        <div className="admin-tabs-bar">
          <button
            type="button"
            className={`admin-tab-btn${activeTab === 'auctions' ? ' active' : ''}`}
            onClick={() => setActiveTab('auctions')}
          >
            <Flame size={14} />
            <span>Recent Auctions ({recentAuctions.length})</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn${activeTab === 'bids' ? ' active' : ''}`}
            onClick={() => setActiveTab('bids')}
          >
            <Gavel size={14} />
            <span>Recent Bids ({recentBids.length})</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn${activeTab === 'disputes' ? ' active' : ''}`}
            onClick={() => setActiveTab('disputes')}
          >
            <ShieldAlert size={14} />
            <span>Filed Disputes ({recentDisputes.length})</span>
          </button>
        </div>

        {/* Tab 1: Auctions */}
        {activeTab === 'auctions' && (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Auction Title</th>
                  <th>Status</th>
                  <th className="text-right">Current Price</th>
                  <th>Created At</th>
                  <th className="text-right">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {recentAuctions.length > 0 ? (
                  recentAuctions.map((auc) => (
                    <tr key={auc.id} className="admin-table-row">
                      <td className="font-medium">
                        <Link to={`/auctions/${auc.id}`} className="admin-link">
                          {auc.title}
                        </Link>
                      </td>
                      <td>
                        <span className="admin-pill font-mono">{auc.status}</span>
                      </td>
                      <td className="text-right font-mono font-medium">
                        {formatCurrency(auc.current_price)}
                      </td>
                      <td>
                        <span className="font-mono text-secondary">{formatDate(auc.created_at)}</span>
                      </td>
                      <td className="text-right">
                        <Link
                          to={`/auctions/${auc.id}`}
                          className="btn btn--xs btn--secondary"
                          title="View live auction"
                        >
                          <ExternalLink size={12} />
                          <span>View</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-secondary py-4">
                      No auctions published by this trader.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Bids */}
        {activeTab === 'bids' && (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Target Auction</th>
                  <th className="text-right">Bid Amount</th>
                  <th>Placed At</th>
                  <th className="text-right">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {recentBids.length > 0 ? (
                  recentBids.map((bid) => (
                    <tr key={bid.id} className="admin-table-row">
                      <td className="font-medium">
                        <Link to={`/auctions/${bid.auction_id}`} className="admin-link">
                          {bid.auction_title || 'Auction #' + bid.auction_id?.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="text-right font-mono font-semibold">
                        {formatCurrency(bid.amount)}
                      </td>
                      <td>
                        <span className="font-mono text-secondary">{formatDate(bid.created_at)}</span>
                      </td>
                      <td className="text-right">
                        <Link
                          to={`/auctions/${bid.auction_id}`}
                          className="btn btn--xs btn--secondary"
                          title="View auction"
                        >
                          <ExternalLink size={12} />
                          <span>View</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-center text-secondary py-4">
                      No bids submitted by this trader.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Disputes */}
        {activeTab === 'disputes' && (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Dispute ID</th>
                  <th>Reason Category</th>
                  <th>Resolution Status</th>
                  <th>Opened At</th>
                  <th className="text-right">Adjudicate</th>
                </tr>
              </thead>
              <tbody>
                {recentDisputes.length > 0 ? (
                  recentDisputes.map((disp) => (
                    <tr key={disp.id} className="admin-table-row">
                      <td className="font-mono">
                        <Link to={`/admin/disputes/${disp.id}`} className="admin-id-link">
                          #{disp.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>
                        <span className="admin-reason-tag">{disp.reason}</span>
                      </td>
                      <td>
                        <span className="admin-pill font-mono">{disp.status}</span>
                      </td>
                      <td>
                        <span className="font-mono text-secondary">{formatDate(disp.created_at)}</span>
                      </td>
                      <td className="text-right">
                        <Link
                          to={`/admin/disputes/${disp.id}`}
                          className="btn btn--xs btn--secondary"
                          title="Open adjudication room"
                        >
                          <ExternalLink size={12} />
                          <span>Review</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-secondary py-4">
                      No dispute claims filed by this trader.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Action Modals */}
      <BanUserModal
        isOpen={activeModal === 'ban'}
        onClose={closeModal}
        onConfirm={handleConfirmBan}
        user={user}
        isLoading={isActionLoading}
      />

      <SuspendUserModal
        isOpen={activeModal === 'suspend'}
        onClose={closeModal}
        onConfirm={handleConfirmSuspend}
        user={user}
        isLoading={isActionLoading}
      />

      <ReactivateUserModal
        isOpen={activeModal === 'reactivate'}
        onClose={closeModal}
        onConfirm={handleConfirmReactivate}
        user={user}
        isLoading={isActionLoading}
      />

      <KycOverrideModal
        isOpen={activeModal === 'kyc'}
        onClose={closeModal}
        onConfirm={handleConfirmKyc}
        user={user}
        isLoading={isActionLoading}
      />
    </div>
  );
}
