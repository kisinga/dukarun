import { describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import {
  DEFAULT_CHANNEL_NOTIFICATION_PREFERENCES,
  NotificationService,
} from '../../../src/services/notifications/notification.service';

describe('NotificationService preferences', () => {
  const ctx = { channelId: 1, activeUserId: 9 } as RequestContext;

  it('defaults missing channel preferences to enabled', async () => {
    const channelService = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve({ id: 1, customFields: {} })),
    };
    const service = new NotificationService({} as any, {} as any, channelService as any);

    await expect(service.getChannelNotificationPreferences(ctx, '1')).resolves.toEqual(
      DEFAULT_CHANNEL_NOTIFICATION_PREFERENCES
    );
  });

  it('merges partial updates without resetting other categories', async () => {
    const channelService = {
      findOne: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: 1,
          customFields: {
            notificationCategoryPreferences: JSON.stringify({
              ...DEFAULT_CHANNEL_NOTIFICATION_PREFERENCES,
              stock: false,
            }),
          },
        })
      ),
      update: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    const service = new NotificationService({} as any, {} as any, channelService as any);

    const result = await service.updateChannelNotificationPreferences(ctx, '1', {
      customer: false,
    });

    expect(result.customer).toBe(false);
    expect(result.stock).toBe(false);
    expect(channelService.update).toHaveBeenCalledWith(ctx, {
      id: '1',
      customFields: {
        notificationCategoryPreferences: JSON.stringify(result),
      },
    });
  });

  it('only marks a notification belonging to the active user and channel', async () => {
    const update = jest.fn().mockImplementation(() => Promise.resolve({ affected: 1 }));
    const connection = {
      rawConnection: {
        getRepository: jest.fn(() => ({ update })),
      },
    };
    const service = new NotificationService(connection as any, {} as any, {} as any);

    await expect(service.markAsRead(ctx, 'notification-1')).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(
      { id: 'notification-1', userId: '9', channelId: '1' },
      { read: true }
    );
  });
});
