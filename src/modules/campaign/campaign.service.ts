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
import { UpdateCampaignInput } from './dto/update-campaign.input';
import { ActivityType } from 'src/graphql';

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
        include: {
          cadence_template: {
            select: {
              id: true,
              name: true,
            },
          },
          cadence_progress: {
            orderBy: { executed_at: 'desc' },
            take: 1, // ✅ Only the latest progress
          },
        },
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
    cadenceId?: string,
    cadenceStartDate?: Date,
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

      const updateData: any = {
        leads_count: totalCount,
        remaining: pendingCount,
        failed: failedCount,
        status: newStatus,
      };

      // ✅ Attach cadence if provided
      if (cadenceId && cadenceId !== 'none') {
        updateData.cadence_template_id = cadenceId;
        updateData.cadence_start_date = cadenceStartDate ?? new Date();
        updateData.cadence_stopped = false;
        updateData.cadence_completed = false;
      }

      const updatedCampaign = await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: updateData,
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
        include: {
          cadence_template: {
            select: {
              id: true,
              name: true,
            },
          },
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

  async attachCadenceToCampaign(input: {
    campaignId: string;
    cadenceId: string;
    startDate?: Date;
  }) {
    const { campaignId, cadenceId, startDate } = input;

    try {
      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        return {
          success: false,
          userError: { message: 'Campaign not found' },
        };
      }

      const cadence = await this.prisma.cadenceTemplate.findUnique({
        where: { id: cadenceId },
      });

      if (!cadence) {
        return {
          success: false,
          userError: { message: 'Cadence template not found' },
        };
      }

      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: {
          cadence_template_id: cadenceId,
          cadence_start_date: startDate,
          cadence_stopped: false,
          cadence_completed: false,
        },
      });

      return {
        success: true,
        userError: null,
      };
    } catch (error) {
      console.error('[AttachCadenceToCampaign] Unexpected error:', error);
      return {
        success: false,
        userError: {
          message: 'Internal server error. Please try again later.',
        },
      };
    }
  }

  async stopCadence(campaignId: string) {
    try {
      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        return {
          success: false,
          userError: { message: 'Campaign not found' },
        };
      }

      if (!campaign.cadence_template_id) {
        return {
          success: false,
          userError: { message: 'This campaign has no cadence attached' },
        };
      }

      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: {
          cadence_stopped: true,
        },
      });

      return {
        success: true,
        userError: null,
      };
    } catch (error) {
      console.error('[StopCadence] Error:', error);
      return {
        success: false,
        userError: {
          message: 'Internal server error. Please try again later.',
        },
      };
    }
  }

  async updateCampaign(input: UpdateCampaignInput) {
    const { id, ...updateData } = input;

    try {
      const updatedCampaign = await this.prisma.campaigns.update({
        where: { id },
        data: updateData,
        include: {
          cadence_template: {
            select: { id: true, name: true },
          },
        },
      });

      return {
        success: true,
        userError: null,
        campaign: updatedCampaign,
      };
    } catch (error) {
      console.error('[updateCampaign] Error:', error);
      return {
        success: false,
        userError: { message: 'Failed to update campaign' },
        campaign: null,
      };
    }
  }

  async fetchLeadAttempts(campaignId: string) {
    try {
      // Fetch leads + their call attempts
      const leads = await this.prisma.leads.findMany({
        where: { campaign_id: campaignId },
        include: {
          activity_logs: {
            where: { activity_type: ActivityType.CALL_ATTEMPT },
            orderBy: { created_at: "asc" }
          }
        }
      });

      // Flatten into one row per attempt or one row if no attempts
      const rows = leads.flatMap((lead) => {
        if (lead.activity_logs.length === 0) {
          // No activity logs, return a single row with lead data and attempt 0
          return [{
            name: lead.name || "",
            phone: lead.phone_number || "",
            status: lead.status || "",
            disposition: lead.disposition || "",
            duration: "0 sec",
            cost: lead.cost ?? 0.0,
            attempt: 0
          }];
        }

        // Otherwise return rows for each activity log
        return lead.activity_logs.map((log, index) => ({
          name: lead.name || "",
          phone: lead.phone_number || "",
          status: log.lead_status || "",
          disposition: log.to_disposition || "",
          duration: log.duration ? `${log.duration} sec` : "0 sec",
          cost: log.cost ?? 0.0,
          attempt: index + 1
        }));
      });

      console.log({ rows });
      return {
        userError: null,
        data: rows
      };
    } catch (error) {
      console.error("Error fetching lead attempts:", error);
      return {
        userError: { message: "Failed to fetch lead attempts" },
        data: []
      };
    }
  }

}
