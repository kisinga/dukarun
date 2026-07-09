import { expect, jest, it, describe, beforeEach } from '@jest/globals';
import axios from 'axios';
import { OpenWaService } from '../../../src/infrastructure/whatsapp/open-wa.service';
import { env } from '../../../src/infrastructure/config/environment.config';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    isAxiosError: jest.fn(),
  },
  AxiosError: class AxiosError extends Error {
    response?: { status?: number; data?: unknown };
    constructor(message: string, response?: { status?: number; data?: unknown }) {
      super(message);
      this.response = response;
    }
  },
}));

jest.mock('../../../src/infrastructure/config/environment.config', () => ({
  env: {
    whatsapp: {
      openWaBaseUrl: '',
      openWaApiKey: '',
      openWaSession: '',
    },
  },
}));

const mockedAxios = axios as any;
const mockedEnv = env as {
  whatsapp: { openWaBaseUrl: string; openWaApiKey: string; openWaSession: string };
};

describe('OpenWaService', () => {
  let service: OpenWaService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnv.whatsapp.openWaBaseUrl = 'https://openwa.example.com';
    mockedEnv.whatsapp.openWaApiKey = 'test-api-key';
    mockedEnv.whatsapp.openWaSession = 'default';
    service = new OpenWaService();
  });

  describe('isConfigured', () => {
    it('returns true when all required config values are set', () => {
      expect((service as any).isConfigured()).toBe(true);
    });

    it('returns false when any required config value is missing', () => {
      mockedEnv.whatsapp.openWaBaseUrl = '';
      expect((service as any).isConfigured()).toBe(false);
    });
  });

  describe('sendText', () => {
    it('returns not_configured when OpenWA is not configured', async () => {
      mockedEnv.whatsapp.openWaBaseUrl = '';
      const result = await service.sendText('0712345678', 'Hello');
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('not_configured');
      expect(result.channel).toBe('whatsapp');
    });

    it('normalizes mobile numbers to WhatsApp chat IDs', async () => {
      mockedAxios.post.mockResolvedValue({ data: { messageId: 'msg-1' } });
      await service.sendText('0712345678', 'Hello');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://openwa.example.com/api/sessions/default/messages/send-text',
        { chatId: '254712345678@s.whatsapp.net', text: 'Hello' },
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key',
          },
          timeout: 10000,
        })
      );
    });

    it.each([['+254712345678'], ['254712345678'], ['712345678']])(
      'normalizes %s to the same WhatsApp chat ID',
      async phone => {
        mockedAxios.post.mockResolvedValue({ data: { messageId: 'msg-1' } });
        await service.sendText(phone, 'Hello');
        const [, body] = mockedAxios.post.mock.calls[0] as [
          string,
          { chatId: string; text: string },
        ];
        expect(body.chatId).toBe('254712345678@s.whatsapp.net');
      }
    );

    it('returns invalid_recipient for landline numbers', async () => {
      const result = await service.sendText('0201234567', 'Hello');
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('invalid_recipient');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns invalid_recipient for email addresses', async () => {
      const result = await service.sendText('customer@example.com', 'Hello');
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('invalid_recipient');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns gateway_error for HTTP error responses', async () => {
      const axiosError = new (jest.requireMock('axios') as any).AxiosError('Request failed', {
        status: 500,
        data: { error: 'Internal error' },
      });
      mockedAxios.post.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const result = await service.sendText('0712345678', 'Hello');
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('gateway_error');
      expect(result.error).toContain('OpenWA HTTP 500');
    });

    it('returns network_error for requests without a response', async () => {
      const axiosError = new (jest.requireMock('axios') as any).AxiosError('Network Error');
      mockedAxios.post.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const result = await service.sendText('0712345678', 'Hello');
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('network_error');
    });

    it('returns messageId on success', async () => {
      mockedAxios.post.mockResolvedValue({ data: { id: 'msg-abc' } });
      const result = await service.sendText('0712345678', 'Hello');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-abc');
    });
  });

  describe('toWhatsAppChatId', () => {
    it.each([
      ['0712345678', '254712345678@s.whatsapp.net'],
      ['+254712345678', '254712345678@s.whatsapp.net'],
      ['254712345678', '254712345678@s.whatsapp.net'],
      ['712345678', '254712345678@s.whatsapp.net'],
      ['0112345678', '254112345678@s.whatsapp.net'],
    ])('normalizes %s to %s', (input, expected) => {
      expect((service as any).toWhatsAppChatId(input)).toBe(expected);
    });

    it.each([['0201234567'], ['customer@example.com'], ['123']])('rejects %s as invalid', input => {
      expect(() => (service as any).toWhatsAppChatId(input)).toThrow();
    });
  });

  describe('maskChatId', () => {
    it.each([
      ['254712345678@s.whatsapp.net', '2547****5678@s.whatsapp.net'],
      ['14155551234@s.whatsapp.net', '1415****1234@s.whatsapp.net'],
      ['short@s.whatsapp.net', 'short@s.whatsapp.net'],
    ])('masks %s as %s', (input, expected) => {
      expect((service as any).maskChatId(input)).toBe(expected);
    });
  });
});
