import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldAlert,
  Award,
  TrendingUp,
  PackageCheck,
  DollarSign,
  Flame,
  ArrowLeft,
  PackageOpen,
  History,
  AlertCircle,
} from 'lucide-react';
import { useSellerProfile } from '../hooks/useSellerProfile';
import { AuctionCard } from '../../auctions/components/AuctionCard';
import './SellerProfilePage.css';

function formatJoinedDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return `Member since ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}

function formatVolume(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

export function SellerProfilePage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed'

  const {
    user,
    stats,
    activeAuctions,
    completedAuctions,
    isLoading,
    error,
    refetch,
  } = useSellerProfile(id);

  // Helper for initials
  const initials = useMemo(() => {
    if (!user) return 'S';
    const name = user.displayName || 'Seller';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }, [user]);

  if (isLoading) {
    return (
      <div className="seller-profile-page">
        <div className="seller-profile__skeleton">
          <div className="seller-skeleton-header">
            <div className="seller-skeleton-avatar" />
            <div className="seller-skeleton-lines">
              <div className="seller-skeleton-line title" />
              <div className="seller-skeleton-line subtitle" />
            </div>
          </div>
          <div className="seller-skeleton-stats" />
          <div className="seller-skeleton-grid" />
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="seller-profile-page">
        <div className="seller-profile__error-state">
          <AlertCircle size={36} className="seller-profile__error-icon" />
          <h2>Seller Not Found</h2>
          <p>
            The seller profile you requested could not be found or has been deactivated.
          </p>
          <div className="seller-profile__error-actions">
            <Link to="/auctions" className="btn btn--sm btn--primary">
              <ArrowLeft size={14} />
              <span>Back to Marketplace</span>
            </Link>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={refetch}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isVerified = user.identityStatus === 'verified';
  const displayedAuctions = activeTab === 'active' ? activeAuctions : completedAuctions;

  return (
    <div className="seller-profile-page">
      {/* Top back navigation */}
      <div className="seller-profile__back-bar">
        <Link to="/auctions" className="seller-profile__back-link">
          <ArrowLeft size={14} />
          <span>Marketplace</span>
        </Link>
      </div>

      {/* Seller Header Profile Card */}
      <section className="seller-profile__hero">
        <div className="seller-profile__hero-main">
          <div className="seller-profile__avatar-wrap">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="seller-profile__avatar-img"
              />
            ) : (
              <div className="seller-profile__avatar-fallback">{initials}</div>
            )}
          </div>

          <div className="seller-profile__identity">
            <div className="seller-profile__title-row">
              <h1 className="seller-profile__name">{user.displayName}</h1>
              {isVerified ? (
                <span className="seller-badge seller-badge--verified" title="KYC Identity Verified">
                  <ShieldCheck size={14} />
                  <span>Verified Seller</span>
                </span>
              ) : (
                <span className="seller-badge seller-badge--pending" title="KYC Verification Pending">
                  <ShieldAlert size={14} />
                  <span>Standard Member</span>
                </span>
              )}
            </div>

            <div className="seller-profile__meta-row">
              <span className="seller-profile__joined">
                {formatJoinedDate(user.joinedAt)}
              </span>
              <span className="seller-profile__dot">•</span>
              <span className="seller-profile__role-tag">
                {user.role === 'admin' ? 'Administrator' : 'Merchant'}
              </span>
            </div>
          </div>
        </div>

        {/* Reputation Badge */}
        <div className="seller-profile__hero-aside">
          <div className="seller-reputation-card">
            <div className="seller-reputation-card__icon-wrap">
              <Award size={20} />
            </div>
            <div className="seller-reputation-card__info">
              <span className="seller-reputation-card__score">
                {stats?.reputationScore ?? 100}%
              </span>
              <span className="seller-reputation-card__label">Trust Score</span>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Bar */}
      <section className="seller-profile__metrics-grid">
        <div className="seller-metric-card">
          <div className="seller-metric-card__header">
            <span className="seller-metric-card__label">Fulfillment Rate</span>
            <TrendingUp size={16} className="seller-metric-card__icon text-success" />
          </div>
          <span className="seller-metric-card__value">
            {stats?.completionRate ?? 100}%
          </span>
          <span className="seller-metric-card__subtext">
            Concluded without dispute
          </span>
        </div>

        <div className="seller-metric-card">
          <div className="seller-metric-card__header">
            <span className="seller-metric-card__label">Successful Sales</span>
            <PackageCheck size={16} className="seller-metric-card__icon text-brand" />
          </div>
          <span className="seller-metric-card__value">
            {stats?.completedSales ?? 0}
          </span>
          <span className="seller-metric-card__subtext">
            Completed transactions
          </span>
        </div>

        <div className="seller-metric-card">
          <div className="seller-metric-card__header">
            <span className="seller-metric-card__label">Volume Settled</span>
            <DollarSign size={16} className="seller-metric-card__icon text-success" />
          </div>
          <span className="seller-metric-card__value">
            {formatVolume(stats?.totalSalesVolume ?? 0)}
          </span>
          <span className="seller-metric-card__subtext">
            Total sales processed
          </span>
        </div>

        <div className="seller-metric-card">
          <div className="seller-metric-card__header">
            <span className="seller-metric-card__label">Active Listings</span>
            <Flame size={16} className="seller-metric-card__icon text-warning" />
          </div>
          <span className="seller-metric-card__value">
            {stats?.activeAuctions ?? 0}
          </span>
          <span className="seller-metric-card__subtext">
            Live auctions open
          </span>
        </div>
      </section>

      {/* Listings Section */}
      <section className="seller-profile__listings-section">
        {/* Navigation Tabs */}
        <div className="seller-profile__tabs-bar">
          <div className="seller-profile__tabs">
            <button
              type="button"
              className={`seller-profile__tab${activeTab === 'active' ? ' seller-profile__tab--active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              <Flame size={14} />
              <span>Active Auctions</span>
              <span className="seller-profile__tab-count">
                {activeAuctions.length}
              </span>
            </button>

            <button
              type="button"
              className={`seller-profile__tab${activeTab === 'completed' ? ' seller-profile__tab--active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              <History size={14} />
              <span>Past Sales</span>
              <span className="seller-profile__tab-count">
                {completedAuctions.length}
              </span>
            </button>
          </div>
        </div>

        {/* Listings Grid */}
        <div className="seller-profile__listings-content">
          {displayedAuctions.length > 0 ? (
            <div className="seller-auctions-grid">
              {displayedAuctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          ) : (
            <div className="seller-profile__empty-tab">
              <div className="seller-profile__empty-icon-wrap">
                <PackageOpen size={24} />
              </div>
              <h3 className="seller-profile__empty-title">
                {activeTab === 'active'
                  ? 'No Active Auctions'
                  : 'No Completed Sales'}
              </h3>
              <p className="seller-profile__empty-desc">
                {activeTab === 'active'
                  ? 'This seller does not currently have any active auctions accepting bids.'
                  : 'This seller has not completed any auction sales yet.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
