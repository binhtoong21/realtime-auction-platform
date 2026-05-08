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

export const auctionStartQueue = new Queue('auction-start', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 200
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

export const scheduleAuctionStart = async (auctionId, startAt) => {
  const delay = new Date(startAt).getTime() - Date.now();

  if (delay <= 0) {
    await auctionStartQueue.add('auction-start', { auctionId }, {
      jobId: `auction_start_${auctionId}`
    });
    return;
  }

  await auctionStartQueue.add('auction-start', { auctionId }, {
    jobId: `auction_start_${auctionId}`,
    delay
  });

  console.log(`[Queue] Scheduled auction-start for ${auctionId} in ${Math.round(delay / 1000)}s`);
};

export const removeAuctionJobs = async (auctionId) => {
  const startJob = await auctionStartQueue.getJob(`auction_start_${auctionId}`);
  if (startJob) await startJob.remove();

  const endJob = await auctionQueue.getJob(`auction_end_${auctionId}`);
  if (endJob) await endJob.remove();

  console.log(`[Queue] Removed scheduled jobs for auction ${auctionId}`);
};
