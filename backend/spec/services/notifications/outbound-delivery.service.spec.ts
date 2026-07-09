import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { OutboundDeliveryService } from '../../../src/services/notifications/outbound-delivery.service';

describe('OutboundDeliveryService notification categories', () => {
  const ctx = { channelId: 1 } as RequestContext;
  let notificationService: any;
  let communicationService: any;
  let channelUserService: any;
  let service: OutboundDeliveryService;

  beforeEach(() => {
    notificationService = {
      isChannelNotificationCategoryEnabled: jest.fn(),
      createNotificationIfEnabled: jest.fn().mockImplementation(() => Promise.resolve()),
      isShiftNotificationEnabled: jest.fn().mockImplementation(() => Promise.resolve(true)),
    };
    communicationService = {
      send: jest.fn(),
    };
    channelUserService = {
      getChannelAdminUserIds: jest.fn().mockImplementation(() => Promise.resolve(['admin-user'])),
      getChannelFinancialAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve(['admin-user'])),
    };
    service = new OutboundDeliveryService(
      notificationService,
      communicationService,
      channelUserService,
      {} as any
    );
  });

  it('skips every delivery channel when the category is disabled', async () => {
    notificationService.isChannelNotificationCategoryEnabled.mockResolvedValue(false);

    await service.deliver(ctx, 'balance_changed', {
      channelId: '1',
      customerId: 'customer-1',
      outstandingAmount: 100,
    });

    expect(notificationService.isChannelNotificationCategoryEnabled).toHaveBeenCalledWith(
      ctx,
      '1',
      'customer'
    );
    expect(notificationService.createNotificationIfEnabled).not.toHaveBeenCalled();
    expect(communicationService.send).not.toHaveBeenCalled();
  });

  it('continues normal delivery when the category is enabled', async () => {
    notificationService.isChannelNotificationCategoryEnabled.mockResolvedValue(true);

    await service.deliver(ctx, 'order_fulfilled', {
      channelId: '1',
      orderCode: 'ORD-1',
    });

    expect(notificationService.isChannelNotificationCategoryEnabled).toHaveBeenCalledWith(
      ctx,
      '1',
      'orders'
    );
    expect(notificationService.createNotificationIfEnabled).toHaveBeenCalledTimes(1);
  });
});

describe('OutboundDeliveryService shift WhatsApp delivery', () => {
  const ctx = { channelId: 1 } as RequestContext;
  let notificationService: any;
  let communicationService: any;
  let channelUserService: any;
  let connection: any;
  let service: OutboundDeliveryService;

  beforeEach(() => {
    notificationService = {
      isChannelNotificationCategoryEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(true)),
      createNotificationIfEnabled: jest.fn().mockImplementation(() => Promise.resolve()),
      isShiftNotificationEnabled: jest.fn().mockImplementation(() => Promise.resolve(true)),
    };
    communicationService = {
      send: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ success: true, channel: 'whatsapp' })),
    };
    channelUserService = {
      getChannelAdminUserIds: jest.fn().mockImplementation(() => Promise.resolve([])),
      getChannelFinancialAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve(['admin-1'])),
    };
    connection = {
      rawConnection: {
        getRepository: jest.fn().mockImplementation(() => ({
          findOne: jest.fn().mockImplementation((query: any) => {
            if (query?.where?.id === 'admin-1') {
              return Promise.resolve({
                id: 'admin-1',
                customFields: { phoneNumber: '0712345678' },
              });
            }
            return Promise.resolve(null);
          }),
        })),
      },
    };
    service = new OutboundDeliveryService(
      notificationService,
      communicationService,
      channelUserService,
      connection
    );
  });

  it('sends WhatsApp to financially privileged admins on shift close', async () => {
    await service.deliver(ctx, 'shift_closed', {
      channelId: '1',
      sessionId: 'session-1',
      storeName: 'ABC Store',
      cashierName: 'John Doe',
      openedAt: '2026-07-09T08:23:00.000Z',
      closedAt: '2026-07-09T17:45:00.000Z',
      cashSales: 0,
      creditSales: 0,
      purchases: 0,
      cashTotal: 0,
      mpesaTotal: 0,
      totalCollected: 0,
      closingDeclared: 0,
      variance: 0,
      varianceThresholdCents: 100,
    });

    expect(channelUserService.getChannelFinancialAdminUserIds).toHaveBeenCalledWith(ctx, '1', {
      includeSuperAdmins: true,
    });
    expect(communicationService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        recipient: '0712345678',
      })
    );
    const body = communicationService.send.mock.calls[0][0].body as string;
    expect(body).toContain('Shift Closed — ABC Store');
    expect(body).toContain('https://dukarun.com/dashboard/accounting?sessionId=session-1');
  });

  it('skips admins who have disabled shift WhatsApp notifications', async () => {
    notificationService.isShiftNotificationEnabled.mockImplementation(
      (_ctx: any, _userId: string, _channelId: string, _trigger: string, channel: string) =>
        Promise.resolve(channel !== 'whatsapp')
    );

    await service.deliver(ctx, 'shift_closed', {
      channelId: '1',
      sessionId: 'session-1',
      storeName: 'ABC Store',
      cashierName: 'John Doe',
      openedAt: '2026-07-09T08:23:00.000Z',
      closedAt: '2026-07-09T17:45:00.000Z',
      cashSales: 0,
      creditSales: 0,
      purchases: 0,
      cashTotal: 0,
      mpesaTotal: 0,
      totalCollected: 0,
      closingDeclared: 0,
      variance: 0,
      varianceThresholdCents: 100,
    });

    expect(communicationService.send).not.toHaveBeenCalled();
  });
});
