import { Redis, RedisOptions } from 'ioredis';
import { ConnectionOptions } from 'tls';

// Direct ioredis client (useful for Pub/Sub or manual Redis ops)
export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6380, // ✅ Upstash TLS port
  password: process.env.REDIS_PASSWORD,
  tls: {} as ConnectionOptions, // ✅ enable TLS (don’t need rejectUnauthorized override for Upstash)
  maxRetriesPerRequest: null,
});

// For BullMQ connection - use plain RedisOptions object
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: 6380, // ✅ Upstash TLS port
  password: process.env.REDIS_PASSWORD,
  tls: {} as ConnectionOptions, // ✅ Upstash requires TLS
  maxRetriesPerRequest: null,
  lazyConnect: true,
};

// Alternative connection string format for Upstash Redis (recommended)
export const getRedisUrl = (): string => {
  const host = process.env.REDIS_HOST;
  const password = process.env.REDIS_PASSWORD;
  const port = 6380; // ✅ TLS port

  if (host && password) {
    return `rediss://default:${password}@${host}:${port}`;
    // "default" is the fixed username for Upstash
  }
  return `redis://${host}:${port}`;
};
