import { DelayedError } from 'bullmq';
import { pool } from '../config/database.js';
import { AuctionStatus, PaymentStatus } from '@auction/shared-constants';
import { emitToAuctionRoom, emitToUser } from '../services/socket.service.js';
import { createEscrowCharge, resumeEscrowCharge, schedulePostHoldJobs } from '../services/payment.service.js';

// Lower bound for a re-delay, so a small clock skew between app and DB cannot spin the job.
const RESCHEDULE_MIN_DELAY_MS = 500;

/**
 * Auction-end job processor.
 *
 * Closing and bidding serialize on the auctions row lock: the deadline check,
 * winner selection and status change run while holding FOR UPDATE, so a bid
 * either commits before the close (and its anti-snipe extension is seen here)
 * or waits and is rejected once the auction is no longer active.
 *
 * When the deadline was extended, the same job is moved back to the delayed
 * set. Adding a new job is not possible: a job cannot re-add its own jobId
 * while it is still active.
 */
export const processAuctionEnd = async (job, token) => {
  const { auctionId } = job.data;
  console.log(`[Worker] Processing auction-end for: ${auctionId}`);

  const auctionResult = await pool.query(
    'SELECT id, status, winner_id, seller_id FROM auctions WHERE id = $1',
    [auctionId]
  );

  if (auctionResult.rowCount === 0) {
    console.log(`[Worker] Auction ${auctionId} not found. Skipping.`);
    return;
  }

  const auction = auctionResult.rows[0];

  // Already closed: resume an Auth Hold interrupted by a crash, otherwise skip
  if (auction.status !== AuctionStatus.ACTIVE) {
    if (auction.status === AuctionStatus.ENDED && auction.winner_id) {
      // Crash or transient error after the auction was closed: finish the charge
      const existingPayment = await pool.query(
        'SELECT id, status FROM payments WHERE auction_id = $1 ORDER BY created_at DESC LIMIT 1',
        [auctionId]
      );

      let holdResult = null;
      if (existingPayment.rowCount === 0) {
        console.log(`[Worker] Resuming interrupted escrow charge for auction ${auctionId}`);
        const winnerResult = await pool.query(
          'SELECT amount FROM bids WHERE auction_id = $1 AND bidder_id = $2 AND is_winning = true LIMIT 1',
          [auctionId, auction.winner_id]
        );
        const amountInCents = winnerResult.rowCount > 0 ? Number(winnerResult.rows[0].amount) : 0;
        holdResult = await createEscrowCharge({
          auctionId,
          winnerId: auction.winner_id,
          sellerId: auction.seller_id,
          amountInCents,
        });
      } else if (existingPayment.rows[0].status === PaymentStatus.HOLD_PENDING) {
        console.log(`[Worker] Resuming hold_pending payment ${existingPayment.rows[0].id} for auction ${auctionId}`);
        holdResult = await resumeEscrowCharge(existingPayment.rows[0].id);
      }

      if (holdResult) {
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

  const client = await pool.connect();
  let outcome;
  try {
    await client.query('BEGIN');

    const lockedResult = await client.query(
      `SELECT id, status, end_at, current_price, reserve_price, seller_id,
              now() >= end_at AS expired
       FROM auctions
       WHERE id = $1
       FOR UPDATE`,
      [auctionId]
    );
    const locked = lockedResult.rows[0];

    if (!locked || locked.status !== AuctionStatus.ACTIVE) {
      await client.query('ROLLBACK');
      outcome = { type: 'skip' };
    } else if (!locked.expired) {
      await client.query('ROLLBACK');
      outcome = { type: 'reschedule', endAt: locked.end_at };
    } else {
      const winnerBidResult = await client.query(
        `SELECT bidder_id, amount FROM bids
         WHERE auction_id = $1 AND is_winning = true
         ORDER BY amount DESC
         LIMIT 1`,
        [auctionId]
      );
      const winner = winnerBidResult.rows[0];
      const reserveNotMet = winner && locked.reserve_price
        && Number(winner.amount) < Number(locked.reserve_price);

      if (!winner || reserveNotMet) {
        await client.query(
          `UPDATE auctions SET status = 'no_sale' WHERE id = $1 AND status = 'active'`,
          [auctionId]
        );
        await client.query('COMMIT');
        outcome = { type: 'no_sale', finalPrice: locked.current_price };
      } else {
        await client.query(
          `UPDATE auctions SET status = 'ended', winner_id = $1 WHERE id = $2 AND status = 'active'`,
          [winner.bidder_id, auctionId]
        );
        await client.query('COMMIT');
        outcome = { type: 'ended', winner, sellerId: locked.seller_id };
      }
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  if (outcome.type === 'skip') {
    console.log(`[Worker] Auction ${auctionId} was closed concurrently. Skipping.`);
    return;
  }

  if (outcome.type === 'reschedule') {
    const runAt = Math.max(new Date(outcome.endAt).getTime(), Date.now() + RESCHEDULE_MIN_DELAY_MS);
    console.log(`[Worker] Auction ${auctionId} extended. Rescheduling for ${new Date(runAt).toISOString()}`);
    await job.moveToDelayed(runAt, token);
    throw new DelayedError();
  }

  if (outcome.type === 'no_sale') {
    console.log(`[Worker] Auction ${auctionId} ended with NO_SALE (no bids or reserve price not met).`);
    await emitToAuctionRoom(auctionId, 'auction:ended', {
      auctionId,
      winnerId: null,
      finalPrice: outcome.finalPrice,
      status: AuctionStatus.NO_SALE
    });
    return;
  }

  const { winner, sellerId } = outcome;

  // The charge runs outside the transaction to avoid holding a pool connection during the Stripe call
  const holdResult = await createEscrowCharge({
    auctionId,
    winnerId: winner.bidder_id,
    sellerId,
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
    status: AuctionStatus.ENDED
  });

  if (holdResult.holdSuccess) {
    // Hold succeeded — tell winner their payment is being held
    await emitToUser(winner.bidder_id, 'auction:won', {
      auctionId,
      finalPrice: winner.amount,
      paymentStatus: PaymentStatus.HELD,
      paymentId: holdResult.paymentId,
    });
  } else {
    // Hold failed — tell winner they need to update payment
    await emitToUser(winner.bidder_id, 'auction:won', {
      auctionId,
      finalPrice: winner.amount,
      paymentStatus: PaymentStatus.GRACE_PERIOD,
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
};
