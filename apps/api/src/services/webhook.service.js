import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { writeAuditLog } from './payment.service.js';
import { emitToUser, emitToAdmin } from './socket.service.js';
import { paymentQueue } from '../jobs/queue.js';
import {
  handleIdentityVerified,
  handleIdentityFailed,
  handleIdentityProcessing,
  handleIdentityCanceled,
  handleConnectAccountUpdated,
  handleSetupIntentSucceeded,
} from './kyc.service.js';

/**
 * Central dispatcher for all Stripe webhook events.
 *
 * Accepts the full Stripe event object and routes to the appropriate handler.
 * Returns silently for unknown event types (route marks them as 'completed').
 *
 * @param {Object} stripeEvent - Full Stripe event: { id, type, data: { object } }
 */
export const processWebhookEvent = async (stripeEvent) => {
  const { type, data } = stripeEvent;
  const obj = data.object;

  switch (type) {
    // --- KYC / Identity handlers (existing from Phase 9.2) ---
    case 'identity.verification_session.verified':
      await handleIdentityVerified(obj);
      break;
    case 'identity.verification_session.requires_input':
      await handleIdentityFailed(obj);
      break;
    case 'identity.verification_session.processing':
      await handleIdentityProcessing(obj);
      break;
    case 'identity.verification_session.canceled':
      await handleIdentityCanceled(obj);
      break;
    case 'account.updated':
      await handleConnectAccountUpdated(obj);
      break;
    case 'setup_intent.succeeded':
      await handleSetupIntentSucceeded(obj);
      break;

    // --- Payment lifecycle handlers ---
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(obj);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(obj);
      break;
    case 'payment_intent.canceled':
      await handlePaymentIntentCanceled(obj);
      break;
    case 'charge.dispute.created':
      await handleChargeDisputeCreated(obj);
      break;

    default:
      // Unknown event type — not an error, just not handled by this system
      break;
  }
};

// ============================================================
// Payment Lifecycle Webhook Handlers
// ============================================================

// Terminal/post-failure states where payment_failed webhook should skip
const PAYMENT_FAILED_SKIP_STATES = [
  'grace_period', 'hold_failed', 'second_chance', 'no_sale',
  'authorized', 'captured', 'released', 'refunded',
];

// Terminal states where payment_canceled webhook should skip
const PAYMENT_TERMINAL_STATES = [
  'captured', 'refunded', 'no_sale', 'released',
];

/**
 * Handle payment_intent.succeeded — Stripe confirms capture was successful.
 *
 * State Guard accepts: authorized, capture_pending
 * capture_pending covers crash recovery for emergency capture worker.
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const stripepiId = paymentIntent.id;

  // Lookup payment
  const lookupResult = await pool.query(
    `SELECT id, status, buyer_id, seller_id, amount, auction_id
     FROM payments WHERE stripe_pi_id = $1`,
    [stripepiId]
  );

  if (lookupResult.rows.length === 0) {
    console.warn(`[Webhook] payment_intent.succeeded: No payment found for PI ${stripepiId}`);
    return;
  }

  const payment = lookupResult.rows[0];

  // Skip if already captured (idempotent)
  if (payment.status === 'captured') {
    console.log(`[Webhook] payment_intent.succeeded: Payment ${payment.id} already captured. Skipping.`);
    return;
  }

  // State Guard: only transition from authorized or capture_pending
  const guardResult = await pool.query(
    `UPDATE payments SET status = 'captured', updated_at = NOW()
     WHERE stripe_pi_id = $1 AND status IN ('authorized', 'capture_pending')
     RETURNING id`,
    [stripepiId]
  );

  if (guardResult.rowCount === 0) {
    const error = new Error(
      `State guard blocked: payment ${payment.id} is '${payment.status}', expected authorized/capture_pending`
    );
    error.code = 'STATE_GUARD_FAILED';
    throw error;
  }

  await writeAuditLog({
    referenceId: payment.id,
    referenceType: 'payment',
    action: 'payment_captured_via_webhook',
    deltaState: {
      stripe_pi_id: stripepiId,
      amount: Number(payment.amount),
      from_status: payment.status,
    },
    actorId: null,
  });

  console.log(`[Webhook] payment_intent.succeeded: Payment ${payment.id} captured via webhook.`);
}

/**
 * Handle payment_intent.payment_failed — Stripe confirms PI failed.
 *
 * This is primarily a safety net for crash recovery. In normal flow,
 * createAuthHold() and retryPayment() handle failures synchronously.
 */
async function handlePaymentIntentFailed(paymentIntent) {
  const stripepiId = paymentIntent.id;

  // Lookup payment
  const lookupResult = await pool.query(
    `SELECT id, status, buyer_id, auction_id
     FROM payments WHERE stripe_pi_id = $1`,
    [stripepiId]
  );

  if (lookupResult.rows.length === 0) {
    // PI may not be saved to DB yet (e.g., retry attempt where PI was created
    // but server crashed before storing stripe_pi_id)
    console.warn(`[Webhook] payment_intent.payment_failed: No payment found for PI ${stripepiId}`);
    return;
  }

  const payment = lookupResult.rows[0];

  // If sync flow already handled this (moved past hold_pending), skip gracefully
  if (PAYMENT_FAILED_SKIP_STATES.includes(payment.status)) {
    console.log(
      `[Webhook] payment_intent.payment_failed: Payment ${payment.id} already at '${payment.status}'. Sync flow handled. Skipping.`
    );
    return;
  }

  // State Guard: only transition from hold_pending
  const guardResult = await pool.query(
    `UPDATE payments SET status = 'hold_failed', updated_at = NOW()
     WHERE stripe_pi_id = $1 AND status = 'hold_pending'
     RETURNING id`,
    [stripepiId]
  );

  if (guardResult.rowCount === 0) {
    // Rare race: status changed between lookup and guard
    const error = new Error(
      `State guard blocked: payment ${payment.id} is '${payment.status}', expected hold_pending`
    );
    error.code = 'STATE_GUARD_FAILED';
    throw error;
  }

  await writeAuditLog({
    referenceId: payment.id,
    referenceType: 'payment',
    action: 'hold_failed_via_webhook',
    deltaState: {
      stripe_pi_id: stripepiId,
      error: paymentIntent.last_payment_error?.message || 'unknown',
      decline_code: paymentIntent.last_payment_error?.decline_code || null,
    },
    actorId: null,
  });

  console.log(`[Webhook] payment_intent.payment_failed: Payment ${payment.id} marked hold_failed via webhook.`);
}

/**
 * Handle payment_intent.canceled — Stripe confirms PI was canceled.
 *
 * Occurs when: (a) auth hold expires after 7 days, (b) code calls cancel() explicitly.
 */
async function handlePaymentIntentCanceled(paymentIntent) {
  const stripepiId = paymentIntent.id;

  // Lookup payment
  const lookupResult = await pool.query(
    `SELECT id, status, auction_id, buyer_id, seller_id
     FROM payments WHERE stripe_pi_id = $1`,
    [stripepiId]
  );

  if (lookupResult.rows.length === 0) {
    console.warn(`[Webhook] payment_intent.canceled: No payment found for PI ${stripepiId}`);
    return;
  }

  const payment = lookupResult.rows[0];

  // Skip if already at terminal state
  if (PAYMENT_TERMINAL_STATES.includes(payment.status)) {
    console.log(
      `[Webhook] payment_intent.canceled: Payment ${payment.id} already at '${payment.status}'. Skipping.`
    );
    return;
  }

  // Use a transaction so payments + auctions updates are atomic
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // State Guard: only transition from authorized or capture_pending
    const guardResult = await client.query(
      `UPDATE payments SET status = 'released', updated_at = NOW()
       WHERE stripe_pi_id = $1 AND status IN ('authorized', 'capture_pending')
       RETURNING id, auction_id, buyer_id, seller_id`,
      [stripepiId]
    );

    if (guardResult.rowCount === 0) {
      await client.query('ROLLBACK');
      const error = new Error(
        `State guard blocked: payment ${payment.id} is '${payment.status}', expected authorized/capture_pending`
      );
      error.code = 'STATE_GUARD_FAILED';
      throw error;
    }

    // Auction State Guard (defense-in-depth): don't overwrite second_chance
    await client.query(
      `UPDATE auctions SET status = 'no_sale', updated_at = NOW()
       WHERE id = $1 AND status IN ('awaiting_ship', 'pending_payment')`,
      [payment.auction_id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await writeAuditLog({
    referenceId: payment.id,
    referenceType: 'payment',
    action: 'payment_released',
    deltaState: {
      stripe_pi_id: stripepiId,
      cancellation_reason: paymentIntent.cancellation_reason || 'unknown',
    },
    actorId: null,
  });

  // Notify buyer and seller
  try {
    await emitToUser(payment.buyer_id, 'payment:released', {
      auctionId: payment.auction_id,
      paymentId: payment.id,
      message: 'Payment authorization has been released.',
    });

    await emitToUser(payment.seller_id, 'auction:no-sale', {
      auctionId: payment.auction_id,
      message: 'Payment authorization expired. The auction ended without a sale.',
    });
  } catch (notifyErr) {
    console.error(`[Webhook] payment_intent.canceled notification failed for payment ${payment.id}:`, notifyErr);
  }

  console.log(`[Webhook] payment_intent.canceled: Payment ${payment.id} released.`);
}

/**
 * Handle charge.dispute.created — Stripe-level dispute (chargeback).
 *
 * This is NOT an in-app dispute (Phase 11). A Stripe dispute happens when
 * the buyer contacts their issuing bank directly.
 *
 * Actions:
 *  1. Cancel emergency-capture BullMQ job to prevent capturing during dispute
 *  2. Write audit log
 *  3. Alert admin
 */
async function handleChargeDisputeCreated(dispute) {
  const stripepiId = dispute.payment_intent;

  if (!stripepiId) {
    console.warn('[Webhook] charge.dispute.created: No payment_intent in dispute object');
    return;
  }

  // Lookup payment
  const lookupResult = await pool.query(
    `SELECT id, auction_id, buyer_id, seller_id, status, amount
     FROM payments WHERE stripe_pi_id = $1`,
    [stripepiId]
  );

  if (lookupResult.rows.length === 0) {
    console.warn(`[Webhook] charge.dispute.created: No payment found for PI ${stripepiId}`);
    return;
  }

  const payment = lookupResult.rows[0];

  // Cancel emergency-capture job if it exists to prevent capturing during dispute
  let emergencyCaptureCancelled = false;
  try {
    const job = await paymentQueue.getJob(`emergency_capture_${payment.id}`);
    if (job) {
      await job.remove();
      emergencyCaptureCancelled = true;
      console.log(`[Webhook] Cancelled emergency-capture job for payment ${payment.id}`);
    }
  } catch (jobErr) {
    console.error(
      `[Webhook] Failed to cancel emergency-capture job for payment ${payment.id}:`,
      jobErr.message
    );
  }

  await writeAuditLog({
    referenceId: payment.id,
    referenceType: 'payment',
    action: 'stripe_dispute_opened',
    deltaState: {
      stripe_dispute_id: dispute.id,
      reason: dispute.reason || 'unknown',
      amount: dispute.amount,
      currency: dispute.currency,
      payment_status: payment.status,
      emergency_capture_cancelled: emergencyCaptureCancelled,
    },
    actorId: null,
  });

  // Alert admin — Stripe disputes need manual intervention
  try {
    await emitToAdmin('admin:stripe-dispute', {
      paymentId: payment.id,
      auctionId: payment.auction_id,
      disputeId: dispute.id,
      disputeAmount: dispute.amount,
      reason: dispute.reason,
      buyerId: payment.buyer_id,
      sellerId: payment.seller_id,
      emergencyCaptureCancelled,
    });
  } catch (emitErr) {
    console.error(`[Webhook] Failed to emit admin alert for dispute ${dispute.id}:`, emitErr);
  }

  console.error(
    `[Webhook] STRIPE DISPUTE OPENED: dispute=${dispute.id} payment=${payment.id} ` +
    `auction=${payment.auction_id} amount=${dispute.amount} reason=${dispute.reason}`
  );
}
