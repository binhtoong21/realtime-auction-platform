import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import errorHandler from './middleware/errorHandler.js';
import { pool } from './config/database.js';

const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors());

// Parse JSON payload
app.use(express.json());

// API Routes
// app.use('/auctions', require('./routes/auctions.routes')); // Tích hợp ở Phase 4

// Health Check Route (Phase 3.4)
app.get('/health', async (req, res, next) => {
  try {
    // Check DB
    const dbRes = await pool.query('SELECT NOW()');
    
    res.status(200).json({
      status: 'ok',
      db: dbRes.rows[0].now,
      redis: 'pending_setup',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Global Error Handler must be the last middleware
app.use(errorHandler);

export default app;
