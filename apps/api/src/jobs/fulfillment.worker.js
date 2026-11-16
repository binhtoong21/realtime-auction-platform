import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { pool } from '../config/database.js';
import { AuctionStatus, EventNames } from '@auction/shared-constants';
import { emitToUser } from '../services/socket.service.js';
import { ensureJobScheduled } from './queue.js';
import { autoConfirmDelivery, expireShippingDeadline } from '../services/fulfillment.service.js';

const connection = createRedisConnection('fulfillment-worker');


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

  if (auction.status !== AuctionStatus.AWAITING_SHIP) return;

  await emitToUser(auction.seller_id, EventNames.SHIPPING_REMINDER, {
    auctionId,
    message: 'Bạn còn 2 ngày để giao hàng. Hãy cập nhật mã vận đơn để tránh bị hủy tự động.'
  });
}

async function processShippingDeadline(auctionId) {
  return expireShippingDeadline(auctionId);
}

async function processDeliveryAutoConfirm(auctionId) {
  // Guard 1: Check for open disputes
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
    // 42P01 = undefined_table (disputes table doesn't exist yet)
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

  if (auction.status !== AuctionStatus.SHIPPED) return;

  const daysLeft = type === 'day10' ? 4 : 1;
  const message = `Bạn còn ${daysLeft} ngày để xác nhận nhận hàng hoặc mở khiếu nại. Sau thời gian này hệ thống sẽ tự động chuyển tiền cho người bán.`;

  await emitToUser(auction.buyer_id, EventNames.DELIVERY_REMINDER, {
    auctionId,
    message
  });
}

async function processFulfillmentSweeper() {
  console.log(`[FulfillmentWorker] Sweeper started`);

  // Initialize/bootstrap jobs from database
  // Optimization note: Can add updated_at > NOW() - INTERVAL '30 minutes' if scaling is needed
  const auctionsResult = await pool.query(
    `SELECT id, status, shipping_deadline_at, delivery_deadline_at, shipped_at
     FROM auctions
     WHERE (status = 'awaiting_ship' AND shipping_deadline_at IS NOT NULL)
        OR (status = 'shipped' AND delivery_deadline_at IS NOT NULL)`
  );

  for (const auction of auctionsResult.rows) {
    if (auction.status === AuctionStatus.AWAITING_SHIP) {
      await ensureJobScheduled('shipping-deadline', auction.id, auction.shipping_deadline_at);
      const reminderTime = new Date(auction.shipping_deadline_at).getTime() - (2 * 24 * 60 * 60 * 1000);
      await ensureJobScheduled('shipping-reminder', auction.id, new Date(reminderTime));
    } else if (auction.status === AuctionStatus.SHIPPED) {
      await ensureJobScheduled('delivery-auto-confirm', auction.id, auction.delivery_deadline_at);
      
      const deadlineTime = new Date(auction.delivery_deadline_at).getTime();
      const reminder10Time = deadlineTime - (4 * 24 * 60 * 60 * 1000); // 14-4=10, 21-4=17 (which is day 10 of extension)
      const reminder13Time = deadlineTime - (1 * 24 * 60 * 60 * 1000);
      
      await ensureJobScheduled('delivery-reminder', auction.id, new Date(reminder10Time), { type: 'day10' });
      await ensureJobScheduled('delivery-reminder', auction.id, new Date(reminder13Time), { type: 'day13' });
    }
  }

  // Catch-up is implicitly handled: if runAt is in the past, ensureJobScheduled sets delay=0
}

fulfillmentWorker.on('completed', (job) => {
  console.log(`[FulfillmentWorker] Job ${job.id} (${job.name}) completed.`);
});

fulfillmentWorker.on('failed', (job, err) => {
  console.error(`[FulfillmentWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

export default fulfillmentWorker;
