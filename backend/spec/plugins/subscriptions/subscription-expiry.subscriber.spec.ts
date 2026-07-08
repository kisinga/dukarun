import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventBus, RequestContext } from '@vendure/core';
import { SubscriptionExpirySubscriber } from '../../../src/plugins/subscriptions/subscription-expiry.subscriber';
import { NotificationService } from '../../../src/services/notifications/notification.service';
import { getDefaultGracePeriodEnd } from '../../../src/services/subscriptions/subscription-access.policy';

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 14;

describe('SubscriptionExpirySubscriber', () => {
  let subscriber: SubscriptionExpirySubscriber;
  let channelService: any;
  let connection: any;
  let eventBus: EventBus;
  let notificationService: NotificationService;
  let subscriptionService: any;
  let publishedEvents: any[];

  beforeEach(() => {
    jest.useFakeTimers();
    publishedEvents = [];
    channelService = {
      findAll: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
    } as any;

    connection = {
      getRepository: jest.fn<any>().mockReturnValue({
        findOne: jest.fn<any>().mockResolvedValue({
          id: '1',
          seller: { name: 'Test Company Seller' },
        }),
      }),
    } as any;

    eventBus = {
      publish: jest.fn(event => publishedEvents.push(event)),
    } as any;

    notificationService = {
      hasAnyAdminWithPaymentNotificationsEnabled: jest.fn<any>().mockResolvedValue(true),
      getLastNotificationThreshold: jest.fn<any>().mockResolvedValue(null),
    } as any;

    subscriptionService = {
      enterGracePeriod: jest.fn<any>().mockResolvedValue({}),
      suspendLegacyExpired: jest.fn<any>().mockResolvedValue({}),
    } as any;

    subscriber = new SubscriptionExpirySubscriber(
      { isWorkerProcess: () => true } as any,
      channelService,
      connection,
      eventBus,
      notificationService,
      subscriptionService
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits expired event and sets grace period when a subscription expires', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    jest.setSystemTime(now);
    const expiry = new Date(now.getTime() - DAY_MS);
    channelService.findAll.mockResolvedValue({
      items: [
        {
          id: '1',
          code: 'test',
          customFields: {
            subscriptionStatus: 'active',
            subscriptionExpiresAt: expiry.toISOString(),
          },
        },
      ],
    });

    await (subscriber as any).checkExpiringSubscriptions();

    expect(subscriptionService.enterGracePeriod).toHaveBeenCalledWith(
      expect.any(RequestContext),
      '1',
      expect.objectContaining({
        baseDate: expect.any(Date),
        expiryDate: expect.any(Date),
        silent: true,
      })
    );

    const enterCall = subscriptionService.enterGracePeriod.mock.calls[0];
    const graceEnd = getDefaultGracePeriodEnd(enterCall[2].baseDate);
    expect(graceEnd.getTime()).toBeGreaterThan(Date.now() - DAY_MS);
    expect(graceEnd.getTime()).toBeLessThanOrEqual(Date.now() + GRACE_PERIOD_DAYS * DAY_MS + 1000);

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].alertType).toBe('expired');
  });

  it('emits grace_period_ending reminders during the grace period', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    jest.setSystemTime(now);
    const graceEnd = new Date(now.getTime() + 3 * DAY_MS);
    channelService.findAll.mockResolvedValue({
      items: [
        {
          id: '1',
          code: 'test',
          customFields: {
            subscriptionStatus: 'expired',
            subscriptionGracePeriodEnd: graceEnd.toISOString(),
          },
        },
      ],
    });

    await (subscriber as any).checkExpiringSubscriptions();

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].alertType).toBe('grace_period_ending');
    expect(publishedEvents[0].data.daysRemaining).toBe(3);
  });

  it('emits hard_expired once the grace period ends', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    jest.setSystemTime(now);
    const graceEnd = new Date(now.getTime() - DAY_MS);
    channelService.findAll.mockResolvedValue({
      items: [
        {
          id: '1',
          code: 'test',
          customFields: {
            subscriptionStatus: 'expired',
            subscriptionGracePeriodEnd: graceEnd.toISOString(),
          },
        },
      ],
    });

    await (subscriber as any).checkExpiringSubscriptions();

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].alertType).toBe('hard_expired');
  });

  it('does not re-emit hard_expired after it has already been sent', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    jest.setSystemTime(now);
    (notificationService.getLastNotificationThreshold as any).mockResolvedValue(0);
    const graceEnd = new Date(now.getTime() - DAY_MS);
    channelService.findAll.mockResolvedValue({
      items: [
        {
          id: '1',
          code: 'test',
          customFields: {
            subscriptionStatus: 'expired',
            subscriptionGracePeriodEnd: graceEnd.toISOString(),
          },
        },
      ],
    });

    await (subscriber as any).checkExpiringSubscriptions();

    expect(publishedEvents).toHaveLength(0);
  });

  it('sends pre-expiry reminders for active subscriptions', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    jest.setSystemTime(now);
    const expiry = new Date(now.getTime() + 3 * DAY_MS);
    channelService.findAll.mockResolvedValue({
      items: [
        {
          id: '1',
          code: 'test',
          customFields: {
            subscriptionStatus: 'active',
            subscriptionExpiresAt: expiry.toISOString(),
          },
        },
      ],
    });

    await (subscriber as any).checkExpiringSubscriptions();

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].alertType).toBe('expiring_soon');
    expect(publishedEvents[0].data.daysRemaining).toBe(3);
  });

  it('does not grant a fresh grace period to legacy expired channels with no dates', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    jest.setSystemTime(now);
    channelService.findAll.mockResolvedValue({
      items: [
        {
          id: '1',
          code: 'test',
          customFields: {
            subscriptionStatus: 'expired',
          },
        },
      ],
    });

    await (subscriber as any).checkExpiringSubscriptions();

    expect(subscriptionService.suspendLegacyExpired).toHaveBeenCalledWith(
      expect.any(RequestContext),
      '1'
    );
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].alertType).toBe('hard_expired');
    expect(publishedEvents[0].data.daysRemaining).toBe(0);
  });
});
