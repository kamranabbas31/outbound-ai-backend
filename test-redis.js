const Redis = require('ioredis');
require('dotenv').config();

async function testRedisConnection() {
  console.log('Testing Redis connection...');
  console.log('REDIS_HOST:', process.env.REDIS_HOST);
  console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***' : 'not set');

  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: 6379,
    password: process.env.REDIS_PASSWORD,
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
  });

  try {
    // Test basic connection
    await redis.ping();
    console.log('✅ Redis connection successful!');

    // Test setting and getting a value
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    console.log('✅ Redis read/write test successful:', value);

    // Test queue operations (like bullmq would use)
    await redis.lpush('test-queue', 'test-job-1');
    await redis.lpush('test-queue', 'test-job-2');
    const queueLength = await redis.llen('test-queue');
    console.log('✅ Redis queue operations successful. Queue length:', queueLength);

    // Clean up
    await redis.del('test-key');
    await redis.del('test-queue');
    console.log('✅ Cleanup successful');

  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.error('Error details:', error);
  } finally {
    await redis.quit();
    console.log('Redis connection closed');
  }
}

testRedisConnection();
