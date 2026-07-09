import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, GlobalSettingsService, TransactionalConnection } from '@vendure/core';
import { OutboundDeliveryService } from '../../../src/services/notifications/outbound-delivery.service';
import { NotificationService } from '../../../src/services/notifications/notification.service';
import { CommunicationService } from '../../../src/infrastructure/communication/communication.service';
import { ChannelUserService } from '../../../src/services/auth/channel-user.service';
import { SendRequest } from '../../../src/infrastructure/communication/send-request.types';

function createMockGlobalSettingsService(enabled: boolean): Partial<GlobalSettingsService> {
  return {
    getSettings: jest.fn().mockImplementation(() =>
      Promise.resolve({
        customFields: { customerNotificationsEnabled: enabled },
      })
    ),
  } as Partial<GlobalSettingsService>;
}

describe('OutboundDeliveryService notification categories', () => {
  const ctx = { channelId: 1 } as RequestContext;
  let notificationService: Partial<NotificationService>;
  let communicationService: Partial<CommunicationService>;
  let channelUserService: Partial<ChannelUserService>;
  let globalSettingsService: Partial<GlobalSettingsService>;
  let service: OutboundDeliveryService;

  beforeEach(() => {
    notificationService = {
      isChannelNotificationCategoryEnabled: jest.fn() as jest.MockedFunction<
        NotificationService['isChannelNotificationCategoryEnabled']
      >,
      createNotificationIfEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(null)) as jest.MockedFunction<
        NotificationService['createNotificationIfEnabled']
      >,
      isShiftNotificationEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<
        NotificationService['isShiftNotificationEnabled']
      >,
    };
    communicationService = {
      send: jest.fn() as jest.MockedFunction<CommunicationService['send']>,
    };
    channelUserService = {
      getChannelAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve(['admin-user'])) as jest.MockedFunction<
        ChannelUserService['getChannelAdminUserIds']
      >,
      getChannelFinancialAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve(['admin-user'])) as jest.MockedFunction<
        ChannelUserService['getChannelFinancialAdminUserIds']
      >,
    };
    globalSettingsService = createMockGlobalSettingsService(false);
    service = new OutboundDeliveryService(
      notificationService as unknown as NotificationService,
      communicationService as unknown as CommunicationService,
      channelUserService as unknown as ChannelUserService,
      {} as unknown as TransactionalConnection,
      globalSettingsService as unknown as GlobalSettingsService
    );
  });

  it('skips every delivery channel when the category is disabled', async () => {
    (
      notificationService.isChannelNotificationCategoryEnabled as jest.MockedFunction<
        NotificationService['isChannelNotificationCategoryEnabled']
      >
    ).mockResolvedValue(false);

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
    (
      notificationService.isChannelNotificationCategoryEnabled as jest.MockedFunction<
        NotificationService['isChannelNotificationCategoryEnabled']
      >
    ).mockResolvedValue(true);

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
  let notificationService: Partial<NotificationService>;
  let communicationService: Partial<CommunicationService>;
  let channelUserService: Partial<ChannelUserService>;
  let connection: unknown;
  let globalSettingsService: Partial<GlobalSettingsService>;
  let service: OutboundDeliveryService;

  beforeEach(() => {
    notificationService = {
      isChannelNotificationCategoryEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<
        NotificationService['isChannelNotificationCategoryEnabled']
      >,
      createNotificationIfEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(null)) as jest.MockedFunction<
        NotificationService['createNotificationIfEnabled']
      >,
      isShiftNotificationEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<
        NotificationService['isShiftNotificationEnabled']
      >,
    };
    communicationService = {
      send: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ success: true, channel: 'whatsapp' })
        ) as jest.MockedFunction<CommunicationService['send']>,
    };
    channelUserService = {
      getChannelAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve([])) as jest.MockedFunction<
        ChannelUserService['getChannelAdminUserIds']
      >,
      getChannelFinancialAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve(['admin-1'])) as jest.MockedFunction<
        ChannelUserService['getChannelFinancialAdminUserIds']
      >,
    };
    connection = {
      rawConnection: {
        getRepository: jest.fn().mockImplementation(() => ({
          findOne: jest.fn().mockImplementation((query: unknown) => {
            const q = query as { where?: { id?: string } };
            if (q?.where?.id === 'admin-1') {
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
    globalSettingsService = createMockGlobalSettingsService(false);
    service = new OutboundDeliveryService(
      notificationService as unknown as NotificationService,
      communicationService as unknown as CommunicationService,
      channelUserService as unknown as ChannelUserService,
      connection as TransactionalConnection,
      globalSettingsService as unknown as GlobalSettingsService
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
    const body = (
      (communicationService.send as jest.MockedFunction<CommunicationService['send']>).mock
        .calls[0][0] as SendRequest
    ).body as string;
    expect(body).toContain('Shift Closed — ABC Store');
    expect(body).toContain('https://dukarun.com/dashboard/accounting?sessionId=session-1');
  });

  it('skips admins who have disabled shift WhatsApp notifications', async () => {
    (
      notificationService.isShiftNotificationEnabled as jest.MockedFunction<
        NotificationService['isShiftNotificationEnabled']
      >
    ).mockImplementation((_ctx, _userId, _channelId, _trigger, channel) =>
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

describe('OutboundDeliveryService customer notification gating', () => {
  const ctx = { channelId: 1 } as RequestContext;

  function buildService(globalEnabled: boolean, customerEnabled: boolean) {
    const notificationService: Partial<NotificationService> = {
      isChannelNotificationCategoryEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<
        NotificationService['isChannelNotificationCategoryEnabled']
      >,
      createNotificationIfEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(null)) as jest.MockedFunction<
        NotificationService['createNotificationIfEnabled']
      >,
      isShiftNotificationEnabled: jest
        .fn()
        .mockImplementation(() => Promise.resolve(true)) as jest.MockedFunction<
        NotificationService['isShiftNotificationEnabled']
      >,
    };
    const communicationService: Partial<CommunicationService> = {
      send: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ success: true, channel: 'whatsapp' })
        ) as jest.MockedFunction<CommunicationService['send']>,
    };
    const channelUserService: Partial<ChannelUserService> = {
      getChannelAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve([])) as jest.MockedFunction<
        ChannelUserService['getChannelAdminUserIds']
      >,
      getChannelFinancialAdminUserIds: jest
        .fn()
        .mockImplementation(() => Promise.resolve([])) as jest.MockedFunction<
        ChannelUserService['getChannelFinancialAdminUserIds']
      >,
    };
    const connection: unknown = {
      getRepository: jest.fn().mockImplementation((_ctx, entity) => {
        if ((entity as { name?: string }).name === 'Customer') {
          return {
            findOne: jest.fn().mockImplementation(() =>
              Promise.resolve({
                id: 'customer-1',
                customFields: {
                  notificationsEnabled: customerEnabled,
                  phoneNumber: '0712345678',
                },
              })
            ),
          };
        }
        return { findOne: jest.fn().mockImplementation(() => Promise.resolve(null)) };
      }),
    };
    const globalSettingsService = createMockGlobalSettingsService(globalEnabled);

    return {
      service: new OutboundDeliveryService(
        notificationService as unknown as NotificationService,
        communicationService as unknown as CommunicationService,
        channelUserService as unknown as ChannelUserService,
        connection as TransactionalConnection,
        globalSettingsService as unknown as GlobalSettingsService
      ),
      notificationService,
      communicationService,
      globalSettingsService,
    };
  }

  it('skips customer sends when the global master switch is off', async () => {
    const { service, communicationService } = buildService(false, true);

    await service.deliver(ctx, 'balance_changed', {
      channelId: '1',
      customerId: 'customer-1',
      newBalanceCents: 50000,
    });

    expect(communicationService.send).not.toHaveBeenCalled();
  });

  it('skips customer sends when the customer preference is off', async () => {
    const { service, communicationService } = buildService(true, false);

    await service.deliver(ctx, 'balance_changed', {
      channelId: '1',
      customerId: 'customer-1',
      newBalanceCents: 50000,
    });

    expect(communicationService.send).not.toHaveBeenCalled();
  });

  it('sends customer notifications when global and customer toggles are on', async () => {
    const { service, communicationService } = buildService(true, true);

    await service.deliver(ctx, 'balance_changed', {
      channelId: '1',
      customerId: 'customer-1',
      newBalanceCents: 50000,
    });

    expect(communicationService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        recipient: '0712345678',
      })
    );
  });
});
