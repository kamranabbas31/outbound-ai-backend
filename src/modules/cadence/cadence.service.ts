// cadence.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { differenceInCalendarDays } from 'date-fns';
import { TriggerCallService } from '../call/trigger-call.service';
import { Queue } from 'bullmq';
import { redisConfig, redis } from 'src/utils/redis';
import { isNowInTimeWindow } from 'src/utils/helper';
import { ActivityType } from '@prisma/client';

@Injectable()
export class CadenceService {
  private readonly logger = new Logger(CadenceService.name);
  private cadenceQueue: Queue;
  private readonly QUEUE_NAME = 'cadence-queue';
  private readonly executingCampaigns = new Set<string>(); // Track executing campaigns

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggerCallService: TriggerCallService,
  ) {
    this.cadenceQueue = new Queue(this.QUEUE_NAME, {
      connection: redisConfig,
    });

    // Add queue error handlers
    this.cadenceQueue.on('error', (error) => {
      this.logger.error(`Cadence queue error: ${error.message}`, error.stack);
    });

    this.cadenceQueue.on('waiting', (job) => {
      this.logger.debug(`Job ${job.id} is waiting`);
    });

    this.cadenceQueue.on('progress', (job, progress) => {
      this.logger.debug(`Job ${job.id} is ${progress}% complete`);
    });

    this.cadenceQueue.on('removed', (job) => {
      this.logger.debug(`Job ${job.id} removed`);
    });
  }

  /**
   * Check Redis connection health
   */
  private async checkRedisHealth(): Promise<void> {
    try {
      await redis.ping();
      this.logger.debug('Redis health check passed');
    } catch (error) {
      this.logger.error('Redis health check failed', error.stack);
      throw error;
    }
  }

  @Cron('0 */25 * * * *') // Run every 25 minutes
  async handleCadenceExecution() {
    try {
      // Check Redis connection before proceeding
      await this.checkRedisHealth();
      this.logger.log('Checking cadence campaigns...');
    } catch (error) {
      this.logger.error(
        'Failed to execute cadence: Redis connection issue',
        error.stack,
      );
      return;
    }

    // Step 1: Get campaigns that are *potentially* eligible
    const campaigns = await this.prisma.campaigns.findMany({
      where: {
        cadence_template_id: { not: null },
        cadence_stopped: false,
        cadence_completed: false,
        cadence_start_date: { not: null, lte: new Date() },
        execution_status: 'idle',
      },
      select: {
        id: true,
        cadence_start_date: true,
        resume_campaign_cadence: true,
        cadence_paused_at: true, // 🔑 NEW
        cadence_resume_from_date: true, // 🔑 NEW
        cadence_resume_day: true,
        cadence_completed: true,
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
      let ageDay: number | null;

      if (
        campaign.resume_campaign_cadence &&
        campaign.cadence_resume_from_date &&
        campaign.cadence_resume_day
      ) {
        const now = new Date();
        const ageInHours =
          (now.getTime() - campaign.cadence_resume_from_date.getTime()) /
          (1000 * 60 * 60);
        const ageInDays = ageInHours / 24;
        ageDay = Math.floor(ageInDays) + campaign.cadence_resume_day;

        if (ageDay === null) {
          this.logger.log(
            `[RESUME-SKIP] Campaign ${campaign.id}: Cadence completed or no valid day`,
          );
          continue;
        }
        this.logger.log(
          `[RESUME-INFO] Campaign ${campaign.id}: Resume Day: ${ageDay}`,
        );
      } else {
        // Use normal logic (time-based day calculation) - EXISTING CODE UNCHANGED
        const now = new Date();
        const ageInHours =
          (now.getTime() - baseDate.getTime()) / (1000 * 60 * 60);
        const ageInDays = ageInHours / 24;
        ageDay = Math.floor(ageInDays) + 1; // Convert to integer for day lookup

        this.logger.log(
          `[INFO] Campaign ${campaign.id}: Age = ${ageInDays.toFixed(2)} days (${ageInHours.toFixed(2)} hours), Day: ${ageDay}`,
        );
      }

      const cadenceDayKeys = Object.keys(cadenceDays)
        .map(Number)
        .sort((a, b) => a - b);
      const lastCadenceDay = Math.max(...cadenceDayKeys);

      if (ageDay >= lastCadenceDay) {
        // Check if attempts for the last day are completed
        const lastDayAttempts = await this.prisma.cadenceProgress.count({
          where: {
            campaign_id: campaign.id,
            cadence_id: campaign?.cadence_template?.id,
            day: lastCadenceDay,
          },
        });

        const lastDayConfig = cadenceDays[lastCadenceDay.toString()];
        if (lastDayConfig && lastDayAttempts >= lastDayConfig.attempts) {
          this.logger.log(
            `[COMPLETE] Campaign ${campaign.id}: Last day (${lastCadenceDay}) completed with all attempts (${lastDayConfig.attempts}). Marking cadence as completed.`,
          );

          await this.prisma.campaigns.update({
            where: { id: campaign.id },
            data: {
              cadence_completed: true,
            },
          });

          continue;
        }
      }

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
      // Step 4: Queue it with retry options
      await this.cadenceQueue.add(
        'execute-cadence',
        {
          campaignId: campaign.id,
          resumeCadence: campaign.resume_campaign_cadence,
        },
        {
          attempts: 1, // Retry failed jobs only once
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 second delay
          },
          removeOnComplete: 5, // Keep only 5 completed jobs
          removeOnFail: 10, // Keep only 10 failed jobs
        },
      );

      queuedCount++;
    }

    this.logger.log(`Cadence jobs queued: ${queuedCount}`);
  }
  catch(error) {
    this.logger.error('Error in handleCadenceExecution:', error.stack);
    throw error;
  }

  async executeCampaignCadence(
    campaignId: string,
  ): Promise<'completed' | void> {
    try {
      console.log('[START] executeCampaignCadence called with:', {
        campaignId,
      });

      // ✅ Check if campaign is already executing
      if (this.executingCampaigns.has(campaignId)) {
        console.log(
          `[SKIP] Campaign ${campaignId} is already executing, skipping...`,
        );
        return;
      }

      // ✅ Mark campaign as executing
      this.executingCampaigns.add(campaignId);

      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
        include: {
          cadence_template: true,
        },
      });
      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: { execution_status: 'executing' },
      });
      console.log('[DB] campaign fetched:', campaign);
      // Update campaign execution status to 'executing'

      console.log('[DB] Campaign execution_status updated to "executing"');
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
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
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
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
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
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
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
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
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
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
        console.log('[DB] Campaign execution_status updated to "completed"');
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
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
        return;
      }

      // ✅ Track leads processed in this execution cycle
      const processedLeadIdsInThisCycle = new Set<string>();

      for (const lead of leads) {
        console.log('\n[LOOP] Processing lead:', lead);

        // ✅ Check if this lead was already processed in this execution cycle
        if (processedLeadIdsInThisCycle.has(lead.id)) {
          console.log(
            `[SKIP] Lead ${lead.id} already processed in this cycle, skipping...`,
          );
          continue; // Skip to next lead
        }

        if (isFirstCadenceExecution) {
          console.log('[ACTION] Triggering normal call...');
          try {
            await this.triggerCallService.triggerCall({ leadId: lead.id });
            console.log('[SUCCESS] Normal call triggered for lead:', lead.id);

            // ✅ Mark this lead as processed
            processedLeadIdsInThisCycle.add(lead.id);
          } catch (err) {
            if (err?.response?.status === 429) {
              this.logger.warn(
                `Rate limited by Vapi. Waiting 5s before retry...`,
              );
              await new Promise((res) => setTimeout(res, 5000));
              await this.triggerCallService.triggerCall({ leadId: lead.id }); // retry once
            } else {
              throw err;
            }
          }
        } else {
          console.log('[ACTION] Triggering cadence call...');
          try {
            await this.triggerCallService.triggerCallForCadence(lead);
            console.log('[SUCCESS] Cadence call triggered for lead:', lead.id);

            // ✅ Mark this lead as processed
            processedLeadIdsInThisCycle.add(lead.id);
          } catch (err) {
            if (err?.response?.status === 429) {
              this.logger.warn(
                `Rate limited by Vapi. Waiting 5s before retry...`,
              );
              await new Promise((res) => setTimeout(res, 4000));
              await this.triggerCallService.triggerCallForCadence(lead); // retry once
            } else {
              throw err;
            }
          }
        }
        await new Promise((res) => setTimeout(res, 5000));
        hasRetried = true;
      }
      const existingProgress = await this.prisma.cadenceProgress.findFirst({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
          day: age,
          attempt: attemptsDoneToday + 1,
          time_window: time_windows[assignedSlot],
        },
      });

      if (existingProgress) {
        console.log(
          '[INFO] Progress already exists for this campaign/day/time window, skipping creation',
        );
      } else {
        // ✅ Create new progress only if it doesn't exist
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
      }
      console.log('[DB] cadenceProgress exist :', existingProgress);

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
            data: { cadence_completed: true, execution_status: 'idle' },
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
      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: { execution_status: 'idle' },
      });
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
      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: { execution_status: 'idle' },
      });
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
    } finally {
      // ✅ Always cleanup executing campaign tracking
      this.executingCampaigns.delete(campaignId);
      console.log(
        `[CLEANUP] Removed campaign ${campaignId} from executing set`,
      );
    }
  }
  async executeResumeCadence(campaignId: string): Promise<'completed' | void> {
    try {
      console.log('[RESUME-START] executeResumeCadence called with:', {
        campaignId,
      });

      // ✅ Check if campaign is already executing
      if (this.executingCampaigns.has(campaignId)) {
        console.log(
          `[SKIP] Campaign ${campaignId} is already executing, skipping...`,
        );
        return;
      }

      // ✅ Mark campaign as executing
      this.executingCampaigns.add(campaignId);

      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
        include: {
          cadence_template: true,
        },
      });
      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: { execution_status: 'executing' },
      });
      console.log('[DB] campaign fetched:', campaign);

      if (!campaign?.cadence_template) {
        console.log('[INFO] No cadence_template found. Exiting...');
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
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
      console.log('[INFO] retry_dispositions:', retryDispositions);

      const baseDate = campaign.cadence_resume_from_date;
      console.log('[INFO] baseDate:', baseDate);
      if (!baseDate) {
        console.log('[SKIP] NO Cadence has started today');
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
        return;
      }

      // 🔑 ONLY CHANGE: Calculate resume day based on progress instead of time

      const now = new Date();
      const ageInHours =
        (now.getTime() - new Date(baseDate).getTime()) / (1000 * 60 * 60);
      const ageInDays = ageInHours / 24;
      const age = Math.floor(ageInDays) + (campaign?.cadence_resume_day || 0);
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

      if (age === null) {
        console.log('[SKIP] Cadence completed or no valid day.');
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
        return 'completed';
      }

      console.log('[INFO] Resume day calculated:', age);

      const dayConfig = cadenceDays[age.toString()];
      console.log('[INFO] dayConfig for resume day:', dayConfig);

      if (!dayConfig) {
        console.log('[SKIP] No cadence config for resume day.');
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
        return;
      }

      const { attempts: maxAttempts, time_windows } = dayConfig;
      console.log('[INFO] maxAttempts:', maxAttempts);
      console.log('[INFO] time_windows:', time_windows);

      // Check attempts done for this specific day
      const attemptsDoneForDay = await this.prisma.cadenceProgress.count({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
          day: age,
        },
      });

      if (attemptsDoneForDay >= maxAttempts) {
        console.log('[SKIP] Max attempts reached for resume day.');
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
        return;
      }

      // �� REST OF THE METHOD: Use resumeDay instead of age, but keep all logic identical
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

        if (!isNowInTimeWindow(timeWindow)) {
          console.log(`[SKIP] Current time not in slot ${timeWindow}`);
          continue;
        }

        // Check if this slot has any attempts today
        const attemptsInThisSlot = await this.prisma.cadenceProgress.count({
          where: {
            campaign_id: campaignId,
            cadence_id: cadence_template.id,
            day: age, // 🔑 Use resumeDay instead of age
            time_window: timeWindow,
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
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
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
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      });
      console.log('[DB] leads fetched:', leads);

      let hasRetried = false;
      if (leads.length === 0) {
        console.log('[STOP] No leads found for this cadence run. Exiting...');
        await this.prisma.campaigns.update({
          where: { id: campaignId },
          data: { execution_status: 'idle' },
        });
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
        await new Promise((res) => setTimeout(res, 4000));
        hasRetried = true;
      }

      // Record progress using resumeDay
      const existingProgress = await this.prisma.cadenceProgress.findFirst({
        where: {
          campaign_id: campaignId,
          cadence_id: cadence_template.id,
          day: age,
          time_window: time_windows[assignedSlot],
        },
      });

      if (existingProgress) {
        console.log(
          '[INFO] Progress already exists for this campaign/day/time window, skipping creation',
        );
      } else {
        // ✅ Create new progress only if it doesn't exist
        const newProgress = await this.prisma.cadenceProgress.create({
          data: {
            campaign_id: campaignId,
            cadence_id: cadence_template.id,
            day: age,
            attempt: attemptsDoneForDay + 1,
            time_window: time_windows[assignedSlot],
          },
        });
        console.log('[DB] cadenceProgress created:', newProgress);
      }
      console.log('[DB] cadenceProgress exist :', existingProgress);
      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: { execution_status: 'idle' },
      });
      // Check completion logic
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
            data: { cadence_completed: true, execution_status: 'idle' },
          });
          console.log('[DB] Campaign marked completed:', updatedCampaign);
          return 'completed';
        }
      }
      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: { execution_status: 'idle' },
      });
      console.log('[END] executeResumeCadence completed.');
    } catch (error) {
      console.error('[ERROR] executeResumeCadence failed:', error);
      throw error;
    } finally {
      // ✅ Always cleanup executing campaign tracking
      this.executingCampaigns.delete(campaignId);
      console.log(
        `[CLEANUP] Removed campaign ${campaignId} from executing set`,
      );
    }
  }

  // 🔑 NEW METHOD: Calculate resume day based on progress

  async createCadenceTemplate(input: {
    userId: string;
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
    const { name, retry_dispositions, cadence_days, userId } = input;

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
        user_id: userId,
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

  async getCadenceTemplates(userId: string) {
    try {
      const templates = await this.prisma.cadenceTemplate.findMany({
        where: {
          user_id: userId,
        },

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
      console.log({ templates });
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
      // baseDate is in UTC, but we want to set EST time on it
      const result = new Date(baseDate);
      result.setHours(hours, minutes, 0, 0);

      // Convert EDT to UTC by adding 4 hours (EDT is UTC-4 in summer)
      // Note: EST is UTC-5 in winter, EDT is UTC-4 in summer
      const edtToUtcOffset = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      const utcResult = new Date(result.getTime() + edtToUtcOffset);

      console.log(
        `Parsed time: "${timeStr}" -> EDT: ${result.toISOString()} -> UTC: ${utcResult.toISOString()}`,
      );
      return utcResult;
    }

    // Handle 24-hour format (e.g., "14:00", "02:30")
    const timeMatch24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch24) {
      const hours = parseInt(timeMatch24[1], 10);
      const minutes = parseInt(timeMatch24[2], 10);

      // Create a new date object and set the time in EST
      // baseDate is in UTC, but we want to set EST time on it
      const result = new Date(baseDate);
      result.setHours(hours, minutes, 0, 0);

      // Convert EDT to UTC by adding 4 hours (EDT is UTC-4 in summer)
      // Note: EST is UTC-5 in winter, EDT is UTC-4 in summer
      const edtToUtcOffset = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      const utcResult = new Date(result.getTime() + edtToUtcOffset);

      console.log(
        `Parsed time: "${timeStr}" -> EDT: ${result.toISOString()} -> UTC: ${utcResult.toISOString()}`,
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

          // Create a date object for the same day but at midnight (00:00:00) in UTC
          // Since executed_at is UTC, we use it directly
          const sameDayDate = new Date(
            executedDate.getFullYear(),
            executedDate.getMonth(),
            executedDate.getDate(),
          );
          console.log(
            `Same day date (midnight UTC): ${sameDayDate.toISOString()}`,
          );

          // Parse start time - handle AM/PM format properly, using the same day
          // The time windows are in EST, so we'll convert them to UTC in parseTimeString
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
            `Looking for activities on: ${sameDayDate.toDateString()} (UTC)`,
          );

          // Check activity logs where lead status is 'Completed' and created_at is within the time window
          console.log(
            `Querying leadActivityLog for campaign ${campaignId} between ${startTime.toISOString()} and ${endTime.toISOString()}`,
          );

          const completedCount = await this.prisma.leadActivityLog.count({
            where: {
              campaign_id: campaignId,
              activity_type: ActivityType.CALL_ATTEMPT,
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
  async stopCadence(campaignId: string) {
    try {
      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
        include: {
          cadence_template: true,
          cadence_progress: {
            orderBy: { executed_at: 'desc' },
            take: 1,
          },
        },
      });

      if (!campaign) {
        return {
          success: false,
          userError: { message: 'Campaign not found' },
        };
      }

      if (!campaign.cadence_template_id) {
        return {
          success: false,
          userError: { message: 'This campaign has no cadence attached' },
        };
      }

      // 🔑 NEW: Capture current state when stopping
      let resumeDay = 1;
      if (campaign.cadence_progress && campaign.cadence_progress.length > 0) {
        const latestProgress = campaign.cadence_progress[0];
        resumeDay = latestProgress.day;
      }

      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: {
          cadence_stopped: true,
          cadence_paused_at: new Date(),
          cadence_resume_day: resumeDay,
        },
      });

      return {
        success: true,
        userError: null,
      };
    } catch (error) {
      console.error('[StopCadence] Error:', error);
      return {
        success: false,
        userError: {
          message: 'Internal server error. Please try again later.',
        },
      };
    }
  }
  async resumeCadence(campaignId: string) {
    try {
      const campaign = await this.prisma.campaigns.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        return {
          success: false,
          userError: { message: 'Campaign not found' },
        };
      }

      if (!campaign.cadence_template_id) {
        return {
          success: false,
          userError: { message: 'This campaign has no cadence attached' },
        };
      }

      if (!campaign.cadence_stopped) {
        return {
          success: false,
          userError: { message: 'Cadence is not stopped' },
        };
      }

      // 🔑 NEW: Set resume date to today (not the original start date)
      await this.prisma.campaigns.update({
        where: { id: campaignId },
        data: {
          cadence_stopped: false,
          cadence_resume_from_date: new Date(), // Today becomes the new "start date"
        },
      });

      return {
        success: true,
        userError: null,
      };
    } catch (error) {
      console.error('[ResumeCadence] Error:', error);
      return {
        success: false,
        userError: {
          message: 'Internal server error. Please try again later.',
        },
      };
    }
  }
}
