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
        ACTIVE: 'Đang diễn ra',
        DRAFT: 'Bản nháp',
        ENDED: 'Đã kết thúc',
        AWAITING_SHIP: 'Chờ giao hàng',
        SHIPPED: 'Đang giao hàng',
        COMPLETED: 'Hoàn thành',
        NO_SALE: 'Không bán được',
        CANCELLED: 'Đã hủy',
      },
      TOKENS: {
        ACTIVE: 'status-badge--success',       // --color-action, #F0FDF4
        DRAFT: 'status-badge--secondary',      // --color-text-secondary
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
        AUTHORIZED: 'Đang giữ tiền',
        CAPTURED: 'Đã thanh toán',
        TRANSFERRED: 'Đã chuyển tiền',
        REFUNDED: 'Đã hoàn tiền',
        HOLD_FAILED: 'Giữ tiền thất bại',
        GRACE_PERIOD: 'Chờ thanh toán lại',
        SECOND_CHANCE: 'Chờ người hạng 2',
        FROZEN: 'Đang tranh chấp',
        HOLD_PENDING: 'Đang xử lý',
        CAPTURE_PENDING: 'Đang xử lý',
        RELEASED: 'Đã giải phóng'
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
