import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import errorHandler from './middleware/errorHandler.js';
import { pool } from './config/database.js';
import auctionRoutes from './routes/auctions.routes.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors());

// Parse JSON payload
app.use(express.json());

// API Routes
app.use('/auth', authRoutes);
app.use('/auctions', auctionRoutes);

// Health Check Route
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
