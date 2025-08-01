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
      // 1. Update the lead
      await tx.leads.update({
        where: { id: leadId },
        data: {
          status,
          disposition,
          duration: durationMinutes,
          cost,
          ...(recordingUrl && { recording_url: recordingUrl }),
        },
      });
      console.log('✅ Lead updated:', leadId);

      // 2. Prepare campaign update fields
      const campaignUpdate: any = {
        cost: { increment: cost },
        duration: { increment: durationMinutes },
      };

      if (status === 'Completed') {
        campaignUpdate.completed = { increment: 1 };
        campaignUpdate.in_progress = { decrement: 1 };
        console.log('📈 Campaign status update: Completed');
      } else if (status === 'Failed') {
        campaignUpdate.failed = { increment: 1 };
        campaignUpdate.in_progress = { decrement: 1 };
        console.log('📈 Campaign status update: Failed');
      }

      // 3. Apply campaign update
      await tx.campaigns.update({
        where: { id: campaignId },
        data: campaignUpdate,
      });
      console.log('✅ Campaign updated:', campaignId);
    });

    console.log('🚀 Webhook processing complete for lead:', leadId);
  }
}
