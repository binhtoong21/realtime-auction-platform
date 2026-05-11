import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';
import { scheduleAuctionEnd } from './queue.js';
import { emitToAuctionRoom, emitToUser } from '../services/socket.service.js';

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

/**
 * Auction End Worker — Lazy Evaluation pattern.
 *
 * Key behavior:
 * 1. Check if end_at has been extended by Anti-snipe.
 *    If yes → reschedule a new delayed job and EXIT.
 *    If no  → proceed to determine winner and finalize.
 * 2. Determine winner (highest bid).
 * 3. Update auction status to 'ended'.
 * 4. Emit WebSocket events (auction:ended, auction:won, auction:lost).
 * 5. TODO: Trigger Stripe Auth Hold on winner's card.
 */
const auctionEndWorker = new Worker('auction', async (job) => {
  const { auctionId } = job.data;
  console.log(`[Worker] Processing auction-end for: ${auctionId}`);

  // 1. Lazy Evaluation: Check if auction has been extended (Anti-snipe)
  const auctionResult = await pool.query(
    'SELECT id, status, end_at, current_price, reserve_price, winner_id FROM auctions WHERE id = $1',
    [auctionId]
  );

  if (auctionResult.rowCount === 0) {
    console.log(`[Worker] Auction ${auctionId} not found. Skipping.`);
    return;
  }

  const auction = auctionResult.rows[0];

  // Skip if already ended (idempotent)
  if (auction.status !== 'active') {
    console.log(`[Worker] Auction ${auctionId} is already '${auction.status}'. Skipping.`);
    return;
  }

  // Lazy Evaluation: If end_at has been pushed forward by Anti-snipe, reschedule
  const now = new Date();
  const endAt = new Date(auction.end_at);

  if (now < endAt) {
    console.log(`[Worker] Auction ${auctionId} extended. Rescheduling for ${endAt.toISOString()}`);
    await scheduleAuctionEnd(auctionId, auction.end_at);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Determine winner — highest bid
    const winnerBidResult = await client.query(
      `SELECT bidder_id, amount FROM bids 
       WHERE auction_id = $1 AND is_winning = true 
       ORDER BY amount DESC
       LIMIT 1`,
      [auctionId]
    );

    if (winnerBidResult.rowCount === 0 || (auction.reserve_price && winnerBidResult.rows[0].amount < auction.reserve_price)) {
      // No bids or reserve price not met → NO_SALE
      const updateResult = await client.query(
        `UPDATE auctions SET status = 'no_sale' 
         WHERE id = $1 AND status = 'active'
         RETURNING id`,
        [auctionId]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return; // Đã bị worker khác xử lý
      }

      await client.query('COMMIT');

      console.log(`[Worker] Auction ${auctionId} ended with NO_SALE (no bids or reserve price not met).`);
      await emitToAuctionRoom(auctionId, 'auction:ended', {
        auctionId,
        winnerId: null,
        finalPrice: auction.current_price,
        status: 'no_sale'
      });
      return;
    }

    const winner = winnerBidResult.rows[0];

    // 3. Update auction status and set winner
    const updateResult = await client.query(
      `UPDATE auctions SET status = 'ended', winner_id = $1 
       WHERE id = $2 AND status = 'active'
       RETURNING id`,
      [winner.bidder_id, auctionId]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return; // Đã bị worker khác xử lý
    }

    await client.query('COMMIT');

    console.log(`[Worker] Auction ${auctionId} ended. Winner: ${winner.bidder_id}, Price: ${winner.amount}`);

    // 4. Emit WebSocket events
    // Public: auction has ended
    await emitToAuctionRoom(auctionId, 'auction:ended', {
      auctionId,
      winnerId: winner.bidder_id,
      finalPrice: winner.amount,
      status: 'ended'
    });

    // Private: notify winner
    await emitToUser(winner.bidder_id, 'auction:won', {
      auctionId,
      finalPrice: winner.amount,
      paymentStatus: 'pending'  // Will trigger Auth Hold when payment is implemented
    });

    // Private: notify all other bidders they lost
    const losersResult = await pool.query(
      `SELECT DISTINCT bidder_id FROM bids 
       WHERE auction_id = $1 AND bidder_id != $2`,
      [auctionId, winner.bidder_id]
    );

    for (const loser of losersResult.rows) {
      // TODO: Phase 13 - Save loser notification to DB for offline users
      await emitToUser(loser.bidder_id, 'auction:lost', {
        auctionId,
        finalPrice: winner.amount
      });
    }

    // 5. TODO: Trigger Stripe PaymentIntent.create with capture_method: 'manual'

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}, {
  connection,
  concurrency: 5  // Process up to 5 auction-end jobs in parallel
});

auctionEndWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

auctionEndWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

export default auctionEndWorker;
