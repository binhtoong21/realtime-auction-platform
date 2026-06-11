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
import { startWebhookReaper, startPaymentSweeper, startFulfillmentSweeper, startDisputeExpirySweeper } from './jobs/queue.js';
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

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

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Register repeatable background jobs with exponential backoff retry
  let retries = 5;
  let delay = 1000;
  while (retries > 0) {
    try {
      await startPaymentSweeper();
      await startWebhookReaper();
      await startFulfillmentSweeper();
      await startDisputeExpirySweeper();
      break; // Success
    } catch (err) {
      console.error(`Failed to register repeatable jobs (sweeper/reaper). Retries left: ${retries - 1}`, err);
      retries--;
      if (retries === 0) {
        console.error('CRITICAL: Exhausted all retries for repeatable jobs. Shutting down process.');
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
});

// Listen for termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
