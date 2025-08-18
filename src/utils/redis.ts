import { Redis, RedisOptions } from 'ioredis';
import { ConnectionOptions } from 'tls';
export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false } as ConnectionOptions,
  maxRetriesPerRequest: null,
});

export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: null,
};
