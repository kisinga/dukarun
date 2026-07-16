import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { CommunicationService } from '../../../src/infrastructure/communication/communication.service';
import { NotificationCalendarService } from '../../../src/services/notifications/notification-calendar.service';
import { NotificationSchedulingService } from '../../../src/services/notifications/notification-scheduling.service';
import { PendingNotificationService } from '../../../src/services/notifications/pending-notification.service';
import { PendingNotification } from '../../../src/services/notifications/pending-notification.entity';

function createMockPendingNotificationService(): Partial<PendingNotificationService> {
  return {
    create: jest.fn() as jest.MockedFunction<PendingNotificationService['create']>,
    findDue: jest.fn() as jest.MockedFunction<PendingNotificationService['findDue']>,
    incrementAttempts: jest.fn() as jest.MockedFunction<
      PendingNotificationService['incrementAttempts']
    >,
    markSent: jest.fn() as jest.MockedFunction<PendingNotificationService['markSent']>,
    markError: jest.fn() as jest.MockedFunction<PendingNotificationService['markError']>,
    delete: jest.fn() as jest.MockedFunction<PendingNotificationService['delete']>,
    deleteOldSent: jest.fn() as jest.MockedFunction<PendingNotificationService['deleteOldSent']>,
  };
}

function createMockCommunicationService(): Partial<CommunicationService> {
  return {
    send: jest.fn() as jest.MockedFunction<CommunicationService['send']>,
  };
}

function buildCtx(): RequestContext {
  return { channelId: 1 } as RequestContext;
}

describe('NotificationSchedulingService', () => {
  let pendingService: Partial<PendingNotificationService>;
  let communicationService: Partial<CommunicationService>;
  let service: NotificationSchedulingService;

  beforeEach(() => {
    jest.useRealTimers();
    pendingService = createMockPendingNotificationService();
    communicationService = createMockCommunicationService();
    service = new NotificationSchedulingService(
      pendingService as unknown as PendingNotificationService,
      communicationService as unknown as CommunicationService,
      new NotificationCalendarService()
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('deferOrSendWhatsApp', () => {
    it('sends immediately inside the WhatsApp window', async () => {
      // 10:00 EAT = 07:00 UTC
      jest.useFakeTimers().setSystemTime(Date.UTC(2026, 6, 15, 7, 0, 0));
      (
        communicationService.send as jest.MockedFunction<CommunicationService['send']>
      ).mockResolvedValue({
        success: true,
        channel: 'whatsapp',
      });

      await service.deferOrSendWhatsApp(buildCtx(), {
        channelId: '1',
        triggerKey: 'credit_period_3_days',
        recipient: '+254712345678',
        body: 'hello',
      });

      expect(communicationService.send).toHaveBeenCalledTimes(1);
      expect(pendingService.create).not.toHaveBeenCalled();
    });

    it('defers until the next morning outside the window', async () => {
      // 21:00 EAT = 18:00 UTC
      jest.useFakeTimers().setSystemTime(Date.UTC(2026, 6, 15, 18, 0, 0));

      await service.deferOrSendWhatsApp(buildCtx(), {
        channelId: '1',
        triggerKey: 'credit_period_3_days',
        recipient: '+254712345678',
        body: 'hello',
      });

      expect(communicationService.send).not.toHaveBeenCalled();
      expect(pendingService.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          scheduledAt: new Date(Date.UTC(2026, 6, 16, 5, 0, 0)),
        })
      );
    });
  });

  describe('flushPendingWhatsApp', () => {
    it('sends due messages and marks them sent', async () => {
      const pending: PendingNotification = {
        id: 'p1',
        channelId: '1',
        triggerKey: 'credit_period_3_days',
        recipient: '+254712345678',
        body: 'hello',
        metadata: {},
        scheduledAt: new Date(),
        sentAt: null,
        attempts: 0,
        error: null,
        createdAt: new Date(),
      };
      (
        pendingService.findDue as jest.MockedFunction<PendingNotificationService['findDue']>
      ).mockResolvedValue([pending]);
      (
        communicationService.send as jest.MockedFunction<CommunicationService['send']>
      ).mockResolvedValue({
        success: true,
        channel: 'whatsapp',
      });

      const result = await service.flushPendingWhatsApp(buildCtx());

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(pendingService.markSent).toHaveBeenCalledWith(expect.anything(), 'p1');
    });

    it('deletes messages that persistently fail', async () => {
      const pending: PendingNotification = {
        id: 'p1',
        channelId: '1',
        triggerKey: 'credit_period_3_days',
        recipient: '+254712345678',
        body: 'hello',
        metadata: {},
        scheduledAt: new Date(),
        sentAt: null,
        attempts: 2,
        error: 'retryable',
        createdAt: new Date(),
      };
      (
        pendingService.findDue as jest.MockedFunction<PendingNotificationService['findDue']>
      ).mockResolvedValue([pending]);
      (
        communicationService.send as jest.MockedFunction<CommunicationService['send']>
      ).mockResolvedValue({
        success: false,
        channel: 'whatsapp',
        error: 'final failure',
      });

      const result = await service.flushPendingWhatsApp(buildCtx());

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(pendingService.markError).not.toHaveBeenCalled();
      expect(pendingService.delete).toHaveBeenCalledWith(expect.anything(), 'p1');
    });

    it('records the error but keeps the message while attempts remain', async () => {
      const pending: PendingNotification = {
        id: 'p1',
        channelId: '1',
        triggerKey: 'credit_period_3_days',
        recipient: '+254712345678',
        body: 'hello',
        metadata: {},
        scheduledAt: new Date(),
        sentAt: null,
        attempts: 1,
        error: null,
        createdAt: new Date(),
      };
      (
        pendingService.findDue as jest.MockedFunction<PendingNotificationService['findDue']>
      ).mockResolvedValue([pending]);
      (
        communicationService.send as jest.MockedFunction<CommunicationService['send']>
      ).mockResolvedValue({
        success: false,
        channel: 'whatsapp',
        error: 'retryable',
      });

      const result = await service.flushPendingWhatsApp(buildCtx());

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(pendingService.markError).toHaveBeenCalledWith(expect.anything(), 'p1', 'retryable');
      expect(pendingService.delete).not.toHaveBeenCalled();
    });
  });
});
