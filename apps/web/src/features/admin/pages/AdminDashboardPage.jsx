import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  Flame,
  ShieldAlert,
  Users,
  Layers,
  ArrowRight,
  RotateCw,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { useAdminStats } from '../hooks/useAdminStats';
import './AdminDashboardPage.css';

const PERIOD_OPTIONS = [
  { value: '1d', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'all', label: 'All Time' },
];

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

export function AdminDashboardPage() {
  const [period, setPeriod] = useState('7d');
  const { overview, topCategories, isLoading, error, refetch } = useAdminStats(period);

  const lastRefreshedTime = useMemo(() => {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  return (
    <div className="admin-dashboard">
      {/* Header bar */}
      <header className="admin-dashboard__header">
        <div>
          <div className="admin-dashboard__badge">CENTRAL COMMAND</div>
          <h1 className="admin-dashboard__title">Platform Analytics & Management</h1>
          <p className="admin-dashboard__subtitle">
            System overview, escrow turnover, active marketplace auctions, and operational queues
          </p>
        </div>

        <div className="admin-dashboard__controls">
          {/* Period selector tabs */}
          <div className="admin-dashboard__period-group" role="group" aria-label="Time period">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`admin-dashboard__period-btn${period === opt.value ? ' admin-dashboard__period-btn--active' : ''}`}
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn--sm btn--secondary admin-dashboard__refresh-btn"
            onClick={refetch}
            disabled={isLoading}
            title="Refresh metrics"
          >
            <RotateCw size={13} className={isLoading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* System Status Banner */}
      <div className="admin-dashboard__status-bar">
        <div className="admin-dashboard__status-item">
          <span className="admin-status-dot online" />
          <span className="admin-dashboard__status-text">Core Services Operational</span>
        </div>
        <div className="admin-dashboard__status-item">
          <Activity size={13} className="text-secondary" />
          <span className="admin-dashboard__status-text">
            Synced at <span className="font-mono">{lastRefreshedTime}</span>
          </span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="admin-dashboard__error-banner">
          <AlertCircle size={16} />
          <span>Failed to load platform metrics: {error}</span>
          <button type="button" className="btn btn--xs btn--secondary" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      {/* 5-Card Metrics Grid */}
      <section className="admin-dashboard__metrics-grid">
        {/* Platform Revenue */}
        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span className="admin-metric-card__label">Platform Net Revenue</span>
            <div className="admin-metric-card__icon-wrap admin-metric-card__icon-wrap--success">
              <DollarSign size={16} />
            </div>
          </div>
          <span className="admin-metric-card__value font-mono">
            {formatCurrency(overview?.platformRevenueCents)}
          </span>
          <span className="admin-metric-card__subtext">
            Settled seller & platform service fees
          </span>
        </div>

        {/* Gross Volume */}
        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span className="admin-metric-card__label">Gross Volume (GMV)</span>
            <div className="admin-metric-card__icon-wrap admin-metric-card__icon-wrap--brand">
              <TrendingUp size={16} />
            </div>
          </div>
          <span className="admin-metric-card__value font-mono">
            {formatCurrency(overview?.totalVolumeCents)}
          </span>
          <span className="admin-metric-card__subtext">
            Total transaction volume across escrow
          </span>
        </div>

        {/* Active Auctions */}
        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span className="admin-metric-card__label">Live Market Auctions</span>
            <div className="admin-metric-card__icon-wrap admin-metric-card__icon-wrap--warning">
              <Flame size={16} />
            </div>
          </div>
          <span className="admin-metric-card__value font-mono">
            {overview?.activeAuctions ?? 0}
          </span>
          <div className="admin-metric-card__footer">
            <span className="admin-metric-card__subtext">
              {overview?.scheduledAuctions ?? 0} scheduled · {overview?.completedAuctions ?? 0} ended
            </span>
            <Link to="/admin/auctions" className="admin-metric-card__action-link">
              <span>Inspect</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Open Disputes */}
        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span className="admin-metric-card__label">Disputes Queue</span>
            <div className="admin-metric-card__icon-wrap admin-metric-card__icon-wrap--danger">
              <ShieldAlert size={16} />
            </div>
          </div>
          <span className="admin-metric-card__value font-mono text-danger">
            {overview?.openDisputes ?? 0}
          </span>
          <div className="admin-metric-card__footer">
            <span className="admin-metric-card__subtext">
              {overview?.resolvedDisputes ?? 0} resolved
            </span>
            <Link to="/admin/disputes" className="admin-metric-card__action-link">
              <span>Arbitrate</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Total Users */}
        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span className="admin-metric-card__label">Registered Traders</span>
            <div className="admin-metric-card__icon-wrap admin-metric-card__icon-wrap--info">
              <Users size={16} />
            </div>
          </div>
          <span className="admin-metric-card__value font-mono">
            {overview?.totalUsers ?? 0}
          </span>
          <div className="admin-metric-card__footer">
            <span className="admin-metric-card__subtext">
              +{overview?.newUsers ?? 0} in {period}
            </span>
            <Link to="/admin/users" className="admin-metric-card__action-link">
              <span>Directory</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </section>

      {/* Operational Command Bar */}
      <section className="admin-dashboard__actions-section">
        <h2 className="admin-section-heading">Operational Command Queues</h2>
        <div className="admin-dashboard__actions-grid">
          <Link to="/admin/disputes" className="admin-action-card">
            <div className="admin-action-card__icon admin-action-card__icon--danger">
              <ShieldAlert size={18} />
            </div>
            <div className="admin-action-card__content">
              <h3 className="admin-action-card__title">Disputes Adjudication</h3>
              <p className="admin-action-card__desc">
                Review evidence packages, enforce SLA timers, and resolve buyer/seller disputes.
              </p>
            </div>
            <ArrowRight size={14} className="admin-action-card__arrow" />
          </Link>

          <Link to="/admin/auctions" className="admin-action-card">
            <div className="admin-action-card__icon admin-action-card__icon--warning">
              <Flame size={18} />
            </div>
            <div className="admin-action-card__content">
              <h3 className="admin-action-card__title">Marketplace Oversight</h3>
              <p className="admin-action-card__desc">
                Monitor bidding orderbooks, inspect items, and execute force cancellations.
              </p>
            </div>
            <ArrowRight size={14} className="admin-action-card__arrow" />
          </Link>

          <Link to="/admin/users" className="admin-action-card">
            <div className="admin-action-card__icon admin-action-card__icon--info">
              <Users size={18} />
            </div>
            <div className="admin-action-card__content">
              <h3 className="admin-action-card__title">Trader Directory & Access</h3>
              <p className="admin-action-card__desc">
                Manage account suspensions, execute manual KYC overrides, and audit traders.
              </p>
            </div>
            <ArrowRight size={14} className="admin-action-card__arrow" />
          </Link>

          <Link to="/admin/categories" className="admin-action-card">
            <div className="admin-action-card__icon admin-action-card__icon--brand">
              <Layers size={18} />
            </div>
            <div className="admin-action-card__content">
              <h3 className="admin-action-card__title">Categories & Taxonomy</h3>
              <p className="admin-action-card__desc">
                Create market categories, manage auction distributions, and execute mergers.
              </p>
            </div>
            <ArrowRight size={14} className="admin-action-card__arrow" />
          </Link>
        </div>
      </section>

      {/* Top Categories Distribution */}
      <section className="admin-dashboard__categories-section">
        <div className="admin-dashboard__section-header">
          <h2 className="admin-section-heading">Top Categories by Volume</h2>
          <Link to="/admin/categories" className="admin-dashboard__view-all-link">
            <span>Manage All Categories</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Slug</th>
                <th className="text-right">Active Listings</th>
                <th className="text-right">Settled Volume</th>
                <th className="text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {topCategories.length > 0 ? (
                topCategories.map((cat) => {
                  const totalVol = overview?.totalVolumeCents || 1;
                  const sharePct = ((cat.volumeCents / totalVol) * 100).toFixed(1);

                  return (
                    <tr key={cat.id}>
                      <td className="font-semibold">{cat.name}</td>
                      <td>
                        <span className="admin-table__tag font-mono">{cat.slug}</span>
                      </td>
                      <td className="text-right font-mono">{cat.auctionCount}</td>
                      <td className="text-right font-mono font-medium">
                        {formatCurrency(cat.volumeCents)}
                      </td>
                      <td className="text-right font-mono text-secondary">
                        {cat.volumeCents > 0 ? `${sharePct}%` : '—'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-secondary py-4">
                    No category volume recorded for this time period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
