import { Resolver, Query, Args, Mutation, Int } from '@nestjs/graphql';
import { CampaignsService } from './campaign.service';
import { Campaigns } from '@prisma/client';
import { UpdateCampaignInput } from './dto/update-campaign.input';
import { LeadAttempt } from 'src/graphql';

@Resolver()
export class CampaignsResolver {
  constructor(private readonly campaignsService: CampaignsService) { }

  @Query('fetchCampaigns')
  async fetchCampaigns(@Args('userId') userId: string): Promise<{
    userError: { message: string } | null;
    data: Campaigns[] | null;
  }> {
    return this.campaignsService.fetchCampaigns(userId);
  }
  @Query('fetchLeadAttempts')
  async fetchLeadAttempts(@Args('campaignId') campaignId: string): Promise<{
    userError: { message: string } | null;
    data: LeadAttempt[] | null;
  }> {
    return this.campaignsService.fetchLeadAttempts(campaignId);
  }
  @Mutation('createCampaign')
  async createCampaign(
    @Args('campaignName') campaignName: string,
    @Args('userId') userId: string,
  ): Promise<{
    userError: { message: string } | null;
    data: Campaigns | null;
  }> {
    return this.campaignsService.createCampaign(campaignName, userId);
  }

  @Mutation('addLeadsToCampaign')
  async addLeadsToCampaign(
    @Args('campaignId') campaignId: string,
    @Args('leads') leads: any[],
    @Args('cadenceId', { nullable: true }) cadenceId?: string,
    @Args('cadenceStartDate', { nullable: true }) cadenceStartDate?: Date,
  ): Promise<{
    userError: { message: string } | null;
    data: Campaigns | null;
  }> {
    return this.campaignsService.addLeadsToCampaign(
      campaignId,
      leads,
      cadenceId,
      cadenceStartDate,
    );
  }

  @Query('fetchLeadsForCampaign')
  async fetchLeadsForCampaign(
    @Args('campaignId') campaignId: string,
    @Args('searchTerm') searchTerm: string,
    @Args('skip', { type: () => Int, nullable: true }) skip = 0,
    @Args('take', { type: () => Int, nullable: true }) take = 100,
  ): Promise<{ userError: { message: string } | null; data: any[] | null }> {
    return this.campaignsService.fetchLeadsForCampaign(
      campaignId,
      skip,
      take,
      searchTerm,
    );
  }

  @Query('fetchCampaignById')
  async fetchCampaignById(@Args('campaignId') campaignId: string): Promise<{
    userError: { message: string } | null;
    data: Campaigns | null;
  }> {
    return this.campaignsService.fetchCampaignById(campaignId);
  }
  @Query('fetchCampaignStats')
  async fetchCampaignStats(
    @Args('campaignId') campaignId: string,
  ): Promise<{ userError: { message: string } | null; data: any | null }> {
    return this.campaignsService.fetchCampaignStats(campaignId);
  }

  @Mutation('enqueueCampaignJob')
  async enqueueCampaignJob(
    @Args('campaignId') campaignId: string,
    @Args('pacingPerSecond', { defaultValue: 1 }) pacingPerSecond: number,
  ): Promise<{
    userError: { message: string } | null;
    success: boolean | null;
  }> {
    console.log(`Start job for campaign ${campaignId}`);
    return await this.campaignsService.enqueueJob(campaignId, pacingPerSecond);
  }

  @Mutation('stopCampaignJob')
  async stopCampaignJob(@Args('campaignId') campaignId: string): Promise<{
    userError: { message: string } | null;
    success: boolean | null;
  }> {
    console.log(`Stopping job for campaign ${campaignId}`);
    return await this.campaignsService.stopJob(campaignId);
  }

  @Query('getTotalPagesForCampaign')
  async getTotalPagesForCampaign(
    @Args('campaignId') campaignId: string,
    @Args('itemsPerPage', { type: () => Int, defaultValue: 50 })
    itemsPerPage: number,
  ) {
    return this.campaignsService.getTotalPagesForCampaign(
      campaignId,
      itemsPerPage,
    );
  }

  @Mutation('attachCadenceToCampaign')
  async attachCadenceToCampaign(
    @Args('input')
    input: {
      campaignId: string;
      cadenceId: string;
      startDate?: Date;
    },
  ) {
    return this.campaignsService.attachCadenceToCampaign(input);
  }

  @Mutation('stopCadence')
  async stopCadence(@Args('campaignId') campaignId: string) {
    return this.campaignsService.stopCadence(campaignId);
  }

  @Mutation('updateCampaign')
  async updateCampaign(@Args('input') input: UpdateCampaignInput) {
    return this.campaignsService.updateCampaign(input);
  }
}
