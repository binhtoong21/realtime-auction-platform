import stripe from '../config/stripe.js';
import { pool } from '../config/database.js';
import { v7 as uuidv7 } from 'uuid';
import { calculatePlatformFee } from './platformFee.service.js';
import {
  scheduleGracePeriodExpiry,
} from '../jobs/queue.js';
import { emitToUser, emitToAdmin } from './socket.service.js';
import { EventNames, PaymentStatus, AuctionStatus } from '@auction/shared-constants';

const CURRENCY = process.env.STRIPE_CURRENCY || 'usd';
const SHIPPING_DEADLINE_DAYS = 5;

const insertChargeAttempt = async (
  client,
  { paymentId, kind, buyerId, amount, feeAmount, paymentMethodId }
) => {
  const { rows } = await client.query(
    `INSERT INTO payment_attempts (id, payment_id, kind, buyer_id, amount, platform_fee_amount, payment_method_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [uuidv7(), paymentId, kind, buyerId, amount, feeAmount, paymentMethodId]
  );
  return rows[0];
};

// Lock the attempt before the payment in both outcome paths.
const lockChargeAttempt = async (client, attempt) => {
  const result = await client.query(
    `SELECT *
     FROM payment_attempts
     WHERE id = $1 AND status = 'pending'
       AND ($2::text IS NULL OR locked_until = $2::timestamptz)
     FOR UPDATE`,
    [attempt.id, attempt.lease_token || null]
  );
  if (!result.rows.length) {
    return null;
  }
  const current = result.rows[0];
  const payment = await client.query(
    `SELECT *
     FROM payments
     WHERE id = $1 AND status = 'hold_pending'
     FOR UPDATE`,
    [current.payment_id]
  );
  return payment.rows.length ? { attempt: current, payment: payment.rows[0] } : null;
};

/** Finalize a pending attempt and its payment together, ignoring stale outcomes. */
export const applyChargeSuccess = async (attempt, pi) => {
  if (pi.status !== 'succeeded') {
    throw new Error('PaymentIntent has not succeeded');
  }
  const client = await pool.connect();
  let current, payment;
  try {
    await client.query('BEGIN');
    const locked = await lockChargeAttempt(client, attempt);
    if (!locked) {
      await client.query('ROLLBACK');
      return false;
    }
    ({ attempt: current, payment } = locked);
    await client.query(
      `UPDATE payment_attempts SET status = 'succeeded', stripe_pi_id = $2, locked_until = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [current.id, pi.id]
    );
    await client.query(
      `UPDATE payments SET status = 'held', stripe_pi_id = $2, buyer_id = $3, amount = $4,
       platform_fee_amount = $5, payment_method_id = $6, updated_at = NOW()
       WHERE id = $1 AND status = 'hold_pending'`,
      [
        payment.id,
        pi.id,
        current.buyer_id,
        current.amount,
        current.platform_fee_amount,
        current.payment_method_id,
      ]
    );
    let auctionUpdate;
    if (current.kind === 'second_chance') {
      auctionUpdate = await client.query(
        `UPDATE auctions SET status = 'awaiting_ship', winner_id = $2, current_price = $3,
         shipping_deadline_at = NOW() + INTERVAL '${SHIPPING_DEADLINE_DAYS} days', updated_at = NOW()
         WHERE id = $1 AND status = 'second_chance'`,
        [payment.auction_id, current.buyer_id, current.amount]
      );
      await client.query(
        `UPDATE bids SET is_winning = false
         WHERE auction_id = $1 AND bidder_id = $2 AND is_winning = true`,
        [payment.auction_id, payment.buyer_id]
      );
      await client.query(
        `UPDATE bids SET is_winning = true
         WHERE auction_id = $1 AND bidder_id = $2 AND amount = $3 AND is_winning = false`,
        [payment.auction_id, current.buyer_id, current.amount]
      );
      await writeAuditLog(
        {
          referenceId: payment.id,
          referenceType: 'payment',
          action: 'second_chance_accepted',
          deltaState: {
            old_buyer_id: payment.buyer_id,
            old_amount: Number(payment.amount),
            old_stripe_pi_id: payment.stripe_pi_id,
            new_buyer_id: current.buyer_id,
            new_amount: Number(current.amount),
            new_stripe_pi_id: pi.id,
            new_fee: Number(current.platform_fee_amount),
          },
          actorId: current.buyer_id,
        },
        client
      );
    } else {
      auctionUpdate = await client.query(
        `UPDATE auctions SET status = 'awaiting_ship', shipping_deadline_at = NOW() + INTERVAL '${SHIPPING_DEADLINE_DAYS} days', updated_at = NOW()
         WHERE id = $1 AND status IN ('ended', 'pending_payment')`,
        [payment.auction_id]
      );
    }
    if (!auctionUpdate.rowCount) {
      throw new Error('Invalid state transition: Auction could not be updated to awaiting_ship');
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (current.kind !== 'second_chance') {
    await writeAuditLogSafely({
      referenceId: payment.id,
      referenceType: 'payment',
      action: current.kind === 'retry' ? 'escrow_charge_retry_success' : 'escrow_charge_success',
      deltaState: {
        stripe_pi_id: pi.id,
        amount: Number(current.amount),
        fee: Number(current.platform_fee_amount),
        buyer_id: current.buyer_id,
      },
      actorId: current.kind === 'retry' ? current.buyer_id : null,
    });
  }
  try {
    if (current.kind === 'retry') {
      await emitToUser(current.buyer_id, EventNames.PAYMENT_STATUS, {
        auctionId: payment.auction_id,
        status: PaymentStatus.HELD,
        amount: Number(current.amount),
      });
    } else if (current.kind === 'second_chance') {
      await emitToUser(current.buyer_id, 'auction:won', {
        auctionId: payment.auction_id,
        finalPrice: Number(current.amount),
        paymentStatus: PaymentStatus.HELD,
        paymentId: payment.id,
      });
      await emitToUser(payment.seller_id, 'auction:second-chance-accepted', {
        auctionId: payment.auction_id,
        amount: Number(current.amount),
        platformFee: Number(current.platform_fee_amount),
        sellerReceives: Number(current.amount) - Number(current.platform_fee_amount),
        status: AuctionStatus.AWAITING_SHIP,
        message: 'A new buyer has accepted the offer. Please prepare for shipping.',
      });
    }
  } catch (err) {
    console.error('[Payment] Charge success side-effects failed:', err.message);
  }
  return true;
};

/** Record one definitive failure without changing a newer attempt or its counter. */
export const applyChargeFailure = async (attempt, err) => {
  const client = await pool.connect();
  let current, payment;
  try {
    await client.query('BEGIN');
    const locked = await lockChargeAttempt(client, attempt);
    if (!locked) {
      await client.query('ROLLBACK');
      return false;
    }
    ({ attempt: current, payment } = locked);
    await client.query(
      `UPDATE payment_attempts SET status = 'failed', error = $2, locked_until = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [current.id, err.message]
    );
    if (current.kind === 'second_chance') {
      await client.query(
        `UPDATE payments SET status = 'no_sale', updated_at = NOW()
         WHERE id = $1 AND status = 'hold_pending'`,
        [payment.id]
      );
      await client.query(
        `UPDATE auctions SET status = 'no_sale', updated_at = NOW()
         WHERE id = $1`,
        [payment.auction_id]
      );
    } else {
      await client.query(
        `UPDATE payments SET status = 'grace_period', capture_attempts = capture_attempts + 1,
         grace_expires_at = CASE WHEN $2 = 'initial' THEN NOW() + INTERVAL '24 hours' ELSE grace_expires_at END,
         updated_at = NOW() WHERE id = $1 AND status = 'hold_pending'`,
        [payment.id, current.kind]
      );
      if (current.kind === 'initial') {
        await client.query(
          `UPDATE auctions SET status = 'pending_payment', updated_at = NOW()
           WHERE id = $1 AND status = 'ended'`,
          [payment.auction_id]
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAuditLogSafely({
    referenceId: payment.id,
    referenceType: 'payment',
    action:
      current.kind === 'second_chance'
        ? 'second_chance_hold_failed'
        : current.kind === 'retry'
          ? 'auth_hold_retry_failed'
          : 'escrow_charge_failed',
    deltaState: {
      error: err.message,
      stripe_code: err.code || null,
      runner_up_id: current.buyer_id,
      original_buyer_id: payment.buyer_id,
      reason: `stripe_error: ${err.message}`,
    },
    actorId: null,
  });
  if (current.kind === 'second_chance') {
    try {
      await emitToUser(payment.seller_id, 'auction:no-sale', {
        auctionId: payment.auction_id,
        message: 'Payment from the runner-up failed. No buyer found for your auction.',
      });
      await emitToUser(current.buyer_id, 'auction:second-chance-failed', {
        auctionId: payment.auction_id,
        message: 'Your payment could not be processed. The auction will end without a sale.',
      });
      await emitToUser(payment.buyer_id, 'auction:no-sale', {
        auctionId: payment.auction_id,
        message: 'The auction has ended without a sale.',
      });
    } catch (error) {
      console.error('[Payment] Charge failure notifications failed:', error.message);
    }
  }
  return true;
};

/** Serialize Stripe execution across inline requests and the reconciler. */
export const claimChargeAttempt = async (attemptId) => {
  const { rows } = await pool.query(
    `UPDATE payment_attempts
     SET locked_until = NOW() + INTERVAL '10 minutes', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
       AND (locked_until IS NULL OR locked_until < NOW())
     RETURNING *, locked_until::text AS lease_token`,
    [attemptId]
  );
  return rows[0] || null;
};

/** Release only this execution's lease, leaving a newer executor untouched. */
export const releaseChargeAttempt = async (attempt) => {
  await pool.query(
    `UPDATE payment_attempts
     SET locked_until = NULL
     WHERE id = $1 AND status = 'pending' AND locked_until = $2::timestamptz`,
    [attempt.id, attempt.lease_token]
  );
};

/** Refund a late or duplicate success after checking the durable outcome again. */
export const refundOrphanChargeIfNeeded = async (attempt, pi) => {
  if (pi?.status !== 'succeeded') {
    return false;
  }
  const { rows } = await pool.query(
    `SELECT pa.*, p.auction_id
     FROM payment_attempts pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.id = $1`,
    [attempt.id]
  );
  const current = rows[0];
  if (
    !current ||
    (current.status !== 'failed' && !(current.status === 'succeeded' && current.stripe_pi_id !== pi.id))
  ) {
    return false;
  }

  // A failed insert must propagate: the refund obligation is not durable yet.
  await pool.query(
    `INSERT INTO orphan_refunds (stripe_pi_id, attempt_id)
     VALUES ($1, $2)
     ON CONFLICT (stripe_pi_id) DO NOTHING`,
    [pi.id, current.id]
  );
  return processOrphanRefund(pi.id);
};

/** Confirm the Stripe refund lifecycle without recreating in-flight or failed refunds. */
export const processOrphanRefund = async (stripePiId) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, pa.payment_id, pa.status AS attempt_status, p.auction_id
       FROM orphan_refunds r
       LEFT JOIN payment_attempts pa ON pa.id = r.attempt_id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE r.stripe_pi_id = $1`,
      [stripePiId]
    );
    const obligation = rows[0];
    if (!obligation) {
      return false;
    }
    if (obligation.status === 'refunded') {
      return true;
    }
    if (obligation.status === 'failed') {
      return false;
    }

    let refund;
    if (obligation.status === 'refund_pending') {
      refund = await stripe.refunds.retrieve(obligation.stripe_refund_id);
    } else {
      const existingRefunds = await stripe.refunds.list({ payment_intent: stripePiId, limit: 10 });
      const reusable = existingRefunds.data.find((r) => ['succeeded', 'pending', 'requires_action'].includes(r.status));
      refund = reusable
        ?? await stripe.refunds.create({ payment_intent: stripePiId }, { idempotencyKey: `refund_${stripePiId}` });
    }
    const succeeded = refund.status === 'succeeded';
    const failed = ['failed', 'canceled'].includes(refund.status);
    const status = succeeded ? 'refunded' : failed ? 'failed' : 'refund_pending';
    const error = failed ? refund.failure_reason || `Stripe refund status: ${refund.status}` : null;
    const update = await pool.query(
      `UPDATE orphan_refunds
       SET status = $3, stripe_refund_id = $2, error = $4, updated_at = NOW()
       WHERE stripe_pi_id = $1 AND status = $5
       RETURNING stripe_pi_id`,
      [stripePiId, refund.id, status, error, obligation.status]
    );
    if (!update.rowCount) {
      return false;
    }
    if (!succeeded && !failed) {
      return false;
    }

    if (succeeded) {
      await writeAuditLogSafely({
        referenceId: obligation.payment_id || obligation.attempt_id || uuidv7(),
        referenceType: obligation.payment_id ? 'payment' : 'orphan_refund',
        action: 'orphan_charge_refunded',
        deltaState: {
          attempt_id: obligation.attempt_id,
          stripe_pi_id: stripePiId,
          refund_id: refund.id,
          attempt_status: obligation.attempt_status,
        },
        actorId: null,
      });
    }
    try {
      await emitToAdmin('payment:reconciliation-alert', {
        paymentId: obligation.payment_id,
        auctionId: obligation.auction_id,
        attemptId: obligation.attempt_id,
        stripePaymentIntentId: stripePiId,
        reason: failed ? 'orphan_refund_failed' : 'orphan_charge_refunded',
        stripeRefundId: refund.id,
        error,
      });
    } catch (err) {
      console.error(`[Payment] Orphan refund notification failed for ${stripePiId}:`, err.message);
    }
    return succeeded;
  } catch (err) {
    try {
      await pool.query(
        `UPDATE orphan_refunds
         SET error = $2, updated_at = NOW()
         WHERE stripe_pi_id = $1 AND status IN ('pending', 'refund_pending')`,
        [stripePiId, err.message]
      );
    } catch (dbErr) {
      console.error(`[Payment] Failed to record refund error for ${stripePiId}:`, dbErr.message);
    }
    console.error(`[Payment] Orphan refund remains pending for ${stripePiId}:`, err.message);
    return false;
  }
};

/** Classify a known PI without abandoning an unsettled charge or failed cancel. */
export const classifyChargePaymentIntent = async (paymentIntent, { reconciling = false } = {}) => {
  if (paymentIntent.status === 'succeeded') {
    return { outcome: 'succeeded', paymentIntent, error: null };
  }
  const error = new Error(`Payment was not completed (Stripe status: ${paymentIntent.status})`);
  if (
    paymentIntent.status === 'canceled' ||
    (reconciling && paymentIntent.status === 'requires_payment_method')
  ) {
    return { outcome: 'failed', paymentIntent, error };
  }
  if (
    ['requires_payment_method', 'requires_action', 'requires_confirmation'].includes(paymentIntent.status)
  ) {
    try {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      return { outcome: 'failed', paymentIntent, error };
    } catch (cancelErr) {
      return { outcome: 'uncertain', paymentIntent, error: cancelErr };
    }
  }
  return { outcome: 'uncertain', paymentIntent, error };
};

/** Reuse a known PI or a retained key; never create beyond the safe replay window. */
export const runChargeAttempt = async (attempt) => {
  const current = await claimChargeAttempt(attempt.id);
  if (!current) {
    return { outcome: 'uncertain', paymentIntent: null, error: processingError() };
  }

  let result;
  try {
    if (current.stripe_pi_id) {
      const pi = await stripe.paymentIntents.retrieve(current.stripe_pi_id);
      result = await classifyChargePaymentIntent(pi);
    } else if (
      current.stripe_requested_at &&
      Date.now() - new Date(current.stripe_requested_at).getTime() > 23 * 60 * 60 * 1000
    ) {
      const found = await stripe.paymentIntents.search({ query: `metadata['attempt_id']:'${current.id}'` });
      result = found.data[0]
        ? await classifyChargePaymentIntent(found.data[0])
        : { outcome: 'uncertain', paymentIntent: null, error: processingError() };
    } else if (!current.payment_method_id && !current.stripe_requested_at) {
      result = { outcome: 'failed', paymentIntent: null, error: new Error('payment_method_removed') };
    } else {
      const { rows } = await pool.query(
        `SELECT p.auction_id, p.seller_id, pm.stripe_pm_id, u.stripe_cus_id
         FROM payments p
         LEFT JOIN payment_methods pm ON pm.id = $2
         JOIN users u ON u.id = $3
         WHERE p.id = $1 AND p.status = 'hold_pending'`,
        [current.payment_id, current.payment_method_id, current.buyer_id]
      );
      const payment = rows[0];
      if (!payment?.stripe_pm_id) {
        return { outcome: 'uncertain', paymentIntent: null, error: processingError() };
      }

      // This statement commits before Stripe can receive the create request.
      const requested = await pool.query(
        `UPDATE payment_attempts
         SET stripe_requested_at = COALESCE(stripe_requested_at, NOW()),
             stripe_last_requested_at = NOW()
         WHERE id = $1 AND status = 'pending' AND locked_until = $2::timestamptz
         RETURNING id`,
        [current.id, current.lease_token]
      );
      if (!requested.rowCount) {
        return { outcome: 'uncertain', paymentIntent: null, error: processingError() };
      }
      result = await createEscrowPaymentIntent({
        paymentId: current.payment_id,
        amount: Number(current.amount),
        stripeCusId: payment.stripe_cus_id,
        stripePmId: payment.stripe_pm_id,
        idempotencyKey: current.id,
        metadata: {
          attempt_id: current.id,
          auction_id: payment.auction_id,
          buyer_id: current.buyer_id,
          seller_id: payment.seller_id,
        },
      });
    }

    if (result.paymentIntent?.id) {
      try {
        await pool.query(
          `UPDATE payment_attempts
           SET stripe_pi_id = $2
           WHERE id = $1 AND status = 'pending' AND locked_until = $3::timestamptz`,
          [current.id, result.paymentIntent.id, current.lease_token]
        );
      } catch (err) {
        // Reconciliation can still search by attempt_id.
      }
    }
    let applied = true;
    if (result.outcome === 'succeeded') {
      applied = await applyChargeSuccess(current, result.paymentIntent);
      await refundOrphanChargeIfNeeded(current, result.paymentIntent);
    } else if (result.outcome === 'failed') {
      applied = await applyChargeFailure(current, result.error);
    }
    if (!applied) {
      const { rows } = await pool.query(
        `SELECT status, stripe_pi_id, error
         FROM payment_attempts
         WHERE id = $1`,
        [current.id]
      );
      const committed = rows[0];
      if (committed?.status === 'succeeded' && committed.stripe_pi_id === result.paymentIntent?.id) {
        return { ...result, outcome: 'succeeded', error: null };
      }
      if (committed?.status === 'failed') {
        return { ...result, outcome: 'failed', error: new Error(committed.error || 'Payment failed') };
      }
      return { ...result, outcome: 'uncertain', error: processingError() };
    }
    return result;
  } catch (error) {
    return { outcome: 'uncertain', paymentIntent: result?.paymentIntent || null, error };
  } finally {
    try {
      await releaseChargeAttempt(current);
    } catch (err) {
      console.error(`[Payment] Failed to release attempt ${current.id}:`, err.message);
    }
  }
};

const processingError = () => ({
  status: 503,
  code: 'PAYMENT_PROCESSING',
  message: 'Payment is being confirmed, please check again shortly',
});

const escrowAttemptResult = async (attempt) => {
  const result = await runChargeAttempt(attempt);
  if (!result) {
    return null;
  }
  if (result.outcome === 'uncertain') {
    throw result.error;
  }
  return {
    paymentId: attempt.payment_id,
    holdSuccess: result.outcome === 'succeeded',
    stripeError: result.error,
  };
};

/**
 * Defensively resolves a Stripe Customer ID when users.stripe_cus_id is missing.
 * If the user has a valid stripePmId, retrieves the PM from Stripe and syncs pm.customer.
 * Returns the customer ID, or null if unrecoverable.
 */
const resolveStripeCustomerDefensively = async (userId, stripePmId) => {
  if (!stripePmId) return null;
  try {
    const pm = await stripe.paymentMethods.retrieve(stripePmId);
    if (pm.customer) {
      await pool.query('UPDATE users SET stripe_cus_id = $1 WHERE id = $2', [pm.customer, userId]);
      return pm.customer;
    }
  } catch (err) {
    console.error(`[Payment] Failed to defensively resolve customer for user ${userId}:`, err.message, {
      code: err.code,
      type: err.type
    });
  }
  return null;
};


// Card failures that will not succeed on a plain retry (move to grace period / no sale)
const isPermanentStripeError = (err) =>
  err?.type === 'StripeCardError' || err?.type === 'StripeInvalidRequestError';


/** Charge immediately, preserving ambiguous Stripe outcomes for reconciliation. */
const createEscrowPaymentIntent = async ({
  paymentId,
  amount,
  stripeCusId,
  stripePmId,
  idempotencyKey,
  metadata,
}) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: CURRENCY,
        customer: stripeCusId,
        payment_method: stripePmId,
        confirm: true,
        off_session: true,
        metadata: {
          ...metadata,
          payment_id: paymentId,
          platform: 'realtime-auction',
        },
      },
      { idempotencyKey }
    );
    return classifyChargePaymentIntent(paymentIntent);
  } catch (error) {
    return {
      outcome: isPermanentStripeError(error) ? 'failed' : 'uncertain',
      paymentIntent: error.payment_intent || null,
      error,
    };
  }
};

/**
 * Audit logging must never change a financial outcome: failures are logged only.
 */
const writeAuditLogSafely = async (entry) => {
  try {
    await writeAuditLog(entry);
  } catch (auditErr) {
    console.error(`[Payment] Audit log '${entry.action}' failed for ${entry.referenceId}:`, auditErr.message);
  }
};

/** Commit the winner's payment and its attempt together before requesting a Stripe charge. */
export const createEscrowCharge = async ({ auctionId, winnerId, sellerId, amountInCents }) => {
  const pmResult = await pool.query(
    `SELECT ap.payment_method_id, pm.stripe_pm_id
     FROM auction_participants ap
     JOIN payment_methods pm ON pm.id = ap.payment_method_id
     WHERE ap.auction_id = $1 AND ap.user_id = $2
       AND ap.payment_method_id IS NOT NULL`,
    [auctionId, winnerId]
  );

  if (pmResult.rows.length === 0) {
    return await handleNoPaymentMethod({ auctionId, winnerId, sellerId, amountInCents });
  }

  const { payment_method_id: localPmId, stripe_pm_id: stripePmId } = pmResult.rows[0];

  const userResult = await pool.query(
    'SELECT stripe_cus_id FROM users WHERE id = $1',
    [winnerId]
  );
  let stripeCusId = userResult.rows[0]?.stripe_cus_id;

  if (!stripeCusId) {
    stripeCusId = await resolveStripeCustomerDefensively(winnerId, stripePmId);
    if (!stripeCusId) {
      return await handleNoPaymentMethod({ auctionId, winnerId, sellerId, amountInCents });
    }
  }


  const { feeAmount } = await calculatePlatformFee(amountInCents);
  const paymentId = uuidv7();
  const client = await pool.connect();
  let attempt;
  let duplicate = false;
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO payments (id, auction_id, buyer_id, seller_id, amount, platform_fee_amount, payment_method_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'hold_pending')`,
      [paymentId, auctionId, winnerId, sellerId, amountInCents, feeAmount, localPmId]
    );
    attempt = await insertChargeAttempt(client, {
      paymentId,
      kind: 'initial',
      buyerId: winnerId,
      amount: amountInCents,
      feeAmount,
      paymentMethodId: localPmId,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint === 'uq_payments_auction_id') {
      duplicate = true;
    } else {
      throw err;
    }
  } finally {
    client.release();
  }
  if (duplicate) {
    return continueExistingAuctionPayment(auctionId);
  }
  return escrowAttemptResult(attempt);
};

/** Resume the same durable attempt after a crash or transient error. */
export const resumeEscrowCharge = async (paymentId) => {
  const { rows } = await pool.query(
    `SELECT pa.*
     FROM payment_attempts pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE p.id = $1 AND p.status = 'hold_pending' AND pa.status = 'pending'`,
    [paymentId]
  );
  return rows.length ? escrowAttemptResult(rows[0]) : null;
};

/**
 * Another execution already created the payment for this auction (one payment per auction).
 * Continue that payment instead of charging a second time.
 */
const continueExistingAuctionPayment = async (auctionId) => {
  const { rows } = await pool.query(
    'SELECT id, status FROM payments WHERE auction_id = $1',
    [auctionId]
  );
  const existing = rows[0];
  if (existing.status === PaymentStatus.HOLD_PENDING) {
    return resumeEscrowCharge(existing.id);
  }
  return {
    paymentId: existing.id,
    holdSuccess: existing.status === PaymentStatus.HELD,
    stripeError: null,
  };
};

/**
 * Handle case where winner has no payment method at all.
 * Directly creates a hold_failed → grace_period payment.
 */
const handleNoPaymentMethod = async ({ auctionId, winnerId, sellerId, amountInCents }) => {
  const { feeAmount } = await calculatePlatformFee(amountInCents);
  const paymentId = uuidv7();
  const graceExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO payments (id, auction_id, buyer_id, seller_id, amount, platform_fee_amount,
                             status, grace_expires_at, capture_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, 'grace_period', $7, 1)`,
      [paymentId, auctionId, winnerId, sellerId, amountInCents, feeAmount, graceExpiresAt]
    );
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'uq_payments_auction_id') {
      return continueExistingAuctionPayment(auctionId);
    }
    throw err;
  }

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
 * Schedule follow-up jobs AFTER the payment state has been committed.
 * Called outside of the transaction to avoid scheduling jobs for rolled-back data.
 */
export const schedulePostHoldJobs = async ({ paymentId, auctionId, holdSuccess }) => {
  // Held funds do not expire, so a successful charge needs no follow-up job
  if (!holdSuccess) {
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
 * Retry a failed charge with a new durable attempt created in the payment claim transaction.
 */
export const retryPayment = async ({ paymentId, buyerId, paymentMethodId }) => {
  const paymentResult = await pool.query(
    `SELECT p.id, p.auction_id, p.buyer_id, p.seller_id, p.amount, p.status, p.payment_method_id, p.grace_expires_at, p.capture_attempts, u.stripe_cus_id
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

  if (payment.status !== PaymentStatus.GRACE_PERIOD) {
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

  let stripeCusId = payment.stripe_cus_id;
  if (!stripeCusId) {
    stripeCusId = await resolveStripeCustomerDefensively(buyerId, stripePmId);
    if (!stripeCusId) {
      throw { status: 400, message: 'No valid payment account configured' };
    }
  }


  const client = await pool.connect();
  let attempt;
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `UPDATE payments SET status = 'hold_pending', payment_method_id = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'grace_period' AND grace_expires_at IS NOT NULL AND grace_expires_at > NOW()
       RETURNING *`,
      [finalPaymentMethodId, paymentId]
    );
    if (!lock.rowCount) {
      throw {
        status: 422,
        message: 'Payment is currently being processed, status changed, or grace period expired',
      };
    }
    const claimed = lock.rows[0];
    attempt = await insertChargeAttempt(client, {
      paymentId,
      kind: 'retry',
      buyerId,
      amount: claimed.amount,
      feeAmount: claimed.platform_fee_amount,
      paymentMethodId: finalPaymentMethodId,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const result = await runChargeAttempt(attempt).catch(() => {
    throw processingError();
  });
  if (!result || result.outcome === 'uncertain') {
    throw processingError();
  }
  if (result.outcome === 'failed') {
    throw { status: 402, code: 'HOLD_FAILED', message: result.error.message };
  }
  return { success: true };
};

/**
 * Claim the second-chance offer and its attempt together before charging the runner-up.
 * An uncertain outcome keeps the offer locked until the charge is confirmed.
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

  if (payment.status !== PaymentStatus.SECOND_CHANCE) {
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

  let stripeCusId = userResult.rows[0]?.stripe_cus_id;

  if (!stripeCusId) {
    stripeCusId = await resolveStripeCustomerDefensively(userId, stripePmId);
    if (!stripeCusId) {
      await transitionToNoSale({
        paymentId: payment.id,
        auctionId,
        payment,
        reason: 'runner_up_no_stripe_customer',
        userId,
      });
      throw { status: 402, code: 'HOLD_FAILED', message: 'Payment account not configured' };
    }
  }

  // Calculate platform fee for the new amount
  const { feeAmount } = await calculatePlatformFee(Number(payment.second_chance_amount));


  const client = await pool.connect();
  let attempt;
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `UPDATE payments SET status = 'hold_pending', updated_at = NOW()
       WHERE id = $1 AND status = 'second_chance' AND second_chance_runner_up_id = $2
       AND second_chance_expires_at > NOW() RETURNING *`,
      [payment.id, userId]
    );
    if (!lock.rowCount) {
      throw {
        status: 422,
        code: 'INVALID_PAYMENT_STATE',
        message: 'Offer has been processed, expired, or state changed',
      };
    }
    attempt = await insertChargeAttempt(client, {
      paymentId: payment.id,
      kind: 'second_chance',
      buyerId: userId,
      amount: lock.rows[0].second_chance_amount,
      feeAmount,
      paymentMethodId: localPmId,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const result = await runChargeAttempt(attempt).catch(() => {
    throw processingError();
  });
  if (!result || result.outcome === 'uncertain') {
    throw processingError();
  }
  if (result.outcome === 'failed') {
    throw {
      status: 402,
      code: 'HOLD_FAILED',
      message: 'Payment hold failed. The auction will end without a sale.',
    };
  }
  return { paymentId: payment.id, status: PaymentStatus.HELD, amount: Number(attempt.amount) };
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

  return { status: PaymentStatus.NO_SALE };
};

/**
 * Helper: Transition a second chance payment to NO_SALE.
 * Used when runner-up's card fails or they have no payment method.
 */
const transitionToNoSale = async ({ paymentId, auctionId, payment, reason, userId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const claimed = await client.query(
      `UPDATE payments SET status = 'no_sale', updated_at = NOW()
       WHERE id = $1 AND status = 'second_chance' AND second_chance_runner_up_id = $2
       RETURNING id`,
      [paymentId, userId]
    );
    if (!claimed.rowCount) {
      throw { status: 422, code: 'INVALID_PAYMENT_STATE', message: 'Offer has already been processed or state changed' };
    }

    await client.query(
      `UPDATE auctions SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
      [auctionId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await writeAuditLogSafely({
    referenceId: paymentId,
    referenceType: 'payment',
    action: 'second_chance_hold_failed',
    deltaState: { runner_up_id: userId, original_buyer_id: payment.original_buyer_id, reason },
    actorId: null,
  });

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

export const getMyPayments = async ({ userId, cursor, limit = 20, status }) => {
  let query = `
    SELECT p.id, p.auction_id AS "auctionId", a.title AS "auctionTitle", p.amount, p.status, p.created_at, p.created_at::text AS "cursorTime", a.status AS "auctionStatus",
           d.id AS "disputeId", d.status AS "disputeStatus"
    FROM payments p
    JOIN auctions a ON p.auction_id = a.id
    LEFT JOIN disputes d ON d.payment_id = p.id
    WHERE p.buyer_id = $1
  `;
  const values = [userId];
  let paramCount = 2;

  if (status) {
    query += ` AND p.status = $${paramCount}`;
    values.push(status);
    paramCount++;
  }

  if (cursor) {
    const [cursorTime, cursorId] = cursor.split('_');
    if (cursorId) {
      query += ` AND (p.created_at, p.id) < ($${paramCount}::timestamptz, $${paramCount + 1})`;
      values.push(cursorTime, cursorId);
      paramCount += 2;
    } else {
      query += ` AND p.created_at < $${paramCount}::timestamptz`;
      values.push(cursorTime);
      paramCount++;
    }
  }

  query += ` ORDER BY p.created_at DESC, p.id DESC LIMIT $${paramCount}`;
  values.push(limit);

  const result = await pool.query(query, values);
  const items = result.rows;

  let nextCursor = null;
  if (items.length > 0 && items.length === Number(limit)) {
    const lastItem = items[items.length - 1];
    nextCursor = `${lastItem.cursorTime}_${lastItem.id}`;
  }

  return {
    items,
    nextCursor
  };
};

export { writeAuditLog };
