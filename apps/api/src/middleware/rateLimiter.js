import { redisClient } from '../config/redis.js';

export const rateLimiter = (limit = 5, windowInSeconds = 10) => {
  return async (req, res, next) => {
    const userId = req.user.id;
    const key = `ratelimit:${userId}`;

    const currentCount = await redisClient.incr(key);
    
    if (currentCount === 1) {
      await redisClient.expire(key, windowInSeconds);
    }

    if (currentCount > limit) {
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please slow down' }
      });
    }

    next();
  };
};
