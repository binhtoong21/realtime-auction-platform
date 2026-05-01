import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient } from '../config/redis.js';
import { verifyToken } from '../utils/jwt.js';
import { pool } from '../config/database.js';

let io;

/**
 * Initialize Socket.IO server and attach to HTTP server.
 * References: websocket_design.md — Mục 2, 3, 4
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST']
    }
  });

  // --- Redis Adapter for Horizontal Scaling ---
  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // --- Auth Middleware (websocket_design.md Mục 3) ---
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('AUTHENTICATION_FAILED'));
    }

    try {
      const bearerToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
      const decoded = verifyToken(bearerToken);
      socket.data = { userId: decoded.id, role: decoded.role };
      next();
    } catch (err) {
      next(new Error('AUTHENTICATION_FAILED'));
    }
  });

  // --- Connection Handler (websocket_design.md Mục 4) ---
  io.on('connection', (socket) => {
    const { userId, role } = socket.data;
    console.log(`[WS] User connected: ${userId}`);

    // Auto-join private room
    socket.join(`user:${userId}`);

    // Auto-join admin room if admin
    if (role === 'admin') {
      socket.join('admin:dashboard');
    }

    // --- Subscribe to Auction Room ---
    socket.on('auction:subscribe', async ({ auctionId, lastSeq }) => {
      try {
        // Validate auction exists
        const auctionResult = await pool.query(
          'SELECT id, current_price, end_at, status, extended_count FROM auctions WHERE id = $1',
          [auctionId]
        );

        if (auctionResult.rowCount === 0) {
          return socket.emit('error', { code: 'NOT_FOUND', message: 'Auction not found' });
        }

        socket.join(`auction:${auctionId}`);

        // Catch-up Sync: Send current state (websocket_design.md Mục 6)
        const auction = auctionResult.rows[0];
        const bidsResult = await pool.query(
          'SELECT id, bidder_id, amount, created_at FROM bids WHERE auction_id = $1 ORDER BY amount DESC LIMIT 50',
          [auctionId]
        );

        // Get current sequence number from Redis
        const currentSeq = await redisClient.get(`auction:${auctionId}:seq`) || 0;

        socket.emit('auction:catchup', {
          currentPrice: auction.current_price,
          endAt: auction.end_at,
          status: auction.status,
          extendedCount: auction.extended_count,
          recentBids: bidsResult.rows,
          seq: Number(currentSeq),
          serverTime: Date.now()
        });
      } catch (err) {
        console.error('[WS] auction:subscribe error:', err);
        socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to subscribe to auction' });
      }
    });

    // --- Unsubscribe from Auction Room ---
    socket.on('auction:unsubscribe', ({ auctionId }) => {
      socket.leave(`auction:${auctionId}`);
    });

    // --- Token Refresh (websocket_design.md Mục 3) ---
    socket.on('auth:refresh', ({ token }) => {
      try {
        const decoded = verifyToken(token);
        socket.data = { userId: decoded.id, role: decoded.role };
        socket.emit('auth:refreshed', { success: true });
      } catch (err) {
        socket.emit('auth:token_expired', {});
        socket.disconnect(true);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[WS] User disconnected: ${userId} (${reason})`);
    });
  });

  return io;
};

/**
 * Get the Socket.IO server instance.
 */
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocket(httpServer) first.');
  }
  return io;
};
