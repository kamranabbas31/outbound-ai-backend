import { Redis, RedisOptions } from 'ioredis';
import { ConnectionOptions } from 'tls';

// For ioredis direct usage
export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false } as ConnectionOptions,
  maxRetriesPerRequest: null,
});

// For bullmq connection - this needs to be a plain object, not an ioredis instance
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: null,
  lazyConnect: true,
};

// Alternative connection string format for Upstash Redis
export const getRedisUrl = (): string => {
  const host = process.env.REDIS_HOST;
  const password = process.env.REDIS_PASSWORD;
  const port = 6379;

  if (host && password) {
    return `rediss://:${password}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
};
