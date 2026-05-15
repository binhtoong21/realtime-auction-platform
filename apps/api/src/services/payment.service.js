import stripe from '../config/stripe.js';
import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { calculatePlatformFee } from './platformFee.service.js';
import {
  scheduleEmergencyCapture,
  scheduleGracePeriodExpiry,
} from '../jobs/queue.js';

const CURRENCY = process.env.STRIPE_CURRENCY || 'usd';

/**
 * Create an Auth Hold (PaymentIntent with capture_method: manual) for the auction winner.
 *
 * Flow:
 *   1. Look up winner's payment method from auction_participants
 *   2. Calculate platform fee
 *   3. Create payment record (status = hold_pending)
 *   4. Call Stripe PaymentIntent.create
 *   5a. Success → status = authorized, schedule emergency-capture (6d)
 *   5b. Failure → status = hold_failed → grace_period, schedule grace-period-expiry (24h)
 *   6. Write financial audit log
 *
 * @param {Object} params
 * @param {string} params.auctionId
 * @param {string} params.winnerId - bidder_id of the winner
 * @param {string} params.sellerId
 * @param {number} params.amountInCents - final auction price in cents
 * @returns {Object} { payment, holdSuccess }
 */
export const createAuthHold = async ({ auctionId, winnerId, sellerId, amountInCents }) => {
  // 1. Retrieve winner's payment method
  const pmResult = await pool.query(
    `SELECT ap.payment_method_id, pm.stripe_pm_id
     FROM auction_participants ap
     JOIN payment_methods pm ON pm.id = ap.payment_method_id
     WHERE ap.auction_id = $1 AND ap.user_id = $2
       AND ap.payment_method_id IS NOT NULL`,
    [auctionId, winnerId]
  );

  if (pmResult.rows.length === 0) {
    // Winner has no valid payment method — immediate hold fail
    return await handleNoPaymentMethod({ auctionId, winnerId, sellerId, amountInCents });
  }

  const { payment_method_id: localPmId, stripe_pm_id: stripePmId } = pmResult.rows[0];

  // 2. Get Stripe customer ID
  const userResult = await pool.query(
    'SELECT stripe_cus_id FROM users WHERE id = $1',
    [winnerId]
  );
  const stripeCusId = userResult.rows[0]?.stripe_cus_id;

  if (!stripeCusId) {
    return await handleNoPaymentMethod({ auctionId, winnerId, sellerId, amountInCents });
  }

  // 3. Calculate platform fee
  const { feeAmount, feeRate } = await calculatePlatformFee(amountInCents);

  // 4. Insert payment record as hold_pending
  const paymentId = uuidv7();
  await pool.query(
    `INSERT INTO payments (id, auction_id, buyer_id, seller_id, amount, platform_fee_amount,
                           payment_method_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'hold_pending')`,
    [paymentId, auctionId, winnerId, sellerId, amountInCents, feeAmount, localPmId]
  );

  // 5. Attempt Stripe PaymentIntent.create
  let holdSuccess = false;
  let stripeError = null;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: CURRENCY,
      customer: stripeCusId,
      payment_method: stripePmId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      metadata: {
        auction_id: auctionId,
        buyer_id: winnerId,
        seller_id: sellerId,
        platform: 'realtime-auction',
        fee_rate: String(feeRate),
      },
    });

    // Hold succeeded
    await pool.query(
      `UPDATE payments
       SET status = 'authorized', stripe_pi_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [paymentIntent.id, paymentId]
    );

    // Update auction status to awaiting_ship (Hold is successful, waiting for shipment)
    await pool.query(
      `UPDATE auctions SET status = 'awaiting_ship', updated_at = NOW()
       WHERE id = $1`,
      [auctionId]
    );

    holdSuccess = true;

    // Audit log
    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'auth_hold_success',
      deltaState: {
        stripe_pi_id: paymentIntent.id,
        amount: amountInCents,
        fee: feeAmount,
        buyer_id: winnerId,
      },
      actorId: null, // system action
    });

  } catch (err) {
    stripeError = err;
    console.error(`[Payment] Auth Hold failed for auction ${auctionId}:`, err.message);

    // Hold failed → transition to grace_period
    const graceExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE payments
       SET status = 'grace_period',
           grace_expires_at = $1,
           capture_attempts = capture_attempts + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [graceExpiresAt, paymentId]
    );

    // Update auction status to pending_payment (waiting for buyer to retry)
    await pool.query(
      `UPDATE auctions SET status = 'pending_payment', updated_at = NOW()
       WHERE id = $1`,
      [auctionId]
    );

    // Audit log
    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'auth_hold_failed',
      deltaState: {
        error: err.message,
        stripe_code: err.code || null,
        amount: amountInCents,
        buyer_id: winnerId,
        grace_expires_at: graceExpiresAt.toISOString(),
      },
      actorId: null,
    });
  }

  return { paymentId, holdSuccess, stripeError };
};

/**
 * Handle case where winner has no payment method at all.
 * Directly creates a hold_failed → grace_period payment.
 */
const handleNoPaymentMethod = async ({ auctionId, winnerId, sellerId, amountInCents }) => {
  const { feeAmount } = await calculatePlatformFee(amountInCents);
  const paymentId = uuidv7();
  const graceExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO payments (id, auction_id, buyer_id, seller_id, amount, platform_fee_amount,
                           status, grace_expires_at, capture_attempts)
     VALUES ($1, $2, $3, $4, $5, $6, 'grace_period', $7, 1)`,
    [paymentId, auctionId, winnerId, sellerId, amountInCents, feeAmount, graceExpiresAt]
  );

  await pool.query(
    `UPDATE auctions SET status = 'pending_payment', updated_at = NOW()
     WHERE id = $1`,
    [auctionId]
  );

  await writeAuditLog({
    referenceId: paymentId,
    referenceType: 'payment',
    action: 'auth_hold_failed',
    deltaState: {
      error: 'No payment method found',
      amount: amountInCents,
      buyer_id: winnerId,
      grace_expires_at: graceExpiresAt.toISOString(),
    },
    actorId: null,
  });

  return { paymentId, holdSuccess: false, stripeError: null };
};

/**
 * Schedule follow-up jobs AFTER the DB transaction has committed.
 * Called outside of the transaction to avoid scheduling jobs for rolled-back data.
 */
export const schedulePostHoldJobs = async ({ paymentId, auctionId, holdSuccess }) => {
  if (holdSuccess) {
    await scheduleEmergencyCapture(paymentId, auctionId);
  } else {
    await scheduleGracePeriodExpiry(paymentId, auctionId);
  }
};

/**
 * Write an immutable financial audit log entry.
 */
const writeAuditLog = async ({ referenceId, referenceType, action, deltaState, actorId, ipAddress }) => {
  await pool.query(
    `INSERT INTO financial_audit_logs (id, reference_id, reference_type, action, delta_state, actor_id, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv7(), referenceId, referenceType, action, JSON.stringify(deltaState), actorId, ipAddress || null]
  );
};

export { writeAuditLog };
