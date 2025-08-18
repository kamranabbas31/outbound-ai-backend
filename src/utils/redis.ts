import { Redis, RedisOptions } from 'ioredis';

// Direct ioredis client
export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT), // ✅ take from .env (6379)
  username: 'default', // ✅ required for Upstash
  password: process.env.REDIS_PASSWORD,
  tls: {
    rejectUnauthorized: false, // ✅ Upstash TLS
  },
  maxRetriesPerRequest: null,
});

// For BullMQ worker/queue
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  username: 'default',
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: null,
  lazyConnect: true,
};

// Alternative URL (recommended for Upstash)
export const getRedisUrl = (): string => {
  const host = process.env.REDIS_HOST;
  const password = process.env.REDIS_PASSWORD;
  const port = process.env.REDIS_PORT;

  if (host && password) {
    return `rediss://default:${password}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
};
