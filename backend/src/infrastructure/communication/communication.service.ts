import { Injectable, Logger } from '@nestjs/common';
import { EventBus, RequestContext } from '@vendure/core';
import { env } from '../config/environment.config';
import { SmsService } from '../sms/sms.service';
import { SmsUsageService } from '../../services/sms/sms-usage.service';
import { maskEmail } from '../../utils/email.utils';
import { isSentinelEmail } from '../../utils/email.utils';
import { OtpEmailEvent } from '../events/otp-email.event';
import { resolveSmsCategory, isCountedCategory } from '../../domain/sms-categories';
import { CommunicationChannel, DeliveryResult, SendRequest } from './send-request.types';

/** Max SMS body length (GSM 7-bit single segment). */
const SMS_MAX_LENGTH = 160;

/**
 * Communication Service
 *
 * Single entry point for all delivery (SMS, email). Applies one dev gate: log payload first,
 * then optionally skip real send. Channel-scoped SMS is subject to per-tier limits (SmsUsageService).
 * SMS body is limited to 160 characters. OTP and platform-level SMS (no channelId) are not counted against channel limits.
 */
@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly eventBus: EventBus,
    private readonly smsUsageService: SmsUsageService
  ) {}

  /**
   * Whether communication dev mode is active (log payload first, optionally skip send).
   */
  isDevMode(): boolean {
    return env.communication.devMode;
  }

  /**
   * Check if a channel is enabled (for transport availability).
   */
  isChannelEnabled(channel: CommunicationChannel): boolean {
    return env.communication.channels[channel];
  }

  /**
   * Send a message via the requested channel. Applies dev gate first: in dev mode logs
   * payload (e.g. OTP) to console, then either skips send or delegates to SMS/email.
   */
  async send(request: SendRequest): Promise<DeliveryResult> {
    const { channel, recipient, body, ctx, metadata } = request;

    // Dev gate: log payload first (so OTP/message is always visible in dev)
    if (env.communication.devMode) {
      const bodyStr =
        typeof body === 'string'
          ? body
          : ((body as Record<string, unknown>)?.otp ?? JSON.stringify(body));
      const purpose = metadata?.purpose ?? 'message';
      if (channel === 'sms') {
        this.logger.warn(
          `[COMMUNICATION DEV] ${purpose} | channel=sms | to=${recipient} | body=${bodyStr}`
        );
      } else {
        this.logger.warn(
          `[COMMUNICATION DEV] ${purpose} | channel=email | to=${maskEmail(recipient)} | body=${bodyStr}`
        );
      }
    }

    // In dev mode, skip real send (log only)
    if (env.communication.devMode) {
      this.logger.log('[COMMUNICATION DEV] Skipping real send');
      return { success: true, channel };
    }

    if (channel === 'sms') {
      const message =
        typeof body === 'string' ? body : String((body as Record<string, unknown>)?.otp ?? body);
      if (message.length > SMS_MAX_LENGTH) {
        const errMsg = `SMS body exceeds ${SMS_MAX_LENGTH} characters (got ${message.length}). Message rejected.`;
        this.logger.error(errMsg, new Error('SMS_LENGTH_EXCEEDED'));
        return { success: false, channel: 'sms', error: errMsg };
      }
      const smsCategory = resolveSmsCategory(metadata?.purpose, request.smsCategory);
      const isCounted = isCountedCategory(smsCategory);
      const channelId = request.channelId ?? request.ctx?.channelId?.toString();
      if (isCounted && channelId && request.ctx) {
        const { allowed, reason } = await this.smsUsageService.canSendSms(request.ctx, channelId);
        if (!allowed) {
          this.logger.warn(`SMS not sent (quota limit): channel=${channelId} - ${reason}`);
          return { success: false, channel: 'sms', error: reason };
        }
      }
      const result = await this.sendSms(recipient, message, smsCategory === 'OTP');
      if (!result.success && result.error) {
        this.logger.error(
          `SMS delivery failed to ${recipient}: ${result.error}`,
          new Error(result.error)
        );
      }
      if (result.success && isCounted && channelId && request.ctx) {
        await this.smsUsageService.recordSmsSent(request.ctx, channelId, smsCategory);
      }
      return result;
    }

    return this.sendEmail(recipient, body, ctx, request.template);
  }

  /**
   * Send SMS via SmsService (single facade; no dev mock here - handled above).
   */
  async sendSms(phoneNumber: string, message: string, isOtp = false): Promise<DeliveryResult> {
    try {
      const result = await this.smsService.sendSms(phoneNumber, message, isOtp);
      return {
        success: result.success,
        channel: 'sms',
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `SMS send error to ${phoneNumber}: ${errMsg}`,
        error instanceof Error ? error : new Error(errMsg)
      );
      return { success: false, channel: 'sms', error: errMsg };
    }
  }

  /**
   * Send OTP email by publishing OtpEmailEvent (EmailPlugin handler sends the email).
   * Call this from the communication layer so dev gating is applied before publish.
   */
  async sendOtpEmail(
    email: string,
    otp: string,
    ctx: RequestContext | undefined
  ): Promise<DeliveryResult> {
    if (!ctx) {
      this.logger.error('Cannot send OTP email without RequestContext');
      return { success: false, channel: 'email', error: 'Missing RequestContext' };
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      this.logger.error(
        `Invalid email address: ${typeof email === 'string' ? maskEmail(email) : typeof email}`
      );
      return { success: false, channel: 'email', error: 'Invalid email' };
    }
    if (isSentinelEmail(email)) {
      this.logger.log(`Skipping OTP email for sentinel address: ${maskEmail(email)}`);
      return { success: true, channel: 'email' };
    }
    try {
      this.eventBus.publish(new OtpEmailEvent(ctx, email, otp));
      return { success: true, channel: 'email' };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`OTP email publish error for ${maskEmail(email)}: ${errMsg}`, error);
      return { success: false, channel: 'email', error: errMsg };
    }
  }

  /**
   * Send email: for OTP we use sendOtpEmail; generic email can be extended later.
   */
  private async sendEmail(
    recipient: string,
    body: string | Record<string, unknown>,
    ctx: RequestContext | undefined,
    template?: string
  ): Promise<DeliveryResult> {
    // OTP email: body is the OTP string (or { otp } for consistency)
    const otpStr =
      typeof body === 'string'
        ? body
        : ((body as Record<string, unknown>)?.otp as string | undefined);
    if (template === 'otp' || (typeof otpStr === 'string' && otpStr.length === 6)) {
      return this.sendOtpEmail(recipient, typeof body === 'string' ? body : (otpStr ?? ''), ctx);
    }
    // Future: generic email template dispatch
    this.logger.warn(
      'Unsupported email template; only OTP email is implemented via CommunicationService'
    );
    return { success: false, channel: 'email', error: 'Unsupported email template' };
  }
}
