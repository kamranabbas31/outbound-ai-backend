import { Redis, RedisOptions } from 'ioredis';

// Direct ioredis client
export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6380, // ✅ Upstash TLS port
  username: 'default', // ✅ Upstash requires "default"
  password: process.env.REDIS_PASSWORD,
  tls: {
    rejectUnauthorized: false,
  }, // ✅ enable TLS
  maxRetriesPerRequest: null,
});

// For BullMQ worker/queue
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: 6380, // ✅ TLS port
  username: 'default',
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false }, // ✅ TLS
  maxRetriesPerRequest: null,
  lazyConnect: true,
};

// Alternative URL (recommended for Upstash)
export const getRedisUrl = (): string => {
  const host = process.env.REDIS_HOST;
  const password = process.env.REDIS_PASSWORD;
  const port = 6380;

  if (host && password) {
    return `rediss://default:${password}@${host}:${port}`; // ✅ include "default"
  }
  return `redis://${host}:${port}`;
};
