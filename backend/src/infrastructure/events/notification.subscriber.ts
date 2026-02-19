import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, RequestContext } from '@vendure/core';
import { ChannelUserService } from '../../services/auth/channel-user.service';
import {
  NotificationService,
  NotificationType,
} from '../../services/notifications/notification.service';
import { AdminNotificationService } from '../../services/notifications/admin-notification.service';
import {
  AdminActionEvent,
  ApprovalRequestEvent,
  ChannelStatusEvent,
  CompanyRegisteredEvent,
  CustomerNotificationEvent,
  DukaHubEvent,
  MLStatusEvent,
  OrderNotificationEvent,
  StockAlertEvent,
  SubscriptionAlertEvent,
} from './custom-events';

/**
 * Notification Subscriber
 *
 * Listens to DukaHub custom events and dispatches notifications.
 * Preference checking happens in NotificationService, keeping this subscriber simple.
 */
@Injectable()
export class NotificationSubscriber implements OnModuleInit {
  private readonly logger = new Logger(NotificationSubscriber.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly notificationService: NotificationService,
    private readonly channelUserService: ChannelUserService,
    private readonly adminNotificationService: AdminNotificationService
  ) {}

  onModuleInit(): void {
    this.logger.log('Initializing NotificationSubscriber...');

    // Subscribe to each event type
    this.eventBus.ofType(OrderNotificationEvent).subscribe(e => this.handleOrder(e));
    this.eventBus.ofType(SubscriptionAlertEvent).subscribe(e => this.handleSubscription(e));
    this.eventBus.ofType(MLStatusEvent).subscribe(e => this.handleMLStatus(e));
    this.eventBus.ofType(AdminActionEvent).subscribe(e => this.handleAdminAction(e));
    this.eventBus.ofType(CustomerNotificationEvent).subscribe(e => this.handleCustomer(e));
    this.eventBus.ofType(ChannelStatusEvent).subscribe(e => this.handleChannelStatus(e));
    this.eventBus.ofType(StockAlertEvent).subscribe(e => this.handleStockAlert(e));
    this.eventBus.ofType(CompanyRegisteredEvent).subscribe(e => this.handleCompanyRegistered(e));
    this.eventBus.ofType(ApprovalRequestEvent).subscribe(e => this.handleApprovalRequest(e));

    this.logger.log('NotificationSubscriber initialized');
  }

  // ============================================================================
  // EVENT HANDLERS
  // Each handler fetches target users and creates notifications.
  // NotificationService handles preference checking internally.
  // ============================================================================

  private async handleOrder(event: OrderNotificationEvent): Promise<void> {
    try {
      const adminIds = await this.getChannelAdmins(event.ctx, event.channelId);
      const titles: Record<string, string> = {
        payment_settled: 'Payment Received',
        fulfilled: 'Order Fulfilled',
        cancelled: 'Order Cancelled',
      };
      const messages: Record<string, string> = {
        payment_settled: `Order #${event.orderCode} payment has been settled`,
        fulfilled: `Order #${event.orderCode} has been fulfilled`,
        cancelled: `Order #${event.orderCode} has been cancelled`,
      };

      for (const userId of adminIds) {
        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId,
          channelId: event.channelId,
          type: NotificationType.ORDER,
          title: titles[event.state] || 'Order Update',
          message: messages[event.state] || `Order #${event.orderCode} status: ${event.state}`,
          data: event.data,
        });
      }
    } catch (error) {
      this.logError('OrderNotificationEvent', error);
    }
  }

  private async handleSubscription(event: SubscriptionAlertEvent): Promise<void> {
    try {
      const adminIds = await this.getChannelAdmins(event.ctx, event.channelId);
      const titles: Record<string, string> = {
        expiring_soon: 'Subscription Expiring Soon',
        expired: 'Subscription Expired',
        renewed: 'Subscription Renewed',
      };
      const messages: Record<string, string> = {
        expiring_soon: `Your subscription expires in ${event.data.daysRemaining || 'a few'} days`,
        expired: 'Your subscription has expired. Please renew to continue.',
        renewed: 'Your subscription has been renewed successfully.',
      };

      for (const userId of adminIds) {
        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId,
          channelId: event.channelId,
          type: NotificationType.PAYMENT,
          title: titles[event.alertType] || 'Subscription Update',
          message: messages[event.alertType] || `Subscription status: ${event.alertType}`,
          data: event.data,
        });
      }
    } catch (error) {
      this.logError('SubscriptionAlertEvent', error);
    }
  }

  private async handleMLStatus(event: MLStatusEvent): Promise<void> {
    try {
      const adminIds = await this.getChannelAdmins(event.ctx, event.channelId);
      const opName = event.operation === 'training' ? 'Training' : 'Extraction';
      const statusMap: Record<string, string> = {
        queued: 'queued',
        started: 'started',
        completed: 'completed successfully',
        failed: 'failed',
      };

      for (const userId of adminIds) {
        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId,
          channelId: event.channelId,
          type: NotificationType.ML_TRAINING,
          title: `ML ${opName} ${event.status === 'completed' ? 'Complete' : event.status.charAt(0).toUpperCase() + event.status.slice(1)}`,
          message: `ML ${opName.toLowerCase()} has ${statusMap[event.status] || event.status}`,
          data: event.data,
        });
      }
    } catch (error) {
      this.logError('MLStatusEvent', error);
    }
  }

  private async handleAdminAction(event: AdminActionEvent): Promise<void> {
    try {
      const adminIds = await this.getChannelAdmins(event.ctx, event.channelId);
      const entityName = event.entity.charAt(0).toUpperCase() + event.entity.slice(1);

      for (const userId of adminIds) {
        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId,
          channelId: event.channelId,
          type: NotificationType.ORDER, // Default type for admin actions
          title: `${entityName} ${event.action}`,
          message: `A ${event.entity} has been ${event.action}`,
          data: event.data,
        });
      }
    } catch (error) {
      this.logError('AdminActionEvent', error);
    }
  }

  private async handleCustomer(event: CustomerNotificationEvent): Promise<void> {
    try {
      // Customer events may target specific users or all admins
      const targetIds = event.data.targetUserId
        ? [event.data.targetUserId]
        : await this.getChannelAdmins(event.ctx, event.channelId);

      const titles: Record<string, string> = {
        created: 'New Customer',
        credit_approved: 'Credit Approved',
        balance_changed: 'Balance Updated',
        repayment_deadline: 'Repayment Reminder',
      };

      for (const userId of targetIds) {
        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId,
          channelId: event.channelId,
          type: NotificationType.PAYMENT,
          title: titles[event.eventType] || 'Customer Update',
          message: event.data.message || `Customer event: ${event.eventType}`,
          data: event.data,
        });
      }
    } catch (error) {
      this.logError('CustomerNotificationEvent', error);
    }
  }

  private async handleChannelStatus(event: ChannelStatusEvent): Promise<void> {
    try {
      const adminIds = await this.getChannelAdmins(event.ctx, event.channelId);

      for (const userId of adminIds) {
        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId,
          channelId: event.channelId,
          type: NotificationType.ORDER,
          title: event.statusChange === 'approved' ? 'Channel Approved' : 'Channel Status Changed',
          message: event.data.message || `Your channel status has been updated`,
          data: event.data,
        });
      }
    } catch (error) {
      this.logError('ChannelStatusEvent', error);
    }
  }

  private async handleStockAlert(event: StockAlertEvent): Promise<void> {
    try {
      const adminIds = await this.getChannelAdmins(event.ctx, event.channelId);

      for (const userId of adminIds) {
        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId,
          channelId: event.channelId,
          type: NotificationType.STOCK,
          title: 'Low Stock Alert',
          message: event.data.message || `Product ${event.productId} is running low on stock`,
          data: event.data,
        });
      }
    } catch (error) {
      this.logError('StockAlertEvent', error);
    }
  }

  private async handleApprovalRequest(event: ApprovalRequestEvent): Promise<void> {
    try {
      const typeLabels: Record<string, string> = {
        overdraft: 'Overdraft',
        customer_credit: 'Customer Credit',
        below_wholesale: 'Below Wholesale Price',
        order_reversal: 'Order Reversal',
      };
      const typeLabel = typeLabels[event.approvalType] || event.approvalType;

      if (event.action === 'created') {
        // Notify all admins except the requester
        const adminIds = await this.getChannelAdmins(event.ctx, event.channelId);
        const targetIds = adminIds.filter(id => id !== event.requestedById);

        for (const userId of targetIds) {
          await this.notificationService.createNotificationIfEnabled(event.ctx, {
            userId,
            channelId: event.channelId,
            type: NotificationType.APPROVAL,
            title: `${typeLabel} Approval Needed`,
            message: `A ${typeLabel.toLowerCase()} approval has been requested. Review it on the Approvals page.`,
            data: {
              approvalId: event.approvalId,
              approvalType: event.approvalType,
              action: event.action,
              navigateTo: '/dashboard/approvals',
            },
          });
        }
      } else {
        // Approved or rejected - notify the requester
        const statusLabel = event.action === 'approved' ? 'approved' : 'rejected';
        const reasonCode = event.data?.rejectionReasonCode as string | undefined;
        const reasonLabel =
          reasonCode &&
          { policy: 'Policy', insufficient_info: 'Insufficient information', other: 'Other' }[
            reasonCode
          ];
        const reasonPrefix = reasonLabel ? ` (${reasonLabel})` : '';
        const message = event.data?.message
          ? `Your ${typeLabel.toLowerCase()} request was ${statusLabel}${reasonPrefix}: ${event.data.message}`
          : `Your ${typeLabel.toLowerCase()} request was ${statusLabel}${reasonPrefix}.`;

        // Determine where to navigate the author (back to the originating form)
        const navigateTo = this.getApprovalSourceRoute(event);

        await this.notificationService.createNotificationIfEnabled(event.ctx, {
          userId: event.requestedById,
          channelId: event.channelId,
          type: NotificationType.APPROVAL,
          title: `${typeLabel} Request ${event.action === 'approved' ? 'Approved' : 'Rejected'}`,
          message,
          data: {
            approvalId: event.approvalId,
            approvalType: event.approvalType,
            action: event.action,
            isAuthorNotification: true,
            navigateTo,
          },
        });
      }
    } catch (error) {
      this.logError('ApprovalRequestEvent', error);
    }
  }

  /**
   * Determine the navigation route for approval author notifications.
   */
  private getApprovalSourceRoute(event: ApprovalRequestEvent): string {
    const routes: Record<string, string> = {
      overdraft: '/dashboard/purchases/create',
      customer_credit: '/dashboard/customers/create',
      below_wholesale: '/dashboard/sell',
      order_reversal: '/dashboard/orders',
    };
    const base = routes[event.approvalType] || '/dashboard/approvals';
    return `${base}?approvalId=${event.approvalId}`;
  }

  // ============================================================================
  // PLATFORM-LEVEL EVENT HANDLERS
  // These events notify platform admins (not channel-scoped)
  // ============================================================================

  private async handleCompanyRegistered(event: CompanyRegisteredEvent): Promise<void> {
    try {
      this.logger.log(`New company registered: ${event.companyDetails.companyName}`);
      await this.adminNotificationService.sendCompanyRegisteredNotification(
        event.ctx,
        event.companyDetails
      );
    } catch (error) {
      this.logError('CompanyRegisteredEvent', error);
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getChannelAdmins(ctx: RequestContext, channelId: string): Promise<string[]> {
    return this.channelUserService.getChannelAdminUserIds(ctx, channelId, {
      includeSuperAdmins: true,
    });
  }

  private logError(eventType: string, error: unknown): void {
    this.logger.error(
      `Failed to handle ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined
    );
  }
}
