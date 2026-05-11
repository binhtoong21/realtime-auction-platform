import { pool } from '../config/database.js';
import stripe from '../config/stripe.js';
import { v7 as uuidv7 } from 'uuid';

const IDENTITY_MAX_RETRIES = 3;

const FAILURE_REASONS = {
  document_expired: 'Giấy tờ đã hết hạn.',
  document_unverified_other: 'Không thể xác minh. Hãy thử ảnh rõ hơn.',
  selfie_face_mismatch: 'Ảnh chân dung không khớp.',
  id_number_mismatch: 'Thông tin không khớp. Liên hệ support.',
  selfie_manipulated: 'Ảnh không hợp lệ. Liên hệ support.',
  document_fraudulent: 'Không thể hoàn tất xác minh. Liên hệ support.',
};

const NON_RETRYABLE_REASONS = [
  'id_number_mismatch',
  'selfie_manipulated',
  'document_fraudulent',
];

/**
 * Ensure user has a Stripe Customer ID. Creates one if missing.
 */
const ensureStripeCustomer = async (userId) => {
  const result = await pool.query(
    'SELECT stripe_cus_id, email, display_name FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.errorCode = 'USER_NOT_FOUND';
    throw error;
  }

  const user = result.rows[0];

  if (user.stripe_cus_id) {
    return { ...user, id: userId };
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.display_name || undefined,
    metadata: { user_id: userId },
  });

  await pool.query(
    'UPDATE users SET stripe_cus_id = $1 WHERE id = $2',
    [customer.id, userId]
  );

  return { ...user, id: userId, stripe_cus_id: customer.id };
};

/**
 * Get KYC status for the authenticated user.
 */
const getKycStatus = async (userId) => {
  const result = await pool.query(
    `SELECT identity_status, identity_verified_at, identity_retry_count,
            identity_failure_reason, connect_status, connect_onboarded_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.errorCode = 'USER_NOT_FOUND';
    throw error;
  }

  const user = result.rows[0];

  return {
    identityStatus: user.identity_status,
    identityVerifiedAt: user.identity_verified_at,
    identityRetryCount: user.identity_retry_count,
    identityFailureReason: user.identity_failure_reason,
    connectStatus: user.connect_status,
    connectOnboardedAt: user.connect_onboarded_at,
    canCreateAuction: user.identity_status === 'verified',
    canReceivePayout: user.connect_status === 'payouts_enabled',
  };
};

/**
 * Create or resume a Stripe Identity VerificationSession.
 */
const createIdentitySession = async (userId) => {
  const user = await ensureStripeCustomer(userId);

  const statusResult = await pool.query(
    'SELECT identity_status, identity_retry_count FROM users WHERE id = $1',
    [userId]
  );
  const { identity_status, identity_retry_count } = statusResult.rows[0];

  if (identity_status === 'verified') {
    const error = new Error('Identity already verified');
    error.statusCode = 400;
    error.errorCode = 'IDENTITY_ALREADY_VERIFIED';
    throw error;
  }

  if (identity_status === 'processing') {
    const error = new Error('Identity verification is being reviewed. Please wait.');
    error.statusCode = 400;
    error.errorCode = 'IDENTITY_PROCESSING';
    throw error;
  }

  if (!['not_started', 'failed', 'pending'].includes(identity_status)) {
    const error = new Error('Cannot start identity verification in current state');
    error.statusCode = 400;
    error.errorCode = 'INVALID_KYC_STATE';
    throw error;
  }

  if (identity_status === 'failed' && identity_retry_count >= IDENTITY_MAX_RETRIES) {
    const error = new Error('Maximum retry attempts reached. Please contact support.');
    error.statusCode = 403;
    error.errorCode = 'KYC_RETRY_LIMIT_EXCEEDED';
    throw error;
  }

  const session = await stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: { user_id: userId },
    options: {
      document: {
        require_matching_selfie: true,
      },
    },
  });

  await pool.query(
    `UPDATE users 
     SET stripe_identity_session_id = $1, identity_status = 'pending'
     WHERE id = $2`,
    [session.id, userId]
  );

  return { clientSecret: session.client_secret, sessionId: session.id };
};

/**
 * Create or resume Stripe Connect onboarding.
 */
const createConnectOnboarding = async (userId, { refreshUrl, returnUrl }) => {
  const statusResult = await pool.query(
    'SELECT identity_status, connect_status, stripe_acct_id FROM users WHERE id = $1',
    [userId]
  );

  if (statusResult.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.errorCode = 'USER_NOT_FOUND';
    throw error;
  }

  const user = statusResult.rows[0];

  if (user.identity_status !== 'verified') {
    const error = new Error('Identity must be verified before Connect onboarding');
    error.statusCode = 403;
    error.errorCode = 'KYC_IDENTITY_REQUIRED';
    throw error;
  }

  if (user.connect_status === 'payouts_enabled') {
    const error = new Error('Connect onboarding already completed');
    error.statusCode = 400;
    error.errorCode = 'CONNECT_ALREADY_ONBOARDED';
    throw error;
  }

  let stripeAcctId = user.stripe_acct_id;

  // Create account if not exists (not_started case)
  if (!stripeAcctId) {
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { user_id: userId },
    });
    stripeAcctId = account.id;

    await pool.query(
      `UPDATE users SET stripe_acct_id = $1, connect_status = 'pending' WHERE id = $2`,
      [stripeAcctId, userId]
    );
  } else if (user.connect_status === 'not_started') {
    await pool.query(
      `UPDATE users SET connect_status = 'pending' WHERE id = $1`,
      [userId]
    );
  }
  // For 'pending' or 'payouts_disabled': reuse existing account, create new link

  const accountLink = await stripe.accountLinks.create({
    account: stripeAcctId,
    refresh_url: refreshUrl || `${process.env.FRONTEND_URL}/settings/kyc?refresh=true`,
    return_url: returnUrl || `${process.env.FRONTEND_URL}/settings/kyc?return=true`,
    type: 'account_onboarding',
  });

  return { url: accountLink.url };
};

// ============================================================
// Webhook Handlers
// ============================================================

/**
 * Handle identity.verification_session.verified
 */
const handleIdentityVerified = async (session) => {
  const userId = session.metadata?.user_id;
  if (!userId) return;

  await pool.query(
    `UPDATE users 
     SET identity_status = 'verified', 
         identity_verified_at = NOW(),
         identity_failure_reason = NULL
     WHERE id = $1 AND identity_status IN ('pending', 'processing')`,
    [userId]
  );
};

/**
 * Handle identity.verification_session.requires_input (failed)
 */
const handleIdentityFailed = async (session) => {
  const userId = session.metadata?.user_id;
  if (!userId) return;

  const lastError = session.last_error;
  const reason = lastError?.code || 'unknown';
  const displayReason = FAILURE_REASONS[reason] || 'Xác minh thất bại. Vui lòng thử lại.';

  const isNonRetryable = NON_RETRYABLE_REASONS.includes(reason);

  await pool.query(
    `UPDATE users 
     SET identity_status = 'failed',
         identity_failure_reason = $1,
         identity_retry_count = identity_retry_count + 1
     WHERE id = $2 AND identity_status IN ('pending', 'processing')`,
    [displayReason, userId]
  );

  // Alert admin for fraudulent documents
  if (reason === 'document_fraudulent') {
    console.warn(`[KYC ALERT] Possible fraudulent document for user ${userId}`);
  }

  return { isNonRetryable };
};

/**
 * Handle identity.verification_session.processing
 */
const handleIdentityProcessing = async (session) => {
  const userId = session.metadata?.user_id;
  if (!userId) return;

  await pool.query(
    `UPDATE users 
     SET identity_status = 'processing'
     WHERE id = $1 AND identity_status = 'pending'`,
    [userId]
  );
};

/**
 * Handle identity.verification_session.canceled
 */
const handleIdentityCanceled = async (session) => {
  const userId = session.metadata?.user_id;
  if (!userId) return;

  // Only reset if currently pending (not if processing/verified)
  await pool.query(
    `UPDATE users 
     SET identity_status = 'not_started',
         stripe_identity_session_id = NULL
     WHERE id = $1 AND identity_status = 'pending'`,
    [userId]
  );
};

/**
 * Handle account.updated (Stripe Connect)
 */
const handleConnectAccountUpdated = async (account) => {
  const stripeAcctId = account.id;

  const result = await pool.query(
    'SELECT id, connect_status FROM users WHERE stripe_acct_id = $1',
    [stripeAcctId]
  );

  if (result.rows.length === 0) return;

  const user = result.rows[0];
  const { payouts_enabled, charges_enabled, details_submitted } = account;

  let newStatus;
  if (payouts_enabled && charges_enabled && details_submitted) {
    newStatus = 'payouts_enabled';
  } else {
    newStatus = user.connect_status === 'not_started' ? 'pending' : 'payouts_disabled';
  }

  // Only update if status changed
  if (newStatus === user.connect_status) return;

  const updates = ['connect_status = $1'];
  const values = [newStatus, user.id];

  if (newStatus === 'payouts_enabled') {
    updates.push('connect_onboarded_at = NOW()');
  }

  await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $2`,
    values
  );

  // Alert if disabled after being enabled
  if (newStatus === 'payouts_disabled' && user.connect_status === 'payouts_enabled') {
    console.warn(`[CONNECT ALERT] Payouts disabled for user ${user.id} (account: ${stripeAcctId})`);
  }
};

/**
 * Handle setup_intent.succeeded
 * Updates auction_participants with confirmed payment method.
 */
const handleSetupIntentSucceeded = async (setupIntent) => {
  const { auction_id, user_id } = setupIntent.metadata || {};
  if (!auction_id || !user_id) return;

  const pmId = setupIntent.payment_method;
  if (!pmId) return;

  // Retrieve payment method details from Stripe
  const pm = await stripe.paymentMethods.retrieve(pmId);
  const card = pm.card || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert into payment_methods
    const pmResult = await client.query(
      `INSERT INTO payment_methods (id, user_id, stripe_pm_id, last4, brand, is_default, expires_at)
       VALUES ($1, $2, $3, $4, $5, false, $6)
       ON CONFLICT (stripe_pm_id) DO UPDATE SET last4 = $4, brand = $5
       RETURNING id`,
      [
        uuidv7(),
        user_id,
        pmId,
        card.last4 || '****',
        card.brand || 'unknown',
        card.exp_month && card.exp_year
          ? new Date(card.exp_year, card.exp_month, 0)
          : null,
      ]
    );

    const paymentMethodId = pmResult.rows[0].id;

    // Set as default if user has no other default
    await client.query(
      `UPDATE payment_methods SET is_default = true 
       WHERE id = $1 AND NOT EXISTS (
         SELECT 1 FROM payment_methods 
         WHERE user_id = $2 AND is_default = true AND id != $1
       )`,
      [paymentMethodId, user_id]
    );

    // Update auction_participants
    await client.query(
      `UPDATE auction_participants 
       SET payment_method_id = $1
       WHERE auction_id = $2 AND user_id = $3`,
      [paymentMethodId, auction_id, user_id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export {
  ensureStripeCustomer,
  getKycStatus,
  createIdentitySession,
  createConnectOnboarding,
  handleIdentityVerified,
  handleIdentityFailed,
  handleIdentityProcessing,
  handleIdentityCanceled,
  handleConnectAccountUpdated,
  handleSetupIntentSucceeded,
};
