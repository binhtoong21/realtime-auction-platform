import PropTypes from 'prop-types';
import { useSecondChance } from '../hooks/useBuyerActions';
import { useToast } from '../../../core/context/ToastContext';
import { formatCurrency } from '../../../utils/formatters';
import './SecondChanceBanner.css';

export function SecondChanceBanner({
  auctionId,
  auctionTitle,
  offerAmount,
  expiresAt,
  onResolved,
}) {
  const { accept, decline, isAccepting, isDeclining, isLoading } = useSecondChance();
  const { showSuccess, showError } = useToast();

  const handleAccept = async () => {
    try {
      await accept(auctionId);
      showSuccess('Second Chance offer accepted! Order confirmed.');
      if (onResolved) onResolved('accepted');
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to accept offer');
    }
  };

  const handleDecline = async () => {
    try {
      await decline(auctionId);
      showSuccess('Second Chance offer declined.');
      if (onResolved) onResolved('declined');
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to decline offer');
    }
  };

  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="second-chance-banner">
      <div className="second-chance-banner__content">
        <div className="second-chance-banner__header">
          <span className="second-chance-banner__badge">Offer</span>
          <h3 className="second-chance-banner__title">Second Chance Offer Available</h3>
        </div>
        <p className="second-chance-banner__text">
          The original winner was unable to complete payment for <strong>{auctionTitle || 'this item'}</strong>.
          You can purchase it now for your top bid of{' '}
          <span className="second-chance-banner__price">{formatCurrency(offerAmount)}</span>.
        </p>
        {formattedExpiry && (
          <span className="second-chance-banner__expiry">
            Offer expires: {formattedExpiry} (48h window)
          </span>
        )}
      </div>

      <div className="second-chance-banner__actions">
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          onClick={handleDecline}
          disabled={isLoading}
        >
          {isDeclining ? 'Declining...' : 'Decline'}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={handleAccept}
          disabled={isLoading}
        >
          {isAccepting ? 'Processing...' : 'Accept & Pay'}
        </button>
      </div>
    </div>
  );
}

SecondChanceBanner.propTypes = {
  auctionId: PropTypes.string.isRequired,
  auctionTitle: PropTypes.string,
  offerAmount: PropTypes.number.isRequired,
  expiresAt: PropTypes.string,
  onResolved: PropTypes.func,
};
