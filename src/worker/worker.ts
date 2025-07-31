// src/workers/campaign.worker.ts
import { Worker } from 'bullmq';
import { ConnectionOptions } from 'tls';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CampaignsService } from 'src/modules/campaign/campaign.service';
import { TriggerCallService } from 'src/modules/call/trigger-call.service';
import { redis } from 'src/utils/redis';

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const campaignsService = app.get(CampaignsService);
  const triggerCallService = app.get(TriggerCallService);

  const worker = new Worker(
    'campaignQueue',
    async (job) => {
      console.log(
        `Processing job ${job.id} for campaign ${job.data.campaignId}`,
      );
      const { campaignId, pacingPerSecond } = job.data;

      const allLeadsResult = await campaignsService.fetchLeadsForExecution(
        campaignId,
        'Pending',
      );
      if (allLeadsResult.userError || !allLeadsResult.data) {
        console.error('❌ No leads found or error fetching leads.');
        return;
      }

      const pendingLeads = allLeadsResult.data;

      if (pendingLeads.length === 0) {
        await campaignsService.updateCampaignStatus(campaignId, 'idle');
        return;
      }

      await campaignsService.updateCampaignStatus(campaignId, 'executing');

      const interval = (1 / parseInt(pacingPerSecond, 10)) * 1000;

      for (const lead of pendingLeads) {
        const execStatus = await redis.get(`execStatus:${campaignId}`);
        if (execStatus === 'stopped') {
          console.log(`Execution for campaign ${campaignId} was stopped.`);
          break;
        }

        console.log(`Calling lead ${lead.id}`);

        try {
          await triggerCallService.triggerCall({ leadId: lead.id });
        } catch (err) {
          console.error(
            `Error triggering call for lead ${lead.id}:`,
            err.message,
          );
        }

        await new Promise((res) => setTimeout(res, interval));
      }

      await campaignsService.updateCampaignStatus(campaignId, 'idle');
    },
    {
      connection: redis,
    },
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed with error: ${err.message}`);
  });

  console.log('Campaign worker is running...');
}

bootstrapWorker();
