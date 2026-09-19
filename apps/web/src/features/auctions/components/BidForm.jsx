import { useEffect, useRef } from 'react';
import { useToast } from '../../../core/context/ToastContext';
import './BidForm.css';

/**
 * Bid form with state machine UI.
 * Handles idle/submitting/success/network_error/rejected states.
 */
export function BidForm({
  currentPrice,
  bidIncrement,
  isJoined,
  auctionStatus,
  onJoinClick,
  bidAmount,
  setBidAmount,
  bidState,
  errorCode,
  submitBid,
  resetState,
  isSubmitting,
}) {
  const { showSuccess, showError, showInfo } = useToast();
  const autoResetTimerRef = useRef(null);

  // Auto-reset from success/rejected after 2s
  useEffect(() => {
    if (bidState === 'success' || bidState === 'rejected') {
      autoResetTimerRef.current = setTimeout(() => {
        resetState();
      }, 2000);
    }
    return () => clearTimeout(autoResetTimerRef.current);
  }, [bidState, resetState]);

  // Show toast on state transitions
  useEffect(() => {
    if (bidState === 'success') {
      showSuccess(`Bid $${Number(bidAmount).toFixed(2)} placed successfully!`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidState]);

  // Handle error codes
  useEffect(() => {
    if (bidState !== 'rejected' || !errorCode) return;

    let code = typeof errorCode === 'object' ? errorCode?.code : errorCode;
    const details = typeof errorCode === 'object' ? errorCode?.details : null;

    if (code && typeof code === 'string' && code.startsWith('ERR_')) {
      code = code.replace('ERR_', '');
    }

    switch (code) {
      case 'PAYMENT_REQUIRED':
        showInfo('You need to join this auction first.');
        onJoinClick();
        break;
      case 'SELLER_CANNOT_BID':
        showError('You cannot bid on your own auction.');
        break;
      case 'OUTBID':
      case 'AUCTION_ENDED':
        showError(code === 'OUTBID'
          ? 'Your bid is outdated. Price has been updated.'
          : 'This auction has ended.');
        if (code === 'OUTBID') {
          const actualPrice = details?.currentPrice ?? currentPrice;
          const actualIncrement = details?.bidIncrement ?? bidIncrement;
          setBidAmount(String((actualPrice + actualIncrement) / 100));
        }
        break;
      case 'INVALID_INCREMENT': {
        const actualPrice = details?.currentPrice ?? currentPrice;
        const actualIncrement = details?.bidIncrement ?? bidIncrement;
        showError(`Minimum bid: $${((actualPrice + actualIncrement) / 100).toFixed(2)}`);
        setBidAmount(String((actualPrice + actualIncrement) / 100));
        break;
      }
      case 'RATE_LIMIT_EXCEEDED':
        showError('Too many bids. Please wait a moment.');
        break;
      default:
        showError('Bid rejected. Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidState, errorCode]);

  const minValidAmountCents = currentPrice + bidIncrement;
  const minValidAmountDollars = minValidAmountCents / 100;
  const bidIncrementDollars = bidIncrement / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountInCents = Math.round(Number(bidAmount) * 100);

    if (!amountInCents || amountInCents < minValidAmountCents) {
      showError(`Minimum bid is $${minValidAmountDollars.toFixed(2)}`);
      return;
    }

    if (!isJoined) {
      onJoinClick();
      return;
    }

    try {
      await submitBid(amountInCents);
    } catch {
      // Error handling is done via bidState/errorCode
    }
  };

  const handleRetry = () => {
    submitBid(Math.round(Number(bidAmount) * 100)).catch(() => {});
  };

  const handleCancel = () => {
    resetState();
  };

  const isDisabled = isSubmitting || bidState === 'success' || auctionStatus !== 'active';

  const handleQuickBid = (multiplier) => {
    if (!isJoined) {
      onJoinClick();
      return;
    }
    const newAmountCents = currentPrice + (multiplier * bidIncrement);
    setBidAmount(String(newAmountCents / 100));
  };

  return (
    <div className="bid-form-container">
      {/* Network error banner */}
      {bidState === 'network_error' && (
        <div className="bid-error-banner">
          <p>Could not confirm your bid. Network issue detected.</p>
          <div className="bid-error-actions">
            <button className="btn btn--sm btn--secondary" onClick={handleRetry}>
              Retry
            </button>
            <button className="btn btn--sm btn--secondary" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <form className="bid-form" onSubmit={handleSubmit}>
        <div className="bid-input-wrapper">
          <span className="bid-input-prefix">$</span>
          <input
            id="bid-amount-input"
            type="number"
            className="bid-input"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            disabled={isDisabled}
            min={minValidAmountDollars}
            step={bidIncrementDollars || 1}
            placeholder={String(minValidAmountDollars)}
          />
        </div>

        <button
          id="place-bid-btn"
          type="submit"
          className="btn btn--lg btn--primary bid-submit-btn"
          disabled={isDisabled}
        >
          {isSubmitting
            ? 'Placing bid...'
            : bidState === 'success'
            ? 'Bid placed!'
            : !isJoined
            ? 'Join to Bid'
            : 'Place Bid'}
        </button>
      </form>

      <div className="quick-bid-container">
        <button type="button" className="btn btn--sm btn--secondary" onClick={() => handleQuickBid(1)} disabled={isDisabled}>
          + ${(bidIncrementDollars).toFixed(2)}
        </button>
        <button type="button" className="btn btn--sm btn--secondary" onClick={() => handleQuickBid(2)} disabled={isDisabled}>
          + ${(bidIncrementDollars * 2).toFixed(2)}
        </button>
        <button type="button" className="btn btn--sm btn--secondary" onClick={() => handleQuickBid(5)} disabled={isDisabled}>
          + ${(bidIncrementDollars * 5).toFixed(2)}
        </button>
      </div>

      <p className="bid-form-hint">
        Min bid: ${minValidAmountDollars.toFixed(2)} (current + ${bidIncrementDollars.toFixed(2)} increment)
      </p>
    </div>
  );
}
