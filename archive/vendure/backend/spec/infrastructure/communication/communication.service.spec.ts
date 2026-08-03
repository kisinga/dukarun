import { expect, jest, it, describe, beforeEach } from '@jest/globals';
import { EventBus, GlobalSettingsService, RequestContext } from '@vendure/core';
import { CommunicationService } from '../../../src/infrastructure/communication/communication.service';
import { SmsService } from '../../../src/infrastructure/sms/sms.service';
import { OpenWaService } from '../../../src/infrastructure/whatsapp/open-wa.service';
import { SmsUsageService } from '../../../src/services/sms/sms-usage.service';
import { SmsResult } from '../../../src/infrastructure/sms/interfaces/sms-provider.interface';
import { DeliveryResult } from '../../../src/infrastructure/communication/send-request.types';
import { env } from '../../../src/infrastructure/config/environment.config';

jest.mock('../../../src/infrastructure/config/environment.config', () => ({
  env: {
    communication: {
      devMode: false,
      channels: { sms: true, email: true, whatsapp: false },
    },
    auditDb: {
      host: 'localhost',
      port: 5432,
      name: 'audit_logs',
      username: 'audit_user',
      password: 'audit_password',
    },
  },
}));

const mockedEnv = env as {
  communication: {
    devMode: boolean;
    channels: { sms: boolean; email: boolean; whatsapp: boolean };
  };
};

describe('CommunicationService channel gating', () => {
  let service: CommunicationService;
  let smsService: SmsService;
  let openWaService: OpenWaService;
  let eventBus: EventBus;
  let smsUsageService: SmsUsageService;
  let globalSettingsService: GlobalSettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnv.communication.devMode = false;
    mockedEnv.communication.channels = { sms: true, email: true, whatsapp: false };

    smsService = {
      sendSms: jest.fn<() => Promise<SmsResult>>().mockResolvedValue({ success: true }),
    } as unknown as SmsService;
    openWaService = {
      sendText: jest.fn<() => Promise<DeliveryResult>>().mockResolvedValue({
        success: true,
        channel: 'whatsapp',
      }),
    } as unknown as OpenWaService;
    eventBus = {
      publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as EventBus;
    smsUsageService = {
      canSendSms: jest
        .fn<() => Promise<{ allowed: boolean; reason?: string }>>()
        .mockResolvedValue({
          allowed: true,
        }),
      recordSmsSent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as SmsUsageService;
    globalSettingsService = {
      getSettings: jest.fn<() => Promise<any>>().mockResolvedValue({
        customFields: { communicationChannels: '{"sms":true,"email":true,"whatsapp":false}' },
      }),
    } as unknown as GlobalSettingsService;

    service = new CommunicationService(
      smsService,
      openWaService,
      eventBus,
      smsUsageService,
      globalSettingsService
    );
  });

  it('blocks whatsapp when disabled and no bypass flag is set', async () => {
    const result = await service.send({
      channel: 'whatsapp',
      recipient: '0712345678',
      body: 'Test',
      metadata: { purpose: 'admin_notification' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled by platform settings');
    expect(openWaService.sendText).not.toHaveBeenCalled();
  });

  it('allows whatsapp when bypassEnabledCheck is true', async () => {
    const result = await service.send({
      channel: 'whatsapp',
      recipient: '0712345678',
      body: 'Test',
      metadata: { purpose: 'admin_notification', bypassEnabledCheck: true },
    });

    expect(result.success).toBe(true);
    expect(openWaService.sendText).toHaveBeenCalledWith('0712345678', 'Test');
  });

  it('allows whatsapp when enabled in global settings', async () => {
    (globalSettingsService.getSettings as jest.MockedFunction<any>).mockResolvedValue({
      customFields: { communicationChannels: '{"sms":true,"email":true,"whatsapp":true}' },
    });

    const result = await service.send({
      channel: 'whatsapp',
      recipient: '0712345678',
      body: 'Test',
      metadata: { purpose: 'admin_notification' },
    });

    expect(result.success).toBe(true);
    expect(openWaService.sendText).toHaveBeenCalledWith('0712345678', 'Test');
  });
});
