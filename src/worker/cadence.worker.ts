import { Worker } from 'bullmq';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CadenceService } from 'src/modules/cadence/cadence.service';
import { redisConfig } from 'src/utils/redis';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrapCadenceWorker() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cadenceService = app.get(CadenceService);

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
    },
  );

  worker.on('completed', async (job) => {
    console.log(`Cadence job ${job.id} completed`);
    await job.remove();
  });

  worker.on('failed', async (job, err) => {
    console.error(`Cadence job  failed with error: ${err.message}`);
    if (job) {
      await job.remove();
      console.log(`Removed completed job ${job.id} from queue`);
    }
  });

  console.log('Cadence worker running...');
}

bootstrapCadenceWorker();
