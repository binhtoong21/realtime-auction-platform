import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';
import stripe from '../config/stripe.js';
import { EventNames } from '@auction/shared-constants';
import { emitToUser } from '../services/socket.service.js';
import { writeAuditLog } from '../services/auditLogger.js';
import { ensureJobScheduled } from './queue.js';
import { autoConfirmDelivery } from '../services/fulfillment.service.js';

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const fulfillmentWorker = new Worker('fulfillment', async (job) => {
  const { name, data } = job;
  const { auctionId } = data;

  switch (name) {
    case 'shipping-reminder':
      await processShippingReminder(auctionId);
      break;
    case 'shipping-deadline':
      await processShippingDeadline(auctionId);
      break;
    case 'delivery-auto-confirm':
      await processDeliveryAutoConfirm(auctionId);
      break;
    case 'delivery-reminder':
      await processDeliveryReminder(auctionId, data.type);
      break;
    case 'fulfillment-sweeper':
      await processFulfillmentSweeper();
      break;
    default:
      console.warn(`[FulfillmentWorker] Unknown job name: ${name}`);
  }
}, { connection });

async function processShippingReminder(auctionId) {
  const result = await pool.query(
    `SELECT a.id, a.status, p.seller_id
     FROM auctions a
     JOIN payments p ON p.auction_id = a.id
     WHERE a.id = $1`,
    [auctionId]
  );
  if (result.rowCount === 0) return;
  const auction = result.rows[0];

  if (auction.status !== 'awaiting_ship') return;

  await emitToUser(auction.seller_id, EventNames.SHIPPING_REMINDER, {
    auctionId,
    message: 'Bạn còn 2 ngày để giao hàng. Hãy cập nhật mã vận đơn để tránh bị hủy tự động.'
  });
}

async function processShippingDeadline(auctionId) {
  const client = await pool.connect();
  let paymentId, stripePiId, sellerId, buyerId;

  try {
    await client.query('BEGIN');

    // 1. Lock and transition to releasing
    const lockResult = await client.query(
      `UPDATE payments p
       SET status = 'releasing', updated_at = NOW()
       FROM auctions a
       WHERE p.auction_id = a.id
         AND p.auction_id = $1
         AND p.status = 'authorized'
         AND a.status = 'awaiting_ship'
         AND a.shipping_deadline_at <= NOW()
       RETURNING p.id, p.stripe_pi_id, p.seller_id, p.buyer_id`,
      [auctionId]
    );

    if (lockResult.rowCount === 0) {
      await client.query('ROLLBACK');
      console.log(`[FulfillmentWorker] shipping-deadline skipped for auction ${auctionId} - not authorized (idempotent guard)`);
      return;
    }

    const payment = lockResult.rows[0];
    paymentId = payment.id;
    stripePiId = payment.stripe_pi_id;
    sellerId = payment.seller_id;
    buyerId = payment.buyer_id;

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  // 2. Stripe Cancel
  let stripeCanceled = false;
  try {
    const cancelResult = await stripe.paymentIntents.cancel(stripePiId);
    if (cancelResult.status === 'canceled') {
      stripeCanceled = true;
    }
  } catch (stripeErr) {
    console.error(`[FulfillmentWorker] Stripe cancel failed for shipping-deadline ${auctionId}:`, stripeErr.message);
    
    // Check for permanent errors (already canceled/expired)
    const isPermanent = 
      stripeErr.code === 'payment_intent_unexpected_state' ||
      stripeErr.type === 'StripeInvalidRequestError' ||
      stripeErr.message?.includes('cannot be canceled');

    if (isPermanent) {
      console.warn(`[FulfillmentWorker] Stripe PI already expired/canceled, proceeding with DB cleanup for ${auctionId}`);
      stripeCanceled = true;
    } else {
      // Transient error, let BullMQ retry
      throw stripeErr;
    }
  }

  // 3. DB Finalize
  if (stripeCanceled) {
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');

      await client2.query(
        `UPDATE payments SET status = 'released', updated_at = NOW() WHERE id = $1`,
        [paymentId]
      );

      const auctionUpdate = await client2.query(
        `UPDATE auctions SET status = 'no_sale', updated_at = NOW() WHERE id = $1 AND status = 'awaiting_ship'`,
        [auctionId]
      );
      if (auctionUpdate.rowCount === 0) {
        throw new Error(`State mismatch: Auction ${auctionId} was not awaiting_ship during shipping-deadline DB finalize.`);
      }

      await writeAuditLog({
        referenceId: paymentId,
        referenceType: 'payment',
        action: 'shipping_overdue_refund',
        deltaState: { status: 'released', auctionStatus: 'no_sale' },
        actorId: null, // System action
      }, client2);

      await client2.query('COMMIT');
    } catch (dbErr) {
      try { await client2.query('ROLLBACK'); } catch (_) { /* ignore */ }
      console.error(`[FulfillmentWorker] DB cleanup failed after cancel for payment ${paymentId}`, dbErr);
      throw dbErr;
    } finally {
      client2.release();
    }

    // 4. Notifications
    Promise.allSettled([
      emitToUser(sellerId, EventNames.SHIPPING_OVERDUE, {
        auctionId,
        message: 'Đơn hàng đã bị hủy do quá hạn giao. Tiền đã được hoàn lại cho người mua.'
      }),
      emitToUser(buyerId, EventNames.PAYMENT_STATUS, {
        status: 'refunded',
        message: 'Người bán không giao hàng đúng hạn. Tiền đã được hoàn lại cho bạn.'
      })
    ]).then(results => {
      results.forEach((res, index) => {
        if (res.status === 'rejected') {
          console.error(`[FulfillmentWorker] shipping-deadline side-effect [${index}] failed:`, res.reason);
        }
      });
    });
  }
}

async function processDeliveryAutoConfirm(auctionId) {
  // Guard 1: Check for open disputes (forward-compatible with Phase 11)
  let hasDispute = false;
  try {
    const disputeResult = await pool.query(
      `SELECT id FROM disputes
       WHERE auction_id = $1 AND status IN ('open', 'under_review')
       LIMIT 1`,
      [auctionId]
    );
    if (disputeResult.rowCount > 0) hasDispute = true;
  } catch (err) {
    // 42P01 = undefined_table (disputes table doesn't exist yet, Phase 11 not applied)
    if (err.code !== '42P01') throw err;
  }

  if (hasDispute) {
    console.log(`[FulfillmentWorker] autoConfirmDelivery skipped for auction ${auctionId} - dispute exists`);
    return;
  }

  // Proceed with auto confirm
  await autoConfirmDelivery(auctionId);
}

async function processDeliveryReminder(auctionId, type) {
  const result = await pool.query(
    `SELECT a.id, a.status, p.buyer_id
     FROM auctions a
     JOIN payments p ON p.auction_id = a.id
     WHERE a.id = $1`,
    [auctionId]
  );
  if (result.rowCount === 0) return;
  const auction = result.rows[0];

  if (auction.status !== 'shipped') return;

  const daysLeft = type === 'day10' ? 4 : 1;
  const message = `Bạn còn ${daysLeft} ngày để xác nhận nhận hàng hoặc mở khiếu nại. Sau thời gian này hệ thống sẽ tự động chuyển tiền cho người bán.`;

  await emitToUser(auction.buyer_id, EventNames.DELIVERY_REMINDER, {
    auctionId,
    message
  });
}

async function processFulfillmentSweeper() {
  console.log(`[FulfillmentWorker] Sweeper started`);

  // Bootstrap Phase
  // Optimization note: Can add updated_at > NOW() - INTERVAL '30 minutes' if scaling is needed
  const auctionsResult = await pool.query(
    `SELECT id, status, shipping_deadline_at, delivery_deadline_at, shipped_at
     FROM auctions
     WHERE (status = 'awaiting_ship' AND shipping_deadline_at IS NOT NULL)
        OR (status = 'shipped' AND delivery_deadline_at IS NOT NULL)`
  );

  for (const auction of auctionsResult.rows) {
    if (auction.status === 'awaiting_ship') {
      await ensureJobScheduled('shipping-deadline', auction.id, auction.shipping_deadline_at);
      const reminderTime = new Date(auction.shipping_deadline_at).getTime() - (2 * 24 * 60 * 60 * 1000);
      await ensureJobScheduled('shipping-reminder', auction.id, new Date(reminderTime));
    } else if (auction.status === 'shipped') {
      await ensureJobScheduled('delivery-auto-confirm', auction.id, auction.delivery_deadline_at);
      
      const deadlineTime = new Date(auction.delivery_deadline_at).getTime();
      const reminder10Time = deadlineTime - (4 * 24 * 60 * 60 * 1000); // 14-4=10, 21-4=17 (which is day 10 of extension)
      const reminder13Time = deadlineTime - (1 * 24 * 60 * 60 * 1000);
      
      await ensureJobScheduled('delivery-reminder', auction.id, new Date(reminder10Time), { type: 'day10' });
      await ensureJobScheduled('delivery-reminder', auction.id, new Date(reminder13Time), { type: 'day13' });
    }
  }

  // Catch-up Phase is implicitly handled: if runAt is in the past, ensureJobScheduled sets delay=0
}

fulfillmentWorker.on('completed', (job) => {
  console.log(`[FulfillmentWorker] Job ${job.id} (${job.name}) completed.`);
});

fulfillmentWorker.on('failed', (job, err) => {
  console.error(`[FulfillmentWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

export default fulfillmentWorker;
