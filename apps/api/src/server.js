import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { pool } from './config/database.js';
import { redisClient } from './config/redis.js';
import { initSocket } from './config/socket.js';
import auctionEndWorker from './jobs/auctionEnd.worker.js';

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocket(server);
console.log('🔌 Socket.IO initialized');

// Graceful Shutdown Logic
const shutdown = async (signal) => {
  console.log(`\n[${signal}] Received. Shutting down gracefully...`);
  
  // 1. Close Socket.IO connections
  io.close();
  console.log('Socket.IO closed.');

  // 2. Stop accepting new HTTP requests
  server.close(async () => {
    console.log('HTTP server closed.');
    
    try {
      // 3. Stop BullMQ Workers
      await auctionEndWorker.close();
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
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Listen for termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
