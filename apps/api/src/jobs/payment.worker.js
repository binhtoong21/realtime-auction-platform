import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';
import stripe from '../config/stripe.js';
import { writeAuditLog } from '../services/payment.service.js';
import { emitToUser, emitToAdmin } from '../services/socket.service.js';

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

/**
 * Payment Lifecycle Worker — Processes delayed payment jobs.
 *
 * Job types:
 *   - emergency-capture: Day 6 after Auth Hold, force capture if dispute open
 *   - grace-period-expiry: 24h after Hold fail, transition to Second Chance
 */
const paymentWorker = new Worker('payment', async (job) => {
  switch (job.name) {
    case 'emergency-capture':
      await processEmergencyCapture(job.data);
      break;
    case 'grace-period-expiry':
      await processGracePeriodExpiry(job.data);
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
 *   - If no dispute open → skip (auto-capture or already settled)
 *   - If dispute open + payment still authorized → force capture
 */
async function processEmergencyCapture({ paymentId, auctionId }) {
  console.log(`[PaymentWorker] Processing emergency-capture for payment: ${paymentId}`);

  const result = await pool.query(
    `SELECT p.id, p.status, p.stripe_pi_id, p.buyer_id, p.seller_id, p.amount,
            d.id AS dispute_id, d.status AS dispute_status
     FROM payments p
     LEFT JOIN disputes d ON d.payment_id = p.id AND d.status IN ('open', 'under_review')
     WHERE p.id = $1`,
    [paymentId]
  );

  if (result.rows.length === 0) {
    console.log(`[PaymentWorker] Payment ${paymentId} not found. Skipping.`);
    return;
  }

  const payment = result.rows[0];

  // Skip if not in authorized state (already captured, refunded, etc.)
  if (payment.status !== 'authorized') {
    console.log(`[PaymentWorker] Payment ${paymentId} is '${payment.status}', not authorized. Skipping emergency capture.`);
    return;
  }

  // Skip if no active dispute — normal capture flow will handle it
  if (!payment.dispute_id) {
    console.log(`[PaymentWorker] Payment ${paymentId} has no active dispute. Skipping emergency capture.`);
    return;
  }

  // Force capture
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic status check — claim the payment by setting to 'capture_pending'
    const lockResult = await client.query(
      `UPDATE payments SET status = 'capture_pending', updated_at = NOW()
       WHERE id = $1 AND status = 'authorized'
       RETURNING id`,
      [paymentId]
    );

    if (lockResult.rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      console.log(`[PaymentWorker] Payment ${paymentId} already transitioned. Skipping.`);
      return;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
  client.release();

  try {
    // Stripe capture OUTSIDE transaction
    await stripe.paymentIntents.capture(payment.stripe_pi_id);

    // Confirm in DB
    await pool.query(
      `UPDATE payments SET status = 'captured', updated_at = NOW() WHERE id = $1`,
      [paymentId]
    );

    // Audit log
    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'emergency_capture',
      deltaState: {
        reason: 'auth_expiry_imminent',
        dispute_id: payment.dispute_id,
        dispute_status: payment.dispute_status,
        amount: Number(payment.amount),
      },
      actorId: null,
    });

    console.log(`[PaymentWorker] Emergency capture executed for payment ${paymentId}`);

    // Notify admin
    await emitToAdmin('payment:emergency-capture', {
      paymentId,
      auctionId,
      amount: Number(payment.amount),
      disputeId: payment.dispute_id,
    });

  } catch (err) {
    console.error(`[PaymentWorker] Emergency capture failed for ${paymentId}:`, err.message);
    throw err; // BullMQ will retry (Needs a reconciliation job to retry capture_pending later)
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

    // Atomic status transition for payment
    const lockResult = await client.query(
      `UPDATE payments SET status = 'second_chance', updated_at = NOW()
       WHERE id = $1 AND status = 'grace_period'
       RETURNING id`,
      [paymentId]
    );

    if (lockResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return;
    }

    // Also transition auction status to second_chance
    await client.query(
      `UPDATE auctions SET status = 'second_chance', updated_at = NOW()
       WHERE id = $1`,
      [auctionId]
    );

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

    // Audit log
    await writeAuditLog({
      referenceId: paymentId,
      referenceType: 'payment',
      action: 'grace_period_expired',
      deltaState: {
        original_buyer_id: payment.buyer_id,
        runner_up_id: runnerUpResult.rows[0]?.bidder_id || null,
        runner_up_amount: runnerUpResult.rows[0] ? Number(runnerUpResult.rows[0].amount) : null,
      },
      actorId: null,
    });

    // Notify original winner they lost the purchase
    await emitToUser(payment.buyer_id, 'payment:grace-expired', {
      auctionId,
      paymentId,
      message: 'Your grace period has expired. The item will be offered to the next bidder.',
    });

    // Notify runner-up if exists (Second Chance will be implemented in Phase 9.7)
    if (runnerUpResult.rows.length > 0) {
      const runnerUp = runnerUpResult.rows[0];
      await emitToUser(runnerUp.bidder_id, 'auction:second-chance', {
        auctionId,
        offerAmount: Number(runnerUp.amount),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });
      console.log(`[PaymentWorker] Second chance offered to ${runnerUp.bidder_id} for auction ${auctionId}`);
    } else {
      // No runner-up → NO_SALE
      await client.query(
        `UPDATE payments SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
        [paymentId]
      );
      await client.query(
        `UPDATE auctions SET status = 'no_sale', updated_at = NOW() WHERE id = $1`,
        [auctionId]
      );
      console.log(`[PaymentWorker] No runner-up for auction ${auctionId}. Status → NO_SALE.`);
    }

    await client.query('COMMIT');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[PaymentWorker] Grace period expiry failed for ${paymentId}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

paymentWorker.on('completed', (job) => {
  console.log(`[PaymentWorker] Job ${job.id} (${job.name}) completed.`);
});

paymentWorker.on('failed', (job, err) => {
  console.error(`[PaymentWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

export default paymentWorker;
