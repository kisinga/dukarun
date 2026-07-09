import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection, GlobalSettingsService } from '@vendure/core';
import { SuperAdminResolver } from '../../../src/plugins/super-admin/super-admin.resolver';
import { PlatformAuditService } from '../../../src/infrastructure/audit/platform-audit.service';
import { CommunicationService } from '../../../src/infrastructure/communication/communication.service';
import { OutboundDeliveryService } from '../../../src/services/notifications/outbound-delivery.service';

describe('SuperAdminResolver notification controls', () => {
  const ctx = {} as RequestContext;
  let resolver: SuperAdminResolver;
  let connection: unknown;
  let platformAuditService: Partial<PlatformAuditService>;
  let globalSettingsService: Partial<GlobalSettingsService>;
  let communicationService: Partial<CommunicationService>;
  let outboundDeliveryService: Partial<OutboundDeliveryService>;

  beforeEach(() => {
    connection = {
      rawConnection: {
        query: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    };
    platformAuditService = {
      log: jest.fn().mockImplementation(() => Promise.resolve()) as jest.MockedFunction<
        PlatformAuditService['log']
      >,
    };
    globalSettingsService = {
      getSettings: jest.fn().mockImplementation(() =>
        Promise.resolve({
          customFields: { trialDays: 14, customerNotificationsEnabled: true },
        })
      ) as jest.MockedFunction<GlobalSettingsService['getSettings']>,
    };
    communicationService = {
      send: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ success: true, channel: 'whatsapp' })
        ) as jest.MockedFunction<CommunicationService['send']>,
    };
    outboundDeliveryService = {
      deliver: jest.fn().mockImplementation(() => Promise.resolve()) as jest.MockedFunction<
        OutboundDeliveryService['deliver']
      >,
    };

    resolver = new SuperAdminResolver(
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[0],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[1],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[2],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[3],
      platformAuditService as unknown as PlatformAuditService,
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[5],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[6],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[7],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[8],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[9],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[10],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[11],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[12],
      connection as TransactionalConnection,
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[14],
      {} as unknown as ConstructorParameters<typeof SuperAdminResolver>[15],
      globalSettingsService as unknown as GlobalSettingsService,
      communicationService as unknown as CommunicationService,
      outboundDeliveryService as unknown as OutboundDeliveryService
    );
  });

  describe('updateCustomerNotificationsEnabled', () => {
    it('updates the global_settings column and returns the new state', async () => {
      const result = await resolver.updateCustomerNotificationsEnabled(ctx, true);

      expect(
        (connection as { rawConnection: { query: jest.Mock } }).rawConnection.query
      ).toHaveBeenCalledWith(
        `UPDATE global_settings SET "customFieldsCustomernotificationsenabled" = $1`,
        [true]
      );
      expect(platformAuditService.log).toHaveBeenCalled();
      expect(result.customerNotificationsEnabled).toBe(true);
      expect(result.trialDays).toBe(14);
    });
  });

  describe('sendTestWhatsAppNotification', () => {
    it('rejects an invalid phone number', async () => {
      const result = await resolver.sendTestWhatsAppNotification('not-a-phone', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid phone number');
      expect(communicationService.send).not.toHaveBeenCalled();
    });

    it('sends a WhatsApp message via CommunicationService and bypasses the channel gate', async () => {
      const result = await resolver.sendTestWhatsAppNotification('0712345678', 'Test message');

      expect(communicationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'whatsapp',
          recipient: '0712345678',
          body: 'Test message',
          metadata: { purpose: 'admin_notification', bypassEnabledCheck: true },
        })
      );
      expect(result.success).toBe(true);
    });

    it('renders a template and sends the generated WhatsApp body', async () => {
      const result = await resolver.sendTestWhatsAppNotification('0712345678', '', 'shift_closed');

      const sent = (communicationService.send as jest.MockedFunction<CommunicationService['send']>)
        .mock.calls[0][0];
      expect(sent.channel).toBe('whatsapp');
      expect(sent.recipient).toBe('0712345678');
      expect(typeof sent.body).toBe('string');
      expect(sent.body).toContain('Shift Closed');
      expect(sent.body).toContain('Test Store');
      expect(sent.body).toContain('Total sales');
      expect(sent.metadata).toEqual({
        purpose: 'admin_notification',
        bypassEnabledCheck: true,
      });
      expect(result.success).toBe(true);
    });

    it('requires either a message or a template key', async () => {
      const result = await resolver.sendTestWhatsAppNotification('0712345678', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message or template key is required');
      expect(communicationService.send).not.toHaveBeenCalled();
    });
  });

  describe('sendTestCustomerNotification', () => {
    it('triggers the outbound delivery path with the supplied ids', async () => {
      const result = await resolver.sendTestCustomerNotification('1', '2', 'balance_changed');

      expect(outboundDeliveryService.deliver).toHaveBeenCalledWith(
        expect.any(Object),
        'balance_changed',
        { channelId: '1', customerId: '2' }
      );
      expect(result.success).toBe(true);
    });
  });
});
