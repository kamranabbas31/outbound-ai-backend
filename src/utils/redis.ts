import Redis from 'ioredis';
import { ConnectionOptions } from 'tls';
export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: {} as ConnectionOptions,
  maxRetriesPerRequest: null,
});
