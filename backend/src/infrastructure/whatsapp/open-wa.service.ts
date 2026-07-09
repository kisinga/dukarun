import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { env } from '../config/environment.config';
import type { DeliveryResult, DeliveryErrorCode } from '../communication/send-request.types';
import { formatPhoneNumber, isMobilePhoneNumber } from '../../utils/phone.utils';

const SEND_TEXT_PATH = '/api/sessions/:session/messages/send-text';
const REQUEST_TIMEOUT_MS = 10000;

interface OpenWaSendTextResponse {
  id?: string;
  messageId?: string;
  key?: { id?: string };
  [key: string]: unknown;
}

@Injectable()
export class OpenWaService {
  private readonly logger = new Logger(OpenWaService.name);

  private isConfigured(): boolean {
    return Boolean(
      env.whatsapp.openWaBaseUrl && env.whatsapp.openWaApiKey && env.whatsapp.openWaSession
    );
  }

  async sendText(phoneNumber: string, message: string): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return this.fail(
        'OpenWA is not configured. Set OPENWA_BASE_URL, OPENWA_API_KEY, and OPENWA_SESSION.',
        'not_configured'
      );
    }

    let recipient: string;
    try {
      recipient = this.toWhatsAppChatId(phoneNumber);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Invalid WhatsApp recipient: ${errMsg}`);
      return this.fail(errMsg, 'invalid_recipient');
    }

    try {
      const url = this.buildSendTextUrl();
      const body = this.buildRequestBody(recipient, message);

      const response = await axios.post<OpenWaSendTextResponse>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': env.whatsapp.openWaApiKey,
        },
        timeout: REQUEST_TIMEOUT_MS,
      });

      const messageId =
        response.data?.messageId ?? response.data?.id ?? response.data?.key?.id ?? undefined;
      this.logger.log(`WhatsApp notification sent via OpenWA to ${this.maskChatId(recipient)}`);
      return { success: true, channel: 'whatsapp', messageId };
    } catch (error) {
      const isAxios = axios.isAxiosError(error);
      const errMsg = isAxios
        ? this.formatAxiosError(error)
        : error instanceof Error
          ? error.message
          : String(error);
      const code: DeliveryErrorCode =
        isAxios && error.response?.status ? 'gateway_error' : isAxios ? 'network_error' : 'unknown';
      this.logger.error(
        `OpenWA send failed for ${this.maskChatId(recipient)}: ${errMsg}`,
        error instanceof Error ? error : undefined
      );
      return this.fail(errMsg, code);
    }
  }

  private buildSendTextUrl(): string {
    const baseUrl = env.whatsapp.openWaBaseUrl.replace(/\/+$/, '');
    const path = SEND_TEXT_PATH.replace(':session', encodeURIComponent(env.whatsapp.openWaSession));
    return `${baseUrl}${path}`;
  }

  private buildRequestBody(chatId: string, text: string): Record<string, string> {
    return { chatId, text };
  }

  private toWhatsAppChatId(phoneNumber: string): string {
    const normalized = formatPhoneNumber(phoneNumber);
    if (!isMobilePhoneNumber(normalized)) {
      throw new Error(`WhatsApp requires a mobile number. Received: ${phoneNumber}`);
    }
    return `254${normalized.substring(1)}@s.whatsapp.net`;
  }

  private maskChatId(chatId: string): string {
    const [user, host] = chatId.split('@');
    if (!user || user.length <= 8) return chatId;
    const masked = `${user.slice(0, 4)}****${user.slice(-4)}`;
    return host ? `${masked}@${host}` : masked;
  }

  private formatAxiosError(error: AxiosError): string {
    const status = error.response?.status;
    const responseData =
      typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {});
    return status ? `OpenWA HTTP ${status}: ${responseData}` : error.message;
  }

  private fail(error: string, errorCode: DeliveryErrorCode): DeliveryResult {
    return { success: false, channel: 'whatsapp', error, errorCode };
  }
}
