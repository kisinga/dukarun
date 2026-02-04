import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventBus, RequestContext } from '@vendure/core';
import { MockDb, MlExtractionQueueRow } from '../../support/mock-db';
import { MlExtractionQueueService } from '../../../src/services/ml/ml-extraction-queue.service';

describe('MlExtractionQueueService', () => {
  const ctx = RequestContext.empty();
  const fixedNow = new Date('2025-01-01T00:00:00.000Z');

  let db: MockDb;
  let service: MlExtractionQueueService;
  let mockEventBus: jest.Mocked<EventBus>;

  beforeEach(() => {
    db = new MockDb({ now: () => new Date(fixedNow) });
    mockEventBus = { publish: jest.fn() } as any;
    service = new MlExtractionQueueService(db.connection, mockEventBus);
  });

  describe('Given a fresh install without ml_extraction_queue', () => {
    it('returns false when checking for recent jobs', async () => {
      const hasRecent = await service.hasRecentPendingExtraction(ctx, 'channel-a');
      expect(hasRecent).toBe(false);
    });

    it('throws a descriptive error when scheduling before migrations run', async () => {
      await expect(service.scheduleExtraction(ctx, 'channel-a', 5)).rejects.toThrow(/not ready/i);
    });

    it('silently skips cleanup when the table is missing', async () => {
      const deleted = await service.cleanupOldExtractions(ctx);
      expect(deleted).toBe(0);
    });
  });

  describe('Given the queue table exists', () => {
    beforeEach(() => {
      db.useMlExtractionQueue();
    });

    it('schedules a new extraction and records it in the mock table', async () => {
      const extractionId = await service.scheduleExtraction(ctx, 'channel-a', 10);
      const rows = db.getTableRows<MlExtractionQueueRow>('ml_extraction_queue');

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(extractionId);
      expect(rows[0].channel_id).toBe('channel-a');
      expect(rows[0].status).toBe('pending');
    });

    it('reports a recent pending extraction once one is scheduled', async () => {
      await service.scheduleExtraction(ctx, 'channel-a', 5);

      const hasRecent = await service.hasRecentPendingExtraction(ctx, 'channel-a');
      expect(hasRecent).toBe(true);
    });

    it('returns due extractions ordered by schedule time', async () => {
      const past = new Date(fixedNow.getTime() - 60_000);
      const future = new Date(fixedNow.getTime() + 60_000);
      db.useMlExtractionQueue([
        {
          id: 'due',
          channel_id: 'channel-a',
          scheduled_at: past,
          created_at: past,
          updated_at: past,
          status: 'pending',
        },
        {
          id: 'later',
          channel_id: 'channel-b',
          scheduled_at: future,
          created_at: future,
          updated_at: future,
          status: 'pending',
        },
      ]);

      const due = await service.getDueExtractions(ctx);
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('due');
    });

    it('walks a job through processing -> completed states', async () => {
      const extractionId = await service.scheduleExtraction(ctx, 'channel-x', 1);

      await service.markAsProcessing(ctx, extractionId);
      await service.markAsCompleted(ctx, extractionId);

      const rows = db.getTableRows<MlExtractionQueueRow>('ml_extraction_queue');
      expect(rows[0].status).toBe('completed');
    });

    it('marks a job as failed with the provided error message', async () => {
      const extractionId = await service.scheduleExtraction(ctx, 'channel-x', 1);

      await service.markAsFailed(ctx, extractionId, 'boom');

      const rows = db.getTableRows<MlExtractionQueueRow>('ml_extraction_queue');
      expect(rows[0].status).toBe('failed');
      expect(rows[0].error).toBe('boom');
    });

    it('cleans up rows older than seven days', async () => {
      const stale = new Date(fixedNow.getTime() - 8 * 24 * 60 * 60 * 1000);
      db.useMlExtractionQueue([
        {
          id: 'old',
          channel_id: 'channel-old',
          status: 'completed',
          scheduled_at: stale,
          created_at: stale,
          updated_at: stale,
          error: null,
        },
        {
          id: 'recent',
          channel_id: 'channel-new',
          status: 'completed',
          scheduled_at: fixedNow,
          created_at: fixedNow,
          updated_at: fixedNow,
          error: null,
        },
      ]);

      const deleted = await service.cleanupOldExtractions(ctx);
      expect(deleted).toBe(1);

      const rows = db.getTableRows<MlExtractionQueueRow>('ml_extraction_queue');
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('recent');
    });

    it('cancels pending extractions for a channel', async () => {
      const extractionId = await service.scheduleExtraction(ctx, 'channel-z', 1);

      const cancelled = await service.cancelPendingExtractions(ctx, 'channel-z');
      expect(cancelled).toBe(1);

      const rows = db.getTableRows<MlExtractionQueueRow>('ml_extraction_queue');
      expect(rows.find(row => row.id === extractionId)?.status).toBe('failed');
      expect(rows.find(row => row.id === extractionId)?.error).toBe('Cancelled by user');
    });

    it('provides channel history ordered by creation time', async () => {
      const older = new Date(fixedNow.getTime() - 1_000);
      const newer = new Date(fixedNow.getTime() + 1_000);
      db.useMlExtractionQueue([
        {
          id: 'older',
          channel_id: 'history',
          status: 'pending',
          scheduled_at: older,
          created_at: older,
          updated_at: older,
        },
        {
          id: 'newer',
          channel_id: 'history',
          status: 'completed',
          scheduled_at: newer,
          created_at: newer,
          updated_at: newer,
        },
      ]);

      const history = await service.getChannelHistory(ctx, 'history', 1);
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('newer');
    });
  });
});
