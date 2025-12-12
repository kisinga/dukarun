import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import pLimit from 'p-limit';
import { MlExtractionQueueService } from '../../services/ml/ml-extraction-queue.service';
import { MlTrainingService } from '../../services/ml/ml-training.service';
import { WorkerBackgroundTaskBase } from '../../infrastructure/utils/worker-background-task.base';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * ML Extraction Queue Subscriber
 *
 * Handles processing of due extractions from the queue.
 * Replaces the polling mechanism with event-driven processing.
 * Only runs in worker process to avoid duplicate execution.
 */
@Injectable()
export class MlExtractionQueueSubscriber extends WorkerBackgroundTaskBase {
  private processingInterval: NodeJS.Timeout | null = null;
  // Limit concurrent extractions to avoid overwhelming the system
  // Process up to 4 channels concurrently, but each channel's extractions sequentially
  private readonly extractionLimit = pLimit(4);

  constructor(
    workerContext: WorkerContextService,
    private extractionQueueService: MlExtractionQueueService,
    private mlTrainingService: MlTrainingService
  ) {
    super(workerContext, MlExtractionQueueSubscriber.name);
  }

  protected initializeTask(): void {
    // OnApplicationBootstrap runs after all modules are initialized AND migrations are complete
    // The ml_extraction_queue table is guaranteed to exist at this point
    // Start processing queue every 30 seconds
    // This is still needed to check for due extractions, but now it's
    // in a dedicated subscriber rather than mixed with event handling
    this.startQueueProcessor();

    // Clean up old extractions on startup (migrations are guaranteed to be complete)
    this.cleanupOldExtractions();

    this.logger.log('Queue processor initialized (migrations complete)');
  }

  /**
   * Start the queue processor to handle due extractions
   */
  private startQueueProcessor(): void {
    // Process queue every 30 seconds
    this.processingInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        this.logger.error('Error processing queue:', error);
      }
    }, 30000);

    this.logger.log('Queue processor started (30s interval)');
  }

  /**
   * Process due extractions from the queue
   */
  private async processQueue(): Promise<void> {
    try {
      this.logger.debug('Checking for due extractions...');
      const dueExtractions = await this.extractionQueueService.getDueExtractions(
        RequestContext.empty()
      );

      if (dueExtractions.length === 0) {
        this.logger.debug(
          'No extractions to process (this is normal when no products have been updated recently)'
        );
        return;
      }

      this.logger.log(`Processing ${dueExtractions.length} due extractions`);

      // Group extractions by channel to avoid processing same channel concurrently
      const extractionsByChannel = new Map<string, typeof dueExtractions>();
      for (const extraction of dueExtractions) {
        const channelId = extraction.channelId;
        if (!extractionsByChannel.has(channelId)) {
          extractionsByChannel.set(channelId, []);
        }
        extractionsByChannel.get(channelId)!.push(extraction);
      }

      // Process each channel's extractions in parallel (with concurrency limit)
      // But process each channel's extractions sequentially to avoid conflicts
      const processChannelExtractions = async (
        channelId: string,
        extractions: typeof dueExtractions
      ) => {
        for (const extraction of extractions) {
          try {
            this.logger.log(
              `Processing extraction ${extraction.id} for channel ${extraction.channelId}`
            );

            // Mark as processing (this will emit ML_EXTRACTION_STARTED event)
            await this.extractionQueueService.markAsProcessing(
              RequestContext.empty(),
              extraction.id
            );

            // Perform the extraction
            await this.mlTrainingService.scheduleAutoExtraction(
              RequestContext.empty(),
              extraction.channelId
            );

            // Mark as completed (this will emit ML_EXTRACTION_COMPLETED event)
            await this.extractionQueueService.markAsCompleted(
              RequestContext.empty(),
              extraction.id
            );

            // Trigger training automatically
            this.logger.log(
              `Extraction completed for channel ${extraction.channelId}, triggering training...`
            );
            try {
              await this.mlTrainingService.startTraining(
                RequestContext.empty(),
                extraction.channelId
              );
            } catch (trainingError) {
              // We log but don't fail the extraction job itself, as extraction was successful
              this.logger.warn(
                `Auto-training fail: ${trainingError instanceof Error ? trainingError.message : trainingError}`
              );
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Error processing extraction ${extraction.id}:`, error);
            // Mark as failed (this will emit ML_EXTRACTION_FAILED event)
            await this.extractionQueueService.markAsFailed(
              RequestContext.empty(),
              extraction.id,
              errorMessage
            );
          }
        }
      };

      // Process different channels in parallel with concurrency limit
      const channelPromises = Array.from(extractionsByChannel.entries()).map(
        ([channelId, extractions]) =>
          this.extractionLimit(() => processChannelExtractions(channelId, extractions))
      );

      await Promise.all(channelPromises);
    } catch (error) {
      this.logger.error('Error getting due extractions:', error);
    }
  }

  /**
   * Clean up old extractions on startup
   */
  private async cleanupOldExtractions(): Promise<void> {
    try {
      const cleanedCount = await this.extractionQueueService.cleanupOldExtractions(
        RequestContext.empty()
      );
      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} old extractions on startup`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up old extractions:', error);
    }
  }
}
