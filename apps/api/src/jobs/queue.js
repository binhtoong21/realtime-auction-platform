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
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

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

/**
 * Schedule a second-chance-expiry job 48h after Second Chance offer is created.
 * If runner-up hasn't accepted or declined, transitions to NO_SALE.
 */
export const scheduleSecondChanceExpiry = async (paymentId, auctionId) => {
  await paymentQueue.add('second-chance-expiry', { paymentId, auctionId }, {
    jobId: `second_chance_expiry_${paymentId}`,
    delay: FORTY_EIGHT_HOURS_MS,
  });

  console.log(`[Queue] Scheduled second-chance-expiry for payment ${paymentId} in 48h`);
};

/**
 * Dispatch a payout job to transfer funds to the seller.
 * Called immediately after payment_intent.succeeded webhook confirms capture.
 * Uses jobId for deduplication when job is still in waiting/delayed state.
 */
export const schedulePayoutJob = async (paymentId, auctionId) => {
  await paymentQueue.add('payout', { paymentId, auctionId }, {
    jobId: `payout_${paymentId}`,
    delay: 0,
  });

  console.log(`[Queue] Dispatched payout job for payment ${paymentId}`);
};

// ============================================================
// Webhook Reaper Queue
// ============================================================

export const webhookQueue = new Queue('webhook', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Register the repeatable webhook reaper job.
 * Call once at server startup.
 */
export const startWebhookReaper = async () => {
  await webhookQueue.add('webhook-reaper', {}, {
    repeat: { every: FIVE_MINUTES_MS },
    jobId: 'webhook-reaper-singleton',
  });

  console.log('[Queue] Webhook reaper registered (every 5 minutes)');
};

/**
 * Register a repeatable payment sweeper job.
 *
 * Runs every 10 minutes to reconcile payments stuck in transitional states
 * (capture_pending, hold_pending) that indicate a crash between a Stripe
 * API call and the subsequent DB update.
 *
 * BullMQ deduplicates repeatables by name + repeat config hash,
 * so calling this on every server restart is safe (no-op if already registered).
 */
export const startPaymentSweeper = async () => {
  await paymentQueue.add('payment-sweeper', {}, {
    repeat: { every: 10 * 60 * 1000 },
  });
  console.log('[Queue] Payment sweeper registered (every 10 min)');
};

// ============================================================
// Fulfillment Lifecycle Queue
// ============================================================

export const fulfillmentQueue = new Queue('fulfillment', {
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

export const rescheduleShippingDeadline = async (auctionId, newDeadlineAt) => {
  const deadlineJobId = `shipping-deadline-${auctionId}`;
  const existingDeadline = await fulfillmentQueue.getJob(deadlineJobId);
  if (existingDeadline) await existingDeadline.remove();

  const delayDeadline = Math.max(0, new Date(newDeadlineAt) - Date.now());
  await fulfillmentQueue.add('shipping-deadline', { auctionId }, { jobId: deadlineJobId, delay: delayDeadline });

  const reminderJobId = `shipping-reminder-${auctionId}`;
  const existingReminder = await fulfillmentQueue.getJob(reminderJobId);
  if (existingReminder) await existingReminder.remove();

  const delayReminder = Math.max(0, new Date(newDeadlineAt) - (2 * 24 * 60 * 60 * 1000) - Date.now());
  await fulfillmentQueue.add('shipping-reminder', { auctionId }, { jobId: reminderJobId, delay: delayReminder });

  console.log(`[Queue] Rescheduled shipping deadline/reminder for auction ${auctionId}`);
};

export const removeDeliveryJobs = async (auctionId) => {
  const autoConfirmJob = await fulfillmentQueue.getJob(`delivery-auto-confirm-${auctionId}`);
  if (autoConfirmJob) await autoConfirmJob.remove();

  const reminder10Job = await fulfillmentQueue.getJob(`delivery-reminder-10-${auctionId}`);
  if (reminder10Job) await reminder10Job.remove();

  const reminder13Job = await fulfillmentQueue.getJob(`delivery-reminder-13-${auctionId}`);
  if (reminder13Job) await reminder13Job.remove();

  console.log(`[Queue] Removed delivery jobs for auction ${auctionId}`);
};

export const rescheduleDeliveryJobs = async (auctionId, newDeadlineAt, originalShippedAt) => {
  await removeDeliveryJobs(auctionId);

  const delayAutoConfirm = Math.max(0, new Date(newDeadlineAt) - Date.now());
  await fulfillmentQueue.add('delivery-auto-confirm', { auctionId }, { jobId: `delivery-auto-confirm-${auctionId}`, delay: delayAutoConfirm });

  const extendedBase = new Date(originalShippedAt).getTime() + (7 * 24 * 60 * 60 * 1000);

  // Reminder Day 10 (from shipped_at + 7 days extension)
  const delay10 = Math.max(0, extendedBase + (10 * 24 * 60 * 60 * 1000) - Date.now());
  await fulfillmentQueue.add('delivery-reminder', { auctionId, type: 'day10' }, { jobId: `delivery-reminder-10-${auctionId}`, delay: delay10 });

  // Reminder Day 13 (from shipped_at + 7 days extension)
  const delay13 = Math.max(0, extendedBase + (13 * 24 * 60 * 60 * 1000) - Date.now());
  await fulfillmentQueue.add('delivery-reminder', { auctionId, type: 'day13' }, { jobId: `delivery-reminder-13-${auctionId}`, delay: delay13 });

  console.log(`[Queue] Rescheduled delivery jobs for auction ${auctionId}`);
};
