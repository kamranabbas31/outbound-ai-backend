import { RedisOptions } from 'ioredis';

export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: null,
};
