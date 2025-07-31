import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Campaigns } from '@prisma/client';
import { Queue } from 'bullmq';
import { redis } from 'src/utils/redis';

@Injectable()
export class CampaignsService {
  private queue: Queue;

  constructor(private readonly prisma: PrismaService) {
    this.queue = new Queue('campaignQueue', {
      connection: redis,
    });
  }

  async createCampaign(
    campaignName: string,
    userId: string,
  ): Promise<{
    userError: { message: string } | null;
    data: Campaigns | null;
  }> {
    if (!campaignName.trim()) {
      return {
        userError: { message: 'Campaign name is required' },
        data: null,
      };
    }

    try {
      const existing = await this.prisma.campaigns.findFirst({
        where: {
          user_id: userId,
          name: {
            equals: campaignName,
            mode: 'insensitive',
          },
        },
      });

      if (existing) {
        return {
          userError: { message: 'You already have a campaign with this name' },
          data: null,
        };
      }

      const campaign = await this.prisma.campaigns.create({
        data: {
          name: campaignName,
          file_name: '',
          status: 'pending',
          execution_status: 'idle',
          leads_count: 0,
          completed: 0,
          in_progress: 0,
          remaining: 0,
          failed: 0,
          duration: 0,
          cost: 0,
          user_id: userId,
        },
      });

      return {
        userError: null,
        data: campaign,
      };
    } catch (error) {
      console.error('Error creating campaign:', error);
      return {
        userError: { message: 'Failed to create campaign' },
        data: null,
      };
    }
  }

  async fetchCampaigns(userId: string): Promise<{
    userError: { message: string } | null;
    data: Campaigns[] | null;
  }> {
    try {
      const campaigns = await this.prisma.campaigns.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
      });

      return {
        userError: null,
        data: campaigns,
      };
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return {
        userError: { message: 'Failed to fetch campaigns' },
        data: null,
      };
    }
  }

  async addLeadsToCampaign(
    campaignId: string,
    leads: any[],
  ): Promise<{
    userError: { message: string } | null;
    data: Campaigns | null;
  }> {
    if (!leads || leads.length === 0) {
      return {
        userError: { message: 'No leads to add to campaign' },
        data: null,
      };
    }

    try {
      const preparedLeads = leads.map(({ id, ...lead }) => ({
        ...lead,
        campaign_id: campaignId,
      }));

      await this.prisma.leads.createMany({
        data: preparedLeads,
        skipDuplicates: true,
      });

      const [
        pendingCount,
        failedCount,
        completedCount,
        inProgressCount,
        totalCount,
      ] = await Promise.all([
        this.prisma.leads.count({
          where: { campaign_id: campaignId, status: 'Pending' },
        }),
        this.prisma.leads.count({
          where: { campaign_id: campaignId, status: 'Failed' },
        }),
        this.prisma.leads.count({
          where: { campaign_id: campaignId, status: 'Completed' },
        }),
        this.prisma.leads.count({
          where: { campaign_id: campaignId, status: 'InProgress' },
        }),
        this.prisma.leads.count({ where: { campaign_id: campaignId } }),
      ]);

      // Determine campaign status
      let newStatus: 'Pending' | 'Failed' | 'Completed' | 'InProgress' =
        'Pending';

      if (failedCount === totalCount) {
        newStatus = 'Failed';
      } else if (completedCount === totalCount) {
        newStatus = 'Completed';
      } else if (inProgressCount > 0) {
        newStatus = 'InProgress';
      } else if (pendingCount === totalCount) {
        newStatus = 'Pending';
      }

      const updatedCampaign = await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: {
          leads_count: totalCount,
          remaining: pendingCount,
          failed: failedCount,
          status: newStatus,
        },
      });

      return {
        userError: null,
        data: updatedCampaign,
      };
    } catch (error) {
      console.error('Error adding leads to campaign:', error);
      return {
        userError: { message: 'Failed to add leads to campaign' },
        data: null,
      };
    }
  }

  async fetchLeadsForCampaign(
    campaignId: string,
    skip = 0,
    take = 100,
    searchTerm?: string,
  ): Promise<{ userError: { message: string } | null; data: any[] | null }> {
    try {
      const leads = await this.prisma.leads.findMany({
        where: {
          campaign_id: campaignId,
          OR: searchTerm
            ? [
                {
                  name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
                {
                  phone_number: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
                {
                  status: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
                {
                  disposition: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              ]
            : undefined,
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      });

      return {
        userError: null,
        data: leads,
      };
    } catch (error) {
      console.error('Failed to fetch leads for campaign:', error);
      return {
        userError: { message: 'Failed to fetch leads for campaign' },
        data: null,
      };
    }
  }

  async fetchLeadsForExecution(
    campaignId: string,
    status,
  ): Promise<{ userError: { message: string } | null; data: any[] | null }> {
    try {
      const leads = await this.prisma.leads.findMany({
        where: {
          campaign_id: campaignId,
          status: status,
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      });

      return {
        userError: null,
        data: leads,
      };
    } catch (error) {
      console.error('Failed to fetch leads for campaign:', error);
      return {
        userError: { message: 'Failed to fetch leads for campaign' },
        data: null,
      };
    }
  }
  async fetchCampaignById(campaignId: string): Promise<{
    userError: { message: string } | null;
    data: Campaigns | null;
  }> {
    try {
      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        return {
          userError: { message: 'Campaign not found' },
          data: null,
        };
      }

      return {
        userError: null,
        data: campaign,
      };
    } catch (error) {
      console.error('Error fetching campaign by ID:', error);
      return {
        userError: { message: 'Failed to fetch campaign' },
        data: null,
      };
    }
  }
  async fetchCampaignStats(
    campaignId: string,
  ): Promise<{ userError: { message: string } | null; data: any | null }> {
    try {
      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
        select: {
          completed: true,
          in_progress: true,
          remaining: true,
          failed: true,
          duration: true,
          cost: true,
        },
      });

      if (!campaign) {
        return {
          userError: { message: 'Campaign not found' },
          data: null,
        };
      }

      return {
        userError: null,
        data: {
          completed: campaign.completed,
          inProgress: campaign.in_progress,
          remaining: campaign.remaining,
          failed: campaign.failed,
          totalDuration: campaign.duration,
          totalCost: campaign.cost,
        },
      };
    } catch (error) {
      console.error('Error in fetchCampaignStats:', error);
      return {
        userError: { message: 'Internal server error' },
        data: null,
      };
    }
  }

  async updateCampaignStatus(
    campaignId: string,
    status: string,
  ): Promise<void> {
    await this.prisma.campaigns.update({
      where: { id: campaignId },
      data: { execution_status: status },
    });
  }
  async enqueueJob(
    campaignId: string,
    pacingPerSecond = 1,
  ): Promise<{
    userError: { message: string } | null;
    success: boolean | null;
  }> {
    if (!campaignId)
      return { userError: { message: 'Missing Cmapaign Id' }, success: false };

    const job = await this.queue.add('campaign-job', {
      campaignId,
      pacingPerSecond,
    });

    await redis.set(`execStatus:${campaignId}`, 'executing');

    return { userError: null, success: true };
  }
  async stopJob(campaignId: string): Promise<{
    userError: { message: string } | null;
    success: boolean | null;
  }> {
    if (!campaignId)
      return { userError: { message: 'Missing Cmapaign Id' }, success: false };

    await redis.set(`execStatus:${campaignId}`, 'stopped');

    return { userError: null, success: true };
  }
  async getTotalPagesForCampaign(
    campaignId: string,
    itemsPerPage = 50,
  ): Promise<{
    totalPages: number;
    totalLeads: number;
  }> {
    const totalLeads = await this.prisma.leads.count({
      where: { campaign_id: campaignId },
    });

    const totalPages = Math.max(1, Math.ceil(totalLeads / itemsPerPage));

    return {
      totalPages,
      totalLeads,
    };
  }
}
