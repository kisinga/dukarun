import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ChannelSmsService } from '../channel-sms.service';
import { PhoneNumberResolver } from '../utils/phone-number-resolver';
import { ActionCategory } from '../types/action-category.enum';
import { ChannelActionType } from '../types/action-type.enum';
import { ChannelEventType } from '../types/event-type.enum';
import { ActionConfig, ActionResult, ChannelEvent } from '../types/channel-event.interface';
import { IChannelActionHandler } from './action-handler.interface';

/**
 * SMS Action Handler
 *
 * Sends SMS notifications using the ChannelSmsService.
 * Uses PhoneNumberResolver for consistent phone number resolution.
 */
@Injectable()
export class SmsActionHandler implements IChannelActionHandler {
  type = ChannelActionType.SMS;
  category = ActionCategory.CUSTOMER_COMMUNICATION; // Can be any category
  private readonly logger = new Logger('SmsActionHandler');

  constructor(
    @Inject(forwardRef(() => ChannelSmsService))
    private readonly channelSmsService: ChannelSmsService,
    private readonly phoneNumberResolver: PhoneNumberResolver
  ) {}

  async execute(
    ctx: RequestContext,
    event: ChannelEvent,
    config: ActionConfig
  ): Promise<ActionResult> {
    try {
      // Use centralized phone number resolver
      const phoneNumber = await this.phoneNumberResolver.resolvePhoneNumber(ctx, event);

      if (!phoneNumber) {
        return {
          success: false,
          actionType: this.type,
          error: 'No phone number available for SMS',
        };
      }

      const message = this.getMessageForEvent(event);

      const result = await this.channelSmsService.sendSms(
        ctx,
        phoneNumber,
        message,
        event.type as ChannelEventType,
        event.channelId
      );

      return {
        success: result.success,
        actionType: this.type,
        error: result.error,
        metadata: {
          messageId: result.messageId,
          phoneNumber,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to send SMS for event ${event.type}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      return {
        success: false,
        actionType: this.type,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  canHandle(event: ChannelEvent): boolean {
    // Use PhoneNumberResolver to check if phone number can be resolved
    // This ensures canHandle and execute are aligned
    return this.phoneNumberResolver.canResolve(event);
  }

  private getMessageForEvent(event: ChannelEvent): string {
    const messageMap: Record<string, (data: any) => string> = {
      customer_created: () => 'Welcome! Your account has been created.',
      customer_credit_approved: data =>
        `Your credit account has been approved. Credit limit: ${data.creditLimit || 'N/A'}`,
      customer_balance_changed: data =>
        `Your outstanding balance has changed to: ${data.outstandingAmount || 'N/A'}`,
      customer_repayment_deadline: data =>
        `Reminder: Your repayment deadline is approaching. Outstanding: ${data.outstandingAmount || 'N/A'}`,
      order_payment_settled: data => `Order #${data.orderCode || 'N/A'} payment has been settled`,
      order_fulfilled: data => `Order #${data.orderCode || 'N/A'} has been fulfilled`,
      order_cancelled: data => `Order #${data.orderCode || 'N/A'} has been cancelled`,
      channel_approved: data =>
        `Hi ${data.adminName || 'there'}! ${data.companyName || 'Your company'} has been approved. Welcome to DukaRun!`,
    };

    const messageFn = messageMap[event.type];
    if (messageFn) {
      return messageFn(event.data || {});
    }

    return `Notification: ${event.type}`;
  }
}
