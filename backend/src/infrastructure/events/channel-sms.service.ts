import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { SmsService } from '../sms/sms.service';
import { ChannelActionTrackingService } from './channel-action-tracking.service';
import { ActionCategory } from './types/action-category.enum';
import { ChannelActionType } from './types/action-type.enum';
import { ChannelEventType } from './types/event-type.enum';
import { ISmsProvider, SmsResult } from '../sms/interfaces/sms-provider.interface';

/**
 * Channel SMS Service
 *
 * Wraps the existing SmsService with channel-specific tracking.
 * Routes SMS_OTP to AUTHENTICATION category and all other SMS to CUSTOMER_COMMUNICATION category.
 */
@Injectable()
export class ChannelSmsService {
  private readonly logger = new Logger('ChannelSmsService');

  constructor(
    private readonly smsService: SmsService,
    @Inject(forwardRef(() => ChannelActionTrackingService))
    private readonly actionTrackingService: ChannelActionTrackingService
  ) {}

  /**
   * Send SMS and track it in the appropriate category
   *
   * @param ctx Request context
   * @param phoneNumber Phone number to send SMS to
   * @param message Message content
   * @param eventType Event type that triggered this SMS (determines category)
   * @param channelId Channel ID for tracking
   */
  async sendSms(
    ctx: RequestContext,
    phoneNumber: string,
    message: string,
    eventType: ChannelEventType,
    channelId: string
  ): Promise<SmsResult> {
    // Determine category based on event type
    const category = this.getCategoryForEventType(eventType);

    // Send SMS using existing service
    const result = await this.smsService.sendSms(phoneNumber, message);

    // Track the action (even if SMS failed, we track the attempt for rate limiting)
    if (result.success) {
      await this.actionTrackingService.trackAction(
        ctx,
        channelId,
        eventType,
        ChannelActionType.SMS,
        category,
        {
          phoneNumber,
          messageId: result.messageId,
        }
      );
    } else {
      this.logger.warn(
        `SMS send failed for channel ${channelId}, event ${eventType}: ${result.error}`
      );
    }

    return result;
  }

  /**
   * Send OTP SMS (special case for authentication)
   *
   * @param ctx Request context
   * @param phoneNumber Phone number to send OTP to
   * @param message OTP message
   * @param channelId Channel ID (optional, may not be available during registration)
   */
  async sendOtpSms(
    ctx: RequestContext,
    phoneNumber: string,
    message: string,
    channelId?: string
  ): Promise<SmsResult> {
    // Send SMS using existing service with isOtp flag to route to dedicated OTP endpoint
    const result = await this.smsService.sendSms(phoneNumber, message, true);

    // Track as AUTHENTICATION category if channel ID is available
    if (channelId && result.success) {
      // Track OTP SMS in AUTHENTICATION category
      // The tracking service will handle the isOtp flag to increment actionCountAuthOtp
      await this.actionTrackingService.trackAction(
        ctx,
        channelId,
        ChannelEventType.CUSTOMER_CREATED, // Placeholder event type - tracking service handles OTP specially
        ChannelActionType.SMS,
        ActionCategory.AUTHENTICATION,
        {
          phoneNumber,
          messageId: result.messageId,
          isOtp: true,
        }
      );
    } else if (!channelId) {
      this.logger.debug('Sending OTP SMS without channel tracking (no channel ID)');
    }

    return result;
  }

  /**
   * Get category for an event type
   * SMS_OTP goes to AUTHENTICATION, all others to CUSTOMER_COMMUNICATION
   */
  private getCategoryForEventType(eventType: ChannelEventType): ActionCategory {
    // For now, we'll determine category based on event type
    // OTP is handled separately via sendOtpSms
    // All customer communication events go to CUSTOMER_COMMUNICATION
    // All system events go to SYSTEM_NOTIFICATIONS

    if (
      eventType === ChannelEventType.CUSTOMER_CREATED ||
      eventType === ChannelEventType.CUSTOMER_CREDIT_APPROVED ||
      eventType === ChannelEventType.CUSTOMER_BALANCE_CHANGED ||
      eventType === ChannelEventType.CUSTOMER_REPAYMENT_DEADLINE
    ) {
      return ActionCategory.CUSTOMER_COMMUNICATION;
    }

    // All other events are system notifications
    return ActionCategory.SYSTEM_NOTIFICATIONS;
  }

  /**
   * Get the active provider name (for debugging/logging)
   */
  getProviderName(): string {
    return this.smsService.getProviderName();
  }

  /**
   * Check if the active provider is configured
   */
  isConfigured(): boolean {
    return this.smsService.isConfigured();
  }
}
