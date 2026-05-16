import { redisClient } from '../config/redis.js';

export const rateLimiter = (actionPrefix, limit = 5, windowInSeconds = 10) => {
  return async (req, res, next) => {
    const userId = req.user.id;
    const key = `ratelimit:${actionPrefix}:${userId}`;

    const replies = await redisClient.multi()
      .incr(key)
      .pttl(key)
      .exec();

    // replies format: [[null, count], [null, pttl]]
    const currentCount = replies[0][1];
    let ttlMs = replies[1][1];

    if (ttlMs <= 0) {
      await redisClient.pexpire(key, windowInSeconds * 1000);
      ttlMs = windowInSeconds * 1000;
    }

    if (currentCount > limit) {
      const retryAfterSec = Math.ceil(ttlMs / 1000);
      
      res.setHeader('Retry-After', retryAfterSec);
      res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + retryAfterSec);
      
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please slow down' }
      });
    }

    next();
  };
};
