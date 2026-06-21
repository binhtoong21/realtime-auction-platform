import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import errorHandler from './middleware/errorHandler.js';
import { pool } from './config/database.js';
import auctionRoutes from './routes/auctions.routes.js';
import authRoutes from './routes/auth.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import usersRoutes from './routes/users.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import paymentMethodRoutes from './routes/payment-method.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import disputesRoutes from './routes/disputes.routes.js';
import adminRoutes from './routes/admin.routes.js';
import testRoutes from './routes/test.routes.js';
import { redisClient } from './config/redis.js';

const pingRedisWithTimeout = async () => {
  let timeoutId;
  try {
    return await Promise.race([
      redisClient.ping().then(() => 'ok'),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), 500);
      })
    ]);
  } catch (err) {
    return 'error';
  } finally {
    clearTimeout(timeoutId);
  }
};

const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors());

// Webhook route MUST be before express.json() — Stripe requires raw body
app.use('/webhooks', webhooksRoutes);

// Parse JSON payload
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// API Routes
app.use('/auth', authRoutes);
app.use('/categories', categoriesRoutes);
app.use('/auctions', auctionRoutes);
app.use('/users', usersRoutes);
app.use('/payment-methods', paymentMethodRoutes);
app.use('/payments', paymentsRoutes);
app.use('/disputes', disputesRoutes);
app.use('/admin', adminRoutes);

if (process.env.NODE_ENV === 'test') {
  app.use('/api/test', testRoutes);
}

app.get('/health', async (req, res, next) => {
  let dbStatus = 'error';
  let dbTime = null;
  let redisStatus = 'error';
  let isDegraded = false;

  const [dbResult, redisResult] = await Promise.allSettled([
    pool.query('SELECT NOW()'),
    pingRedisWithTimeout()
  ]);

  if (dbResult.status === 'fulfilled') {
    dbStatus = 'ok';
    dbTime = dbResult.value.rows[0].now;
  } else {
    isDegraded = true;
    console.error('[Health] DB ping failed:', dbResult.reason.message);
  }

  redisStatus = redisResult.status === 'fulfilled' ? redisResult.value : 'error';
  if (redisStatus === 'error') {
    isDegraded = true;
    if (redisResult.reason) console.error('[Health] Redis ping failed:', redisResult.reason.message);
  }

  const statusCode = isDegraded ? 503 : 200;

  res.status(statusCode).json({
    status: isDegraded ? 'degraded' : 'ok',
    db: dbStatus === 'ok' ? dbTime : 'error',
    redis: redisStatus,
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler must be the last middleware
app.use(errorHandler);

export default app;
