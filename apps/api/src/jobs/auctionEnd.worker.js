import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';
import { scheduleAuctionEnd } from './queue.js';
import { emitToAuctionRoom, emitToUser } from '../services/socket.service.js';
import { createAuthHold, schedulePostHoldJobs } from '../services/payment.service.js';

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
 * 4. Create Stripe Auth Hold (PaymentIntent with capture_method: manual).
 * 5. Emit WebSocket events (auction:ended, auction:won, auction:lost).
 * 6. Schedule follow-up jobs based on hold result.
 */
const auctionEndWorker = new Worker('auction', async (job) => {
  const { auctionId } = job.data;
  console.log(`[Worker] Processing auction-end for: ${auctionId}`);

  // 1. Lazy Evaluation: Check if auction has been extended (Anti-snipe)
  const auctionResult = await pool.query(
    'SELECT id, status, end_at, current_price, reserve_price, winner_id, seller_id FROM auctions WHERE id = $1',
    [auctionId]
  );

  if (auctionResult.rowCount === 0) {
    console.log(`[Worker] Auction ${auctionId} not found. Skipping.`);
    return;
  }

  const auction = auctionResult.rows[0];

  // Skip if already ended (idempotent)
  if (auction.status !== 'active') {
    if (auction.status === 'ended' && auction.winner_id) {
      // Check if payment exists
      const existingPayment = await pool.query(
        'SELECT id FROM payments WHERE auction_id = $1', [auctionId]
      );
      if (existingPayment.rowCount === 0) {
        // Crash scenario: resume Auth Hold
        console.log(`[Worker] Resuming interrupted Auth Hold for auction ${auctionId}`);
        const winnerResult = await pool.query(
          'SELECT amount FROM bids WHERE auction_id = $1 AND bidder_id = $2 AND is_winning = true LIMIT 1',
          [auctionId, auction.winner_id]
        );
        const amountInCents = winnerResult.rowCount > 0 ? Number(winnerResult.rows[0].amount) : 0;
        
        const holdResult = await createAuthHold({
          auctionId,
          winnerId: auction.winner_id,
          sellerId: auction.seller_id,
          amountInCents,
        });
        await schedulePostHoldJobs({
          paymentId: holdResult.paymentId,
          auctionId,
          holdSuccess: holdResult.holdSuccess,
        });
        return;
      }
    }
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
  let transactionCommitted = false;
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

    if (winnerBidResult.rowCount === 0 || (auction.reserve_price && Number(winnerBidResult.rows[0].amount) < Number(auction.reserve_price))) {
      // No bids or reserve price not met → NO_SALE
      const updateResult = await client.query(
        `UPDATE auctions SET status = 'no_sale' 
         WHERE id = $1 AND status = 'active'
         RETURNING id`,
        [auctionId]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return;
      }

      await client.query('COMMIT');
      transactionCommitted = true;
      client.release();

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

    // 3. Update auction status to 'ended' and set winner
    const updateResult = await client.query(
      `UPDATE auctions SET status = 'ended', winner_id = $1 
       WHERE id = $2 AND status = 'active'
       RETURNING id`,
      [winner.bidder_id, auctionId]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query('COMMIT');
    transactionCommitted = true;
    client.release(); // Free connection early since we are done with the transaction

    // 4. Create Auth Hold (OUTSIDE transaction to avoid pool exhaustion)
    const holdResult = await createAuthHold({
      auctionId,
      winnerId: winner.bidder_id,
      sellerId: auction.seller_id,
      amountInCents: Number(winner.amount),
    });

    console.log(`[Worker] Auction ${auctionId} ended. Winner: ${winner.bidder_id}, Price: ${winner.amount}, Hold: ${holdResult.holdSuccess ? 'OK' : 'FAILED'}`);

    // 5. Schedule follow-up jobs AFTER commit
    await schedulePostHoldJobs({
      paymentId: holdResult.paymentId,
      auctionId,
      holdSuccess: holdResult.holdSuccess,
    });

    // 6. Emit WebSocket events
    await emitToAuctionRoom(auctionId, 'auction:ended', {
      auctionId,
      winnerId: winner.bidder_id,
      finalPrice: winner.amount,
      status: 'ended'
    });

    if (holdResult.holdSuccess) {
      // Hold succeeded — tell winner their payment is being held
      await emitToUser(winner.bidder_id, 'auction:won', {
        auctionId,
        finalPrice: winner.amount,
        paymentStatus: 'authorized',
        paymentId: holdResult.paymentId,
      });
    } else {
      // Hold failed — tell winner they need to update payment
      await emitToUser(winner.bidder_id, 'auction:won', {
        auctionId,
        finalPrice: winner.amount,
        paymentStatus: 'grace_period',
        paymentId: holdResult.paymentId,
        graceExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        message: 'Payment hold failed. Please update your payment method within 24 hours.',
      });
    }

    // Notify all other bidders they lost
    const losersResult = await pool.query(
      `SELECT DISTINCT bidder_id FROM bids 
       WHERE auction_id = $1 AND bidder_id != $2`,
      [auctionId, winner.bidder_id]
    );

    for (const loser of losersResult.rows) {
      await emitToUser(loser.bidder_id, 'auction:lost', {
        auctionId,
        finalPrice: winner.amount
      });
    }

  } catch (err) {
    if (!transactionCommitted) {
      try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    }
    throw err;
  } finally {
    if (!transactionCommitted) {
      try { client.release(); } catch (e) { /* ignore */ }
    }
  }
}, {
  connection,
  concurrency: 5
});

auctionEndWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

auctionEndWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

export default auctionEndWorker;
