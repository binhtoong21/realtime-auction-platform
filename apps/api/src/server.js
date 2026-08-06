import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { pool } from './config/database.js';
import { redisClient } from './config/redis.js';
import { initSocket } from './config/socket.js';
import auctionEndWorker from './jobs/auctionEnd.worker.js';
import auctionStartWorker from './jobs/auctionStart.worker.js';
import paymentWorker from './jobs/payment.worker.js';
import webhookReaperWorker from './jobs/webhook-reaper.worker.js';
import fulfillmentWorker from './jobs/fulfillment.worker.js';
import { disputeWorker } from './jobs/dispute.worker.js';
import { startWebhookReaper, startPaymentSweeper, startGracePeriodSweeper, startFulfillmentSweeper, startDisputeExpirySweeper } from './jobs/queue.js';
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

async function withTimeout(promise, ms, label) {
  let timeoutId;
  promise.catch(() => {}); // Swallow late rejection to avoid unhandled rejection
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Initialize Socket.IO
const io = initSocket(server);
console.log('🔌 Socket.IO initialized');

// Graceful Shutdown Logic
let isShuttingDown = false;
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[${signal}] Received. Shutting down gracefully...`);
  
  // 1. Close Socket.IO connections
  io.close();
  console.log('Socket.IO closed.');

  // 2. Stop accepting new HTTP requests
  server.close(async () => {
    console.log('HTTP server closed.');
    
    try {
      // 3. Stop BullMQ Workers
      await auctionStartWorker.close();
      await auctionEndWorker.close();
      await paymentWorker.close();
      await webhookReaperWorker.close();
      await fulfillmentWorker.close();
      await disputeWorker.close();
      console.log('BullMQ workers closed.');
      
      // 4. Close Redis
      await redisClient.quit();
      console.log('Redis connection closed.');

      // 5. Close Database Pool
      await pool.end();
      console.log('PostgreSQL pool closed.');
      
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force close after 10s if graceful shutdown fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  const sweepers = [
    { name: 'startPaymentSweeper', fn: startPaymentSweeper },
    { name: 'startGracePeriodSweeper', fn: startGracePeriodSweeper },
    { name: 'startWebhookReaper', fn: startWebhookReaper },
    { name: 'startFulfillmentSweeper', fn: startFulfillmentSweeper },
    { name: 'startDisputeExpirySweeper', fn: startDisputeExpirySweeper }
  ];

  for (const { name, fn } of sweepers) {
    try {
      await withTimeout(fn(), 5000, name);
    } catch (err) {
      console.error(`[SweeperInit] ${name} failed/timeout:`, err.message);
    }
  }
});

// Listen for termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Safety net: prevent unhandled promise rejections from crashing the process.
// In production, these should be investigated; here we log and continue.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
  shutdown('uncaughtException');
});
