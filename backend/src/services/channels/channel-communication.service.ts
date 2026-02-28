import { Injectable, Logger } from '@nestjs/common';
import { Customer, CustomerService, EventBus, RequestContext } from '@vendure/core';
import { CustomerNotificationEvent } from '../../infrastructure/events/custom-events';
import { AccountNotificationDeliveryService } from './account-notification-delivery.service';

/**
 * Channel Communication Service
 *
 * Business logic service for credit-related customer communications.
 * Handles sending notifications for credit events (approval, balance changes, repayment deadlines).
 * Balance-change notifications are delivered to the customer via SMS/email (AccountNotificationDeliveryService).
 */
@Injectable()
export class ChannelCommunicationService {
  private readonly logger = new Logger('ChannelCommunicationService');

  constructor(
    private readonly customerService: CustomerService,
    private readonly eventBus: EventBus,
    private readonly accountNotificationDelivery: AccountNotificationDeliveryService
  ) {}

  /**
   * Send account created notification
   */
  async sendAccountCreatedNotification(ctx: RequestContext, customerId: string): Promise<void> {
    try {
      const customer = await this.customerService.findOne(ctx, customerId);
      if (!customer) {
        this.logger.warn(`Customer ${customerId} not found for account created notification`);
        return;
      }

      const channelId = ctx.channelId?.toString();
      if (!channelId) {
        this.logger.warn(`No channel ID in context for customer ${customerId}`);
        return;
      }

      this.eventBus.publish(
        new CustomerNotificationEvent(ctx, channelId, 'created', customerId, {
          customerName: customer.firstName + ' ' + customer.lastName,
          targetUserId: customer.user?.id?.toString(),
        })
      );

      this.logger.log(`Sent account created notification for customer ${customerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send account created notification for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Send account approved notification
   */
  async sendAccountApprovedNotification(
    ctx: RequestContext,
    customerId: string,
    creditLimit?: number,
    creditDuration?: number
  ): Promise<void> {
    try {
      const customer = await this.customerService.findOne(ctx, customerId);
      if (!customer) {
        this.logger.warn(`Customer ${customerId} not found for approval notification`);
        return;
      }

      const channelId = ctx.channelId?.toString();
      if (!channelId) {
        this.logger.warn(`No channel ID in context for customer ${customerId}`);
        return;
      }

      const customFields = (customer.customFields as any) || {};
      const finalCreditLimit = creditLimit ?? customFields.creditLimit ?? 0;

      this.eventBus.publish(
        new CustomerNotificationEvent(ctx, channelId, 'credit_approved', customerId, {
          creditLimit: finalCreditLimit,
          creditDuration: creditDuration ?? customFields.creditDuration ?? 30,
          targetUserId: customer.user?.id?.toString(),
        })
      );

      this.logger.log(`Sent account approved notification for customer ${customerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send account approved notification for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Send starting balance notification (in-app event + SMS/email to customer).
   */
  async sendStartingBalanceNotification(ctx: RequestContext, customerId: string): Promise<void> {
    try {
      const customer = await this.customerService.findOne(ctx, customerId);
      if (!customer) {
        return;
      }

      const customFields = (customer.customFields as any) || {};
      const outstandingAmount = customFields.outstandingAmount ?? 0;

      if (outstandingAmount === 0) {
        return; // No balance to notify about
      }

      const channelId = ctx.channelId?.toString();
      if (!channelId) {
        return;
      }

      this.eventBus.publish(
        new CustomerNotificationEvent(ctx, channelId, 'balance_changed', customerId, {
          outstandingAmount,
          isStartingBalance: true,
          targetUserId: customer.user?.id?.toString(),
        })
      );

      const amountCents = Math.round(Number(outstandingAmount));
      await this.accountNotificationDelivery.deliverBalanceChange(
        ctx,
        channelId,
        'customer',
        customerId,
        { oldBalanceCents: 0, newBalanceCents: amountCents }
      );

      this.logger.log(`Sent starting balance notification for customer ${customerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send starting balance notification for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Send balance change notification (in-app event + SMS/email to customer via AccountNotificationDeliveryService).
   */
  async sendBalanceChangeNotification(
    ctx: RequestContext,
    customerId: string,
    oldBalance: number,
    newBalance: number
  ): Promise<void> {
    try {
      // Only send if balance changed significantly (avoid spam)
      if (Math.abs(newBalance - oldBalance) < 0.01) {
        return;
      }

      const customer = await this.customerService.findOne(ctx, customerId);
      if (!customer) {
        return;
      }

      const channelId = ctx.channelId?.toString();
      if (!channelId) {
        return;
      }

      this.eventBus.publish(
        new CustomerNotificationEvent(ctx, channelId, 'balance_changed', customerId, {
          outstandingAmount: newBalance,
          oldBalance,
          change: newBalance - oldBalance,
          targetUserId: customer.user?.id?.toString(),
        })
      );

      await this.accountNotificationDelivery.deliverBalanceChange(
        ctx,
        channelId,
        'customer',
        customerId,
        { oldBalanceCents: Math.round(oldBalance), newBalanceCents: Math.round(newBalance) }
      );

      this.logger.log(
        `Sent balance change notification for customer ${customerId}: ${oldBalance} -> ${newBalance}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send balance change notification for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Send repayment deadline notification
   *
   * Checks both:
   * - creditDuration days after last repayment date
   * - When outstanding balance exceeds threshold (e.g., 80% of credit limit)
   */
  async sendRepaymentDeadlineNotification(ctx: RequestContext, customerId: string): Promise<void> {
    try {
      const customer = await this.customerService.findOne(ctx, customerId);
      if (!customer) {
        return;
      }

      const customFields = (customer.customFields as any) || {};
      const outstandingAmount = Math.abs(customFields.outstandingAmount ?? 0);
      const creditLimit = customFields.creditLimit ?? 0;
      const creditDuration = customFields.creditDuration ?? 30;
      const lastRepaymentDate = customFields.lastRepaymentDate
        ? new Date(customFields.lastRepaymentDate)
        : null;

      // Check if balance exceeds threshold (80% of credit limit)
      const threshold = creditLimit * 0.8;
      const exceedsThreshold = outstandingAmount >= threshold;

      // Check if deadline is approaching (within 3 days)
      let deadlineApproaching = false;
      if (lastRepaymentDate) {
        const deadlineDate = new Date(lastRepaymentDate);
        deadlineDate.setDate(deadlineDate.getDate() + creditDuration);
        const daysUntilDeadline = Math.ceil(
          (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        deadlineApproaching = daysUntilDeadline <= 3 && daysUntilDeadline >= 0;
      }

      // Send notification if either condition is met
      if (exceedsThreshold || deadlineApproaching) {
        const channelId = ctx.channelId?.toString();
        if (!channelId) {
          return;
        }

        this.eventBus.publish(
          new CustomerNotificationEvent(ctx, channelId, 'repayment_deadline', customerId, {
            outstandingAmount,
            creditLimit,
            creditDuration,
            lastRepaymentDate: lastRepaymentDate?.toISOString(),
            exceedsThreshold,
            deadlineApproaching,
            targetUserId: customer.user?.id?.toString(),
          })
        );

        this.logger.log(`Sent repayment deadline notification for customer ${customerId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send repayment deadline notification for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
}
