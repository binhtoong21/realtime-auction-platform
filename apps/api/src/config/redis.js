import Redis from 'ioredis';

export const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on('connect', () => console.log('Redis connected successfully'));
redisClient.on('error', (err) => console.error('Redis connection error:', err));
