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
        AWAITING_SHIP: 'status-badge--brand',  // --color-brand
        SHIPPED: 'status-badge--brand',        // --color-brand
        COMPLETED: 'status-badge--success',    // --color-action
        NO_SALE: 'status-badge--disabled',     // --color-text-disabled
        CANCELLED: 'status-badge--disabled',   // --color-text-disabled
      }
    },
    payment: {
      LABELS: {
        AUTHORIZED: 'Authorized',
        CAPTURED: 'Captured',
        TRANSFERRED: 'Transferred',
        REFUNDED: 'Refunded',
        HOLD_FAILED: 'Hold Failed',
        GRACE_PERIOD: 'Grace Period',
        SECOND_CHANCE: 'Second Chance',
        FROZEN: 'Disputed',
        HOLD_PENDING: 'Hold Pending',
        CAPTURE_PENDING: 'Capture Pending',
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
        HOLD_PENDING: 'status-badge--warning', // Extrapolated: in-flight processing
        CAPTURE_PENDING: 'status-badge--warning',// Extrapolated: in-flight processing
        RELEASED: 'status-badge--disabled'     // Extrapolated: terminal inactive
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
