import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../../utils/logger';

@Injectable()
export class DashboardService {
  private readonly logger = new AppLogger();

  constructor(private readonly prisma: PrismaService) {}
  private emptyStats() {
    this.logger.logStart('DashboardService', 'emptyStats');
    try {
      const result = {
        completed: 0,
        inProgress: 0,
        remaining: 0,
        failed: 0,
        totalDuration: 0,
        totalCost: 0,
      };
      this.logger.logEnd('DashboardService', 'emptyStats', result);
      return result;
    } catch (error) {
      this.logger.logFailed('DashboardService', 'emptyStats', error);
      throw error;
    }
  }
  async getDashboardStatsByUser(
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    this.logger.logStart('DashboardService', 'getDashboardStatsByUser', {
      userId,
      startDate,
      endDate,
    });
    try {
      if (startDate && endDate) {
        // Parse dates and set time to start/end of day for proper range filtering
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end = new Date(endDate + 'T23:59:59.999Z');
        console.log(
          `[DashboardService] Date range: ${start.toISOString()} to ${end.toISOString()}`,
        );

        // 1️⃣ Get all campaigns of the user
        const campaigns = await this.prisma.campaigns.findMany({
          where: { user_id: userId },
          select: { id: true, cadence_template_id: true },
        });
        console.log(
          `[DashboardService] Found ${campaigns.length} campaigns for user`,
        );

        const campaignIds = campaigns.map((c) => c.id);
        if (!campaignIds.length) {
          console.log(
            `[DashboardService] No campaigns found, returning empty stats`,
          );
          return this.emptyStats();
        }
        // Get counts for different lead statuses
        const leadStatusCounts = await this.prisma.leads.groupBy({
          by: ['status'],
          where: {
            campaign_id: { in: campaignIds },
            created_at: { gte: start, lte: end },
          },
          _count: {
            status: true,
          },
        });

        console.log(
          `[DashboardService] Lead status counts across all campaigns:`,
          leadStatusCounts,
        );
        let completed = 0;
        let inProgress = 0;
        let remaining = 0;
        let failed = 0;
        let totalDuration = 0;
        let totalCost = 0;
        // Process the grouped results
        for (const statusGroup of leadStatusCounts) {
          const status = statusGroup.status?.toLowerCase();
          const count = statusGroup._count.status;

          switch (status) {
            case 'in_progress':
            case 'in progress':
              inProgress += count;
              break;
            case 'pending':
              remaining += count;
              break;
          }
        }
        const logs = await this.prisma.leadActivityLog.findMany({
          where: {
            campaign_id: { in: campaignIds },
            created_at: { gte: start, lte: end },
          },
          select: {
            lead_id: true,
            campaign_id: true,
            duration: true,
            cost: true,
            lead_status: true,
          },
        });
        // Process logs to count completed and failed leads
        const processedLeads = new Set<string>(); // Track unique leads to avoid double counting

        for (const log of logs) {
          const logStatus = log.lead_status?.toLowerCase();

          // Only count each lead once

          switch (logStatus) {
            case 'completed':
              completed++;
              break;
            case 'failed':
              failed++;
              break;
          }

          // Always aggregate duration and cost from logs
          if (log.duration) {
            totalDuration += log.duration;
          }
          if (log.cost) {
            totalCost += log.cost;
          }
        }

        console.log(
          `[DashboardService] Processed ${logs.length} activity logs for ${processedLeads.size} unique leads`,
          { completed, failed, totalDuration, totalCost },
        );
        console.log(
          `[DashboardService] Aggregated counts from lead status grouping:`,
          { completed, inProgress, remaining, failed },
        );

        // Separate cadence vs non-cadence campaigns
        // const cadenceCampaignIds = campaigns
        //   .filter((c) => c.cadence_template_id)
        //   .map((c) => c.id);
        // const nonCadenceCampaignIds = campaigns
        //   .filter((c) => !c.cadence_template_id)
        //   .map((c) => c.id);
        // console.log(
        //   `[DashboardService] Cadence campaigns: ${cadenceCampaignIds.length}, Non-cadence campaigns: ${nonCadenceCampaignIds.length}`,
        // );

        // 2️⃣ Non-cadence → fetch leads and calculate from lead data
        // if (nonCadenceCampaignIds.length > 0 && start && end) {
        //   console.log(
        //     `[DashboardService] Processing ${nonCadenceCampaignIds.length} non-cadence campaigns`,
        //   );

        //   const leads = await this.prisma.leads.findMany({
        //     where: {
        //       campaign_id: { in: nonCadenceCampaignIds },
        //       created_at: { gte: start, lte: end },
        //     },
        //     select: { status: true, duration: true, cost: true },
        //   });

        //   console.log(
        //     `[DashboardService] Found ${leads.length} leads for non-cadence campaigns`,
        //   );

        //   for (const lead of leads) {
        //     const status = lead.status?.toLowerCase();
        //     console.log({ status });
        //     switch (status) {
        //       case 'completed':
        //         completed++;
        //         break;
        //       case 'in_progress':
        //         inProgress++;
        //         break;
        //       case 'in progress':
        //         inProgress++;
        //         break;
        //       case 'failed':
        //         failed++;
        //         break;
        //       default:
        //         remaining++;
        //         break;
        //     }
        //     totalDuration += lead.duration ?? 0;
        //     totalCost += lead.cost ?? 0;
        //   }

        //   console.log(`[DashboardService] Non-cadence stats calculated:`, {
        //     completed,
        //     inProgress,
        //     remaining,
        //     failed,
        //     totalDuration,
        //     totalCost,
        //   });
        // }

        // // 3️⃣ Cadence → match by LeadActivityLog.created_at
        // if (cadenceCampaignIds.length > 0 && start && end) {
        //   console.log(
        //     `[DashboardService] Processing ${cadenceCampaignIds.length} cadence campaigns`,
        //   );

        //   // First, get unique lead_ids from activity logs in date range
        //   const logs = await this.prisma.leadActivityLog.findMany({
        //     where: {
        //       campaign_id: { in: cadenceCampaignIds },
        //       created_at: { gte: start, lte: end },
        //     },
        //     select: {
        //       lead_id: true,
        //       campaign_id: true,
        //       duration: true,
        //       cost: true,
        //     },
        //   });

        //   console.log(
        //     `[DashboardService] Found ${logs.length} activity logs for cadence campaigns`,
        //   );

        //   if (logs.length > 0) {
        //     // === Existing Logic ===
        //     const leadIds = [...new Set(logs.map((l) => l.lead_id))];
        //     console.log(
        //       `[DashboardService] Unique lead IDs from logs: ${leadIds.length}`,
        //     );

        //     if (leadIds.length) {
        //       const leads = await this.prisma.leads.findMany({
        //         where: { id: { in: leadIds } },
        //         select: { status: true },
        //       });

        //       console.log(
        //         `[DashboardService] Fetched ${leads.length} leads for cadence campaigns`,
        //       );

        //       for (const lead of leads) {
        //         const status = lead.status?.toLowerCase();
        //         switch (status) {
        //           case 'completed':
        //             completed++;
        //             break;
        //           case 'in_progress':
        //             inProgress++;
        //             break;
        //           case 'in progress':
        //             inProgress++;
        //             break;
        //           case 'failed':
        //             failed++;
        //             break;
        //           default:
        //             remaining++;
        //             break;
        //         }
        //       }
        //     }

        //     // Sum up duration & cost directly from logs
        //     for (const log of logs) {
        //       totalDuration += log.duration ?? 0;
        //       totalCost += log.cost ?? 0;
        //     }

        //     console.log(`[DashboardService] Cadence stats from logs:`, {
        //       completed,
        //       inProgress,
        //       remaining,
        //       failed,
        //       totalDuration,
        //       totalCost,
        //     });
        //   } else {
        //     // === NEW FALLBACK LOGIC ===
        //     console.log(
        //       `[DashboardService] No logs found — fetching leads directly for cadence campaigns`,
        //     );

        //     const leads = await this.prisma.leads.findMany({
        //       where: { campaign_id: { in: cadenceCampaignIds } },
        //       select: { status: true, duration: true, cost: true },
        //     });

        //     console.log(
        //       `[DashboardService] Fetched ${leads.length} leads directly for cadence campaigns`,
        //     );

        //     for (const lead of leads) {
        //       const status = lead.status?.toLowerCase();
        //       console.log({ status });

        //       switch (status) {
        //         case 'completed':
        //           completed++;
        //           break;
        //         case 'in_progress':
        //           inProgress++;
        //           break;
        //         case 'in progress':
        //           inProgress++;
        //           break;
        //         case 'failed':
        //           failed++;
        //           break;
        //         default:
        //           remaining++;
        //           break;
        //       }

        //       totalDuration += lead.duration ?? 0;
        //       totalCost += lead.cost ?? 0;
        //     }

        //     console.log(
        //       `[DashboardService] Cadence stats from direct lead fetch:`,
        //       {
        //         completed,
        //         inProgress,
        //         remaining,
        //         failed,
        //         totalDuration,
        //         totalCost,
        //       },
        //     );
        //   }
        // }

        const finalStats = {
          completed,
          inProgress,
          remaining,
          failed,
          totalDuration,
          totalCost,
        };
        this.logger.logEnd(
          'DashboardService',
          'getDashboardStatsByUser',
          finalStats,
        );
        return finalStats;
      }

      // 4️⃣ Fallback → old logic (no date filter)
      console.log(
        `[DashboardService] No date filter provided, using fallback logic`,
      );
      const campaigns = await this.prisma.campaigns.findMany({
        where: { user_id: userId },
        select: {
          completed: true,
          in_progress: true,
          remaining: true,
          failed: true,
          duration: true,
          cost: true,
        },
      });

      let completed = 0;
      let inProgress = 0;
      let remaining = 0;
      let failed = 0;
      let totalDuration = 0;
      let totalCost = 0;

      for (const campaign of campaigns) {
        completed += campaign.completed ?? 0;
        inProgress += campaign.in_progress ?? 0;
        remaining += campaign.remaining ?? 0;
        failed += campaign.failed ?? 0;
        totalDuration += campaign.duration ?? 0;
        totalCost += campaign.cost ?? 0;
      }

      const fallbackStats = {
        completed,
        inProgress,
        remaining,
        failed,
        totalDuration,
        totalCost,
      };
      this.logger.logEnd(
        'DashboardService',
        'getDashboardStatsByUser',
        fallbackStats,
      );
      return fallbackStats;
    } catch (error) {
      this.logger.logFailed(
        'DashboardService',
        'getDashboardStatsByUser',
        error,
      );
      throw error;
    }
  }
}
