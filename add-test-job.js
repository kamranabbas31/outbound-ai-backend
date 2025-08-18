const { Queue } = require('bullmq');
require('dotenv').config();

async function addTestJob() {
  const redisConfig = {
    host: process.env.REDIS_HOST,
    port: 6379,
    password: process.env.REDIS_PASSWORD,
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
    lazyConnect: true,
  };

  try {
    const queue = new Queue('cadence-queue', { connection: redisConfig });
    
    // Add a test job
    const job = await queue.add('execute-cadence', {
      campaignId: 'test-campaign-' + Date.now(),
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Test job added successfully!');
    console.log('Job ID:', job.id);
    console.log('Job data:', job.data);
    
    // Check queue status
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    
    console.log('\n📊 Queue Status:');
    console.log('Waiting jobs:', waiting.length);
    console.log('Active jobs:', active.length);
    console.log('Completed jobs:', completed.length);
    console.log('Failed jobs:', failed.length);
    
    await queue.close();
    
  } catch (error) {
    console.error('❌ Error adding job:', error.message);
  }
}

addTestJob();
