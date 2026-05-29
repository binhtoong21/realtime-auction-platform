import stripe from '../config/stripe.js';
import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { calculatePlatformFee } from './platformFee.service.js';
import {
  scheduleEmergencyCapture,
  scheduleGracePeriodExpiry,
} from '../jobs/queue.js';
import { emitToUser } from './socket.service.js';

const CURRENCY = process.env.STRIPE_CURRENCY || 'usd';
const SHIPPING_DEADLINE_DAYS = 5;

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

    // Hold succeeded - DB updates must be atomic
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE payments
         SET status = 'authorized', stripe_pi_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [paymentIntent.id, paymentId]
      );

      // Update auction status to awaiting_ship (Hold is successful, waiting for shipment)
      const auctionUpdate = await client.query(
        `UPDATE auctions SET status = 'awaiting_ship', shipping_deadline_at = NOW() + INTERVAL '${SHIPPING_DEADLINE_DAYS} days', updated_at = NOW()
         WHERE id = $1 AND status IN ('ended', 'pending_payment')`,
        [auctionId]
      );

      if (auctionUpdate.rowCount === 0) {
        throw new Error(`Invalid state transition: Auction ${auctionId} could not be updated to awaiting_ship`);
      }
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      console.error(`[Payment] DB update failed after Stripe hold for auction ${auctionId}. Canceling hold.`, dbErr.message);
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id);
      } catch (cancelErr) {
        console.error(`[Payment] CRITICAL: Failed to cancel orphaned Stripe PI ${paymentIntent.id}:`, cancelErr.message);
      }
      throw dbErr;
    } finally {
      client.release();
    }

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
const writeAuditLog = async ({ referenceId, referenceType, action, deltaState, actorId, ipAddress }, client) => {
  const queryFn = client || pool;
  await queryFn.query(
    `INSERT INTO financial_audit_logs (id, reference_id, reference_type, action, delta_state, actor_id, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv7(), referenceId, referenceType, action, JSON.stringify(deltaState), actorId, ipAddress || null]
  );
};

/**
 * Retry an Auth Hold that previously failed.
 * Can use a new payment method or the existing one.
 */
export const retryPayment = async ({ paymentId, buyerId, paymentMethodId }) => {
  const paymentResult = await pool.query(
    `SELECT p.id, p.auction_id, p.buyer_id, p.seller_id, p.amount, p.status, p.payment_method_id, p.grace_expires_at, u.stripe_cus_id
     FROM payments p
     JOIN users u ON u.id = p.buyer_id
     WHERE p.id = $1`,
    [paymentId]
  );

  if (paymentResult.rows.length === 0) {
    throw { status: 404, message: 'Payment not found' };
  }

  const payment = paymentResult.rows[0];

  if (payment.buyer_id !== buyerId) {
    throw { status: 403, message: 'Forbidden' };
  }

  if (payment.status !== 'grace_period') {
    throw { status: 422, message: `Cannot retry payment in state: ${payment.status}` };
  }

  let finalPaymentMethodId = payment.payment_method_id;
  let stripePmId = null;

  // Resolve payment method BEFORE acquiring the lock to prevent stuck payments
  if (paymentMethodId && paymentMethodId !== finalPaymentMethodId) {
    // Verify the new payment method belongs to the user
    const pmResult = await pool.query(
      'SELECT id, stripe_pm_id FROM payment_methods WHERE id = $1 AND user_id = $2',
      [paymentMethodId, buyerId]
    );
    if (pmResult.rows.length === 0) {
      throw { status: 404, message: 'Payment method not found or does not belong to user' };
    }
    finalPaymentMethodId = pmResult.rows[0].id;
    stripePmId = pmResult.rows[0].stripe_pm_id;
  } else if (finalPaymentMethodId) {
    // Fetch stripe_pm_id for existing payment method
    const pmResult = await pool.query(
      'SELECT stripe_pm_id FROM payment_methods WHERE id = $1',
      [finalPaymentMethodId]
    );
    stripePmId = pmResult.rows[0]?.stripe_pm_id;
  }

  if (!stripePmId) {
    throw { status: 400, message: 'No valid payment method available to retry' };
  }

  // Atomic lock: prevent duplicate holds and TOCTOU on grace_expires_at
  const lockResult = await pool.query(
    `UPDATE payments 
     SET status = 'hold_pending', payment_method_id = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'grace_period' AND grace_expires_at IS NOT NULL AND grace_expires_at > NOW()
     RETURNING id`,
    [finalPaymentMethodId, paymentId]
  );

  if (lockResult.rowCount === 0) {
    throw { status: 422, message: 'Payment is currently being processed, status changed, or grace period expired' };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Number(payment.amount),
      currency: CURRENCY,
      customer: payment.stripe_cus_id,
      payment_method: stripePmId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      metadata: {
        auction_id: payment.auction_id,
        buyer_id: payment.buyer_id,
        seller_id: payment.seller_id,
        platform: 'realtime-auction',
        retry: 'true'
      },
    });

    // Hold succeeded - DB updates must be atomic
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE payments
         SET status = 'authorized', stripe_pi_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [paymentIntent.id, paymentId]
      );

      const auctionUpdate = await client.query(
        `UPDATE auctions SET status = 'awaiting_ship', shipping_deadline_at = NOW() + INTERVAL '${SHIPPING_DEADLINE_DAYS} days', updated_at = NOW()
         WHERE id = $1 AND status = 'pending_payment'`,
        [payment.auction_id]
      );

      if (auctionUpdate.rowCount === 0) {
        throw new Error(`Invalid state transition: Auction ${payment.auction_id} could not be updated to awaiting_ship`);
      }
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      console.error(`[Payment] DB update failed after Stripe hold for auction ${payment.auction_id}. Canceling hold.`, dbErr.message);
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id);
      } catch (cancelErr) {
        console.error(`[Payment] CRITICAL: Failed to cancel orphaned Stripe PI ${paymentIntent.id}:`, cancelErr.message);
      }
      throw dbErr;
    } finally {
      client.release();
    }

    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'auth_hold_retry_success',
      deltaState: { stripe_pi_id: paymentIntent.id },
      actorId: buyerId,
    });

    // Isolate side effects
    try {
      await scheduleEmergencyCapture(paymentId, payment.auction_id);
      await emitToUser(buyerId, 'payment:status', {
        auctionId: payment.auction_id,
        status: 'authorized',
        amount: Number(payment.amount)
      });
    } catch (sideEffectError) {
      console.error(`[Payment] Retry side-effects failed for payment ${paymentId}:`, sideEffectError);
    }

    return { success: true };

  } catch (err) {
    console.error(`[Payment] Retry failed for payment ${paymentId}:`, err.message);

    if (err.type === 'StripeCardError') {
      // It's a card error, user's fault, revert to grace_period and increment attempts
      await pool.query(
        `UPDATE payments
         SET status = 'grace_period', capture_attempts = capture_attempts + 1, updated_at = NOW()
         WHERE id = $1`,
        [paymentId]
      );

      await writeAuditLog({
        referenceId: paymentId,
        referenceType: 'payment',
        action: 'auth_hold_retry_failed',
        deltaState: { error: err.message, stripe_code: err.code || null },
        actorId: buyerId,
      });

      throw { status: 402, code: 'HOLD_FAILED', message: err.message };
    } else {
      // System/Network error (StripeAPIError, StripeConnectionError)
      // Revert to grace_period, do not increment attempts
      await pool.query(
        `UPDATE payments
         SET status = 'grace_period', updated_at = NOW()
         WHERE id = $1`,
        [paymentId]
      );

      await writeAuditLog({
        referenceId: paymentId,
        referenceType: 'payment',
        action: 'auth_hold_retry_failed',
        deltaState: { error: err.message, stripe_code: err.code || null, system_error: true },
        actorId: buyerId,
      });
      
      throw { status: 503, code: 'SYSTEM_ERROR', message: 'Hệ thống thanh toán đang gián đoạn, vui lòng thử lại sau' };
    }
  }
};

/**
 * Accept a Second Chance offer — runner-up agrees to purchase.
 *
 * Flow (3-step Stripe pattern):
 *   1. Validate: payment is in second_chance, user is the runner-up, not expired
 *   2. Atomic lock: status → hold_pending
 *   3. Stripe PaymentIntent.create (outside transaction)
 *   4a. Success: update payment + auction in transaction, schedule emergency-capture
 *   4b. Failure: → NO_SALE (no grace period for runner-up per design doc)
 */
export const acceptSecondChance = async ({ auctionId, userId }) => {
  // Step 1: Validate pre-conditions
  const paymentResult = await pool.query(
    `SELECT p.id, p.status, p.buyer_id AS original_buyer_id, p.seller_id,
            p.amount AS original_amount, p.stripe_pi_id AS old_stripe_pi_id,
            p.second_chance_runner_up_id, p.second_chance_amount,
            p.second_chance_expires_at
     FROM payments p
     WHERE p.auction_id = $1`,
    [auctionId]
  );

  if (paymentResult.rows.length === 0) {
    throw { status: 404, code: 'SECOND_CHANCE_NOT_FOUND', message: 'No payment found for this auction' };
  }

  const payment = paymentResult.rows[0];

  if (payment.status !== 'second_chance') {
    throw { status: 422, code: 'INVALID_PAYMENT_STATE', message: `Cannot accept second chance in state: ${payment.status}` };
  }

  if (payment.second_chance_runner_up_id !== userId) {
    throw { status: 403, code: 'FORBIDDEN', message: 'You are not the runner-up for this auction' };
  }

  if (new Date(payment.second_chance_expires_at) <= new Date()) {
    throw { status: 410, code: 'SECOND_CHANCE_EXPIRED', message: 'The second chance offer has expired' };
  }

  // Resolve payment method
  const pmResult = await pool.query(
    `SELECT ap.payment_method_id, pm.stripe_pm_id
     FROM auction_participants ap
     JOIN payment_methods pm ON pm.id = ap.payment_method_id
     WHERE ap.auction_id = $1 AND ap.user_id = $2
       AND ap.payment_method_id IS NOT NULL`,
    [auctionId, userId]
  );

  if (pmResult.rows.length === 0) {
    // No payment method → treat as hold failure → NO_SALE
    await transitionToNoSale({
      paymentId: payment.id,
      auctionId,
      payment,
      reason: 'runner_up_no_payment_method',
      userId,
    });
    throw { status: 402, code: 'HOLD_FAILED', message: 'No payment method available' };
  }

  const { payment_method_id: localPmId, stripe_pm_id: stripePmId } = pmResult.rows[0];

  const userResult = await pool.query(
    'SELECT stripe_cus_id FROM users WHERE id = $1',
    [userId]
  );

  if (!userResult.rows[0]?.stripe_cus_id) {
    await transitionToNoSale({
      paymentId: payment.id,
      auctionId,
      payment,
      reason: 'runner_up_no_stripe_customer',
      userId,
    });
    throw { status: 402, code: 'HOLD_FAILED', message: 'Payment account not configured' };
  }

  const stripeCusId = userResult.rows[0].stripe_cus_id;

  // Calculate platform fee for the new amount
  const { feeAmount } = await calculatePlatformFee(Number(payment.second_chance_amount));

  // Step 2: Atomic lock — claim by transitioning to hold_pending
  const lockResult = await pool.query(
    `UPDATE payments
     SET status = 'hold_pending', updated_at = NOW()
     WHERE id = $1
       AND status = 'second_chance'
       AND second_chance_runner_up_id = $2
       AND second_chance_expires_at > NOW()
     RETURNING id`,
    [payment.id, userId]
  );

  if (lockResult.rowCount === 0) {
    throw { status: 422, code: 'INVALID_PAYMENT_STATE', message: 'Offer has been processed, expired, or state changed' };
  }

  // Step 3: Stripe call (OUTSIDE transaction)
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Number(payment.second_chance_amount),
      currency: CURRENCY,
      customer: stripeCusId,
      payment_method: stripePmId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      metadata: {
        auction_id: auctionId,
        buyer_id: userId,
        seller_id: payment.seller_id,
        platform: 'realtime-auction',
        second_chance: 'true',
      },
    });

    // Step 4a: Stripe SUCCESS — wrap DB updates in transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Audit snapshot BEFORE swapping buyer (preserves full history)
      await writeAuditLog({
        referenceId: payment.id,
        referenceType: 'payment',
        action: 'second_chance_accepted',
        deltaState: {
          old_buyer_id: payment.original_buyer_id,
          old_amount: Number(payment.original_amount),
          old_stripe_pi_id: payment.old_stripe_pi_id,
          new_buyer_id: userId,
          new_amount: Number(payment.second_chance_amount),
          new_stripe_pi_id: paymentIntent.id,
          new_fee: feeAmount,
        },
        actorId: userId,
      }, client);

      // Update payment: swap buyer, amount, PI
      await client.query(
        `UPDATE payments
         SET status = 'authorized',
             buyer_id = $1,
             amount = second_chance_amount,
             platform_fee_amount = $2,
             payment_method_id = $3,
             stripe_pi_id = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [userId, feeAmount, localPmId, paymentIntent.id, payment.id]
      );

      // Update auction: swap winner, update price
      const auctionUpdate = await client.query(
        `UPDATE auctions
         SET status = 'awaiting_ship',
             shipping_deadline_at = NOW() + INTERVAL '${SHIPPING_DEADLINE_DAYS} days',
             winner_id = $1,
             current_price = $2,
             updated_at = NOW()
         WHERE id = $3 AND status = 'second_chance'`,
        [userId, payment.second_chance_amount, auctionId]
      );

      if (auctionUpdate.rowCount === 0) {
        throw new Error(`Invalid state transition: Auction ${auctionId} could not be updated to awaiting_ship`);
      }

      // Clear old winner's bid (defense-in-depth, worker already does this)
      await client.query(
        `UPDATE bids SET is_winning = false
         WHERE auction_id = $1 AND bidder_id = $2 AND is_winning = true`,
        [auctionId, payment.original_buyer_id]
      );

      // Mark runner-up's bid as winning
      await client.query(
        `UPDATE bids SET is_winning = true
         WHERE auction_id = $1 AND bidder_id = $2 AND amount = $3
           AND is_winning = false`,
        [auctionId, userId, payment.second_chance_amount]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');

      // Compensating action: cancel the live Stripe hold
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id);
        // PI cancelled — safe to let runner-up retry
        await pool.query(
          `UPDATE payments SET status = 'second_chance', updated_at = NOW() WHERE id = $1`,
          [payment.id]
        );
        console.error(`[Payment] DB TX failed for auction ${auctionId}, cancelled PI ${paymentIntent.id}`);
      } catch (cancelErr) {
        // Orphan hold — transition to no_sale, sweeper will reconcile
        console.error(`[Payment] CRITICAL: Failed to cancel PI ${paymentIntent.id}:`, cancelErr.message);
        await pool.query(
          `UPDATE payments SET status = 'no_sale', stripe_pi_id = $1, updated_at = NOW() WHERE id = $2`,
          [paymentIntent.id, payment.id]
        );
        await pool.query(
          `UPDATE auctions SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
          [auctionId]
        );
      }

      throw { status: 503, code: 'SYSTEM_ERROR', message: 'Payment system is temporarily unavailable, please try again' };
    } finally {
      client.release();
    }

    // Side effects AFTER commit (isolated)
    try {
      await scheduleEmergencyCapture(payment.id, auctionId);

      const sellerReceives = Number(payment.second_chance_amount) - feeAmount;

      await emitToUser(userId, 'auction:won', {
        auctionId,
        finalPrice: Number(payment.second_chance_amount),
        paymentStatus: 'authorized',
        paymentId: payment.id,
      });

      await emitToUser(payment.seller_id, 'auction:second-chance-accepted', {
        auctionId,
        amount: Number(payment.second_chance_amount),
        platformFee: feeAmount,
        sellerReceives,
        status: 'awaiting_ship',
        message: 'A new buyer has accepted the offer. Please prepare for shipping.',
      });
    } catch (sideEffectErr) {
      console.error(`[Payment] Second chance accept side-effects failed for payment ${payment.id}:`, sideEffectErr);
    }

    return {
      paymentId: payment.id,
      status: 'authorized',
      amount: Number(payment.second_chance_amount),
    };

  } catch (err) {
    // Step 4b: Stripe FAILURE — NO_SALE (no grace period for runner-up)
    if (err.type === 'StripeCardError' || err.type === 'StripeInvalidRequestError') {
      console.error(`[Payment] Second chance hold failed for auction ${auctionId}:`, err.message);

      await transitionToNoSale({
        paymentId: payment.id,
        auctionId,
        payment,
        reason: `stripe_error: ${err.message}`,
        userId,
      });

      throw { status: 402, code: 'HOLD_FAILED', message: 'Payment hold failed. The auction will end without a sale.' };
    }

    // Already-handled error from DB TX failure (PI compensation done above)
    if (err.status && err.code) throw err;

    // System error — revert to second_chance so runner-up can try again
    // (network timeout, Stripe outage — not runner-up's fault)
    console.error(`[Payment] Second chance system error for auction ${auctionId}:`, err.message);
    await pool.query(
      `UPDATE payments SET status = 'second_chance', updated_at = NOW() WHERE id = $1`,
      [payment.id]
    );

    throw { status: 503, code: 'SYSTEM_ERROR', message: 'Payment system is temporarily unavailable, please try again' };
  }
};

/**
 * Decline a Second Chance offer — runner-up refuses to purchase.
 * Auction transitions to NO_SALE.
 */
export const declineSecondChance = async ({ auctionId, userId }) => {
  const client = await pool.connect();
  let payment = null;

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE payments
       SET status = 'no_sale', updated_at = NOW()
       WHERE auction_id = $1
         AND status = 'second_chance'
         AND second_chance_runner_up_id = $2
       RETURNING id, buyer_id, seller_id`,
      [auctionId, userId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');

      // Diagnostic SELECT to provide specific error (uses pool, TX already rolled back)
      const checkResult = await pool.query(
        `SELECT status, second_chance_runner_up_id FROM payments WHERE auction_id = $1`,
        [auctionId]
      );

      if (checkResult.rows.length === 0) {
        throw { status: 404, code: 'SECOND_CHANCE_NOT_FOUND', message: 'No payment found for this auction' };
      }

      const p = checkResult.rows[0];
      if (p.second_chance_runner_up_id !== userId) {
        throw { status: 403, code: 'FORBIDDEN', message: 'You are not the runner-up for this auction' };
      }

      throw { status: 422, code: 'INVALID_PAYMENT_STATE', message: `Cannot decline in state: ${p.status}` };
    }

    payment = result.rows[0];

    // Cascade auction status (same transaction)
    await client.query(
      `UPDATE auctions SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
      [auctionId]
    );

    // Audit log (same transaction)
    await writeAuditLog({
      referenceId: payment.id,
      referenceType: 'payment',
      action: 'second_chance_declined',
      deltaState: {
        runner_up_id: userId,
        original_buyer_id: payment.buyer_id,
      },
      actorId: userId,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  // Notifications AFTER commit and release
  try {
    await emitToUser(payment.seller_id, 'auction:no-sale', {
      auctionId,
      message: 'The runner-up declined the offer. No buyer found for your auction.',
    });

    await emitToUser(userId, 'auction:second-chance-declined', {
      auctionId,
      message: 'You have declined the second chance offer.',
    });

    await emitToUser(payment.buyer_id, 'auction:no-sale', {
      auctionId,
      message: 'The auction has ended without a sale.',
    });
  } catch (notifyErr) {
    console.error(`[Payment] Decline notification failed for auction ${auctionId}:`, notifyErr);
  }

  return { status: 'no_sale' };
};

/**
 * Helper: Transition a second chance payment to NO_SALE.
 * Used when runner-up's card fails or they have no payment method.
 */
const transitionToNoSale = async ({ paymentId, auctionId, payment, reason, userId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE payments SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
      [paymentId]
    );

    await client.query(
      `UPDATE auctions SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
      [auctionId]
    );

    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'second_chance_hold_failed',
      deltaState: {
        runner_up_id: userId,
        original_buyer_id: payment.original_buyer_id,
        reason,
      },
      actorId: null,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Notifications after commit
  try {
    await emitToUser(payment.seller_id, 'auction:no-sale', {
      auctionId,
      message: 'Payment from the runner-up failed. No buyer found for your auction.',
    });

    await emitToUser(userId, 'auction:second-chance-failed', {
      auctionId,
      message: 'Your payment could not be processed. The auction will end without a sale.',
    });

    // Notify original winner
    await emitToUser(payment.original_buyer_id, 'auction:no-sale', {
      auctionId,
      message: 'The auction has ended without a sale.',
    });
  } catch (notifyErr) {
    console.error(`[Payment] NO_SALE notification failed for auction ${auctionId}:`, notifyErr);
  }
};

/**
 * Get payment details by ID.
 * Buyer sees their own payment, Seller sees payment for their auction.
 */
export const getPaymentById = async ({ paymentId, userId }) => {
  const result = await pool.query(
    `SELECT p.id, p.auction_id, p.buyer_id, p.seller_id, p.amount,
            p.platform_fee_amount, p.status, p.stripe_pi_id,
            p.grace_expires_at, p.capture_attempts, p.created_at, p.updated_at,
            a.title AS auction_title
     FROM payments p
     JOIN auctions a ON a.id = p.auction_id
     WHERE p.id = $1`,
    [paymentId]
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'Payment not found' };
  }

  const payment = result.rows[0];

  if (payment.buyer_id !== userId && payment.seller_id !== userId) {
    throw { status: 403, message: 'Forbidden' };
  }

  const sellerReceives = Number(payment.amount) - Number(payment.platform_fee_amount);

  return {
    id: payment.id,
    auctionId: payment.auction_id,
    auctionTitle: payment.auction_title,
    amount: Number(payment.amount),
    platformFeeAmount: Number(payment.platform_fee_amount),
    sellerReceives,
    status: payment.status,
    stripePaymentIntentId: payment.stripe_pi_id,
    graceExpiresAt: payment.grace_expires_at,
    captureAttempts: payment.capture_attempts,
    createdAt: payment.created_at,
  };
};

export { writeAuditLog };
