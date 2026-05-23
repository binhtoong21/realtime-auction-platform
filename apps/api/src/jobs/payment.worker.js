import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';
import stripe from '../config/stripe.js';
import { writeAuditLog } from '../services/payment.service.js';
import { createPayout } from '../services/payout.service.js';
import { emitToUser, emitToAdmin } from '../services/socket.service.js';
import { scheduleSecondChanceExpiry, scheduleGracePeriodExpiry } from './queue.js';

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

/**
 * Payment Lifecycle Worker — Processes delayed payment jobs.
 *
 * Job types:
 *   - emergency-capture: Day 6 after Auth Hold, force capture if dispute open
 *   - grace-period-expiry: 24h after Hold fail, transition to Second Chance
 *   - second-chance-expiry: 48h after Second Chance offer, timeout to NO_SALE
 *   - payout: Transfer captured funds to seller's Connected Account
 *   - payment-sweeper: Every 10 min, reconcile stuck transitional states
 */
const paymentWorker = new Worker('payment', async (job) => {
  switch (job.name) {
    case 'emergency-capture':
      await processEmergencyCapture(job.data);
      break;
    case 'grace-period-expiry':
      await processGracePeriodExpiry(job.data);
      break;
    case 'second-chance-expiry':
      await processSecondChanceExpiry(job.data);
      break;
    case 'payment-sweeper':
      await processPaymentSweeper();
      break;
    case 'payout':
      await processPayout(job.data);
      break;
    default:
      console.warn(`[PaymentWorker] Unknown job type: ${job.name}`);
  }
}, {
  connection,
  concurrency: 3
});

/**
 * Emergency Capture — Day 6 after Auth Hold.
 *
 * Stripe Auth Hold expires after ~7 days. If a dispute is still open,
 * we must force-capture to prevent losing the funds.
 *
 * Logic:
 *   - If payment is capture_pending (retry after crash) → retrieve PI from Stripe
 *     to determine actual state before deciding action
 *   - If no dispute open → skip (auto-capture or already settled)
 *   - If dispute open + payment still authorized → force capture
 *
 * Error handling:
 *   - StripeCardError / payment_intent_unexpected_state → permanent, no retry
 *   - Transient Stripe errors → throw for BullMQ retry
 */
async function processEmergencyCapture({ paymentId, auctionId }) {
  console.log(`[PaymentWorker] Processing emergency-capture for payment: ${paymentId}`);

  const result = await pool.query(
    `SELECT id, status, stripe_pi_id, buyer_id, seller_id, amount
     FROM payments WHERE id = $1`,
    [paymentId]
  );

  if (result.rows.length === 0) {
    console.log(`[PaymentWorker] Payment ${paymentId} not found. Skipping.`);
    return;
  }

  const payment = result.rows[0];

  // Handle capture_pending (BullMQ retry after crash between Stripe call and DB update)
  if (payment.status === 'capture_pending') {
    console.log(`[PaymentWorker] Payment ${paymentId} stuck in capture_pending. Reconciling with Stripe...`);
    await reconcileCaptureState(payment, auctionId);
    return;
  }

  // Only process if authorized
  if (payment.status !== 'authorized') {
    console.log(`[PaymentWorker] Payment ${paymentId} is '${payment.status}', not authorized. Skipping emergency capture.`);
    return;
  }

  // Check for active disputes (defensive — table may not exist until Phase 11)
  let disputeInfo = null;
  try {
    const disputeResult = await pool.query(
      `SELECT id, status FROM disputes
       WHERE payment_id = $1 AND status IN ('open', 'under_review')
       LIMIT 1`,
      [paymentId]
    );
    if (disputeResult.rowCount > 0) {
      disputeInfo = disputeResult.rows[0];
    }
  } catch (err) {
    if (err.code === '42P01') {
      // relation "disputes" does not exist — not yet deployed
      console.log(`[PaymentWorker] Disputes table not yet created. No disputes possible. Skipping emergency capture.`);
      return;
    }
    throw err;
  }

  // No active dispute → normal capture flow will handle it
  if (!disputeInfo) {
    console.log(`[PaymentWorker] Payment ${paymentId} has no active dispute. Skipping emergency capture.`);
    return;
  }

  // Atomic lock: authorized → capture_pending
  const lockResult = await pool.query(
    `UPDATE payments SET status = 'capture_pending', updated_at = NOW()
     WHERE id = $1 AND status = 'authorized'
     RETURNING id`,
    [paymentId]
  );

  if (lockResult.rowCount === 0) {
    console.log(`[PaymentWorker] Payment ${paymentId} already transitioned. Skipping.`);
    return;
  }

  // Stripe capture OUTSIDE transaction (3-step pattern: lock → Stripe → confirm)
  try {
    await stripe.paymentIntents.capture(payment.stripe_pi_id);

    // Confirm in DB
    await pool.query(
      `UPDATE payments SET status = 'captured', updated_at = NOW() WHERE id = $1`,
      [paymentId]
    );

    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'emergency_capture',
      deltaState: {
        reason: 'auth_expiry_imminent',
        dispute_id: disputeInfo.id,
        dispute_status: disputeInfo.status,
        amount: Number(payment.amount),
        seller_id: payment.seller_id,
        auction_id: auctionId,
        stripe_pi_id: payment.stripe_pi_id,
      },
      actorId: null,
    });

    console.log(`[PaymentWorker] Emergency capture executed for payment ${paymentId}`);

    await emitToAdmin('payment:emergency-capture', {
      paymentId,
      auctionId,
      amount: Number(payment.amount),
      disputeId: disputeInfo.id,
    });

  } catch (err) {
    console.error(`[PaymentWorker] Emergency capture Stripe call failed for ${paymentId}:`, err.message);

    // Distinguish permanent vs transient errors
    const isPermanent = err.type === 'StripeCardError' ||
      (err.type === 'StripeInvalidRequestError' && err.code === 'payment_intent_unexpected_state');

    if (isPermanent) {
      // Check actual Stripe state — maybe it's already captured
      await reconcileCaptureState(payment, auctionId);
      return; // Don't throw — permanent failure, no BullMQ retry
    }

    // Transient error (StripeAPIError, StripeConnectionError) — throw for BullMQ retry
    throw err;
  }
}

/**
 * Reconcile a payment stuck in capture_pending with Stripe's actual PI state.
 *
 * Called when:
 *   - BullMQ retries after crash between Stripe capture and DB update
 *   - Stripe returns payment_intent_unexpected_state during capture
 */
async function reconcileCaptureState(payment, auctionId) {
  if (!payment.stripe_pi_id) {
    console.error(`[PaymentWorker] Payment ${payment.id} in capture_pending but no stripe_pi_id. Alerting admin.`);
    await writeAuditLog({
      referenceId: payment.id,
      referenceType: 'payment',
      action: 'sweeper_admin_alert',
      deltaState: {
        stuck_status: payment.status,
        reason: 'no_stripe_pi_id',
        auction_id: auctionId,
      },
      actorId: null,
    });
    await emitToAdmin('payment:reconciliation-alert', {
      paymentId: payment.id,
      auctionId,
      reason: 'Payment stuck in capture_pending without Stripe PI ID',
    });
    return;
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(payment.stripe_pi_id);

    if (pi.status === 'succeeded') {
      // Stripe already captured — sync DB
      const updateResult = await pool.query(
        `UPDATE payments SET status = 'captured', updated_at = NOW() WHERE id = $1 AND status = $2 RETURNING id`,
        [payment.id, payment.status]
      );
      if (updateResult.rowCount === 0) return;
      await writeAuditLog({
        referenceId: payment.id,
        referenceType: 'payment',
        action: 'emergency_capture',
        deltaState: {
          reason: 'auth_expiry_imminent',
          recovery: 'synced_from_stripe',
          stripe_pi_id: payment.stripe_pi_id,
          amount: Number(payment.amount),
          seller_id: payment.seller_id,
          auction_id: auctionId,
        },
        actorId: null,
      });
      await emitToAdmin('payment:emergency-capture', {
        paymentId: payment.id,
        auctionId,
        amount: Number(payment.amount),
        reconciled: true,
      });
      console.log(`[PaymentWorker] Reconciled payment ${payment.id}: Stripe already captured → DB synced.`);

    } else if (pi.status === 'requires_capture') {
      // Stripe hasn't captured — try again
      await stripe.paymentIntents.capture(payment.stripe_pi_id);
      const updateResult = await pool.query(
        `UPDATE payments SET status = 'captured', updated_at = NOW() WHERE id = $1 AND status = $2 RETURNING id`,
        [payment.id, payment.status]
      );
      if (updateResult.rowCount === 0) return;
      await writeAuditLog({
        referenceId: payment.id,
        referenceType: 'payment',
        action: 'emergency_capture',
        deltaState: {
          reason: 'auth_expiry_imminent',
          recovery: 'retry_after_crash',
          stripe_pi_id: payment.stripe_pi_id,
          amount: Number(payment.amount),
          seller_id: payment.seller_id,
          auction_id: auctionId,
        },
        actorId: null,
      });
      await emitToAdmin('payment:emergency-capture', {
        paymentId: payment.id,
        auctionId,
        amount: Number(payment.amount),
        reconciled: true,
      });
      console.log(`[PaymentWorker] Reconciled payment ${payment.id}: Capture retried successfully.`);

    } else {
      // Unexpected PI state (canceled, requires_payment_method, etc.)
      // Map terminal states appropriately
      const isTerminal = ['canceled', 'requires_payment_method', 'requires_action'].includes(pi.status);
      const newStatus = isTerminal ? 'hold_failed' : 'frozen';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const updateResult = await client.query(
          `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING id`,
          [newStatus, payment.id, payment.status]
        );
        if (updateResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return;
        }
        await writeAuditLog({
          referenceId: payment.id,
          referenceType: 'payment',
          action: 'emergency_capture_failed',
          deltaState: {
            stripe_pi_status: pi.status,
            stripe_pi_id: payment.stripe_pi_id,
            auction_id: auctionId,
            mapped_to: newStatus,
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

      await emitToAdmin('payment:emergency-capture-failed', {
        paymentId: payment.id,
        auctionId,
        stripePiStatus: pi.status,
        message: `Unexpected Stripe PI state: ${pi.status}. Payment mapped to ${newStatus}.`,
      });
      console.warn(`[PaymentWorker] Payment ${payment.id} has unexpected PI state '${pi.status}'. Mapped to ${newStatus}.`);
    }

  } catch (err) {
    console.error(`[PaymentWorker] Reconciliation failed for payment ${payment.id}:`, err.message);
    // Don't revert status — leave as capture_pending for sweeper to pick up
    throw err; // BullMQ will retry
  }
}

/**
 * Grace Period Expiry — 24h after Hold fail.
 *
 * If buyer hasn't successfully retried, transition to Second Chance.
 *
 * Logic:
 *   - If already authorized → skip (buyer retried successfully)
 *   - If still grace_period → transition to second_chance, find runner-up
 */
async function processGracePeriodExpiry({ paymentId, auctionId }) {
  console.log(`[PaymentWorker] Processing grace-period-expiry for payment: ${paymentId}`);

  const result = await pool.query(
    'SELECT id, status, buyer_id, amount FROM payments WHERE id = $1',
    [paymentId]
  );

  if (result.rows.length === 0) {
    console.log(`[PaymentWorker] Payment ${paymentId} not found. Skipping.`);
    return;
  }

  const payment = result.rows[0];

  // Skip if buyer already retried successfully
  if (payment.status === 'authorized') {
    console.log(`[PaymentWorker] Payment ${paymentId} already authorized. Buyer retried OK. Skipping.`);
    return;
  }

  // Only process if still in grace_period
  if (payment.status !== 'grace_period') {
    console.log(`[PaymentWorker] Payment ${paymentId} is '${payment.status}', not grace_period. Skipping.`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mark the failed winner's bid as no longer winning
    await client.query(
      `UPDATE bids SET is_winning = false WHERE auction_id = $1 AND bidder_id = $2 AND is_winning = true`,
      [auctionId, payment.buyer_id]
    );

    // Find runner-up (second highest bid)
    const runnerUpResult = await client.query(
      `SELECT bidder_id, amount FROM bids
       WHERE auction_id = $1 AND bidder_id != $2
       ORDER BY amount DESC
       LIMIT 1`,
      [auctionId, payment.buyer_id]
    );

    if (runnerUpResult.rows.length > 0) {
      const runnerUp = runnerUpResult.rows[0];
      const scExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      // Transition payment to second_chance with runner-up metadata
      const lockResult = await client.query(
        `UPDATE payments
         SET status = 'second_chance',
             second_chance_runner_up_id = $2,
             second_chance_amount = $3,
             second_chance_expires_at = $4,
             updated_at = NOW()
         WHERE id = $1 AND status = 'grace_period'
         RETURNING id`,
        [paymentId, runnerUp.bidder_id, runnerUp.amount, scExpiresAt]
      );

      if (lockResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return;
      }

      // Transition auction status to second_chance
      await client.query(
        `UPDATE auctions SET status = 'second_chance', updated_at = NOW()
         WHERE id = $1`,
        [auctionId]
      );

      // Audit log
      await writeAuditLog({
        referenceId: paymentId,
        referenceType: 'payment',
        action: 'grace_period_expired',
        deltaState: {
          original_buyer_id: payment.buyer_id,
          runner_up_id: runnerUp.bidder_id,
          runner_up_amount: Number(runnerUp.amount),
          second_chance_expires_at: scExpiresAt.toISOString(),
        },
        actorId: null,
      });

      await client.query('COMMIT');

      // Schedule and notify AFTER commit
      try {
        await scheduleSecondChanceExpiry(paymentId, auctionId);
      } catch (scheduleErr) {
        console.error(`[PaymentWorker] Failed to schedule second-chance-expiry for ${paymentId}:`, scheduleErr.message);
      }

      await emitToUser(payment.buyer_id, 'payment:grace-expired', {
        auctionId,
        paymentId,
        message: 'Your grace period has expired. The item will be offered to the next bidder.',
      });

      await emitToUser(runnerUp.bidder_id, 'auction:second-chance', {
        auctionId,
        offerAmount: Number(runnerUp.amount),
        expiresAt: scExpiresAt.toISOString(),
      });

      console.log(`[PaymentWorker] Second chance offered to ${runnerUp.bidder_id} for auction ${auctionId}`);

    } else {
      // No runner-up → NO_SALE
      const lockResult = await client.query(
        `UPDATE payments SET status = 'no_sale', updated_at = NOW()
         WHERE id = $1 AND status = 'grace_period'
         RETURNING id`,
        [paymentId]
      );

      if (lockResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return;
      }

      await client.query(
        `UPDATE auctions SET status = 'no_sale', updated_at = NOW()
         WHERE id = $1`,
        [auctionId]
      );

      await writeAuditLog({
        referenceId: paymentId,
        referenceType: 'payment',
        action: 'grace_period_expired',
        deltaState: {
          original_buyer_id: payment.buyer_id,
          runner_up_id: null,
          reason: 'no_runner_up',
        },
        actorId: null,
      });

      await client.query('COMMIT');

      await emitToUser(payment.buyer_id, 'payment:grace-expired', {
        auctionId,
        paymentId,
        message: 'Your grace period has expired. No other buyers were found.',
      });

      console.log(`[PaymentWorker] No runner-up for auction ${auctionId}. Status → NO_SALE.`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[PaymentWorker] Grace period expiry failed for ${paymentId}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Second Chance Expiry — 48h after offer sent.
 *
 * If runner-up hasn't accepted or declined within 48 hours,
 * auction transitions to NO_SALE.
 */
async function processSecondChanceExpiry({ paymentId, auctionId }) {
  console.log(`[PaymentWorker] Processing second-chance-expiry for payment: ${paymentId}`);

  const result = await pool.query(
    'SELECT id, status, buyer_id, seller_id, second_chance_runner_up_id FROM payments WHERE id = $1',
    [paymentId]
  );

  if (result.rows.length === 0) {
    console.log(`[PaymentWorker] Payment ${paymentId} not found. Skipping.`);
    return;
  }

  const payment = result.rows[0];

  // Skip if already resolved (accepted → authorized, declined → no_sale, etc.)
  if (payment.status !== 'second_chance') {
    console.log(`[PaymentWorker] Payment ${paymentId} is '${payment.status}', not second_chance. Skipping.`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic transition → no_sale
    const lockResult = await client.query(
      `UPDATE payments SET status = 'no_sale', updated_at = NOW()
       WHERE id = $1 AND status = 'second_chance'
       RETURNING id`,
      [paymentId]
    );

    if (lockResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE auctions SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
      [auctionId]
    );

    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'second_chance_expired',
      deltaState: {
        runner_up_id: payment.second_chance_runner_up_id,
        original_buyer_id: payment.buyer_id,
        reason: 'timeout_48h',
      },
      actorId: null,
    });

    await client.query('COMMIT');

    // Notifications after commit
    if (payment.second_chance_runner_up_id) {
      await emitToUser(payment.second_chance_runner_up_id, 'auction:second-chance-expired', {
        auctionId,
        message: 'Your second chance offer has expired.',
      });
    }

    await emitToUser(payment.seller_id, 'auction:no-sale', {
      auctionId,
      message: 'No buyer found for your auction.',
    });

    // Notify original winner that the auction ended without a sale
    await emitToUser(payment.buyer_id, 'auction:no-sale', {
      auctionId,
      message: 'The auction has ended without a sale.',
    });

    console.log(`[PaymentWorker] Second chance expired for payment ${paymentId}. Status → NO_SALE.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[PaymentWorker] Second chance expiry failed for ${paymentId}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Payment Sweeper — Periodic reconciliation for stuck transitional states.
 *
 * Runs every 10 minutes via BullMQ repeatable job.
 * Catches payments stuck in capture_pending or hold_pending for > 10 minutes,
 * which indicates a crash between the Stripe API call and the DB update.
 *
 * For each stuck payment:
 *   - If stripe_pi_id exists → retrieve PI from Stripe and reconcile
 *   - If stripe_pi_id is NULL → alert Admin (cannot auto-reconcile)
 */
async function processPaymentSweeper() {
  console.log('[PaymentWorker] Running payment sweeper...');

  const stuckResult = await pool.query(
    `SELECT id, status, stripe_pi_id, auction_id, buyer_id, seller_id, amount, updated_at
     FROM payments
     WHERE status IN ('capture_pending', 'hold_pending')
       AND updated_at < NOW() - INTERVAL '10 minutes'`
  );

  if (stuckResult.rows.length > 0) {
    console.log(`[PaymentWorker] Sweeper: Found ${stuckResult.rows.length} stuck payment(s).`);
    for (const payment of stuckResult.rows) {
      try {
        await sweepSinglePayment(payment);
      } catch (err) {
        console.error(`[PaymentWorker] Sweeper: Failed to reconcile payment ${payment.id}:`, err.message);
      }
    }
  } else {
    console.log('[PaymentWorker] Sweeper: No stuck payments found.');
  }

  // 2. Fallback for stuck grace_period payments
  const stuckGraceResult = await pool.query(
    `SELECT id, auction_id FROM payments
     WHERE status = 'grace_period' AND grace_expires_at < NOW()`
  );
  if (stuckGraceResult.rows.length > 0) {
    for (const payment of stuckGraceResult.rows) {
      try {
        const claim = await pool.query(
          `UPDATE payments SET updated_at = NOW() WHERE id = $1 AND status = 'grace_period' AND grace_expires_at < NOW() RETURNING id`,
          [payment.id]
        );
        if (claim.rowCount > 0) {
          try {
            await scheduleGracePeriodExpiry(payment.id, payment.auction_id);
            console.log(`[PaymentWorker] Sweeper: Rescheduled stuck grace-period-expiry for ${payment.id}`);
          } catch (enqueueErr) {
            console.error(`[PaymentWorker] Sweeper: Failed to reschedule grace_period for ${payment.id}:`, enqueueErr.message);
          }
        }
      } catch (err) {
        console.error(`[PaymentWorker] Sweeper: Failed to sweep grace_period for ${payment.id}:`, err.message);
      }
    }
  }

  // 3. Payout sweep: captured payments that should have been transferred
  try {
    await sweepPendingPayouts();
  } catch (err) {
    console.error('[PaymentWorker] Sweeper: Payout sweep failed:', err.message);
  }
}

/**
 * Reconcile a single stuck payment with Stripe.
 */
async function sweepSinglePayment(payment) {
  // Atomic DB claim to prevent concurrent worker races
  const claimResult = await pool.query(
    `UPDATE payments SET updated_at = NOW()
     WHERE id = $1 AND status = $2 AND updated_at < NOW() - INTERVAL '10 minutes'
     RETURNING id`,
    [payment.id, payment.status]
  );
  if (claimResult.rowCount === 0) {
    console.log(`[PaymentWorker] Sweeper: Payment ${payment.id} already claimed. Skipping.`);
    return;
  }
  // No stripe_pi_id → cannot auto-reconcile, alert Admin
  if (!payment.stripe_pi_id) {
    console.warn(`[PaymentWorker] Sweeper: Payment ${payment.id} (${payment.status}) has no stripe_pi_id. Alerting admin.`);
    await writeAuditLog({
      referenceId: payment.id,
      referenceType: 'payment',
      action: 'sweeper_admin_alert',
      deltaState: {
        stuck_status: payment.status,
        reason: 'no_stripe_pi_id',
        auction_id: payment.auction_id,
        age_minutes: '> 10',
      },
      actorId: null,
    });
    await emitToAdmin('payment:reconciliation-alert', {
      paymentId: payment.id,
      auctionId: payment.auction_id,
      status: payment.status,
      reason: `Payment stuck in ${payment.status} without Stripe PI ID for > 10 minutes`,
    });
    return;
  }

  // Retrieve actual state from Stripe
  const pi = await stripe.paymentIntents.retrieve(payment.stripe_pi_id);

  if (payment.status === 'capture_pending') {
    await sweepCapturePending(payment, pi);
  } else if (payment.status === 'hold_pending') {
    await sweepHoldPending(payment, pi);
  }
}

/**
 * Reconcile a payment stuck in capture_pending.
 */
async function sweepCapturePending(payment, pi) {
  if (pi.status === 'succeeded') {
    // Already captured on Stripe — sync DB
    const updateResult = await pool.query(
      `UPDATE payments SET status = 'captured', updated_at = NOW() WHERE id = $1 AND status = 'capture_pending' RETURNING id`,
      [payment.id]
    );
    if (updateResult.rowCount === 0) return;
    await writeAuditLog({
      referenceId: payment.id,
      referenceType: 'payment',
      action: 'sweeper_capture_synced',
      deltaState: {
        stripe_pi_id: payment.stripe_pi_id,
        stripe_pi_status: 'succeeded',
        amount: Number(payment.amount),
        auction_id: payment.auction_id,
      },
      actorId: null,
    });
    console.log(`[PaymentWorker] Sweeper: Payment ${payment.id} capture synced from Stripe.`);

  } else if (pi.status === 'requires_capture') {
    // Stripe hasn't captured — try again
    try {
      await stripe.paymentIntents.capture(payment.stripe_pi_id);
      const updateResult = await pool.query(
        `UPDATE payments SET status = 'captured', updated_at = NOW() WHERE id = $1 AND status = 'capture_pending' RETURNING id`,
        [payment.id]
      );
      if (updateResult.rowCount === 0) return;
      await writeAuditLog({
        referenceId: payment.id,
        referenceType: 'payment',
        action: 'sweeper_capture_synced',
        deltaState: {
          stripe_pi_id: payment.stripe_pi_id,
          stripe_pi_status: 'requires_capture',
          synced_to: 'captured',
          auction_id: payment.auction_id,
        },
        actorId: null,
      });
      console.log(`[PaymentWorker] Sweeper: Payment ${payment.id} capture retried successfully.`);
    } catch (captureErr) {
      console.error(`[PaymentWorker] Sweeper: Payment ${payment.id} capture attempt failed:`, captureErr.message);
      
      const isPermanent = captureErr.type === 'StripeCardError' ||
        (captureErr.type === 'StripeInvalidRequestError' && captureErr.code === 'payment_intent_unexpected_state');

      if (isPermanent) {
        console.log(`[PaymentWorker] Sweeper: Payment ${payment.id} encountered permanent capture failure. Reconciling with Stripe PI state.`);
        // Re-retrieve actual PI state from Stripe
        const updatedPi = await stripe.paymentIntents.retrieve(payment.stripe_pi_id);
        
        // Log the error and actual status
        await writeAuditLog({
          referenceId: payment.id,
          referenceType: 'payment',
          action: 'sweeper_capture_failed',
          deltaState: {
            stripe_pi_id: payment.stripe_pi_id,
            error: captureErr.message,
            stripe_pi_status: updatedPi.status,
            auction_id: payment.auction_id,
          },
          actorId: null,
        });

        // Reconcile DB with actual PI status
        await reconcileCaptureState(payment, payment.auction_id);
      } else {
        // Rethrow transient errors so the sweeper job can try again later
        throw captureErr;
      }
    }

  } else {
    // Unexpected state — alert Admin
    await writeAuditLog({
      referenceId: payment.id,
      referenceType: 'payment',
      action: 'sweeper_admin_alert',
      deltaState: {
        stuck_status: 'capture_pending',
        stripe_pi_id: payment.stripe_pi_id,
        stripe_pi_status: pi.status,
        auction_id: payment.auction_id,
      },
      actorId: null,
    });
    await emitToAdmin('payment:reconciliation-alert', {
      paymentId: payment.id,
      auctionId: payment.auction_id,
      stripePiStatus: pi.status,
      reason: `Unexpected Stripe PI state '${pi.status}' for capture_pending payment`,
    });
    console.warn(`[PaymentWorker] Sweeper: Payment ${payment.id} has unexpected PI state '${pi.status}'. Admin alerted.`);
  }
}

/**
 * Reconcile a payment stuck in hold_pending.
 */
async function sweepHoldPending(payment, pi) {
  if (pi.status === 'requires_capture') {
    // Hold succeeded on Stripe but DB wasn't updated — sync to authorized
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updateResult = await client.query(
        `UPDATE payments SET status = 'authorized', stripe_pi_id = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'hold_pending' RETURNING id`,
        [payment.stripe_pi_id, payment.id]
      );
      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return;
      }
      await client.query(
        `UPDATE auctions SET status = 'awaiting_ship', updated_at = NOW() WHERE id = $1`,
        [payment.auction_id]
      );
      await writeAuditLog({
        referenceId: payment.id,
        referenceType: 'payment',
        action: 'sweeper_capture_synced',
        deltaState: {
          stripe_pi_id: payment.stripe_pi_id,
          stripe_pi_status: 'requires_capture',
          synced_to: 'authorized',
          auction_id: payment.auction_id,
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
    console.log(`[PaymentWorker] Sweeper: Payment ${payment.id} hold synced → authorized.`);

  } else if (pi.status === 'canceled' || pi.status === 'requires_payment_method') {
    // Hold failed on Stripe — transition to grace_period
    const graceExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updateResult = await client.query(
        `UPDATE payments SET status = 'grace_period', grace_expires_at = $1,
                capture_attempts = capture_attempts + 1, updated_at = NOW()
         WHERE id = $2 AND status = 'hold_pending' RETURNING id`,
        [graceExpiresAt, payment.id]
      );
      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return;
      }
      await client.query(
        `UPDATE auctions SET status = 'pending_payment', updated_at = NOW() WHERE id = $1`,
        [payment.auction_id]
      );
      await writeAuditLog({
        referenceId: payment.id,
        referenceType: 'payment',
        action: 'sweeper_hold_reverted',
        deltaState: {
          stripe_pi_id: payment.stripe_pi_id,
          stripe_pi_status: pi.status,
          reverted_to: 'grace_period',
          grace_expires_at: graceExpiresAt.toISOString(),
          auction_id: payment.auction_id,
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
    
    // Schedule grace-period-expiry follow-up job
    try {
      await scheduleGracePeriodExpiry(payment.id, payment.auction_id);
    } catch (enqueueErr) {
      console.error(`[PaymentWorker] Sweeper: Failed to enqueue grace-period-expiry for ${payment.id}:`, enqueueErr.message);
      await emitToAdmin('payment:reconciliation-alert', {
        paymentId: payment.id,
        auctionId: payment.auction_id,
        reason: `Payment recovered to grace_period but failed to enqueue expiry job.`,
      });
    }
    console.log(`[PaymentWorker] Sweeper: Payment ${payment.id} hold failed on Stripe → grace_period.`);

  } else {
    // Unexpected state — alert Admin
    await writeAuditLog({
      referenceId: payment.id,
      referenceType: 'payment',
      action: 'sweeper_admin_alert',
      deltaState: {
        stuck_status: 'hold_pending',
        stripe_pi_id: payment.stripe_pi_id,
        stripe_pi_status: pi.status,
        auction_id: payment.auction_id,
      },
      actorId: null,
    });
    await emitToAdmin('payment:reconciliation-alert', {
      paymentId: payment.id,
      auctionId: payment.auction_id,
      stripePiStatus: pi.status,
      reason: `Unexpected Stripe PI state '${pi.status}' for hold_pending payment`,
    });
    console.warn(`[PaymentWorker] Sweeper: Payment ${payment.id} has unexpected PI state '${pi.status}'. Admin alerted.`);
  }
}

/**
 * Process a payout job — transfer funds to seller's Connected Account.
 */
async function processPayout({ paymentId }) {
  console.log(`[PaymentWorker] Processing payout for payment: ${paymentId}`);

  const result = await createPayout(paymentId);

  if (result.transferred) {
    console.log(`[PaymentWorker] Payout completed for payment ${paymentId}`);
  } else {
    const level = result.retry ? 'warn' : 'log';
    console[level](`[PaymentWorker] Payout skipped for payment ${paymentId}: ${result.reason}`);
  }
}

/**
 * Sweep captured payments that should have been transferred.
 *
 * Unified query covers:
 *   - Payout job dispatch failed (Redis down during webhook)
 *   - Phase 11 forgot to dispatch payout after dispute resolved
 *   - Seller was not onboarded at payout time, now onboarded
 *   - Crash recovery via idempotency key
 *
 * Filters:
 *   - Only seller with payouts_enabled (skip unboarded sellers)
 *   - No active disputes (LEFT JOIN filter)
 *   - Older than 10 minutes (avoid race with normal payout job)
 */
async function sweepPendingPayouts() {
  let pendingResult;
  try {
    pendingResult = await pool.query(
      `SELECT p.id, p.auction_id, p.seller_id
       FROM payments p
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN disputes d ON d.payment_id = p.id AND d.status IN ('open', 'under_review')
       WHERE p.status = 'captured'
         AND p.stripe_transfer_id IS NULL
         AND p.updated_at < NOW() - INTERVAL '10 minutes'
         AND u.connect_status = 'payouts_enabled'
         AND d.id IS NULL`
    );
  } catch (err) {
    if (err.code === '42P01') {
      // disputes table not yet created — run without dispute filter
      pendingResult = await pool.query(
        `SELECT p.id, p.auction_id, p.seller_id
         FROM payments p
         JOIN users u ON u.id = p.seller_id
         WHERE p.status = 'captured'
           AND p.stripe_transfer_id IS NULL
           AND p.updated_at < NOW() - INTERVAL '10 minutes'
           AND u.connect_status = 'payouts_enabled'`
      );
    } else {
      throw err;
    }
  }

  if (pendingResult.rows.length === 0) {
    return;
  }

  console.log(`[PaymentWorker] Sweeper: Found ${pendingResult.rows.length} payment(s) pending payout.`);

  for (const payment of pendingResult.rows) {
    try {
      const result = await createPayout(payment.id);
      if (result.transferred) {
        console.log(`[PaymentWorker] Sweeper: Payout completed for payment ${payment.id}`);
      } else {
        console.log(`[PaymentWorker] Sweeper: Payout skipped for payment ${payment.id}: ${result.reason}`);
      }
    } catch (err) {
      console.error(`[PaymentWorker] Sweeper: Payout failed for payment ${payment.id}:`, err.message);
    }
  }
}

paymentWorker.on('completed', (job) => {
  console.log(`[PaymentWorker] Job ${job.id} (${job.name}) completed.`);
});

paymentWorker.on('failed', (job, err) => {
  console.error(`[PaymentWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

export default paymentWorker;
