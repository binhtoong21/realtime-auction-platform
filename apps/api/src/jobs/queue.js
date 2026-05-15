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

// ============================================================
// Payment Lifecycle Queue
// ============================================================

export const paymentQueue = new Queue('payment', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Schedule an emergency-capture job 6 days after Auth Hold success.
 * If a dispute is open near auth expiry (Day 7), this job force-captures.
 */
export const scheduleEmergencyCapture = async (paymentId, auctionId) => {
  await paymentQueue.add('emergency-capture', { paymentId, auctionId }, {
    jobId: `emergency_capture_${paymentId}`,
    delay: SIX_DAYS_MS,
  });

  console.log(`[Queue] Scheduled emergency-capture for payment ${paymentId} in 6 days`);
};

/**
 * Schedule a grace-period-expiry job 24h after Auth Hold failure.
 * If buyer hasn't retried successfully, transitions to Second Chance.
 */
export const scheduleGracePeriodExpiry = async (paymentId, auctionId) => {
  await paymentQueue.add('grace-period-expiry', { paymentId, auctionId }, {
    jobId: `grace_expiry_${paymentId}`,
    delay: TWENTY_FOUR_HOURS_MS,
  });

  console.log(`[Queue] Scheduled grace-period-expiry for payment ${paymentId} in 24h`);
};
