import { loadStripe } from '@stripe/stripe-js';
import { useFetch } from '../../../core/hooks/useFetch';
import { useMutation } from '../../../core/hooks/useMutation';
import { useToast } from '../../../core/context/ToastContext';
import { StatusBadge } from '../../../components/StatusBadge';
import './KycPage.css';

const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const stripePromise = loadStripe(stripePublicKey || '');

// Fail-closed approach for retries. Only exactly matching these allows retry.
const RETRYABLE_MESSAGES = [
  'Giấy tờ đã hết hạn.',
  'Không thể xác minh. Hãy thử ảnh rõ hơn.',
  'Ảnh chân dung không khớp.'
];

export function KycPage() {
  const { data: kycRes, isLoading: isKycLoading, error: kycError, refetch: refetchKyc } = useFetch('/users/me/kyc');
  const kycData = kycRes?.data;

  const { mutate: createIdentity, isLoading: isCreatingIdentity } = useMutation('/users/me/kyc/identity-session');
  const { mutate: createConnect, isLoading: isCreatingConnect } = useMutation('/users/me/kyc/connect-onboarding');

  const { showError } = useToast();

  const handleStartIdentity = async () => {
    try {
      const res = await createIdentity();
      const clientSecret = res.data?.clientSecret;
      if (!clientSecret) throw new Error('No client secret returned from server');

      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe failed to initialize');

      const { error } = await stripe.verifyIdentity(clientSecret);
      
      if (error) {
        showError(error.message || 'Verification failed or was closed.');
      }
    } catch (err) {
      showError(err.response?.data?.error?.message || err.message || 'Failed to start verification.');
    } finally {
      try {
        await refetchKyc();
      } catch {
        // Refetch failure is non-critical; KYC state will sync on next page load
      }
    }
  };

  const handleStartConnect = async () => {
    try {
      // Gửi current URL để backend setup Stripe Connect redirect params
      const res = await createConnect({
        returnUrl: window.location.href,
        refreshUrl: window.location.href
      });
      
      const url = res.data?.url;
      if (!url) throw new Error('No onboarding URL returned from server');

      // Redirect sang Stripe hosted onboarding
      window.location.href = url;
    } catch (err) {
      showError(err.response?.data?.error?.message || err.message || 'Failed to start payout setup.');
    }
  };

  if (isKycLoading && !kycData) {
    return (
      <div className="kyc-page">
        <div className="kyc-header">
          <h1>KYC & Seller Verification</h1>
          <p>Complete verification to create auctions and receive payouts.</p>
        </div>
        <div className="kyc-section">
          <div className="kyc-section-header">
            <div className="kyc-skeleton kyc-skeleton-title"></div>
          </div>
          <div className="kyc-section-content">
            <div className="kyc-skeleton kyc-skeleton-text"></div>
            <div className="kyc-skeleton kyc-skeleton-text" style={{ width: '80%' }}></div>
            <div className="kyc-action-bar">
              <div className="kyc-skeleton kyc-skeleton-button"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kycError) {
    return (
      <div className="kyc-page">
        <div className="kyc-header">
          <h1>KYC & Seller Verification</h1>
          <p>Complete verification to create auctions and receive payouts.</p>
        </div>
        <div className="kyc-alert kyc-alert--danger">
          <strong>Error loading KYC status:</strong> {kycError}
          <button className="btn-secondary" onClick={refetchKyc} style={{ marginLeft: 'var(--space-4)' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isValidKycData = kycData && typeof kycData === 'object' && 'identityStatus' in kycData;

  if (!isValidKycData) {
    return (
      <div className="kyc-page">
        <div className="kyc-header">
          <h1>KYC & Seller Verification</h1>
          <p>Complete verification to create auctions and receive payouts.</p>
        </div>
        <div className="kyc-alert kyc-alert--danger">
          <strong>Unable to load KYC data.</strong> The server returned an unexpected response.
          <button className="btn-secondary" onClick={refetchKyc} style={{ marginLeft: 'var(--space-4)' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { 
    identityStatus, 
    identityVerifiedAt, 
    identityRetryCount, 
    identityFailureReason, 
    connectStatus,
    connectOnboardedAt 
  } = kycData;

  // Xử lý fail-closed retry logic
  const isIdentityFailed = identityStatus === 'failed';
  const isRetryable = identityRetryCount < 3 && RETRYABLE_MESSAGES.includes(identityFailureReason);
  const showIdentityContactSupport = isIdentityFailed && !isRetryable;

  return (
    <div className="kyc-page">
      <div className="kyc-header">
        <h1>KYC & Seller Verification</h1>
        <p>Complete verification to create auctions and receive payouts.</p>
      </div>

      {/* Identity Verification Section */}
      <div className="kyc-section">
        <div className="kyc-section-header">
          <h2>1. Identity Verification</h2>
          <StatusBadge type="kyc" status={identityStatus} />
        </div>
        <div className="kyc-section-content">
          <p>We need to verify your identity before you can sell items. This requires a valid ID document and a selfie.</p>
          
          {identityStatus === 'verified' && (
            <div className="kyc-info-row">
              <span className="kyc-info-label">Verified At</span>
              <span className="kyc-info-value">{new Date(identityVerifiedAt).toLocaleString()}</span>
            </div>
          )}

          {identityStatus === 'processing' && (
            <div className="kyc-alert kyc-alert--info">
              Your identity verification is currently under review. This usually takes 1-3 business days.
            </div>
          )}

          {isIdentityFailed && (
            <div className="kyc-alert kyc-alert--danger">
              <strong>Verification Failed:</strong> {identityFailureReason || 'Unknown error'}
            </div>
          )}

          <div className="kyc-action-bar">
            {['not_started', 'pending'].includes(identityStatus) && (
              <button 
                className="btn-primary" 
                onClick={handleStartIdentity}
                disabled={isCreatingIdentity}
              >
                {isCreatingIdentity ? 'Loading...' : identityStatus === 'pending' ? 'Continue Verification' : 'Start Verification'}
              </button>
            )}

            {isIdentityFailed && isRetryable && (
              <button 
                className="btn-primary" 
                onClick={handleStartIdentity}
                disabled={isCreatingIdentity}
              >
                {isCreatingIdentity ? 'Loading...' : 'Retry Verification'}
              </button>
            )}

            {showIdentityContactSupport && (
              <div className="kyc-alert kyc-alert--danger" style={{ width: '100%', marginTop: 0 }}>
                You have reached the maximum number of attempts or your case requires manual review. Please contact support to resolve this issue.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stripe Connect Onboarding Section */}
      {identityStatus === 'verified' && (
        <div className="kyc-section">
          <div className="kyc-section-header">
            <h2>2. Payout Setup</h2>
            <StatusBadge type="kyc" status={connectStatus} />
          </div>
          <div className="kyc-section-content">
            <p>Set up your bank account or debit card to receive payouts when your auctions are successfully completed.</p>
            
            {connectStatus === 'payouts_enabled' && (
              <div className="kyc-info-row">
                <span className="kyc-info-label">Payouts Enabled At</span>
                <span className="kyc-info-value">{new Date(connectOnboardedAt).toLocaleString()}</span>
              </div>
            )}

            {connectStatus === 'payouts_disabled' && (
              <div className="kyc-alert kyc-alert--danger">
                Your payouts have been disabled by Stripe. Please continue setup or contact support.
              </div>
            )}

            <div className="kyc-action-bar">
              {['not_started', 'pending', 'payouts_disabled'].includes(connectStatus) && (
                <button 
                  className="btn-primary" 
                  onClick={handleStartConnect}
                  disabled={isCreatingConnect}
                >
                  {isCreatingConnect ? 'Loading...' : connectStatus === 'not_started' ? 'Set Up Payouts' : 'Continue Setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Notice when identity not verified */}
      {identityStatus !== 'verified' && (
        <div className="kyc-section" style={{ opacity: 0.6 }}>
          <div className="kyc-section-header">
            <h2>2. Payout Setup</h2>
            <span className="kyc-info-label">Locked</span>
          </div>
          <div className="kyc-section-content">
            <p>Please complete Identity Verification first before setting up payouts.</p>
          </div>
        </div>
      )}
    </div>
  );
}
