// trigger-call.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { TriggerCallInput } from './dto/trigger-call.dto';
import * as https from 'https';
import { Leads } from '@prisma/client';
import { CampaignsService } from '../campaign/campaign.service';

@Injectable()
export class TriggerCallService {
  private readonly VAPI_API_URL = process.env.VAPI_API_URL || '';
  private readonly VAPI_API_KEY = process.env.VAPI_API_KEY;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) { }



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

    const payload = {
      assistantId: finalAssistantId,
      assistantOverrides: {
        variableValues: {
          Name: lead.name,
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
        name: lead.name,
        number: lead.phone_number,
      },
    };

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // <-- Accept self-signed certs
    });

    try {
      const vapiRes = await firstValueFrom(
        this.httpService.post(this.VAPI_API_URL, payload, {
          headers: {
            Authorization: `Bearer ${this.VAPI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          httpsAgent, // <-- add this line
        }),
      );

      // ✅ Check if lead is already in progress to prevent double counting
      if (lead.status === 'In Progress') {
        console.log('⚠️ Lead already in progress:', leadId);
        return {
          success: true,
          message: 'Call already in progress',
          data: null,
        };
      }

      await this.prisma.$transaction(async (tx) => {
        // 1. Update lead status to In Progress
        await tx.leads.update({
          where: { id: leadId },
          data: {
            status: 'In Progress',
            disposition: 'Call initiated',
            initiated_at: new Date(),
          },
        });

        // 2. Update campaign stats: decrement remaining, increment in_progress
        await tx.campaigns.update({
          where: { id: lead.campaign_id },
          data: {
            in_progress: { increment: 1 },
            remaining: { decrement: 1 },
            status: 'InProgress',
          },
        });

        // 3. Validate campaign stats balance
        const updatedCampaign = await tx.campaigns.findUnique({
          where: { id: lead.campaign_id },
          select: { 
            in_progress: true, 
            remaining: true, 
            completed: true, 
            failed: true,
            leads_count: true 
          },
        });

        if (updatedCampaign) {
          // Safety check: Prevent negative values
          const safetyUpdates: any = {};
          
          if (updatedCampaign.in_progress < 0) {
            safetyUpdates.in_progress = 0;
          }
          if (updatedCampaign.remaining < 0) {
            safetyUpdates.remaining = 0;
          }

          if (Object.keys(safetyUpdates).length > 0) {
            await tx.campaigns.update({
              where: { id: lead.campaign_id },
              data: safetyUpdates,
            });
            console.log('🔧 Fixed negative campaign stats:', safetyUpdates);
          }

          // Validate total balance
          const calculatedTotal = updatedCampaign.completed + updatedCampaign.in_progress + updatedCampaign.remaining + updatedCampaign.failed;
          if (calculatedTotal !== updatedCampaign.leads_count) {
            console.warn(`⚠️ Campaign stats imbalance detected: calculated=${calculatedTotal}, expected=${updatedCampaign.leads_count}`);
          }
        }
      });

      return {
        success: true,
        message: 'Call initiated successfully',
        data: vapiRes?.data,
      };
    } catch (error) {
      const message =
        error?.response?.data?.message || error?.message || 'VAPI Error';

      await this.prisma.$transaction(async (tx) => {
        await tx.leads.update({
          where: { id: leadId },
          data: {
            status: 'Failed',
            disposition: `API Error: ${message}`,
          },
        });

        // Update campaign stats: decrement remaining, increment failed
        await tx.campaigns.update({
          where: { id: lead.campaign_id },
          data: {
            remaining: { decrement: 1 },
            failed: { increment: 1 },
          },
        });

        // Validate campaign stats balance
        const updatedCampaign = await tx.campaigns.findUnique({
          where: { id: lead.campaign_id },
          select: { 
            in_progress: true, 
            remaining: true, 
            completed: true, 
            failed: true,
            leads_count: true 
          },
        });

        if (updatedCampaign) {
          // Safety check: Prevent negative values
          const safetyUpdates: any = {};
          
          if (updatedCampaign.remaining < 0) {
            safetyUpdates.remaining = 0;
          }

          if (Object.keys(safetyUpdates).length > 0) {
            await tx.campaigns.update({
              where: { id: lead.campaign_id },
              data: safetyUpdates,
            });
            console.log('🔧 Fixed negative campaign stats:', safetyUpdates);
          }

          // Validate total balance
          const calculatedTotal = updatedCampaign.completed + updatedCampaign.in_progress + updatedCampaign.remaining + updatedCampaign.failed;
          if (calculatedTotal !== updatedCampaign.leads_count) {
            console.warn(`⚠️ Campaign stats imbalance detected: calculated=${calculatedTotal}, expected=${updatedCampaign.leads_count}`);
          }
        }

        const [failed, total] = await Promise.all([
          tx.leads.count({
            where: { campaign_id: lead.campaign_id, status: 'Failed' },
          }),

          tx.leads.count({ where: { campaign_id: lead.campaign_id } }),
        ]);

        let newStatus = '';

        if (failed === total) {
          newStatus = 'Failed';
        }

        if (newStatus === 'Failed') {
          await tx.campaigns.update({
            where: { id: lead.campaign_id },
            data: { status: newStatus },
          });
        }
      });

      throw new HttpException(message, error?.response?.status || 500);
    }
  }

  async triggerCallForCadence(lead: Leads) {
    const finalAssistantId = process.env.defaultAssistantId;

    if (!lead) {
      throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);
    }

    if (!lead.phone_id) {
      throw new HttpException(
        'Lead does not have a phone ID assigned',
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = {
      assistantId: finalAssistantId,
      assistantOverrides: {
        variableValues: {
          Name: lead.name,
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
        name: lead.name,
        number: lead.phone_number,
      },
    };

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // <-- Accept self-signed certs
    });

    try {
      const vapiRes = await firstValueFrom(
        this.httpService.post(this.VAPI_API_URL, payload, {
          headers: {
            Authorization: `Bearer ${this.VAPI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          httpsAgent,
        }),
      );

      await this.prisma.$transaction(async (tx) => {
        const previousDisposition = lead.disposition || 'Unknown';
        // Adjust campaign stats based on previous lead status
        const campaignStatUpdates: any = {
          in_progress: { increment: 1 },    
          status: 'InProgress',
        };
        
        if (lead.status === 'Completed') {
          // Decrement the completed count
          campaignStatUpdates.completed = { decrement: 1 };
        } else if (lead.status === 'Failed') {
          // Decrement the failed count
          campaignStatUpdates.failed = { decrement: 1 };
        }
        
        // Apply the stat adjustments if needed
        if (Object.keys(campaignStatUpdates).length > 0) {
          await tx.campaigns.update({
            where: { id: lead.campaign_id },
            data: campaignStatUpdates,
          });
        }
        await tx.campaigns.update({
          where: { id: lead.campaign_id },
          data: {
            in_progress: { increment: 1 },
            remaining: { decrement: 1 },
            status: 'InProgress',
          },
        });

        // Update lead and campaign
        await tx.leads.update({
          where: { id: lead.id },
          data: {
            status: 'In Progress',
            disposition: 'Call initiated',
            initiated_at: new Date(),
          },
        });

        // Update campaign stats: decrement remaining, increment in_progress
      
        // ✅ Safety check: Prevent negative campaign stats
        const updatedCampaign = await tx.campaigns.findUnique({
          where: { id: lead.campaign_id },
          select: { 
            in_progress: true, 
            remaining: true, 
            completed: true, 
            failed: true,
            leads_count: true 
          },
        });

        if (updatedCampaign) {
          const safetyUpdates: any = {};
          
          if (updatedCampaign.in_progress < 0) {
            safetyUpdates.in_progress = 0;
          }
          if (updatedCampaign.remaining < 0) {
            safetyUpdates.remaining = 0;
          }

          if (Object.keys(safetyUpdates).length > 0) {
            await tx.campaigns.update({
              where: { id: lead.campaign_id },
              data: safetyUpdates,
            });
            console.log('🔧 Fixed negative campaign stats:', safetyUpdates);
          }

          // Validate total balance
          const calculatedTotal = updatedCampaign.completed + updatedCampaign.in_progress + updatedCampaign.remaining + updatedCampaign.failed;
          if (calculatedTotal !== updatedCampaign.leads_count) {
            console.warn(`⚠️ Campaign stats imbalance detected: calculated=${calculatedTotal}, expected=${updatedCampaign.leads_count}`);
          }
        }
      });

      return {
        success: true,
        message: 'Call initiated successfully',
        data: vapiRes?.data,
      };
    } catch (error) {
      const message =
        error?.response?.data?.message || error?.message || 'VAPI Error';

      await this.prisma.$transaction(async (tx) => {
        await tx.leads.update({
          where: { id: lead.id },
          data: {
            status: 'Failed',
            disposition: `API Error: ${message}`,
          },
        });
        await tx.leadActivityLog.create({
          data: {
            lead_id: lead.id,
            campaign_id: lead.campaign_id,
            lead_status: "Failed",
            activity_type: 'CALL_ATTEMPT',
            to_disposition: `API Error: ${message}`,
            duration: 0,
            cost: 0.0,
          }
        })
        const [failed, total] = await Promise.all([
          tx.leads.count({
            where: { campaign_id: lead.campaign_id, status: 'Failed' },
          }),

          tx.leads.count({ where: { campaign_id: lead.campaign_id } }),
        ]);

        let newStatus = '';

        if (failed === total) {
          newStatus = 'Failed';
        }

        await tx.campaigns.update({
          where: { id: lead.campaign_id },
          data: {
            remaining: { decrement: 1 },
            failed: { increment: 1 },
            ...(newStatus === 'Failed' && { status: newStatus }),
          },
        });
      });

      throw new HttpException(message, error?.response?.status || 500);
    }
  }




}
