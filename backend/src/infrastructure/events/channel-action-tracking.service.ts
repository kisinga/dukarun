import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelService, RequestContext, TransactionalConnection } from '@vendure/core';
import { ActionCategory } from './types/action-category.enum';
import { ChannelActionType } from './types/action-type.enum';
import { ChannelEventType } from './types/event-type.enum';
import { ChannelUpdateHelper } from '../../services/channels/channel-update.helper';

/**
 * Channel Action Tracking Service
 *
 * Tracks all actions per channel, per event type, and per category.
 * Updates channel custom fields with action counts for rate limiting and monitoring.
 */
@Injectable()
export class ChannelActionTrackingService {
  private readonly logger = new Logger('ChannelActionTrackingService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly channelService: ChannelService,
    private readonly channelUpdateHelper: ChannelUpdateHelper
  ) {}

  /**
   * Track an action for a specific event type
   */
  async trackAction(
    ctx: RequestContext,
    channelId: string,
    eventType: ChannelEventType,
    actionType: ChannelActionType,
    category: ActionCategory,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const channel = await this.channelService.findOne(ctx, channelId);
      if (!channel) {
        this.logger.warn(`Channel ${channelId} not found for action tracking`);
        return;
      }

      const customFields = (channel.customFields as any) || {};

      // Special handling for OTP (AUTHENTICATION category)
      if (category === ActionCategory.AUTHENTICATION && metadata?.isOtp) {
        const currentOtpCount = customFields.actionCountAuthOtp || 0;
        customFields.actionCountAuthOtp = currentOtpCount + 1;
      } else {
        // Get the field name for this event type
        const eventFieldName = this.getEventTypeFieldName(eventType);
        if (eventFieldName) {
          const currentCount = customFields[eventFieldName] || 0;
          customFields[eventFieldName] = currentCount + 1;
        }
      }

      const categoryTotalFieldName = this.getCategoryTotalFieldName(category);

      // Increment category total
      if (categoryTotalFieldName) {
        const currentCategoryTotal = customFields[categoryTotalFieldName] || 0;
        customFields[categoryTotalFieldName] = currentCategoryTotal + 1;
      }

      // Increment global total
      const currentGlobalTotal = customFields.actionCountTotal || 0;
      customFields.actionCountTotal = currentGlobalTotal + 1;

      // Update channel
      await this.channelUpdateHelper.updateChannelCustomFields(ctx, channelId, customFields as any);

      this.logger.debug(
        `Tracked action: ${actionType} for event ${eventType} in channel ${channelId} (category: ${category})`
      );
    } catch (error) {
      this.logger.error(
        `Failed to track action for channel ${channelId}, event ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Get action count for a specific event type
   */
  async getEventTypeCount(
    ctx: RequestContext,
    channelId: string,
    eventType: ChannelEventType,
    period?: 'daily' | 'monthly'
  ): Promise<number> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return 0;
    }

    const customFields = (channel.customFields as any) || {};
    const fieldName = this.getEventTypeFieldName(eventType);

    if (!fieldName) {
      return 0;
    }

    return customFields[fieldName] || 0;
  }

  /**
   * Get action count for a category (sum of all event types in category)
   */
  async getCategoryCount(
    ctx: RequestContext,
    channelId: string,
    category: ActionCategory,
    period?: 'daily' | 'monthly'
  ): Promise<number> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return 0;
    }

    const customFields = (channel.customFields as any) || {};
    const fieldName = this.getCategoryTotalFieldName(category);

    if (!fieldName) {
      return 0;
    }

    return customFields[fieldName] || 0;
  }

  /**
   * Check if rate limit is exceeded for a specific event type
   */
  async checkRateLimit(
    ctx: RequestContext,
    channelId: string,
    eventType: ChannelEventType,
    limit?: number
  ): Promise<boolean> {
    if (limit === undefined) {
      return false; // No limit set
    }

    const currentCount = await this.getEventTypeCount(ctx, channelId, eventType);
    return currentCount >= limit;
  }

  /**
   * Check if rate limit is exceeded for a category
   */
  async checkCategoryRateLimit(
    ctx: RequestContext,
    channelId: string,
    category: ActionCategory,
    limit?: number
  ): Promise<boolean> {
    if (limit === undefined) {
      return false; // No limit set
    }

    const currentCount = await this.getCategoryCount(ctx, channelId, category);
    return currentCount >= limit;
  }

  /**
   * Reset action counts for a channel
   */
  async resetCounts(
    ctx: RequestContext,
    channelId: string,
    resetType: 'daily' | 'monthly'
  ): Promise<void> {
    try {
      const channel = await this.channelService.findOne(ctx, channelId);
      if (!channel) {
        return;
      }

      const customFields = (channel.customFields as any) || {};

      // Reset all event type counts
      const eventTypes = Object.values(ChannelEventType);
      for (const eventType of eventTypes) {
        const fieldName = this.getEventTypeFieldName(eventType);
        if (fieldName) {
          customFields[fieldName] = 0;
        }
      }

      // Reset category totals
      customFields.actionCountAuthTotal = 0;
      customFields.actionCountCommTotal = 0;
      customFields.actionCountSysTotal = 0;
      customFields.actionCountTotal = 0;

      // Update reset date and type
      customFields.actionTrackingLastResetDate = new Date();
      customFields.actionTrackingResetType = resetType;

      await this.channelUpdateHelper.updateChannelCustomFields(ctx, channelId, customFields as any);

      this.logger.log(`Reset action counts for channel ${channelId} (${resetType})`);
    } catch (error) {
      this.logger.error(
        `Failed to reset counts for channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Get the custom field name for an event type
   */
  private getEventTypeFieldName(eventType: ChannelEventType): string | null {
    const fieldNameMap: Record<ChannelEventType, string> = {
      [ChannelEventType.ORDER_PAYMENT_SETTLED]: 'actionCountSysOrderPaymentSettled',
      [ChannelEventType.ORDER_FULFILLED]: 'actionCountSysOrderFulfilled',
      [ChannelEventType.ORDER_CANCELLED]: 'actionCountSysOrderCancelled',
      [ChannelEventType.STOCK_LOW_ALERT]: 'actionCountSysStockLowAlert',
      [ChannelEventType.ML_TRAINING_STARTED]: 'actionCountSysMlTrainingStarted',
      [ChannelEventType.ML_TRAINING_PROGRESS]: 'actionCountSysMlTrainingProgress',
      [ChannelEventType.ML_TRAINING_COMPLETED]: 'actionCountSysMlTrainingCompleted',
      [ChannelEventType.ML_TRAINING_FAILED]: 'actionCountSysMlTrainingFailed',
      [ChannelEventType.ML_EXTRACTION_QUEUED]: 'actionCountSysMlExtractionQueued',
      [ChannelEventType.ML_EXTRACTION_STARTED]: 'actionCountSysMlExtractionStarted',
      [ChannelEventType.ML_EXTRACTION_COMPLETED]: 'actionCountSysMlExtractionCompleted',
      [ChannelEventType.ML_EXTRACTION_FAILED]: 'actionCountSysMlExtractionFailed',
      [ChannelEventType.PAYMENT_CONFIRMED]: 'actionCountSysPaymentConfirmed',
      [ChannelEventType.CUSTOMER_CREATED]: 'actionCountCommCustomerCreated',
      [ChannelEventType.CUSTOMER_CREDIT_APPROVED]: 'actionCountCommCreditApproved',
      [ChannelEventType.CUSTOMER_BALANCE_CHANGED]: 'actionCountCommBalanceChanged',
      [ChannelEventType.CUSTOMER_REPAYMENT_DEADLINE]: 'actionCountCommRepaymentDeadline',
      [ChannelEventType.ADMIN_CREATED]: 'actionCountSysAdminCreated',
      [ChannelEventType.ADMIN_UPDATED]: 'actionCountSysAdminUpdated',
      [ChannelEventType.USER_CREATED]: 'actionCountSysUserCreated',
      [ChannelEventType.USER_UPDATED]: 'actionCountSysUserUpdated',
      [ChannelEventType.SUBSCRIPTION_EXPIRING_SOON]: 'actionCountSysSubscriptionExpiringSoon',
      [ChannelEventType.SUBSCRIPTION_EXPIRED]: 'actionCountSysSubscriptionExpired',
      [ChannelEventType.SUBSCRIPTION_RENEWED]: 'actionCountSysSubscriptionRenewed',
      [ChannelEventType.CHANNEL_APPROVED]: 'actionCountSysChannelApproved',
    };

    return fieldNameMap[eventType] || null;
  }

  /**
   * Get the custom field name for a category total
   */
  private getCategoryTotalFieldName(category: ActionCategory): string | null {
    const fieldNameMap: Record<ActionCategory, string> = {
      [ActionCategory.AUTHENTICATION]: 'actionCountAuthTotal',
      [ActionCategory.CUSTOMER_COMMUNICATION]: 'actionCountCommTotal',
      [ActionCategory.SYSTEM_NOTIFICATIONS]: 'actionCountSysTotal',
    };

    return fieldNameMap[category] || null;
  }
}
