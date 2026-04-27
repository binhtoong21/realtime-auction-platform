import { redisClient } from '../config/redis.js';

export const debounceBid = async (req, res, next) => {
  const { id: auctionId } = req.params;
  const { amount } = req.body;
  const userId = req.user.id;

  const lockKey = `lock:bid:${userId}:${auctionId}:${amount}`;
  const isLocked = await redisClient.set(lockKey, 'locked', 'NX', 'EX', 5); // 5s

  if (!isLocked) {
    return res.status(429).json({
      success: false,
      error: { code: 'DEBOUNCE_LOCKED', message: 'Please wait a moment before placing the same bid again' }
    });
  }

  next();
};
