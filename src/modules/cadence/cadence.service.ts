// cadence.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { differenceInCalendarDays } from 'date-fns';
import { TriggerCallService } from '../call/trigger-call.service';
import { Queue } from 'bullmq';
import { redisConfig } from 'src/utils/redis';
import { isNowInTimeWindow } from 'src/utils/helper';

@Injectable()
export class CadenceService {
  private readonly logger = new Logger(CadenceService.name);
  private cadenceQueue: Queue;
  private readonly QUEUE_NAME = 'cadence-queue';

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggerCallService: TriggerCallService,
  ) {
    this.cadenceQueue = new Queue(this.QUEUE_NAME, {
      connection: redisConfig,
    });
  }

  @Cron('0 */25 * * * *') // Run every 25 minutes
  async handleCadenceExecution() {
    this.logger.log('Checking cadence campaigns...');

    // Step 1: Get campaigns that are *potentially* eligible
    const campaigns = await this.prisma.campaigns.findMany({
      where: {
        cadence_template_id: { not: null },
        cadence_stopped: false,
        cadence_completed: false,
        cadence_start_date: { not: null, lte: new Date() },
      },
      select: {
        id: true,
        cadence_start_date: true,
        cadence_template: {
          select: {
            id: true,
            cadence_days: true,
          },
        },
      },
    });

    if (campaigns.length === 0) {
      this.logger.log('No campaigns eligible for cadence execution.');
      return;
    }

    let queuedCount = 0;

    // Step 2: Filter campaigns where today is in cadence config & attempts not exhausted
    for (const campaign of campaigns) {
      const baseDate = campaign.cadence_start_date;
      const cadenceDays = campaign.cadence_template?.cadence_days as Record<
        string,
        { attempts: number; time_windows: string[] }
      >;

      if (!baseDate || !cadenceDays) {
        this.logger.log(
          `[SKIP] Campaign ${campaign.id}: Missing baseDate or cadence config`,
        );
        continue;
      }

      // Calculate age with hours precision
      const now = new Date();
      const ageInHours =
        (now.getTime() - baseDate.getTime()) / (1000 * 60 * 60);
      const ageInDays = ageInHours / 24;
      const ageDay = Math.floor(ageInDays) + 1; // Convert to integer for day lookup

      this.logger.log(
        `[INFO] Campaign ${campaign.id}: Age = ${ageInDays.toFixed(2)} days (${ageInHours.toFixed(2)} hours), Day: ${ageDay}`,
      );

      const dayConfig = cadenceDays[ageDay.toString()];

      if (!dayConfig) {
        this.logger.log(
          `[SKIP] Campaign ${campaign.id}: No config for day ${ageDay}`,
        );
        continue;
      }

      // Step 3: Check if today's attempts are already done
      const attemptsDoneToday = await this.prisma.cadenceProgress.count({
        where: {
          campaign_id: campaign.id,
          cadence_id: campaign?.cadence_template?.id,
          day: ageDay,
        },
      });

      if (attemptsDoneToday >= dayConfig.attempts) {
        this.logger.log(
          `[SKIP] Campaign ${campaign.id}: Max attempts (${dayConfig.attempts}) already done today.`,
        );
        continue;
      }

      // Step 4: Queue it
      await this.cadenceQueue.add('execute-cadence', {
        campaignId: campaign.id,
      });

      queuedCount++;
    }

    this.logger.log(`Cadence jobs queued: ${queuedCount}`);
  }

  async executeCampaignCadence(
    campaignId: string,
  ): Promise<'completed' | void> {
    try {
      console.log('[START] executeCampaignCadence called with:', {
        campaignId,
      });

      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
        include: {
          cadence_template: true,
        },
      });
      console.log('[DB] campaign fetched:', campaign);

      if (!campaign?.cadence_template) {
        console.log('[INFO] No cadence_template found. Exiting...');
        console.log('[SUMMARY] Campaign cadence execution summary:');
        console.log(`  - Campaign ID: ${campaignId}`);
        console.log(`  - Day: Unknown (no cadence template)`);
        console.log(`  - Time window used: None (no cadence template)`);
        console.log(`  - Leads processed: 0`);
        console.log(`  - Calls triggered: No`);
        console.log(`  - Progress recorded: No`);
        console.log(`  - Status: No cadence template found`);
        return;
      }

      const { cadence_template } = campaign;
      console.log('[INFO] cadence_template:', cadence_template);

      const cadenceDays = cadence_template.cadence_days as Record<
        string,
        { attempts: number; time_windows: string[] }
      >;
      console.log('[INFO] cadenceDays:', cadenceDays);

      const retryDispositions = cadence_template.retry_dispositions;
      console.log('[INFO] retryDispositions:', retryDispositions);

      const baseDate = campaign.cadence_start_date;
      console.log('[INFO] baseDate:', baseDate);
      if (!baseDate) {
        console.log('[SKIP] NO Cadence has started today');
        console.log('[SUMMARY] Campaign cadence execution summary:');
        console.log(`  - Campaign ID: ${campaignId}`);
        console.log(`  - Day: Unknown (no base date)`);
        console.log(`  - Time window used: None (no base date)`);
        console.log(`  - Leads processed: 0`);
        console.log(`  - Calls triggered: No`);
        console.log(`  - Progress recorded: No`);
        console.log(`  - Status: No cadence start date`);
        return;
      }

      // Calculate age with hours precision
      const now = new Date();
      const ageInHours =
        (now.getTime() - new Date(baseDate).getTime()) / (1000 * 60 * 60);
      const ageInDays = ageInHours / 24;
      const age = Math.floor(ageInDays) + 1;
      // Convert to integer for day lookup, add 1 for 1-based indexing
      console.log(
        '[INFO] age (days since created):',
        age,
        `(${ageInDays.toFixed(2)} days, ${ageInHours.toFixed(2)} hours)`,
      );
      console.log(
        '[INFO] Current time (EST):',
        now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      );

      const dayConfig = cadenceDays[age.toString()];
      console.log('[INFO] dayConfig for age:', dayConfig);
      if (!dayConfig) {
        console.log('[SKIP] No cadence config for today.');
        console.log('[SUMMARY] Campaign cadence execution summary:');
        console.log(`  - Campaign ID: ${campaignId}`);
        console.log(`  - Day: ${age}`);
        console.log(`  - Time window used: None (no day config)`);
        console.log(`  - Leads processed: 0`);
        console.log(`  - Calls triggered: No`);
        console.log(`  - Progress recorded: No`);
        console.log(`  - Status: No cadence config for today`);
        return;
      }

      const { attempts: maxAttempts, time_windows } = dayConfig;
      console.log('[INFO] maxAttempts:', maxAttempts);
      console.log('[INFO] time_windows:', time_windows);
      console.log(
        '[INFO] Current time (EST):',
        now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      );
      console.log(
        '[INFO] Checking if current time is in any of these windows...',
      );

      const attemptsDoneToday = await this.prisma.cadenceProgress.count({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
          day: age,
        },
      });

      if (attemptsDoneToday >= maxAttempts) {
        console.log('[SKIP] Max attempts reached for today.');
        console.log('[SUMMARY] Campaign cadence execution summary:');
        console.log(`  - Campaign ID: ${campaignId}`);
        console.log(`  - Day: ${age}`);
        console.log(`  - Time window used: None (max attempts reached)`);
        console.log(`  - Leads processed: 0`);
        console.log(`  - Calls triggered: No`);
        console.log(`  - Progress recorded: No`);
        console.log(`  - Status: Max attempts reached for today`);
        return;
      }

      const baseAttemptsPerSlot = Math.floor(maxAttempts / time_windows.length);
      const extraAttempts = maxAttempts % time_windows.length;
      console.log('[INFO] baseAttemptsPerSlot:', baseAttemptsPerSlot);
      console.log('[INFO] extraAttempts:', extraAttempts);

      const attemptDistribution = time_windows.map((_, index) =>
        index < extraAttempts ? baseAttemptsPerSlot + 1 : baseAttemptsPerSlot,
      );
      console.log('[INFO] attemptDistribution:', attemptDistribution);

      let assignedSlot = -1;
      for (let i = 0; i < time_windows.length; i++) {
        const timeWindow = time_windows[i];
        console.log(`[DEBUG] Checking time window ${i}: ${timeWindow}`);

        // Find last record for this slot
        if (!isNowInTimeWindow(timeWindow)) {
          console.log(`[SKIP] Current time not in slot ${timeWindow}`);
          continue;
        }

        // Check if this slot has any attempts today
        const attemptsInThisSlot = await this.prisma.cadenceProgress.count({
          where: {
            campaign_id: campaignId,
            cadence_id: cadence_template.id,
            day: age,
            time_window: timeWindow,
            attempt: attemptsDoneToday + 1,
          },
        });

        const slotMaxAttempts = attemptDistribution[i];
        console.log(
          `[DEBUG] Slot ${timeWindow}: attempts=${attemptsInThisSlot}, max=${slotMaxAttempts}`,
        );

        if (attemptsInThisSlot >= slotMaxAttempts) {
          console.log(
            `[SKIP] Slot ${timeWindow} has reached max attempts (${attemptsInThisSlot}/${slotMaxAttempts})`,
          );
          continue;
        }

        assignedSlot = i;
        console.log(
          '[INFO] assignedSlot:',
          assignedSlot,
          `for time window: ${timeWindow}`,
        );
        break;
      }

      if (assignedSlot === -1) {
        console.log(
          '[SKIP] All time slots filled or not in current time window.',
        );
        console.log('[SUMMARY] Campaign cadence execution summary:');
        console.log(`  - Campaign ID: ${campaignId}`);
        console.log(`  - Day: ${age}`);
        console.log(`  - Time window used: None (no valid slots)`);
        console.log(`  - Leads processed: 0`);
        console.log(`  - Calls triggered: No`);
        console.log(`  - Progress recorded: No`);
        return;
      }
      const cadenceProgressCount = await this.prisma.cadenceProgress.count({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
        },
      });
      console.log('[DB] cadenceProgressCount:', cadenceProgressCount);

      const isFirstCadenceExecution = cadenceProgressCount === 0;
      console.log('[INFO] isFirstCadenceExecution:', isFirstCadenceExecution);

      const leads = await this.prisma.leads.findMany({
        where: {
          campaign_id: campaignId,
          ...(isFirstCadenceExecution
            ? { status: 'Pending' }
            : { disposition: { in: retryDispositions } }),
        },
      });
      console.log('[DB] leads fetched:', leads);
      console.log('[INFO] isFirstCadenceExecution:', isFirstCadenceExecution);
      console.log('[INFO] retryDispositions:', retryDispositions);

      let hasRetried = false;
      if (leads.length === 0) {
        console.log('[STOP] No leads found for this cadence run. Exiting...');
        console.log('[SUMMARY] Campaign cadence execution summary:');
        console.log(`  - Campaign ID: ${campaignId}`);
        console.log(`  - Day: ${age}`);
        console.log(`  - Time window used: ${time_windows[assignedSlot]}`);
        console.log(`  - Leads processed: 0`);
        console.log(`  - Calls triggered: No`);
        console.log(`  - Progress recorded: No`);
        console.log(`  - Status: No leads found for cadence run`);
        return;
      }

      for (const lead of leads) {
        console.log('\n[LOOP] Processing lead:', lead);
        if (isFirstCadenceExecution) {
          console.log('[ACTION] Triggering normal call...');
          try {
            await this.triggerCallService.triggerCall({ leadId: lead.id });
            console.log('[SUCCESS] Normal call triggered for lead:', lead.id);
          } catch (error) {
            console.error(
              '[ERROR] Failed to trigger normal call for lead:',
              lead.id,
              error,
            );
          }
        } else {
          console.log('[ACTION] Triggering cadence call...');
          try {
            await this.triggerCallService.triggerCallForCadence(lead);
            console.log('[SUCCESS] Cadence call triggered for lead:', lead.id);
          } catch (error) {
            console.error(
              '[ERROR] Failed to trigger cadence call for lead:',
              lead.id,
              error,
            );
          }
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
      console.log('[DB] cadenceProgress created:', newProgress);
      console.log(
        '[INFO] Progress recorded for day:',
        age,
        'time window:',
        time_windows[assignedSlot],
      );
      if (!hasRetried) {
        const lastCadenceDay = Math.max(
          ...Object.keys(cadenceDays).map((k) => parseInt(k)),
        );
        console.log('[INFO] lastCadenceDay:', lastCadenceDay);

        const leadsInCampaign = await this.prisma.leads.count({
          where: { campaign_id: campaignId },
        });
        console.log('[DB] leadsInCampaign:', leadsInCampaign);

        const totalAttemptsOnLastDay =
          await this.prisma.cadenceProgress.findFirst({
            where: {
              campaign_id: campaignId,
              cadence_id: cadence_template.id,
              day: lastCadenceDay,
            },
            orderBy: { executed_at: 'desc' },
            select: { attempt: true },
          });
        console.log('[DB] totalAttemptsOnLastDay:', totalAttemptsOnLastDay);

        if (
          totalAttemptsOnLastDay?.attempt ??
          0 >= cadenceDays[lastCadenceDay].attempts
        ) {
          const updatedCampaign = await this.prisma.campaigns.update({
            where: { id: campaignId },
            data: { cadence_completed: true },
          });
          console.log('[DB] Campaign marked completed:', updatedCampaign);

          this.logger.log(`[CADENCE COMPLETED] Campaign ${campaignId}`);
          console.log('[SUMMARY] Campaign cadence execution summary:');
          console.log(`  - Campaign ID: ${campaignId}`);
          console.log(`  - Day: ${age}`);
          console.log(`  - Time window used: ${time_windows[assignedSlot]}`);
          console.log(`  - Leads processed: ${leads.length}`);
          console.log(`  - Calls triggered: ${hasRetried ? 'Yes' : 'No'}`);
          console.log(`  - Progress recorded: Yes`);
          console.log(`  - Status: Campaign marked as completed`);
          return 'completed';
        }
      }

      console.log('[END] executeCampaignCadence completed.');
      console.log('[SUMMARY] Campaign cadence execution summary:');
      console.log(`  - Campaign ID: ${campaignId}`);
      console.log(`  - Day: ${age}`);
      console.log(`  - Time window used: ${time_windows[assignedSlot]}`);
      console.log(`  - Leads processed: ${leads.length}`);
      console.log(`  - Calls triggered: ${hasRetried ? 'Yes' : 'No'}`);
      console.log(`  - Progress recorded: Yes`);
      console.log(`  - Status: Normal completion`);
    } catch (error) {
      console.error('[ERROR] executeCampaignCadence failed:', error);
      console.log('[SUMMARY] Campaign cadence execution summary:');
      console.log(`  - Campaign ID: ${campaignId}`);
      console.log(`  - Day: Unknown (error occurred)`);
      console.log(`  - Time window used: None (error occurred)`);
      console.log(`  - Leads processed: 0`);
      console.log(`  - Calls triggered: No`);
      console.log(`  - Progress recorded: No`);
      console.log(`  - Status: Error occurred`);
      this.logger.error(
        `Error executing cadence for campaign ${campaignId}:`,
        error,
      );
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

  async updateCadenceTemplate(input: {
    id: string;
    name?: string;
    retry_dispositions?: string[];
    cadence_days?: {
      day: string;
      config: {
        attempts: number;
        time_windows: string[];
      };
    }[];
  }) {
    const { id, name, retry_dispositions, cadence_days } = input;

    // 🔍 Check if the cadence template exists
    const existing = await this.prisma.cadenceTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Cadence template not found.');
    }

    // 🔒 If updating name, check if another cadence with the same name already exists
    if (name && name !== existing.name) {
      const nameConflict = await this.prisma.cadenceTemplate.findFirst({
        where: {
          name,
          id: { not: id }, // Exclude current template from check
        },
      });

      if (nameConflict) {
        throw new Error('A cadence template with this name already exists.');
      }
    }

    // 🧱 Build the update data object
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (retry_dispositions !== undefined) {
      updateData.retry_dispositions = retry_dispositions;
    }

    if (cadence_days !== undefined) {
      // Build the JSON cadence_days map
      const cadenceMap: Record<
        string,
        { attempts: number; time_windows: string[] }
      > = {};
      for (const { day, config } of cadence_days) {
        cadenceMap[day] = config;
      }
      updateData.cadence_days = cadenceMap;
    }

    // ✅ Update the cadence template
    return this.prisma.cadenceTemplate.update({
      where: { id },
      data: updateData,
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
      const attachedCampaigns = await this.prisma.campaigns.findMany({
        where: { cadence_template_id: id },
        select: { name: true },
      });

      if (attachedCampaigns.length > 0) {
        const campaignNames = attachedCampaigns.map((c) => c.name).join(', ');
        return {
          userError: {
            message: `The following campaign(s) are attached to this cadence: ${campaignNames}. Please unlink them first to delete.`,
          },
          success: false,
        };
      }
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

  private parseTimeString(timeStr: string, baseDate: Date): Date {
    // Check if timeStr is defined and is a string
    if (!timeStr || typeof timeStr !== 'string') {
      console.warn(`Invalid time string: "${timeStr}", using base date`);
      return new Date(baseDate);
    }

    // Remove any extra whitespace
    timeStr = timeStr.trim();

    // Handle 12-hour format (e.g., "02:00 AM", "2:30 PM")
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const period = timeMatch[3].toUpperCase();

      // Convert to 24-hour format
      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }

      // Create a new date object and set the time in EST
      // baseDate is already in EST timezone (we converted it earlier)
      const result = new Date(baseDate);
      result.setHours(hours, minutes, 0, 0);

      // Convert EST to UTC by adding 5 hours (EST is UTC-5)
      const estToUtcOffset = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
      const utcResult = new Date(result.getTime() + estToUtcOffset);

      console.log(
        `Parsed time: "${timeStr}" -> EST: ${result.toISOString()} -> UTC: ${utcResult.toISOString()}`,
      );
      return utcResult;
    }

    // Handle 24-hour format (e.g., "14:00", "02:30")
    const timeMatch24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch24) {
      const hours = parseInt(timeMatch24[1], 10);
      const minutes = parseInt(timeMatch24[2], 10);

      // Create a new date object and set the time in EST
      // baseDate is already in EST timezone (we converted it earlier)
      const result = new Date(baseDate);
      result.setHours(hours, minutes, 0, 0);

      // Convert EST to UTC by adding 5 hours (EST is UTC-5)
      const estToUtcOffset = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
      const utcResult = new Date(result.getTime() + estToUtcOffset);

      console.log(
        `Parsed time: "${timeStr}" -> EST: ${result.toISOString()} -> UTC: ${utcResult.toISOString()}`,
      );
      return utcResult;
    }

    // If parsing fails, return the base date
    console.warn(`Failed to parse time string: "${timeStr}", using base date`);
    return new Date(baseDate);
  }

  async getCadenceProgressStats(campaignId: string): Promise<{
    userError: { message: string } | null;
    data: any[] | null;
  }> {
    try {
      const count = await this.prisma.cadenceProgress.count({
        where: { campaign_id: campaignId },
      });
      // Get detailed cadence execution stats with completed leads per attempt
      const cadenceStats = await this.prisma.cadenceProgress.findMany({
        where: { campaign_id: campaignId },
        orderBy: [{ day: 'asc' }, { attempt: 'asc' }],
      });

      // Group by day and attempt, and count completed leads for each
      const attemptStats = await Promise.all(
        cadenceStats.map(async (progress) => {
          // Count completed leads for this specific attempt
          // Parse time window (e.g., "02:00 AM - 02:30 AM" or "02:00 AM-02:30 AM") to get start and end times
          const timeWindow = progress.time_window;
          console.log(
            `Processing time window: "${timeWindow}" for day ${progress.day}, attempt ${progress.attempt}`,
          );

          // Handle both formats: " - " and "-"
          const [startTimeStr, endTimeStr] = timeWindow.includes(' - ')
            ? timeWindow.split(' - ')
            : timeWindow.split('-');

          console.log(
            `Split time window: start="${startTimeStr}", end="${endTimeStr}"`,
          );

          // Get the date from executed_at and create a date object for the same day
          const executedDate = new Date(progress.executed_at);
          console.log(`Base executed date: ${executedDate.toISOString()}`);

          // Create a date object for the same day but at midnight (00:00:00) in EST
          // Since executed_at is UTC, we need to convert to EST first, then create the date
          const estDate = new Date(executedDate.getTime() - 5 * 60 * 60 * 1000); // Convert UTC to EST
          const sameDayDate = new Date(
            estDate.getFullYear(),
            estDate.getMonth(),
            estDate.getDate(),
          );
          console.log(
            `Same day date (midnight EST): ${sameDayDate.toISOString()}`,
          );
          console.log(
            `Converting UTC ${executedDate.toISOString()} to EST ${estDate.toISOString()}`,
          );

          // Parse start time - handle AM/PM format properly, using the same day
          // The time windows are in EST, so parse them as EST times
          const startTime = this.parseTimeString(startTimeStr, sameDayDate);

          // Parse end time - handle AM/PM format properly, using the same day
          let endTime = this.parseTimeString(endTimeStr, sameDayDate);

          // If end time is before start time, it means it's the next day
          if (endTime <= startTime) {
            endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
            console.log(
              `End time adjusted to next day: ${endTime.toISOString()}`,
            );
          }

          console.log(
            `Final time window: ${startTime.toISOString()} to ${endTime.toISOString()}`,
          );
          console.log(
            `Looking for activities on: ${sameDayDate.toDateString()}`,
          );

          // Check activity logs where lead status is 'Completed' and created_at is within the time window
          console.log(
            `Querying leadActivityLog for campaign ${campaignId} between ${startTime.toISOString()} and ${endTime.toISOString()}`,
          );

          const completedCount = await this.prisma.leadActivityLog.count({
            where: {
              campaign_id: campaignId,
              activity_type: 'CALL_ATTEMPT',
              lead_status: 'Completed',
              created_at: {
                gte: startTime,
                lte: endTime,
              },
            },
          });

          console.log(`Found ${completedCount} completed leads in time window`);

          return {
            day: progress.day,
            attempt: progress.attempt,
            timeWindow: progress.time_window,
            executedAt: progress.executed_at,
            completedLeads: completedCount,
          };
        }),
      );

      console.log('Cadence attempt stats:', attemptStats);

      return {
        userError: null,
        data: attemptStats,
      };
    } catch (error) {
      console.error('Error fetching campaign cadence count:', error);
      return {
        userError: { message: 'Failed to fetch campaign cadence count' },
        data: null,
      };
    }
  }
}
