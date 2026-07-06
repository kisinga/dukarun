import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { env } from '../config/environment.config';
import type { DeliveryResult } from '../communication/send-request.types';
import { formatPhoneNumber } from '../../utils/phone.utils';

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

  isConfigured(): boolean {
    return Boolean(
      env.whatsapp.openWaBaseUrl && env.whatsapp.openWaApiKey && env.whatsapp.openWaSession
    );
  }

  async sendText(phoneNumber: string, message: string): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        channel: 'whatsapp',
        error: 'OpenWA is not configured. Set OPENWA_BASE_URL, OPENWA_API_KEY, and OPENWA_SESSION.',
      };
    }

    try {
      const recipient = this.toWhatsAppChatId(phoneNumber);
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
      this.logger.log(`WhatsApp notification sent via OpenWA to ${recipient}`);
      return { success: true, channel: 'whatsapp', messageId };
    } catch (error) {
      const errMsg = axios.isAxiosError(error)
        ? this.formatAxiosError(error)
        : error instanceof Error
          ? error.message
          : String(error);
      this.logger.error(
        `OpenWA send failed: ${errMsg}`,
        error instanceof Error ? error : undefined
      );
      return { success: false, channel: 'whatsapp', error: errMsg };
    }
  }

  private buildSendTextUrl(): string {
    const baseUrl = env.whatsapp.openWaBaseUrl.replace(/\/+$/, '');
    const path = SEND_TEXT_PATH.replace(':session', encodeURIComponent(env.whatsapp.openWaSession));
    return `${baseUrl}${path}`;
  }

  private buildRequestBody(to: string, text: string): Record<string, string> {
    return { to, text };
  }

  private toWhatsAppChatId(phoneNumber: string): string {
    const normalized = formatPhoneNumber(phoneNumber);
    // WhatsApp requires a mobile number. Kenyan mobiles are 07XXXXXXXX or 01XXXXXXXX.
    if (!/^0[17]\d{8}$/.test(normalized)) {
      throw new Error(`WhatsApp requires a mobile number. Received: ${phoneNumber}`);
    }
    return `254${normalized.substring(1)}@s.whatsapp.net`;
  }

  private formatAxiosError(error: AxiosError): string {
    const status = error.response?.status;
    const responseData =
      typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {});
    return status ? `OpenWA HTTP ${status}: ${responseData}` : error.message;
  }
}
