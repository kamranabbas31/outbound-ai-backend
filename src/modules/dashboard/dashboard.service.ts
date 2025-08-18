import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}
  private emptyStats() {
    return {
      completed: 0,
      inProgress: 0,
      remaining: 0,
      failed: 0,
      totalDuration: 0,
      totalCost: 0,
    };
  }
  async getDashboardStatsByUser(
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    console.log(
      `[DashboardService] Starting getDashboardStatsByUser for userId: ${userId}, startDate: ${startDate}, endDate: ${endDate}`,
    );

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

      // Separate cadence vs non-cadence campaigns
      const cadenceCampaignIds = campaigns
        .filter((c) => c.cadence_template_id)
        .map((c) => c.id);
      const nonCadenceCampaignIds = campaigns
        .filter((c) => !c.cadence_template_id)
        .map((c) => c.id);
      console.log(
        `[DashboardService] Cadence campaigns: ${cadenceCampaignIds.length}, Non-cadence campaigns: ${nonCadenceCampaignIds.length}`,
      );

      let completed = 0;
      let inProgress = 0;
      let remaining = 0;
      let failed = 0;
      let totalDuration = 0;
      let totalCost = 0;

      // 2️⃣ Non-cadence → read campaign statuses directly from database
      if (nonCadenceCampaignIds.length) {
        const nonCadenceCampaigns = await this.prisma.campaigns.findMany({
          where: {
            id: { in: nonCadenceCampaignIds },
            created_at: { gte: start, lte: end },
          },
          select: {
            completed: true,
            in_progress: true,
            remaining: true,
            failed: true,
            duration: true,
            cost: true,
          },
        });

        for (const campaign of nonCadenceCampaigns) {
          completed += campaign.completed ?? 0;
          inProgress += campaign.in_progress ?? 0;
          remaining += campaign.remaining ?? 0;
          failed += campaign.failed ?? 0;
          totalDuration += campaign.duration ?? 0;
          totalCost += campaign.cost ?? 0;
        }
      }

      // 3️⃣ Cadence → match by LeadActivityLog.created_at
      if (cadenceCampaignIds.length) {
        // First, get unique lead_ids from activity logs in date range
        const logs = await this.prisma.leadActivityLog.findMany({
          where: {
            campaign_id: { in: cadenceCampaignIds },
            created_at: { gte: start, lte: end },
          },
          select: {
            lead_id: true,
            campaign_id: true,
            duration: true,
            cost: true,
          },
        });

        if (logs.length) {
          // === Existing Logic ===
          const leadIds = [...new Set(logs.map((l) => l.lead_id))];

          if (leadIds.length) {
            const leads = await this.prisma.leads.findMany({
              where: { id: { in: leadIds } },
              select: { status: true },
            });

            for (const lead of leads) {
              const status = lead.status?.toLowerCase();
              switch (status) {
                case 'completed':
                  completed++;
                  break;
                case 'in_progress':
                  inProgress++;
                  break;
                case 'in progress':
                  inProgress++;
                  break;
                case 'failed':
                  failed++;
                  break;
                default:
                  remaining++;
                  break;
              }
            }
          }

          // Sum up duration & cost directly from logs
          for (const log of logs) {
            totalDuration += log.duration ?? 0;
            totalCost += log.cost ?? 0;
          }
        } else {
          // === NEW FALLBACK LOGIC ===
          console.log(
            `[DashboardService] No logs found — fetching leads directly for cadence campaigns`,
          );

          const leads = await this.prisma.leads.findMany({
            where: { campaign_id: { in: cadenceCampaignIds } },
            select: { status: true, duration: true, cost: true },
          });

          for (const lead of leads) {
            const status = lead.status?.toLowerCase();
            switch (status) {
              case 'completed':
                completed++;
                break;
              case 'in_progress':
                inProgress++;
                break;
              case 'in progress':
                inProgress++;
                break;
              case 'failed':
                failed++;
                break;
              default:
                remaining++;
                break;
            }

            totalDuration += lead.duration ?? 0;
            totalCost += lead.cost ?? 0;
          }
        }
      }

      const finalStats = {
        completed,
        inProgress,
        remaining,
        failed,
        totalDuration,
        totalCost,
      };
      console.log(
        `[DashboardService] Final stats with date filter:`,
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
    console.log(`[DashboardService] Fallback stats:`, fallbackStats);
    return fallbackStats;
  }
}
