// trigger-call.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { TriggerCallInput } from './dto/trigger-call.dto';
import { CTX } from 'src/types/context.type';

@Injectable()
export class TriggerCallService {
  private readonly VAPI_API_URL = process.env.VAPI_API_URL || '';
  private readonly VAPI_API_KEY = process.env.VAPI_API_KEY;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async triggerCall(input: TriggerCallInput) {
    const { leadId, assistantId } = input;

    const finalAssistantId = assistantId || process.env.defaultAssistantId;

    const lead = await this.prisma.leads.findUnique({ where: { id: leadId } });

    if (!lead) {
      throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);
    }

    if (!lead.phone_id) {
      throw new HttpException(
        'Lead does not have a phone ID assigned',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (lead.status !== 'Pending') {
      throw new HttpException(
        `Lead already has status: ${lead.status}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = {
      assistantId: finalAssistantId,
      assistantOverrides: {
        variableValues: {
          Name: lead.name, // changed from `lead.name`
          Phone: lead.phone_number,
        },
        metadata: {
          contactId: lead.id,
        },
        voicemailDetection: {
          provider: 'twilio',
          voicemailDetectionTypes: ['machine_end_beep'],
          enabled: true,
          machineDetectionTimeout: 30,
          machineDetectionSpeechThreshold: 2400,
          machineDetectionSpeechEndThreshold: 1800,
          machineDetectionSilenceTimeout: 5000,
        },
        analysisPlan: {
          structuredDataPlan: { enabled: true },
          summaryPlan: { enabled: true },
          successEvaluationPlan: { enabled: true },
        },
      },
      phoneNumberId: lead.phone_id,
      customer: {
        name: lead.name, // changed from `lead.name`
        number: lead.phone_number,
      },
    };

    try {
      const vapiRes = await firstValueFrom(
        this.httpService.post(this.VAPI_API_URL, payload, {
          headers: {
            Authorization: `Bearer ${this.VAPI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      await this.prisma.$transaction([
        this.prisma.leads.update({
          where: { id: leadId },
          data: {
            status: 'In Progress',
            disposition: 'Call initiated',
          },
        }),
        this.prisma.campaigns.update({
          where: { id: lead.campaign_id },
          data: {
            in_progress: { increment: 1 },
            remaining: { decrement: 1 },
            status: 'InProgress',
          },
        }),
      ]);

      return {
        success: true,
        message: 'Call initiated successfully',
        data: vapiRes?.data,
      };
    } catch (error) {
      const message =
        error?.response?.data?.message || error?.message || 'VAPI Error';

      await this.prisma.$transaction(async (tx) => {
        // Step 1: Mark lead as failed
        await tx.leads.update({
          where: { id: leadId },
          data: {
            status: 'Failed',
            disposition: `API Error: ${message}`,
          },
        });

        // Step 2: Count campaign-level lead statuses
        const [pending, failed, completed, inProgress, total] =
          await Promise.all([
            tx.leads.count({
              where: { campaign_id: lead.campaign_id, status: 'Pending' },
            }),
            tx.leads.count({
              where: { campaign_id: lead.campaign_id, status: 'Failed' },
            }),
            tx.leads.count({
              where: { campaign_id: lead.campaign_id, status: 'Completed' },
            }),
            tx.leads.count({
              where: { campaign_id: lead.campaign_id, status: 'InProgress' },
            }),
            tx.leads.count({ where: { campaign_id: lead.campaign_id } }),
          ]);

        // Step 3: Determine campaign status
        let newStatus: 'Pending' | 'InProgress' | 'Failed' | 'Completed' =
          'Pending';

        if (failed === total) {
          newStatus = 'Failed';
        } else if (completed === total) {
          newStatus = 'Completed';
        } else if (inProgress > 0) {
          newStatus = 'InProgress';
        } else if (pending === total) {
          newStatus = 'Pending';
        }

        // Step 4: Single campaign update
        await tx.campaigns.update({
          where: { id: lead.campaign_id },
          data: {
            remaining: { decrement: 1 },
            failed: { increment: 1 },
            status: newStatus,
          },
        });
      });

      throw new HttpException(message, error?.response?.status || 500);
    }
  }
}
