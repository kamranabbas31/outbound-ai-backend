import { Worker } from 'bullmq';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CadenceService } from 'src/modules/cadence/cadence.service';
import { redisConfig, getRedisUrl } from 'src/utils/redis';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrapCadenceWorker() {
  try {
    console.log('Starting cadence worker...');
    console.log('Redis config:', {
      host: process.env.REDIS_HOST,
      port: 6379,
      tls: true,
    });

    const app = await NestFactory.createApplicationContext(AppModule);
    const cadenceService = app.get(CadenceService);

    // Use connection string format for better compatibility with Upstash Redis
    const connectionString = getRedisUrl();
    console.log('Using Redis connection:', connectionString);

    const worker = new Worker(
      'cadence-queue',
      async (job) => {
        const { campaignId } = job.data;

        console.log(`Processing cadence for campaign ${campaignId}`);

        try {
          await cadenceService.executeCampaignCadence(campaignId);
        } catch (err) {
          console.error(
            `Cadence execution failed for ${campaignId}:`,
            err.message,
          );
        }
      },
      {
        connection: redisConfig,
        // Alternative: use connection string
        // connection: connectionString,
      },
    );

    worker.on('completed', async (job) => {
      console.log(`Cadence job ${job.id} completed`);
      await job.remove();
    });

    worker.on('failed', async (job, err) => {
      console.error(`Cadence job failed with error: ${err.message}`);
      if (job) {
        await job.remove();
        console.log(`Removed failed job ${job.id} from queue`);
      }
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    worker.on('ready', () => {
      console.log('Cadence worker is ready and listening for jobs...');
    });

    console.log('Cadence worker running...');
  } catch (error) {
    console.error('Failed to start cadence worker:', error);
    process.exit(1);
  }
}

bootstrapCadenceWorker();
