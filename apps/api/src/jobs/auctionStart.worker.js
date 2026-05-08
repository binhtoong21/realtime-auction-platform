import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../config/database.js';

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

/**
 * Auction Start Worker
 * Changes auction status from 'draft' to 'active' when start_at is reached.
 */
const auctionStartWorker = new Worker('auction-start', async (job) => {
  const { auctionId } = job.data;
  console.log(`[Worker] Processing auction-start for: ${auctionId}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query(
      'SELECT id, status, start_at FROM auctions WHERE id = $1 FOR UPDATE',
      [auctionId]
    );

    if (auctionResult.rowCount === 0) {
      console.log(`[Worker] Auction ${auctionId} not found. Skipping.`);
      await client.query('ROLLBACK');
      return;
    }

    const auction = auctionResult.rows[0];

    // If it's already active or ended or cancelled, skip
    if (auction.status !== 'draft') {
      console.log(`[Worker] Auction ${auctionId} is already '${auction.status}'. Skipping.`);
      await client.query('ROLLBACK');
      return;
    }

    // Double check the time just in case job fired early or time was changed
    const now = new Date();
    const startAt = new Date(auction.start_at);
    if (now < startAt) {
      console.log(`[Worker] Auction ${auctionId} is not ready to start yet. Exiting (will rely on newly scheduled job if updated).`);
      // It will just complete and rely on the new job if it was rescheduled
      await client.query('ROLLBACK');
      return;
    }

    // Update status to active
    await client.query(
      `UPDATE auctions SET status = 'active' WHERE id = $1`,
      [auctionId]
    );

    await client.query('COMMIT');
    console.log(`[Worker] Auction ${auctionId} started successfully.`);

    // Note: We don't necessarily need to emit a WS event for 'auction:started' 
    // unless clients are specifically waiting on a pre-auction room, 
    // but typically they just poll or load active auctions.

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}, {
  connection,
  concurrency: 5
});

auctionStartWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} (auction-start) completed successfully.`);
});

auctionStartWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} (auction-start) failed:`, err.message);
});

export default auctionStartWorker;
