import { Redis, RedisOptions } from 'ioredis';

// Singleton Redis instance with proper error handling
let redisInstance: Redis | null = null;

const createRedisConnection = (): Redis => {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT), // ✅ take from .env (6379)
    username: 'default', // ✅ required for Upstash
    password: process.env.REDIS_PASSWORD,
    tls: {
      rejectUnauthorized: false, // ✅ Upstash TLS
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
  });

  // Add event handlers for connection management
  redis.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redis.on('ready', () => {
    console.log('✅ Redis ready');
  });

  redis.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
  });

  redis.on('close', () => {
    console.log('⚠️ Redis connection closed');
  });

  redis.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  redis.on('end', () => {
    console.log('🔚 Redis connection ended');
    redisInstance = null; // Reset singleton
  });

  return redis;
};

// Export singleton Redis instance
export const redis = (() => {
  if (!redisInstance) {
    redisInstance = createRedisConnection();
  }
  return redisInstance;
})();

// For BullMQ worker/queue - improved configuration
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  username: 'default',
  password: process.env.REDIS_PASSWORD,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
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

// Redis health check utility
export const checkRedisHealth = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  message: string;
  timestamp: Date;
}> => {
  try {
    const startTime = Date.now();
    await redis.ping();
    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      message: `Redis is healthy (${responseTime}ms)`,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Redis health check failed: ${error.message}`,
      timestamp: new Date(),
    };
  }
};
