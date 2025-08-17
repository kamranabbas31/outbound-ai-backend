import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) { }

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

      // 2. Update the lead
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
          activity_type: 'CALL_ATTEMPT',
          lead_status: status,
          to_disposition: disposition,
          duration: durationMinutes,
          cost,
        },
      });

      // 3. Prepare campaign update fields with validation
      const campaignUpdate: any = {
        cost: { increment: cost },
        duration: { increment: durationMinutes },
      };

      // ✅ Only decrement in_progress if the lead was actually in progress
      const wasInProgress = currentLead?.status === 'In Progress';
      
      if (status === 'Completed') {
        campaignUpdate.completed = { increment: 1 };
        if (wasInProgress) {
          campaignUpdate.in_progress = { decrement: 1 };
          console.log('📈 Campaign status update: Completed (was in progress)');
        } else {
          console.log('📈 Campaign status update: Completed (was not in progress)');
        }
      } else if (status === 'Failed') {
        campaignUpdate.failed = { increment: 1 };
        if (wasInProgress) {
          campaignUpdate.in_progress = { decrement: 1 };
          console.log('📈 Campaign status update: Failed (was in progress)');
        } else {
          console.log('📈 Campaign status update: Failed (was not in progress)');
        }
      }

      // 4. Apply campaign update with validation
      const updatedCampaign = await tx.campaigns.update({
        where: { id: campaignId },
        data: campaignUpdate,
      });

      // ✅ Validate and fix any negative campaign stats
      if (updatedCampaign.in_progress < 0) {
        await tx.campaigns.update({
          where: { id: campaignId },
          data: { in_progress: 0 },
        });
        console.log('🔧 Fixed negative in_progress count for campaign:', campaignId);
      }

      console.log('✅ Campaign updated:', campaignId);
    });

    console.log('🚀 Webhook processing complete for lead:', leadId);
  }
}
