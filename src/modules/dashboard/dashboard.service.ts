import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }
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
    async getDashboardStatsByUser(userId: string, startDate?: string, endDate?: string) {
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);

            // 1️⃣ Get all campaigns of the user
            const campaigns = await this.prisma.campaigns.findMany({
                where: { user_id: userId },
                select: { id: true, cadence_template_id: true },
            });

            const campaignIds = campaigns.map(c => c.id);
            if (!campaignIds.length) return this.emptyStats();

            // Separate cadence vs non-cadence campaigns
            const cadenceCampaignIds = campaigns.filter(c => c.cadence_template_id).map(c => c.id);
            const nonCadenceCampaignIds = campaigns.filter(c => !c.cadence_template_id).map(c => c.id);

            let completed = 0;
            let inProgress = 0;
            let remaining = 0;
            let failed = 0;
            let totalDuration = 0;
            let totalCost = 0;

            // 2️⃣ Non-cadence → match by leads.initiated_at
            if (nonCadenceCampaignIds.length) {
                const leads = await this.prisma.leads.findMany({
                    where: {
                        campaign_id: { in: nonCadenceCampaignIds },
                        initiated_at: { gte: start, lte: end },
                    },
                    select: { status: true, duration: true, cost: true },
                });

                for (const lead of leads) {
                    switch (lead.status) {
                        case 'COMPLETED':
                            completed++;
                            break;
                        case 'IN_PROGRESS':
                            inProgress++;
                            break;
                        case 'FAILED':
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

            // 3️⃣ Cadence → match by LeadActivityLog.created_at
            if (cadenceCampaignIds.length) {
                // First, get unique lead_ids from activity logs in date range
                const logs = await this.prisma.leadActivityLog.findMany({
                    where: {
                        campaign_id: { in: cadenceCampaignIds },
                        created_at: { gte: start, lte: end },
                    },
                    select: { lead_id: true, campaign_id: true, duration: true, cost: true },
                });

                const leadIds = [...new Set(logs.map(l => l.lead_id))];

                if (leadIds.length) {
                    const leads = await this.prisma.leads.findMany({
                        where: { id: { in: leadIds } },
                        select: { status: true },
                    });

                    for (const lead of leads) {
                        switch (lead.status) {
                            case 'COMPLETED':
                                completed++;
                                break;
                            case 'IN_PROGRESS':
                                inProgress++;
                                break;
                            case 'FAILED':
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
            }

            return { completed, inProgress, remaining, failed, totalDuration, totalCost };
        }

        // 4️⃣ Fallback → old logic (no date filter)
        const campaigns = await this.prisma.campaigns.findMany({
            where: { user_id: userId },
            select: { completed: true, in_progress: true, remaining: true, failed: true, duration: true, cost: true },
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

        return { completed, inProgress, remaining, failed, totalDuration, totalCost };
    }

}
