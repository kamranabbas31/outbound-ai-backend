import { Module } from '@nestjs/common';
import { CampaignsResolver } from './campaign.resolver';
import { CampaignsService } from './campaign.service';

@Module({
  providers: [CampaignsResolver, CampaignsService],
})
export class CampaignModule {}
