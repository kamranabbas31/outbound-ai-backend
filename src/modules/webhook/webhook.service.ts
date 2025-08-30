import { Injectable } from '@nestjs/common';
import { ActivityType } from 'src/graphql';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import {
  calculateCallCost,
  determineCallStatus,
  extractContactId,
  extractDisposition,
  extractDuration,
  extractPhoneNumber,
  extractRecordingUrl,
} from 'src/utils/extractors';

@Injectable()
export class WebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async processWebhook(rawBody: string): Promise<void> {
    let payload: any;

    try {
      payload = JSON.parse(rawBody);
      console.log('✅ Webhook payload parsed successfully');
    } catch (e) {
      console.error('❌ Invalid JSON payload');
      throw new Error('Invalid JSON payload');
    }

    const contactId = extractContactId(payload);
    const phoneNumber = extractPhoneNumber(payload);
    const disposition = extractDisposition(payload);
    const duration = extractDuration(payload);
    const status = determineCallStatus(payload);
    const recordingUrl = extractRecordingUrl(payload);
    const durationMinutes = duration / 60;
    const cost = calculateCallCost(durationMinutes);

    console.log('📞 Extracted data:', {
      contactId,
      phoneNumber,
      disposition,
      durationMinutes,
      status,
      recordingUrl,
      cost,
    });

    let leadId = contactId;
    let campaignId: string | null = null;

    if (!leadId && phoneNumber) {
      const lead = await this.prisma.leads.findFirst({
        where: { phone_number: phoneNumber },
        select: { id: true, campaign_id: true },
      });
      if (lead) {
        leadId = lead.id;
        campaignId = lead.campaign_id;
        console.log('🔍 Found lead by phone number:', leadId, campaignId);
      }
    } else if (leadId) {
      const lead = await this.prisma.leads.findUnique({
        where: { id: leadId },
        select: { campaign_id: true },
      });
      campaignId = lead?.campaign_id ?? null;
      console.log('🔍 Found lead by contact ID:', leadId, campaignId);
    }

    if (!leadId || !campaignId) {
      console.warn('⚠️ No valid lead or campaign found');
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Get the lead's current status before updating
      const currentLead = await tx.leads.findUnique({
        where: { id: leadId },
        select: { status: true },
      });
      const wasInProgress = currentLead?.status === 'In Progress';
      // 2. Update the lead

      if (wasInProgress) {
        console.log({
          lead_id: leadId,
          campaign_id: campaignId,
          activity_type: ActivityType.CALL_ATTEMPT,
          lead_status: status,
          to_disposition: disposition,
          duration: durationMinutes ?? 0.0, // ✅ force number
          cost: cost ?? 0.0,
        });
        await tx.leads.update({
          where: { id: leadId },
          data: {
            status,
            disposition,
            duration: durationMinutes,
            cost,
            ...(recordingUrl && { recordingUrl }),
          },
        });
        await tx.leadActivityLog.create({
          data: {
            lead_id: leadId,
            campaign_id: campaignId,
            activity_type: ActivityType.CALL_ATTEMPT,
            lead_status: status || null,
            to_disposition: disposition || null,
            duration: durationMinutes ?? 0.0, // ✅ force number
            cost: cost ?? 0.0,
          },
        });

        // 3. Prepare campaign update fields with proper stats balancing
        const campaignUpdate: any = {
          cost: { increment: cost },
          duration: { increment: durationMinutes },
          status: 'InProgress',
        };

        // ✅ Only decrement in_progress if the lead was actually in progress

        if (status === 'Completed') {
          if (wasInProgress) {
            campaignUpdate.completed = { increment: 1 };
            campaignUpdate.in_progress = { decrement: 1 };
            console.log(
              '📈 Campaign status update: Completed (was in progress)',
            );
          } else {
            console.log(
              '📈 Campaign status update: Completed (was not in progress)',
            );
          }
        } else if (status === 'Failed') {
          if (wasInProgress) {
            campaignUpdate.failed = { increment: 1 };
            campaignUpdate.in_progress = { decrement: 1 };
            console.log('📈 Campaign status update: Failed (was in progress)');
          } else {
            console.log(
              '📈 Campaign status update: Failed (was not in progress)',
            );
          }
        }
        const actualStats = await tx.leads.groupBy({
          by: ['status'],
          where: { campaign_id: campaignId },
          _count: { status: true },
        });

        // Get total leads count for this campaign
        const totalLeadsCount = await tx.leads.count({
          where: { campaign_id: campaignId },
        });

        const actualCompleted =
          actualStats.find((s) => s.status === 'Completed')?._count.status || 0;
        const actualInProgress =
          actualStats.find((s) => s.status === 'In Progress')?._count.status ||
          0;
        const actualFailed =
          actualStats.find((s) => s.status === 'Failed')?._count.status || 0;
        const actualRemaining =
          actualStats.find((s) => s.status === 'Pending')?._count.status || 0;
        // Update campaign status based on lead distribution

        if (actualCompleted === totalLeadsCount) {
          // All leads are completed
          campaignUpdate.status = 'Completed';
        } else if (actualFailed === totalLeadsCount) {
          // All leads have failed
          campaignUpdate.status = 'Failed';
        } else if (actualInProgress > 0) {
          // Some leads are still in progress
          campaignUpdate.status = 'InProgress';
        }

        // 4. Apply campaign update
        const updatedCampaign = await tx.campaigns.update({
          where: { id: campaignId },
          data: campaignUpdate,
        });

        // 5. Validate and fix campaign stats balance
        const campaignStats = await tx.campaigns.findUnique({
          where: { id: campaignId },
          select: {
            in_progress: true,
            remaining: true,
            completed: true,
            failed: true,
            leads_count: true,
          },
        });

        if (campaignStats) {
          // Safety check: Prevent negative values
          const safetyUpdates: any = {};

          if (campaignStats.in_progress < 0) {
            safetyUpdates.in_progress = 0;
          }
          if (campaignStats.remaining < 0) {
            safetyUpdates.remaining = 0;
          }
          if (campaignStats.completed < 0) {
            safetyUpdates.completed = 0;
          }
          if (campaignStats.failed < 0) {
            safetyUpdates.failed = 0;
          }

          if (Object.keys(safetyUpdates).length > 0) {
            await tx.campaigns.update({
              where: { id: campaignId },
              data: safetyUpdates,
            });
            console.log('🔧 Fixed negative campaign stats:', safetyUpdates);
          }

          // Validate total balance
          const calculatedTotal =
            campaignStats.completed +
            campaignStats.in_progress +
            campaignStats.remaining +
            campaignStats.failed;
          if (calculatedTotal !== campaignStats.leads_count) {
            console.warn(
              `⚠️ Campaign stats imbalance detected: calculated=${calculatedTotal}, expected=${campaignStats.leads_count}`,
            );

            // Auto-fix: Recalculate stats based on actual lead counts
            const actualStats = await tx.leads.groupBy({
              by: ['status'],
              where: { campaign_id: campaignId },
              _count: { status: true },
            });

            // Get total leads count for this campaign
            const totalLeadsCount = await tx.leads.count({
              where: { campaign_id: campaignId },
            });

            const actualCompleted =
              actualStats.find((s) => s.status === 'Completed')?._count
                .status || 0;
            const actualInProgress =
              actualStats.find((s) => s.status === 'In Progress')?._count
                .status || 0;
            const actualFailed =
              actualStats.find((s) => s.status === 'Failed')?._count.status ||
              0;
            const actualRemaining =
              actualStats.find((s) => s.status === 'Pending')?._count.status ||
              0;

            // Update campaign status based on lead distribution
            let campaignStatus: string = 'InProgress';

            if (actualCompleted === totalLeadsCount) {
              // All leads are completed
              campaignStatus = 'Completed';
            } else if (actualFailed === totalLeadsCount) {
              // All leads have failed
              campaignStatus = 'Failed';
            } else if (actualInProgress > 0) {
              // Some leads are still in progress
              campaignStatus = 'InProgress';
            }

            await tx.campaigns.update({
              where: { id: campaignId },
              data: {
                status: campaignStatus,
                completed: actualCompleted,
                in_progress: actualInProgress,
                failed: actualFailed,
                remaining: Math.max(0, actualRemaining),
              },
            });
            console.log('🔧 Auto-fixed campaign stats imbalance:', {
              completed: actualCompleted,
              in_progress: actualInProgress,
              failed: actualFailed,
              remaining: Math.max(0, actualRemaining),
            });
          }
        }

        console.log('✅ Campaign updated:', campaignId);
      }
    });

    console.log('🚀 Webhook processing complete for lead:', leadId);
  }
}
