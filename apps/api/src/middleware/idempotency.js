import { redisClient } from '../config/redis.js';

export const checkIdempotency = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Header Idempotency-Key is required' }
    });
  }

  const redisKey = `idempotency:${idempotencyKey}`;
  const isSet = await redisClient.set(redisKey, 'processing', 'NX', 'EX', 86400); // 24h

  if (!isSet) {
    return res.status(409).json({
      success: false,
      error: { code: 'IDEMPOTENCY_ERROR', message: 'Request with this Idempotency-Key is already processed or processing' }
    });
  }

  // Pass key to req for DB insertion
  req.idempotencyKey = idempotencyKey;
  next();
};
