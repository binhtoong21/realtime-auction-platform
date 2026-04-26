require('dotenv').config();
const http = require('http');
const app = require('./app');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Graceful Shutdown Logic
const shutdown = async (signal) => {
  console.log(`\n[${signal}] Received. Shutting down gracefully...`);
  
  // 1. Stop accepting new HTTP requests
  server.close(async () => {
    console.log('HTTP server closed.');
    
    try {
      // 2. Stop BullMQ Workers (Tích hợp ở Phase 6)
      // if (worker) await worker.close();
      // console.log('BullMQ workers closed.');
      
      // 3. Close Database Pool
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
