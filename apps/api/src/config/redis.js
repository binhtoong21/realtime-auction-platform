import Redis from 'ioredis';

/**
 * Shared base options for all IORedis connections in this process.
 *
 * - maxRetriesPerRequest: null — required by BullMQ and prevents
 *   MaxRetriesPerRequestError from being thrown as an unhandled exception
 *   when Redis drops a connection mid-reconnection cycle.
 * - enableOfflineQueue: true (default) — commands issued while Redis is
 *   reconnecting are queued and replayed once the connection is restored.
 */
const BASE_OPTIONS = {
  maxRetriesPerRequest: null,
};

/**
 * Create a named IORedis connection with standardized options and logging.
 * All Redis connections in the application MUST be created via this factory
 * to guarantee consistent configuration and error handling.
 *
 * @param {string} name - Human-readable label used in log output.
 * @param {object} [overrides] - Optional ioredis option overrides.
 * @returns {Redis} Configured IORedis instance.
 */
export function createRedisConnection(name, overrides = {}) {
  const client = new Redis(process.env.REDIS_URL, { ...BASE_OPTIONS, ...overrides });
  client.on('connect', () => console.log(`[Redis:${name}] connected`));
  client.on('error', (err) => console.error(`[Redis:${name}] error:`, err.message));
  return client;
}

// General-purpose client: cache, rate-limiting, pub/sub, misc.
export const redisClient = createRedisConnection('main');
