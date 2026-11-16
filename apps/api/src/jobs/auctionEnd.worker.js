import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { processAuctionEnd } from './auctionEnd.processor.js';

const connection = createRedisConnection('auction-end-worker');

const auctionEndWorker = new Worker('auction', processAuctionEnd, {
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
