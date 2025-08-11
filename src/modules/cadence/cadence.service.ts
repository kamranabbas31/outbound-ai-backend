// cadence.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { differenceInCalendarDays } from 'date-fns';
import { TriggerCallService } from '../call/trigger-call.service';
import { Queue } from 'bullmq';
import { redis } from 'src/utils/redis';
import { isNowInTimeWindow } from 'src/utils/helper';

@Injectable()
export class CadenceService {
  private readonly logger = new Logger(CadenceService.name);
  private cadenceQueue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggerCallService: TriggerCallService,
  ) {
    this.cadenceQueue = new Queue('cadenceQueue', {
      connection: redis,
    });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleCadenceExecution() {
    this.logger.log('Checking cadence campaigns...');

    const campaigns = await this.prisma.campaigns.findMany({
      where: {
        cadence_template_id: { not: null },
        cadence_stopped: false,
        cadence_completed: false,
        cadence_start_date: {
          lte: new Date(),
        },
      },
      select: { id: true },
    });
    if (!campaigns || campaigns.length == 0) {
      this.logger.log('No campaign available for cadence');
      return
    }
    for (const campaign of campaigns) {
      await this.cadenceQueue.add('execute-cadence', {
        campaignId: campaign.id,
      });
    }
    console.log({ campaigns })
    this.logger.log('Cadence jobs queued.');
  }

  async executeCampaignCadence(
    campaignId: string,
  ): Promise<'completed' | void> {
    try {
      console.log("[START] executeCampaignCadence called with:", { campaignId });

      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
        include: {
          cadence_template: true,
        },
      });
      console.log("[DB] campaign fetched:", campaign);

      if (!campaign?.cadence_template) {
        console.log("[INFO] No cadence_template found. Exiting...");
        return;
      }

      const { cadence_template } = campaign;
      console.log("[INFO] cadence_template:", cadence_template);

      const cadenceDays = cadence_template.cadence_days as Record<
        string,
        { attempts: number; time_windows: string[] }
      >;
      console.log("[INFO] cadenceDays:", cadenceDays);

      const retryDispositions = cadence_template.retry_dispositions;
      console.log("[INFO] retryDispositions:", retryDispositions);

      const cadenceProgressCount = await this.prisma.cadenceProgress.count({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
        },
      });
      console.log("[DB] cadenceProgressCount:", cadenceProgressCount);

      const isFirstCadenceExecution = cadenceProgressCount === 0;
      console.log("[INFO] isFirstCadenceExecution:", isFirstCadenceExecution);

      const leads = await this.prisma.leads.findMany({
        where: {
          campaign_id: campaignId,
          ...(isFirstCadenceExecution
            ? { status: 'Pending' }
            : { disposition: { in: retryDispositions } }),
        },
      });
      console.log("[DB] leads fetched:", leads);

      let hasRetried = false;
      if (leads.length === 0) {
        console.log("[STOP] No leads found for this cadence run. Exiting...");
        return;
      }

      const baseDate = campaign.cadence_start_date;
      console.log("[INFO] baseDate:", baseDate);
      if (!baseDate) {
        console.log("[SKIP] NO Cadence has started today");
        return;
      }

      const age = differenceInCalendarDays(new Date(), new Date(baseDate)) + 1;
      console.log("[INFO] age (days since created):", age);

      const dayConfig = cadenceDays[age.toString()];
      console.log("[INFO] dayConfig for age:", dayConfig);
      if (!dayConfig) {
        console.log("[SKIP] No cadence config for today.");
        return;
      }

      const { attempts: maxAttempts, time_windows } = dayConfig;
      console.log("[INFO] maxAttempts:", maxAttempts);
      console.log("[INFO] time_windows:", time_windows);

      const attemptsDoneToday = await this.prisma.cadenceProgress.count({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
          day: age,
        },

      });


      if (attemptsDoneToday >= maxAttempts) {
        console.log("[SKIP] Max attempts reached for today.");
        return;
      }

      const baseAttemptsPerSlot = Math.floor(maxAttempts / time_windows.length);
      const extraAttempts = maxAttempts % time_windows.length;
      console.log("[INFO] baseAttemptsPerSlot:", baseAttemptsPerSlot);
      console.log("[INFO] extraAttempts:", extraAttempts);

      const attemptDistribution = time_windows.map((_, index) =>
        index < extraAttempts ? baseAttemptsPerSlot + 1 : baseAttemptsPerSlot,
      );
      console.log("[INFO] attemptDistribution:", attemptDistribution);

      let assignedSlot = -1;
      for (let i = 0; i < time_windows.length; i++) {
        // Find last record for this slot
        if (!isNowInTimeWindow(time_windows[i])) {
          console.log(`[SKIP] Current time not in slot ${time_windows[i]}`);
          continue;
        }

        const slotMaxAttempts = attemptDistribution[i];
        if (attemptsDoneToday >= slotMaxAttempts) {
          console.log(`[SKIP] Enough attempts  reached for time window ${time_windows[i]}`);
          continue;
        }



        assignedSlot = i;
        console.log("[INFO] assignedSlot:", assignedSlot);
        break;
      }

      if (assignedSlot === -1) {
        console.log("[SKIP] All time slots filled or not in current time window.");
        return;
      }

      const isFirstEverAttempt = await this.prisma.cadenceProgress.findFirst({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
        },
      });
      console.log("[DB] isFirstEverAttempt record:", isFirstEverAttempt);

      for (const lead of leads) {
        console.log("\n[LOOP] Processing lead:", lead);
        if (isFirstEverAttempt) {
          console.log("[ACTION] Triggering normal call...");
          await this.triggerCallService.triggerCall({ leadId: lead.id });
        } else {
          console.log("[ACTION] Triggering cadence call...");
          await this.triggerCallService.triggerCallForCadence(lead);
        }

        hasRetried = true;
      }
      const newProgress = await this.prisma.cadenceProgress.create({
        data: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
          day: age,
          attempt: attemptsDoneToday + 1,
          time_window: time_windows[assignedSlot],
        },
      });
      console.log("[DB] cadenceProgress created:", newProgress);
      if (!hasRetried) {
        const lastCadenceDay = Math.max(
          ...Object.keys(cadenceDays).map((k) => parseInt(k)),
        );
        console.log("[INFO] lastCadenceDay:", lastCadenceDay);

        const leadsInCampaign = await this.prisma.leads.count({
          where: { campaign_id: campaignId },
        });
        console.log("[DB] leadsInCampaign:", leadsInCampaign);

        const totalAttemptsOnLastDay = await this.prisma.cadenceProgress.findFirst({
          where: {
            campaign_id: campaignId,
            cadence_id: cadence_template.id,
            day: lastCadenceDay,
          },
          orderBy: { executed_at: "desc" },
          select: { attempt: true }
        });
        console.log("[DB] totalAttemptsOnLastDay:", totalAttemptsOnLastDay);

        if (totalAttemptsOnLastDay?.attempt ?? 0 >= cadenceDays[lastCadenceDay].attempts) {
          const updatedCampaign = await this.prisma.campaigns.update({
            where: { id: campaignId },
            data: { cadence_completed: true },
          });
          console.log("[DB] Campaign marked completed:", updatedCampaign);

          this.logger.log(`[CADENCE COMPLETED] Campaign ${campaignId}`);
          return 'completed';
        }
      }

      console.log("[END] executeCampaignCadence completed.");
    } catch (error) {
      console.error("[ERROR] executeCampaignCadence failed:", error);
      this.logger.error(`Error executing cadence for campaign ${campaignId}:`, error);
      throw error;
    }
  }



  async createCadenceTemplate(input: {
    name: string;
    retry_dispositions: string[];
    cadence_days: {
      day: string;
      config: {
        attempts: number;
        time_windows: string[];
      };
    }[];
  }) {
    const { name, retry_dispositions, cadence_days } = input;

    // 🔒 Check if a cadence with the same name already exists
    const existing = await this.prisma.cadenceTemplate.findFirst({
      where: { name },
    });

    if (existing) {
      throw new Error('A cadence template with this name already exists.');
    }

    // 🧱 Build the JSON cadence_days map
    const cadenceMap: Record<
      string,
      { attempts: number; time_windows: string[] }
    > = {};
    for (const { day, config } of cadence_days) {
      cadenceMap[day] = config;
    }

    // ✅ Create the cadence template
    return this.prisma.cadenceTemplate.create({
      data: {
        name,
        retry_dispositions,
        cadence_days: cadenceMap,
      },
      include: {
        campaigns: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async attachCadenceToCampaign(input: {
    campaignId: string;
    cadenceId: string;
    startDate: Date;
  }) {
    const { campaignId, cadenceId, startDate } = input;

    const campaign = await this.prisma.campaigns.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) throw new Error('Campaign not found');

    const cadence = await this.prisma.cadenceTemplate.findUnique({
      where: { id: cadenceId },
    });

    if (!cadence) throw new Error('Cadence template not found');

    await this.prisma.campaigns.update({
      where: { id: campaignId },
      data: {
        cadence_template_id: cadenceId,
        cadence_start_date: startDate,
        cadence_stopped: false,
        cadence_completed: false,
      },
    });
  }

  async getCadenceTemplates() {
    try {
      const templates = await this.prisma.cadenceTemplate.findMany({
        include: {
          campaigns: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      return {
        userError: null,
        templates,
      };
    } catch (error) {
      return {
        userError: {
          message: error.message || 'Failed to fetch cadence templates',
        },
        templates: [],
      };
    }
  }

  async deleteCadenceTemplate(id: string) {
    try {
      await this.prisma.cadenceTemplate.delete({
        where: { id },
      });
      return {
        userError: null,
        success: true,
      };
    } catch (error) {
      return {
        userError: { message: error.message || 'Unable to delete cadence' },
        success: false,
      };
    }
  }
}
