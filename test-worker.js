const { Worker, Queue } = require('bullmq');
require('dotenv').config();

async function testWorker() {
  console.log('Testing BullMQ Worker...');
  console.log('REDIS_HOST:', process.env.REDIS_HOST);
  console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***' : 'not set');

  const redisConfig = {
    host: process.env.REDIS_HOST,
    port: 6379,
    password: process.env.REDIS_PASSWORD,
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
    lazyConnect: true,
  };

  try {
    // Create a test queue
    const testQueue = new Queue('cadence-queue', {
      connection: redisConfig,
    });

    // Add a test job
    const job = await testQueue.add('execute-cadence', {
      campaignId: 'test-campaign-123',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Test job added to queue:', job.id);

    // Create a test worker
    const worker = new Worker(
      'cadence-queue',
      async (job) => {
        console.log('🎯 Worker processing job:', job.id);
        console.log('Job data:', job.data);
        
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Job completed successfully');
        return { status: 'completed', campaignId: job.data.campaignId };
      },
      {
        connection: redisConfig,
      }
    );

    worker.on('completed', (job) => {
      console.log('🎉 Job completed:', job.id);
    });

    worker.on('failed', (job, err) => {
      console.error('❌ Job failed:', job?.id, err.message);
    });

    worker.on('error', (err) => {
      console.error('🚨 Worker error:', err);
    });

    worker.on('ready', () => {
      console.log('🚀 Worker is ready and listening for jobs...');
    });

    // Wait for the job to be processed
    console.log('Waiting for job to be processed...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Clean up
    await worker.close();
    await testQueue.close();
    console.log('✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error details:', error);
  }
}

testWorker();
