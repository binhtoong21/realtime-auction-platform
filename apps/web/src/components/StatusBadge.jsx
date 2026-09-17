import './StatusBadge.css';

/**
 * Reusable StatusBadge component for mapping auction and payment statuses to UI design tokens.
 * Mappings strictly adhere to ui_design.md §8.4 or extrapolated rules for missing states.
 */
export function StatusBadge({ status, type = 'auction', className = '' }) {
  if (!status) return null;

  const normalizedStatus = status.toUpperCase();

  const CONFIG = {
    auction: {
      LABELS: {
        ACTIVE: 'Active',
        SCHEDULED: 'Scheduled',
        ENDED: 'Ended',
        AWAITING_SHIP: 'Awaiting Ship',
        SHIPPED: 'Shipped',
        COMPLETED: 'Completed',
        NO_SALE: 'No Sale',
        CANCELLED: 'Cancelled',
      },
      TOKENS: {
        ACTIVE: 'status-badge--success',       // --color-action, #F0FDF4
        SCHEDULED: 'status-badge--secondary',      // --color-text-secondary
        ENDED: 'status-badge--disabled',       // --color-text-disabled
        AWAITING_SHIP: 'status-badge--warning',  // --color-warning
        SHIPPED: 'status-badge--brand',        // --color-brand
        COMPLETED: 'status-badge--success',    // --color-action
        NO_SALE: 'status-badge--disabled',     // --color-text-disabled
        CANCELLED: 'status-badge--danger',   // --color-danger
      }
    },
    payment: {
      LABELS: {
        AUTHORIZED: 'Authorized',
        CAPTURED: 'Captured',
        TRANSFERRED: 'Paid Out',
        REFUNDED: 'Refunded',
        HOLD_FAILED: 'Payment Failed',
        GRACE_PERIOD: 'Action Needed',
        SECOND_CHANCE: 'Offer Pending',
        FROZEN: 'Disputed',
        HOLD_PENDING: 'Processing',
        CAPTURE_PENDING: 'Processing',
        RELEASED: 'Released'
      },
      TOKENS: {
        AUTHORIZED: 'status-badge--brand',     // Extrapolated: active hold = brand
        CAPTURED: 'status-badge--success',     // Extrapolated: success state
        TRANSFERRED: 'status-badge--success',  // Extrapolated: final success
        REFUNDED: 'status-badge--danger',      // Literal §8.4: danger
        HOLD_FAILED: 'status-badge--danger',   // Extrapolated: error
        GRACE_PERIOD: 'status-badge--warning', // Extrapolated: user action required
        SECOND_CHANCE: 'status-badge--warning',// Extrapolated: warning
        FROZEN: 'status-badge--warning',       // Extrapolated: disputed pattern
        HOLD_PENDING: 'status-badge--secondary', // Extrapolated: in-flight processing
        CAPTURE_PENDING: 'status-badge--secondary',// Extrapolated: in-flight processing
        RELEASED: 'status-badge--disabled'     // Extrapolated: terminal inactive
      }
    },
    kyc: {
      LABELS: {
        NOT_STARTED: 'Not Started',
        PENDING: 'Pending',
        PROCESSING: 'Processing',
        VERIFIED: 'Verified',
        FAILED: 'Failed',
        PAYOUTS_ENABLED: 'Payouts Active',
        PAYOUTS_DISABLED: 'Payouts Disabled'
      },
      TOKENS: {
        NOT_STARTED: 'status-badge--secondary',
        PENDING: 'status-badge--warning',
        PROCESSING: 'status-badge--warning',
        VERIFIED: 'status-badge--success',
        FAILED: 'status-badge--danger',
        PAYOUTS_ENABLED: 'status-badge--success',
        PAYOUTS_DISABLED: 'status-badge--danger'
      }
    },
    dispute: {
      LABELS: {
        OPEN: 'Open',
        UNDER_REVIEW: 'Under Review',
        RESOLVED_BUYER_WINS: 'Resolved',
        RESOLVED_SELLER_WINS: 'Resolved',
        EXPIRED: 'Expired',
        WITHDRAWN: 'Withdrawn',
      },
      TOKENS: {
        OPEN: 'status-badge--warning',
        UNDER_REVIEW: 'status-badge--brand',
        RESOLVED_BUYER_WINS: 'status-badge--disabled',
        RESOLVED_SELLER_WINS: 'status-badge--disabled',
        EXPIRED: 'status-badge--disabled',
        WITHDRAWN: 'status-badge--disabled',
      }
    }
  };

  const domain = CONFIG[type] || CONFIG.auction;
  const label = domain.LABELS[normalizedStatus] || normalizedStatus;
  const tokenClass = domain.TOKENS[normalizedStatus] || 'status-badge--secondary';

  return (
    <span className={`status-badge ${tokenClass} ${className}`}>
      {label}
    </span>
  );
}
