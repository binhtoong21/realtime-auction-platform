import { useState, useRef, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useFetch } from '../../../core/hooks/useFetch';
import { useMutation } from '../../../core/hooks/useMutation';
import { useToast } from '../../../core/context/ToastContext';
import './PaymentMethodsPage.css';

const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const stripePromise = loadStripe(stripePublicKey || '');

/**
 * Inline form component for adding a new card
 */
function AddCardForm({ onCancel, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const { showError, showSuccess } = useToast();
  
  const [isConfirming, setIsConfirming] = useState(false);
  const { mutate: createSetupIntent, isLoading: isCreatingIntent } = useMutation('/payment-methods');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    try {
      // 1. Lấy clientSecret từ backend
      const res = await createSetupIntent();
      const clientSecret = res.data?.clientSecret;
      if (!clientSecret) throw new Error('No client secret returned');

      setIsConfirming(true);

      // 2. Xác thực card với Stripe (hỗ trợ 3D Secure tự động)
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });

      if (!isMountedRef.current) return;

      if (result.error) {
        showError(result.error.message || 'Card setup failed.');
      } else {
        // Stripe webhook handleSetupIntentSucceeded sẽ update DB
        showSuccess('Card added successfully!');
        onSuccess();
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err.response?.data?.error?.errorCode === 'MAX_PAYMENT_METHODS_REACHED') {
         showError('You have reached the maximum limit of 5 cards.');
      } else {
         showError(err.response?.data?.error?.message || err.message || 'Failed to add card');
      }
    } finally {
      if (isMountedRef.current) {
        setIsConfirming(false);
      }
    }
  };

  const getCSSVariable = (name) => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: getCSSVariable('--color-text-primary'),
        '::placeholder': { color: getCSSVariable('--color-text-secondary') },
      },
      invalid: { color: getCSSVariable('--color-danger') },
    },
  };

  return (
    <div className="add-card-section">
      <div className="add-card-header">
        <h2>Add New Card</h2>
      </div>
      <form onSubmit={handleSubmit} className="add-card-form">
        <div className="stripe-element-container">
          <CardElement options={cardElementOptions} />
        </div>
        <div className="form-actions">
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={onCancel}
            disabled={isConfirming || isCreatingIntent}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn-primary"
            disabled={!stripe || isConfirming || isCreatingIntent}
          >
            {isConfirming || isCreatingIntent ? 'Processing...' : 'Save Card'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function PaymentMethodsPage() {
  const { data: cardsRes, isLoading, error, refetch } = useFetch('/payment-methods');
  const cards = cardsRes?.data || [];
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);

  const { showError, showSuccess, showInfo } = useToast();
  
  // Dynamic URL mutations
  const { mutate: mutateCard } = useMutation(null);

  const pollTimersRef = useRef([]);
  const prevCardCountRef = useRef(cards.length);

  // Track card count for polling comparison
  useEffect(() => {
    prevCardCountRef.current = cards.length;
  }, [cards.length]);

  // Cleanup polling timers on unmount
  useEffect(() => {
    return () => {
      pollTimersRef.current.forEach(clearTimeout);
      pollTimersRef.current = [];
    };
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to remove this card?')) return;
    
    setActionInProgressId(id);
    try {
      const res = await mutateCard({}, { 
        url: `/payment-methods/${id}`, 
        method: 'delete' 
      });
      
      showSuccess('Card removed successfully');
      
      // Xử lý warning "Last card deleted"
      if (res.data?.warning) {
        showInfo(res.data.warning);
      }
      
      refetch();
    } catch (err) {
      if (err.response?.data?.error?.errorCode === 'PAYMENT_METHOD_IN_USE') {
        showError('This card is currently in use for an active transaction/hold.');
      } else {
        showError(err.response?.data?.error?.message || 'Failed to remove card');
      }
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleSetDefault = async (id) => {
    setActionInProgressId(id);
    try {
      await mutateCard({}, { 
        url: `/payment-methods/${id}/default`, 
        method: 'patch' 
      });
      
      showSuccess('Default card updated');
      refetch();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to set default card');
    } finally {
      setActionInProgressId(null);
    }
  };


  const handleAddSuccess = () => {
    setShowAddForm(false);
    const expectedCount = prevCardCountRef.current;
    let attempt = 0;
    const maxAttempts = 5;
    const intervalMs = 1500;

    const poll = async () => {
      attempt++;
      try {
        const res = await refetch();
        const newCards = res?.data?.data;
        if (Array.isArray(newCards) && newCards.length > expectedCount) return;
      } catch {
        // Non-critical: will retry on next poll
      }
      if (attempt < maxAttempts) {
        const timerId = setTimeout(poll, intervalMs);
        pollTimersRef.current.push(timerId);
      }
    };

    const timerId = setTimeout(poll, intervalMs);
    pollTimersRef.current.push(timerId);
  };

  if (isLoading && !cardsRes) {
    return (
      <div className="payment-methods-page">
        <div className="payment-methods-header">
          <h1>Cards & Payment Methods</h1>
          <p>Manage your linked credit cards and billing information.</p>
        </div>
        <div className="payment-methods-content">
          <div className="card-list">
            <div className="pm-skeleton pm-skeleton-card"></div>
            <div className="pm-skeleton pm-skeleton-card"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="payment-methods-page">
        <div className="payment-methods-header">
          <h1>Cards & Payment Methods</h1>
          <p>Manage your linked credit cards and billing information.</p>
        </div>
        <div className="empty-state" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
          <strong>Error loading cards:</strong> {error}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn-secondary" onClick={refetch}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const hasMaxCards = cards.length >= 5;

  return (
    <div className="payment-methods-page">
      <div className="payment-methods-header">
        <h1>Cards & Payment Methods</h1>
        <p>Manage your linked credit cards and billing information. (Max 5 cards)</p>
      </div>

      <div className="payment-methods-content">
        {!showAddForm && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {!hasMaxCards ? (
              <button className="btn-primary" onClick={() => setShowAddForm(true)}>
                + Add New Card
              </button>
            ) : (
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Maximum 5 cards limit reached.
              </span>
            )}
          </div>
        )}

        {showAddForm && !hasMaxCards && (
          <Elements stripe={stripePromise}>
            <AddCardForm 
              onCancel={() => setShowAddForm(false)} 
              onSuccess={handleAddSuccess} 
            />
          </Elements>
        )}

        {cards.length === 0 ? (
          <div className="empty-state">
            <p>You have no saved cards.</p>
            {!showAddForm && (
              <button className="btn-secondary" onClick={() => setShowAddForm(true)} style={{ marginTop: 'var(--space-4)' }}>
                Add a Card
              </button>
            )}
          </div>
        ) : (
          <div className="card-list">
            {cards.map(card => {
              const isAnyActionInProgress = actionInProgressId !== null;
              
              return (
                <div key={card.id} className={`payment-card ${card.isDefault ? 'is-default' : ''}`}>
                  <div className="card-header">
                    <span className="card-brand">{card.brand}</span>
                    {card.isDefault && <span className="default-badge">Default</span>}
                  </div>
                  
                  <div className="card-details">
                    <span className="card-number">**** **** **** {card.last4}</span>
                    <span className="card-expiry">Expires {new Date(card.expiresAt).toLocaleDateString(undefined, { month: '2-digit', year: '2-digit' })}</span>
                  </div>
                  
                  <div className="card-actions">
                    {!card.isDefault ? (
                      <button 
                        className="card-action-btn btn-set-default"
                        onClick={() => handleSetDefault(card.id)}
                        disabled={isAnyActionInProgress}
                      >
                        Set as Default
                      </button>
                    ) : (
                      <span></span>
                    )}
                    
                    <button 
                      className="card-action-btn btn-delete"
                      onClick={() => handleDelete(card.id)}
                      disabled={isAnyActionInProgress}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
