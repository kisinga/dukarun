import { Injectable } from '@nestjs/common';
import { ChannelService, RequestContext, TransactionalConnection } from '@vendure/core';
import { env } from '../../infrastructure/config/environment.config';
import { MlTrainingService } from '../../services/ml/ml-training.service';
import { WorkerBackgroundTaskBase } from '../../infrastructure/utils/worker-background-task.base';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * ML Training Scheduler
 *
 * Processes training queue on a scheduled interval (default: hourly).
 * Implements rate limiting to prevent excessive training per channel.
 * Only runs in worker process to avoid duplicate execution.
 */
@Injectable()
export class MlTrainingScheduler extends WorkerBackgroundTaskBase {
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(
    workerContext: WorkerContextService,
    private channelService: ChannelService,
    private mlTrainingService: MlTrainingService,
    private connection: TransactionalConnection
  ) {
    super(workerContext, MlTrainingScheduler.name);
  }

  protected initializeTask(): void {
    const intervalMinutes = env.ml.trainingIntervalMinutes || 60;
    this.logger.log(
      `Initializing ML training scheduler (interval: ${intervalMinutes} minutes, cooldown: ${env.ml.trainingCooldownHours} hours)`
    );
    this.startScheduler(intervalMinutes);
  }

  /**
   * Start the scheduler to process training queue
   */
  private startScheduler(intervalMinutes: number): void {
    // Process queue immediately on startup, then on interval
    this.processTrainingQueue();

    // Process queue every N minutes
    this.schedulerInterval = setInterval(
      async () => {
        try {
          await this.processTrainingQueue();
        } catch (error) {
          this.logger.error('Error processing training queue:', error);
        }
      },
      intervalMinutes * 60 * 1000
    );

    this.logger.log(`Training scheduler started (${intervalMinutes} minute interval)`);
  }

  /**
   * Process training queue - find channels that need training and start them
   */
  private async processTrainingQueue(): Promise<void> {
    try {
      this.logger.debug('Processing training queue...');

      // Find all channels with mlTrainingQueuedAt set (need training)
      const channels = await this.findChannelsNeedingTraining();

      if (channels.length === 0) {
        this.logger.debug('No channels queued for training');
        return;
      }

      this.logger.log(`Found ${channels.length} channel(s) queued for training`);

      const cooldownHours = env.ml.trainingCooldownHours || 4;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const now = Date.now();
      let processed = 0;
      let skipped = 0;

      for (const channel of channels) {
        try {
          const customFields = channel.customFields as any;

          // Check if channel is already training
          if (customFields.mlTrainingStatus === 'training') {
            this.logger.debug(`Channel ${channel.id} already training, skipping`);
            skipped++;
            continue;
          }

          // Check rate limit (cooldown period)
          if (customFields.mlLastTrainedAt) {
            const lastTrainedAt = new Date(customFields.mlLastTrainedAt).getTime();
            const timeSinceLastTraining = now - lastTrainedAt;

            if (timeSinceLastTraining < cooldownMs) {
              const hoursRemaining = (
                (cooldownMs - timeSinceLastTraining) /
                (60 * 60 * 1000)
              ).toFixed(1);
              this.logger.debug(
                `Channel ${channel.id} in cooldown (${hoursRemaining}h remaining), skipping`
              );
              skipped++;
              continue; // Don't clear queue marker - will retry next run
            }
          }

          // Eligible for training - start it
          this.logger.log(`Starting training for channel ${channel.id}`);
          await this.mlTrainingService.startTraining(RequestContext.empty(), channel.id.toString());

          // Clear the queue marker (training has been initiated)
          await this.clearTrainingQueuedAt(channel.id.toString());
          processed++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error processing training for channel ${channel.id}: ${errorMessage}`);
          // Don't clear queue marker on error - will retry next run
        }
      }

      this.logger.log(
        `Training queue processed: ${processed} started, ${skipped} skipped (cooldown/already training)`
      );
    } catch (error) {
      this.logger.error('Error processing training queue:', error);
    }
  }

  /**
   * Find channels that have mlTrainingQueuedAt set (need training)
   */
  private async findChannelsNeedingTraining(): Promise<any[]> {
    try {
      // Query channels where mlTrainingQueuedAt is not null
      const channels = await this.channelService.findAll(RequestContext.empty());
      return channels.items.filter((channel: any) => {
        const customFields = channel.customFields as any;
        return !!customFields.mlTrainingQueuedAt;
      });
    } catch (error) {
      this.logger.error('Error finding channels needing training:', error);
      return [];
    }
  }

  /**
   * Clear the training queue marker for a channel
   */
  private async clearTrainingQueuedAt(channelId: string): Promise<void> {
    try {
      await this.channelService.update(RequestContext.empty(), {
        id: channelId,
        customFields: {
          mlTrainingQueuedAt: null,
        },
      });
    } catch (error) {
      this.logger.error(`Error clearing training queue marker for channel ${channelId}:`, error);
    }
  }
}
