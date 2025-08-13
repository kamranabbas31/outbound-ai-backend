import { Module } from '@nestjs/common';
import { CampaignsResolver } from './campaign.resolver';
import { CampaignsService } from './campaign.service';
import { TriggerCallModule } from '../call/trigger-call.module';

@Module({
  imports: [TriggerCallModule],
  providers: [CampaignsResolver, CampaignsService],
  exports: [CampaignsService]
})
export class CampaignModule { }
