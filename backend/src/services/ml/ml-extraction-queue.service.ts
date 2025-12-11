import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { MLStatusEvent } from '../../infrastructure/events/custom-events';
import { TracingService } from '../../infrastructure/observability/tracing.service';
import { MetricsService } from '../../infrastructure/observability/metrics.service';

export interface ScheduledExtraction {
  id: string;
  channelId: string;
  scheduledAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

/**
 * ML Extraction Queue Service
 *
 * Manages persistent storage of scheduled extractions to handle
 * backend restarts and ensure no extractions are lost.
 */
@Injectable()
export class MlExtractionQueueService {
  private readonly logger = new Logger(MlExtractionQueueService.name);
  private queueTableReady = false;
  private tableCheckPromise: Promise<boolean> | null = null;

  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    @Optional() private tracingService?: TracingService,
    @Optional() private metricsService?: MetricsService
  ) {}

  /**
   * Ensure the ml_extraction_queue table exists before running raw queries.
   * During the initial bootstrap we run synchronize (without custom migrations),
   * so this guard prevents noisy errors until migrations have finished.
   */
  private async ensureQueueTableReady(): Promise<boolean> {
    if (this.queueTableReady) {
      return true;
    }

    if (!this.tableCheckPromise) {
      this.tableCheckPromise = this.ensureDriverConnected()
        .then(isReady => {
          if (!isReady) {
            return false;
          }
          return this.connection.rawConnection
            .query(
              `
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = current_schema()
                    AND table_name = $1
                ) AS exists
            `,
              ['ml_extraction_queue']
            )
            .then(result => {
              const exists = Boolean(result.rows?.[0]?.exists);
              if (!exists) {
                this.logger.debug(
                  'ml_extraction_queue table not found yet; ML queue operations will be skipped until migrations finish'
                );
              }
              this.queueTableReady = exists;
              return exists;
            });
        })
        .catch(error => {
          this.logger.warn('Failed to verify ml_extraction_queue table existence:', error);
          return false;
        })
        .finally(() => {
          this.tableCheckPromise = null;
        });
    }

    return this.tableCheckPromise;
  }

  private async ensureDriverConnected(): Promise<boolean> {
    const dataSource = this.connection.rawConnection;
    if (dataSource.isInitialized) {
      return true;
    }

    try {
      await dataSource.initialize();
      return true;
    } catch (error) {
      this.logger.warn('Failed to initialize database driver for ML queue:', error);
      return false;
    }
  }

  private handleMissingTable(error: unknown): boolean {
    if (
      error instanceof Error &&
      error.message.includes('relation "ml_extraction_queue" does not exist')
    ) {
      this.queueTableReady = false;
      this.logger.debug(
        'Detected missing ml_extraction_queue table, forcing re-check on next access'
      );
      return true;
    }
    return false;
  }

  /**
   * Schedule a new extraction for a channel
   */
  async scheduleExtraction(
    ctx: RequestContext,
    channelId: string,
    delayMinutes: number = 5
  ): Promise<string> {
    if (!(await this.ensureQueueTableReady())) {
      throw new Error('ML extraction queue is not ready yet. Please retry in a few seconds.');
    }

    const span = this.tracingService?.startSpan('ml.scheduleExtraction', {
      'ml.channel_id': channelId,
      'ml.delay_minutes': delayMinutes.toString(),
    });

    try {
      const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

      const result = await this.connection.rawConnection.query(
        `
                INSERT INTO ml_extraction_queue (channel_id, scheduled_at, status, created_at, updated_at)
                VALUES ($1, $2, 'pending', NOW(), NOW())
                RETURNING id
            `,
        [channelId, scheduledAt]
      );

      const extractionId = result.rows[0].id;

      this.tracingService?.setAttributes(span!, {
        'ml.extraction_id': extractionId,
        'ml.scheduled_at': scheduledAt.toISOString(),
      });
      this.tracingService?.addEvent(span!, 'ml.extraction.scheduled', {
        'ml.extraction_id': extractionId,
      });

      this.logger.log(
        `Scheduled extraction ${extractionId} for channel ${channelId} at ${scheduledAt.toISOString()}`
      );

      // Emit extraction queued event
      this.eventBus.publish(
        new MLStatusEvent(ctx, channelId, 'extraction', 'queued', {
          extractionId,
          scheduledAt: scheduledAt.toISOString(),
        })
      );

      this.tracingService?.endSpan(span!, true);
      return extractionId;
    } catch (error) {
      if (this.handleMissingTable(error)) {
        this.logger.warn(
          `ml_extraction_queue table was missing while scheduling extraction for channel ${channelId}`
        );
      }
      this.tracingService?.endSpan(
        span!,
        false,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Check if a channel has a recent pending extraction (within 30 seconds)
   */
  async hasRecentPendingExtraction(ctx: RequestContext, channelId: string): Promise<boolean> {
    try {
      if (!(await this.ensureQueueTableReady())) {
        return false;
      }

      const result = await this.connection.rawConnection.query(
        `
                SELECT id FROM ml_extraction_queue 
                WHERE channel_id = $1 
                AND status = 'pending' 
                AND created_at > NOW() - INTERVAL '30 seconds'
                LIMIT 1
            `,
        [channelId]
      );

      return result.rows.length > 0;
    } catch (error) {
      // Handle table not existing
      if (this.handleMissingTable(error)) {
        this.logger.log('Table does not exist yet, returning false for recent check');
        return false;
      }
      this.logger.error('Error checking recent pending extraction:', error);
      return false;
    }
  }

  /**
   * Get all pending extractions that are due for processing
   */
  async getDueExtractions(ctx: RequestContext): Promise<ScheduledExtraction[]> {
    try {
      if (!(await this.ensureQueueTableReady())) {
        return [];
      }

      const result = await this.connection.rawConnection.query(`
                SELECT id, channel_id, scheduled_at, status, created_at, updated_at, error
                FROM ml_extraction_queue 
                WHERE status = 'pending' 
                AND scheduled_at <= NOW()
                ORDER BY scheduled_at ASC
            `);

      // Handle case where table doesn't exist yet or query fails
      if (!result || !result.rows) {
        this.logger.log('Table not found or no results, returning empty array');
        return [];
      }

      // Log the number of due extractions found
      if (result.rows.length === 0) {
        this.logger.log(
          'No due extractions found (this is normal when no products have been updated recently)'
        );
      } else {
        this.logger.log(`Found ${result.rows.length} due extractions to process`);
      }

      return result.rows.map((row: any) => ({
        id: row.id,
        channelId: row.channel_id,
        scheduledAt: new Date(row.scheduled_at),
        status: row.status,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        error: row.error,
      }));
    } catch (error) {
      // Handle table not existing or other database errors
      if (this.handleMissingTable(error)) {
        this.logger.log('Table does not exist yet, returning empty array');
        return [];
      }
      this.logger.error('Error getting due extractions:', error);
      return [];
    }
  }

  /**
   * Mark an extraction as processing
   */
  async markAsProcessing(ctx: RequestContext, extractionId: string): Promise<void> {
    if (!(await this.ensureQueueTableReady())) {
      this.logger.debug('Skipping markAsProcessing - ml_extraction_queue table not ready yet');
      return;
    }

    try {
      // Get channel ID from extraction record
      const extractionResult = await this.connection.rawConnection.query(
        `
                SELECT channel_id FROM ml_extraction_queue WHERE id = $1
            `,
        [extractionId]
      );

      if (extractionResult.rows.length === 0) {
        this.logger.warn(`Extraction ${extractionId} not found when marking as processing`);
        return;
      }

      const channelId = extractionResult.rows[0].channel_id;

      await this.connection.rawConnection.query(
        `
                UPDATE ml_extraction_queue 
                SET status = 'processing', updated_at = NOW()
                WHERE id = $1
            `,
        [extractionId]
      );

      this.logger.log(`Marked extraction ${extractionId} as processing`);

      // Emit extraction started event
      this.eventBus.publish(
        new MLStatusEvent(ctx, channelId, 'extraction', 'started', {
          extractionId,
        })
      );
    } catch (error) {
      if (this.handleMissingTable(error)) {
        this.logger.debug('ml_extraction_queue table missing while marking as processing');
        return;
      }
      throw error;
    }
  }

  /**
   * Mark an extraction as completed
   */
  async markAsCompleted(ctx: RequestContext, extractionId: string): Promise<void> {
    if (!(await this.ensureQueueTableReady())) {
      this.logger.debug('Skipping markAsCompleted - ml_extraction_queue table not ready yet');
      return;
    }

    try {
      // Get channel ID from extraction record
      const extractionResult = await this.connection.rawConnection.query(
        `
                SELECT channel_id FROM ml_extraction_queue WHERE id = $1
            `,
        [extractionId]
      );

      if (extractionResult.rows.length === 0) {
        this.logger.warn(`Extraction ${extractionId} not found when marking as completed`);
        return;
      }

      const channelId = extractionResult.rows[0].channel_id;

      await this.connection.rawConnection.query(
        `
                UPDATE ml_extraction_queue 
                SET status = 'completed', updated_at = NOW()
                WHERE id = $1
            `,
        [extractionId]
      );

      this.logger.log(`Marked extraction ${extractionId} as completed`);

      // Emit extraction completed event
      this.eventBus.publish(
        new MLStatusEvent(ctx, channelId, 'extraction', 'completed', {
          extractionId,
        })
      );
    } catch (error) {
      if (this.handleMissingTable(error)) {
        this.logger.debug('ml_extraction_queue table missing while marking as completed');
        return;
      }
      throw error;
    }
  }

  /**
   * Mark an extraction as failed
   */
  async markAsFailed(ctx: RequestContext, extractionId: string, error: string): Promise<void> {
    if (!(await this.ensureQueueTableReady())) {
      this.logger.debug('Skipping markAsFailed - ml_extraction_queue table not ready yet');
      return;
    }

    try {
      // Get channel ID from extraction record
      const extractionResult = await this.connection.rawConnection.query(
        `
                SELECT channel_id FROM ml_extraction_queue WHERE id = $1
            `,
        [extractionId]
      );

      if (extractionResult.rows.length === 0) {
        this.logger.warn(`Extraction ${extractionId} not found when marking as failed`);
        return;
      }

      const channelId = extractionResult.rows[0].channel_id;

      await this.connection.rawConnection.query(
        `
                UPDATE ml_extraction_queue 
                SET status = 'failed', error = $2, updated_at = NOW()
                WHERE id = $1
            `,
        [extractionId, error]
      );

      this.logger.log(`Marked extraction ${extractionId} as failed: ${error}`);

      // Emit extraction failed event
      this.eventBus.publish(
        new MLStatusEvent(ctx, channelId, 'extraction', 'failed', {
          extractionId,
          error,
        })
      );
    } catch (err) {
      if (this.handleMissingTable(err)) {
        this.logger.debug('ml_extraction_queue table missing while marking as failed');
        return;
      }
      throw err;
    }
  }

  /**
   * Clean up old completed extractions (older than 7 days)
   * Skips work automatically until the queue table is available (fresh install bootstrap).
   */
  async cleanupOldExtractions(ctx: RequestContext): Promise<number> {
    try {
      if (!(await this.ensureQueueTableReady())) {
        this.logger.debug('Skipping cleanup of old extractions - table not ready yet');
        return 0;
      }

      const result = await this.connection.rawConnection.query(`
                DELETE FROM ml_extraction_queue 
                WHERE status IN ('completed', 'failed') 
                AND updated_at < NOW() - INTERVAL '7 days'
            `);

      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old extractions`);
      }

      return deletedCount;
    } catch (error) {
      if (this.handleMissingTable(error)) {
        this.logger.debug('ml_extraction_queue table missing while running cleanup');
        return 0;
      }
      this.logger.error('Error cleaning up old extractions:', error);
      throw error;
    }
  }

  /**
   * Get extraction history for a channel
   */
  async getChannelHistory(
    ctx: RequestContext,
    channelId: string,
    limit: number = 10
  ): Promise<ScheduledExtraction[]> {
    if (!(await this.ensureQueueTableReady())) {
      return [];
    }

    try {
      const result = await this.connection.rawConnection.query(
        `
            SELECT id, channel_id, scheduled_at, status, created_at, updated_at, error
            FROM ml_extraction_queue 
            WHERE channel_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `,
        [channelId, limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        channelId: row.channel_id,
        scheduledAt: new Date(row.scheduled_at),
        status: row.status,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        error: row.error,
      }));
    } catch (error) {
      if (this.handleMissingTable(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Cancel pending extractions for a channel
   */
  async cancelPendingExtractions(ctx: RequestContext, channelId: string): Promise<number> {
    if (!(await this.ensureQueueTableReady())) {
      return 0;
    }

    try {
      const result = await this.connection.rawConnection.query(
        `
            UPDATE ml_extraction_queue 
            SET status = 'failed', error = 'Cancelled by user', updated_at = NOW()
            WHERE channel_id = $1 AND status = 'pending'
        `,
        [channelId]
      );

      const cancelledCount = result.rowCount || 0;
      if (cancelledCount > 0) {
        this.logger.log(`Cancelled ${cancelledCount} pending extractions for channel ${channelId}`);
      }

      return cancelledCount;
    } catch (error) {
      if (this.handleMissingTable(error)) {
        return 0;
      }
      throw error;
    }
  }
}
