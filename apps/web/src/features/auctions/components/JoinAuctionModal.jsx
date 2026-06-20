import { useState, useEffect, useRef, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useJoinAuction } from '../hooks/useJoinAuction';
import { useToast } from '../../../core/context/ToastContext';
import './JoinAuctionModal.css';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

/**
 * Inner form rendered inside Stripe Elements provider.
 * Handles card setup confirmation including 3D Secure.
 */
function JoinForm({ clientSecret, onSuccess, onClose, confirmSetup }) {
  const stripe = useStripe();
  const elements = useElements();
  const { showError } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;

    setIsConfirming(true);

    try {
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });

      if (!isMountedRef.current) return;

      if (result.error) {
        showError(result.error.message || 'Card setup failed. Please try again.');
      } else {
        // Fallback for local testing without webhooks:
        // Tell backend to check SetupIntent status and save payment method.
        if (confirmSetup) {
          await confirmSetup();
        }
        onSuccess();
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      showError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setIsConfirming(false);
      }
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#1C1917',
        '::placeholder': { color: '#A8A29E' },
      },
      invalid: { color: '#DC2626' },
    },
  };

  return (
    <form className="join-form" onSubmit={handleSubmit}>
      <div className="join-card-element-wrapper">
        <CardElement options={cardElementOptions} />
      </div>
      <div className="join-form-actions">
        <button
          type="submit"
          className="btn-primary join-confirm-btn"
          disabled={!stripe || isConfirming}
        >
          {isConfirming ? 'Confirming...' : 'Confirm Card'}
        </button>
        <button
          type="button"
          className="join-cancel-btn"
          onClick={onClose}
          disabled={isConfirming}
        >
          Cancel
        </button>
      </div>
      <p className="join-form-note">
        Your card will be authorized for this auction. No charge will be made until you win.
      </p>
    </form>
  );
}

/**
 * Modal for joining an auction via Stripe SetupIntent.
 * Handles the full flow: request clientSecret → show card form → confirm setup.
 */
export function JoinAuctionModal({ isOpen, onClose, auctionId, onJoinSuccess }) {
  const { showSuccess, showError } = useToast();
  const { joinAuction, confirmSetup, clientSecret, isLoading, error } = useJoinAuction(auctionId);
  const [hasRequested, setHasRequested] = useState(false);

  // Request client secret when modal opens
  useEffect(() => {
    if (isOpen && !hasRequested) {
      setHasRequested(true);
      joinAuction().catch(() => {});
    }
  }, [isOpen, hasRequested, joinAuction]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasRequested(false);
    }
  }, [isOpen]);

  // Close on Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleJoinSuccess = useCallback(() => {
    showSuccess('Card verified! You can now place bids.');
    onJoinSuccess();
  }, [showSuccess, onJoinSuccess]);

  if (!isOpen) return null;

  return (
    <div className="join-modal-backdrop" onClick={handleBackdropClick}>
      <div className="join-modal" role="dialog" aria-modal="true" aria-label="Join Auction">
        <div className="join-modal-header">
          <h2>Join Auction</h2>
          <button className="join-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="join-modal-body">
          <p className="join-modal-description">
            To place bids, you need to verify your payment method. Your card will be authorized
            but <strong>no charge</strong> is made until you win.
          </p>

          {error && (
            <div className="join-modal-error">
              <p>{error.response?.data?.message || 'Failed to initialize payment. Please try again.'}</p>
              <button className="btn-primary" onClick={() => { setHasRequested(false); }}>
                Retry
              </button>
            </div>
          )}

          {isLoading && (
            <div className="join-modal-loading">
              <p>Setting up secure payment...</p>
            </div>
          )}

          {clientSecret && (
            <Elements stripe={stripePromise}>
              <JoinForm
                clientSecret={clientSecret}
                onSuccess={handleJoinSuccess}
                onClose={onClose}
                confirmSetup={confirmSetup}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
