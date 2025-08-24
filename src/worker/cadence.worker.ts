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

    // ✅ Print the actual redisConfig (not hardcoded)
    console.log('Redis config (BullMQ):', redisConfig);

    // ✅ Print the connection string alternative
    const connectionString = getRedisUrl();
    console.log('Redis connection string:', connectionString);

    const app = await NestFactory.createApplicationContext(AppModule);
    const cadenceService = app.get(CadenceService);

    const worker = new Worker(
      'cadence-queue',
      async (job) => {
        const { campaignId, resumeCadence } = job.data;
        console.log(`Processing cadence for campaign ${campaignId}`);

        try {
          if (resumeCadence === 'false') {
            await cadenceService.executeCampaignCadence(campaignId);
          } else {
            await cadenceService.executeResumeCadence(campaignId);
          }
        } catch (err) {
          console.error(
            `Cadence execution failed for ${campaignId}:`,
            err.message,
          );
        }
      },
      {
        // ✅ Use redisConfig (6380 + TLS)
        connection: redisConfig,

        // Alternative: use connection string instead
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
