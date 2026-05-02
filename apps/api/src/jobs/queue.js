import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * BullMQ requires a separate IORedis connection (not shared with cache/pub-sub).
 */
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null // Required by BullMQ
});

export const auctionQueue = new Queue('auction', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,  // Keep last 100 completed jobs
    removeOnFail: 200       // Keep last 200 failed jobs
  }
});

/**
 * Schedule an auction-end job with deduplication.
 * Uses jobId = `auction_end_{auctionId}` to prevent duplicate jobs.
 */
export const scheduleAuctionEnd = async (auctionId, endAt) => {
  const delay = new Date(endAt).getTime() - Date.now();

  if (delay <= 0) {
    // Auction already ended, process immediately
    await auctionQueue.add('auction-end', { auctionId }, {
      jobId: `auction_end_${auctionId}`
    });
    return;
  }

  await auctionQueue.add('auction-end', { auctionId }, {
    jobId: `auction_end_${auctionId}`,
    delay
  });

  console.log(`[Queue] Scheduled auction-end for ${auctionId} in ${Math.round(delay / 1000)}s`);
};
