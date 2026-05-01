import { getIO } from '../config/socket.js';
import { redisClient } from '../config/redis.js';

/**
 * Emit a realtime event to an auction room.
 * Increments the sequence number for catch-up sync support.
 * Reference: websocket_design.md Mục 5, 6
 */
export const emitToAuctionRoom = async (auctionId, eventName, data) => {
  const io = getIO();
  const seq = await redisClient.incr(`auction:${auctionId}:seq`);

  io.to(`auction:${auctionId}`).emit(eventName, {
    ...data,
    seq,
    serverTime: Date.now()
  });
};

/**
 * Emit a private event to a specific user.
 */
export const emitToUser = (userId, eventName, data) => {
  const io = getIO();
  io.to(`user:${userId}`).emit(eventName, {
    ...data,
    serverTime: Date.now()
  });
};

/**
 * Emit an event to the admin dashboard room.
 */
export const emitToAdmin = (eventName, data) => {
  const io = getIO();
  io.to('admin:dashboard').emit(eventName, {
    ...data,
    serverTime: Date.now()
  });
};
