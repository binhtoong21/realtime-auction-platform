import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  AlertTriangle,
  Trophy,
  Truck,
  ShieldAlert,
  DollarSign,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../../../core/context/AuthContext';
import { useToast } from '../../../core/context/ToastContext';
import './NotificationCenterPage.css';

/**
 * Format timestamp into relative human-readable string
 */
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get visual icon and badge class for each notification type
 */
function getNotificationMeta(type) {
  switch (type) {
    case 'bid:outbid':
      return {
        icon: AlertTriangle,
        variant: 'warning',
        label: 'Outbid',
      };
    case 'auction:won':
      return {
        icon: Trophy,
        variant: 'success',
        label: 'Auction Won',
      };
    case 'auction:shipped':
    case 'shipping:update':
      return {
        icon: Truck,
        variant: 'info',
        label: 'Shipping',
      };
    case 'dispute:opened':
    case 'dispute:resolved':
      return {
        icon: ShieldAlert,
        variant: 'danger',
        label: 'Dispute',
      };
    case 'payment:success':
    case 'payout:released':
      return {
        icon: DollarSign,
        variant: 'success',
        label: 'Payment',
      };
    default:
      return {
        icon: Bell,
        variant: 'brand',
        label: 'Alert',
      };
  }
}

export function NotificationCenterPage() {
  const user = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState(new Set());

  const {
    notifications,
    unreadCount,
    meta,
    isLoading,
    error,
    refetch,
    loadMore,
    markAsRead,
    markAllAsRead,
  } = useNotifications({
    limit: 20,
    unreadOnly: activeTab === 'unread',
  });

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
      showSuccess('All notifications marked as read');
    } catch {
      showError('Failed to mark all notifications as read');
    } finally {
      setIsMarkingAll(false);
    }
  }, [unreadCount, isMarkingAll, markAllAsRead, showSuccess, showError]);

  const handleMarkSingleRead = useCallback(
    async (id, e) => {
      if (e) e.stopPropagation();
      if (markingIds.has(id)) return;

      setMarkingIds((prev) => new Set(prev).add(id));
      try {
        await markAsRead(id);
      } catch {
        showError('Failed to mark notification as read');
      } finally {
        setMarkingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [markingIds, markAsRead, showError]
  );

  const handleNotificationClick = useCallback(
    async (item) => {
      if (!item.isRead) {
        handleMarkSingleRead(item.id);
      }

      if (item.referenceType === 'auction' && item.referenceId) {
        navigate(`/auctions/${item.referenceId}`);
      } else if (
        (item.referenceType === 'tracking' || item.referenceType === 'fulfillment') &&
        item.referenceId
      ) {
        navigate(`/auctions/${item.referenceId}/tracking`);
      } else if (item.referenceType === 'dispute' && item.referenceId) {
        if (user?.role === 'admin') {
          navigate(`/admin/disputes/${item.referenceId}`);
        } else {
          navigate('/dashboard/payments');
        }
      } else if (item.referenceType === 'payment') {
        navigate('/dashboard/payments');
      } else if (item.referenceType === 'bid') {
        navigate('/dashboard/bids');
      }
    },
    [handleMarkSingleRead, navigate, user?.role]
  );

  const displayList = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [activeTab, notifications]);

  return (
    <div className="notification-center">
      {/* Header bar */}
      <header className="notification-center__header">
        <div>
          <h1 className="notification-center__title">Notifications</h1>
          <p className="notification-center__subtitle">
            Real-time activity and alerts for your bids, auctions, and settlements
          </p>
        </div>

        <div className="notification-center__header-actions">
          <button
            type="button"
            className="btn btn--sm btn--secondary notification-center__action-btn"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0 || isMarkingAll}
            title="Mark all notifications as read"
          >
            {isMarkingAll ? (
              <Loader2 size={14} className="spin-icon" />
            ) : (
              <CheckCheck size={14} />
            )}
            <span>Mark all read</span>
          </button>
        </div>
      </header>

      {/* Tabs bar */}
      <div className="notification-center__tabs-bar">
        <div className="notification-center__tabs">
          <button
            type="button"
            className={`notification-center__tab${activeTab === 'all' ? ' notification-center__tab--active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`notification-center__tab${activeTab === 'unread' ? ' notification-center__tab--active' : ''}`}
            onClick={() => setActiveTab('unread')}
          >
            Unread
            {unreadCount > 0 && (
              <span className="notification-center__tab-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="notification-center__meta-summary">
          <span className="notification-center__meta-count">
            {unreadCount} unread
          </span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="notification-center__error">
          <span>Failed to load notifications: {error}</span>
          <button
            type="button"
            className="btn btn--xs btn--secondary"
            onClick={refetch}
          >
            Retry
          </button>
        </div>
      )}

      {/* Notification items list */}
      <div className="notification-center__list">
        {displayList.length === 0 && !isLoading && (
          <div className="notification-center__empty">
            <div className="notification-center__empty-icon-wrap">
              {activeTab === 'unread' ? (
                <Check className="notification-center__empty-icon" />
              ) : (
                <BellOff className="notification-center__empty-icon" />
              )}
            </div>
            <h3 className="notification-center__empty-title">
              {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </h3>
            <p className="notification-center__empty-desc">
              {activeTab === 'unread'
                ? "You're all caught up! New updates on your bids and auctions will appear here."
                : 'Activity regarding your bids, won items, and shipments will appear here.'}
            </p>
          </div>
        )}

        {displayList.map((item) => {
          const metaInfo = getNotificationMeta(item.type);
          const IconComponent = metaInfo.icon;
          const isItemMarking = markingIds.has(item.id);
          const isNavigable = Boolean(item.referenceId);

          return (
            <div
              key={item.id}
              className={`notification-item${!item.isRead ? ' notification-item--unread' : ''}${isNavigable ? ' notification-item--clickable' : ''}`}
              onClick={() => handleNotificationClick(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNotificationClick(item);
                }
              }}
            >
              <div
                className={`notification-item__icon notification-item__icon--${metaInfo.variant}`}
              >
                <IconComponent size={16} />
              </div>

              <div className="notification-item__content">
                <div className="notification-item__top">
                  <span className="notification-item__title">{item.title}</span>
                  <span className="notification-item__time">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>

                <p className="notification-item__message">{item.message}</p>

                {item.payload && item.payload.amount && (
                  <div className="notification-item__payload">
                    Amount:{' '}
                    <span className="notification-item__amount">
                      ${(Number(item.payload.amount) / 100).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="notification-item__actions">
                {!item.isRead && (
                  <button
                    type="button"
                    className="notification-item__btn-read"
                    onClick={(e) => handleMarkSingleRead(item.id, e)}
                    disabled={isItemMarking}
                    title="Mark as read"
                    aria-label="Mark as read"
                  >
                    {isItemMarking ? (
                      <Loader2 size={14} className="spin-icon" />
                    ) : (
                      <Check size={14} />
                    )}
                  </button>
                )}
                {isNavigable && (
                  <span className="notification-item__link-indicator">
                    <ExternalLink size={13} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Load More */}
      {meta.hasMore && (
        <div className="notification-center__pagination">
          <button
            type="button"
            className="btn btn--secondary notification-center__load-more-btn"
            onClick={loadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="spin-icon" />
                <span>Loading more...</span>
              </>
            ) : (
              <span>Load More Notifications</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
