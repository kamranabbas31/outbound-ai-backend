import { Worker } from 'bullmq';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CadenceService } from 'src/modules/cadence/cadence.service';
import { redisConfig, getRedisUrl, redis } from 'src/utils/redis';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrapCadenceWorker() {
  try {
    console.log('Starting cadence worker...');

    // ✅ Print the actual redisConfig (not hardcoded)
    console.log('Redis config (BullMQ):', {
      host: redisConfig.host,
      port: redisConfig.port,
      connectTimeout: redisConfig.connectTimeout,
      commandTimeout: redisConfig.commandTimeout,
    });

    // ✅ Print the connection string alternative
    const connectionString = getRedisUrl();
    console.log('Redis connection string available:', !!connectionString);

    // Test Redis connection before starting worker
    try {
      console.log('Testing Redis connection...');
      await redis.ping();
      console.log('✅ Redis connection successful');
    } catch (err) {
      console.error('❌ Redis connection failed:', err.message);
      console.log(
        '⚠️ Continuing with worker startup, connection might recover...',
      );
    }

    const app = await NestFactory.createApplicationContext(AppModule);
    const cadenceService = app.get(CadenceService);

    const worker = new Worker(
      'cadence-queue',
      async (job) => {
        const { campaignId, resumeCadence } = job.data;
        console.log(
          `Processing cadence for campaign ${campaignId}, attempt ${job.attemptsMade + 1}`,
        );
        console.log({ resumeCadence, type: typeof resumeCadence });
        try {
          // Add timeout for job execution
          const executionPromise =
            resumeCadence === false
              ? cadenceService.executeCampaignCadence(campaignId)
              : cadenceService.executeResumeCadence(campaignId);

          await executionPromise;

          console.log(
            `✅ Cadence execution completed for campaign ${campaignId}`,
          );
        } catch (err) {
          console.error(
            `❌ Cadence execution failed for ${campaignId}:`,
            err.message,
          );

          // Throw error to trigger retry logic
          throw err;
        }
      },
      {
        // ✅ Use redisConfig with enhanced settings for worker stability
        connection: {
          ...redisConfig,
          // Worker-specific Redis settings
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          // Increase timeouts for job processing
          connectTimeout: 30000,
          commandTimeout: 15000,
        },

        // Worker-specific settings
        concurrency: 1, // Process one job at a time
        removeOnComplete: { count: 5 }, // Keep fewer completed jobs
        removeOnFail: { count: 20 }, // Keep fewer failed jobs

        // Job settings
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Retry stalled jobs once

        // Alternative: use connection string instead
        // connection: connectionString,
      },
    );

    worker.on('completed', (job) => {
      console.log(`✅ Cadence job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      console.error(
        `❌ Cadence job ${job?.id} failed with error: ${err.message}`,
      );
      if (job) {
        console.log(`Job ${job.id} will be retried or moved to failed queue`);
      }
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);

      // Handle Redis timeout errors specifically
      if (
        err.message.includes('Command timed out') ||
        err.message.includes('Connection is closed')
      ) {
        console.log(
          '⚠️ Redis timeout detected, worker will continue processing...',
        );
        // Don't exit on Redis timeouts, let the worker recover
        return;
      }

      // For other critical errors, you might want to restart
      console.error('❌ Critical worker error, considering restart...');
    });

    worker.on('ready', () => {
      console.log('✅ Cadence worker is ready and listening for jobs...');
    });

    worker.on('active', (job) => {
      console.log(`🔄 Job ${job.id} started processing...`);
    });

    worker.on('stalled', (jobId) => {
      console.log(`⚠️ Job ${jobId} stalled and will be retried`);
    });

    worker.on('progress', (job, progress) => {
      console.log(`📊 Job ${job.id} progress: ${progress}%`);
    });

    console.log('Cadence worker running...');
  } catch (error) {
    console.error('Failed to start cadence worker:', error);
    process.exit(1);
  }
}

bootstrapCadenceWorker();
