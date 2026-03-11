import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, RequestContext } from '@vendure/core';
import { ChannelUserService } from '../../services/auth/channel-user.service';
import {
  OutboundDeliveryService,
  type OutboundPayload,
} from '../../services/notifications/outbound-delivery.service';
import {
  AdminActionEvent,
  ApprovalRequestEvent,
  ChannelStatusEvent,
  CompanyRegisteredEvent,
  CustomerNotificationEvent,
  OrderNotificationEvent,
  MLStatusEvent,
  ShiftSessionEvent,
  StockAlertEvent,
  SubscriptionAlertEvent,
} from './custom-events';

/**
 * Notification Subscriber
 *
 * Listens to DukaHub custom events and dispatches via the single outbound delivery path.
 * Each handler maps the event to trigger key(s) + payload and calls OutboundDeliveryService.deliver.
 */
@Injectable()
export class NotificationSubscriber implements OnModuleInit {
  private readonly logger = new Logger(NotificationSubscriber.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly channelUserService: ChannelUserService,
    private readonly outboundDelivery: OutboundDeliveryService
  ) {}

  onModuleInit(): void {
    this.logger.log('Initializing NotificationSubscriber...');

    this.eventBus.ofType(OrderNotificationEvent).subscribe(e => this.handleOrder(e));
    this.eventBus.ofType(SubscriptionAlertEvent).subscribe(e => this.handleSubscription(e));
    this.eventBus.ofType(MLStatusEvent).subscribe(e => this.handleMLStatus(e));
    this.eventBus.ofType(AdminActionEvent).subscribe(e => this.handleAdminAction(e));
    this.eventBus.ofType(CustomerNotificationEvent).subscribe(e => this.handleCustomer(e));
    this.eventBus.ofType(ChannelStatusEvent).subscribe(e => this.handleChannelStatus(e));
    this.eventBus.ofType(StockAlertEvent).subscribe(e => this.handleStockAlert(e));
    this.eventBus.ofType(CompanyRegisteredEvent).subscribe(e => this.handleCompanyRegistered(e));
    this.eventBus.ofType(ApprovalRequestEvent).subscribe(e => this.handleApprovalRequest(e));
    this.eventBus.ofType(ShiftSessionEvent).subscribe(e => this.handleShiftSession(e));

    this.logger.log('NotificationSubscriber initialized');
  }

  private async handleOrder(event: OrderNotificationEvent): Promise<void> {
    try {
      const triggerKey =
        event.state === 'payment_settled'
          ? 'order_payment_settled'
          : event.state === 'fulfilled'
            ? 'order_fulfilled'
            : 'order_cancelled';
      await this.outboundDelivery.deliver(event.ctx, triggerKey, {
        ...event.data,
        channelId: event.channelId,
        orderCode: event.orderCode,
      });
    } catch (error) {
      this.logError('OrderNotificationEvent', error);
    }
  }

  private async handleSubscription(event: SubscriptionAlertEvent): Promise<void> {
    try {
      // Disabled: trial/subscription expired notification is inaccurate and triggers wrongly
      if (event.alertType === 'expired') {
        return;
      }
      const triggerKey =
        event.alertType === 'expiring_soon' ? 'subscription_expiring_soon' : 'subscription_renewed';
      await this.outboundDelivery.deliver(event.ctx, triggerKey, {
        ...event.data,
        channelId: event.channelId,
        daysRemaining: event.data.daysRemaining,
        company: event.data.company,
      });
    } catch (error) {
      this.logError('SubscriptionAlertEvent', error);
    }
  }

  private async handleMLStatus(event: MLStatusEvent): Promise<void> {
    try {
      await this.outboundDelivery.deliver(event.ctx, 'ml_status', {
        ...event.data,
        channelId: event.channelId,
        operation: event.operation,
        status: event.status,
      });
    } catch (error) {
      this.logError('MLStatusEvent', error);
    }
  }

  private async handleAdminAction(event: AdminActionEvent): Promise<void> {
    try {
      await this.outboundDelivery.deliver(event.ctx, 'admin_action', {
        ...event.data,
        channelId: event.channelId,
        entity: event.entity,
        action: event.action,
      });
    } catch (error) {
      this.logError('AdminActionEvent', error);
    }
  }

  private async handleCustomer(event: CustomerNotificationEvent): Promise<void> {
    try {
      const basePayload: OutboundPayload = {
        ...event.data,
        channelId: event.channelId,
        customerId: event.customerId,
        targetUserIds: event.data.targetUserId ? [event.data.targetUserId] : undefined,
      };

      if (event.eventType === 'balance_changed') {
        await this.outboundDelivery.deliver(event.ctx, 'balance_changed_admin', basePayload);
        await this.outboundDelivery.deliver(event.ctx, 'balance_changed', {
          ...basePayload,
          newBalanceCents: Math.round((event.data.outstandingAmount ?? 0) * 100),
          oldBalanceCents: Math.round((event.data.oldBalance ?? 0) * 100),
        });
        return;
      }

      const triggerKey =
        event.eventType === 'created'
          ? 'customer_created'
          : event.eventType === 'credit_approved'
            ? 'credit_approved'
            : event.eventType === 'repayment_deadline'
              ? 'repayment_deadline'
              : 'balance_changed_admin';
      await this.outboundDelivery.deliver(event.ctx, triggerKey, basePayload);
    } catch (error) {
      this.logError('CustomerNotificationEvent', error);
    }
  }

  private async handleChannelStatus(event: ChannelStatusEvent): Promise<void> {
    try {
      const triggerKey =
        event.statusChange === 'approved' ? 'channel_approved' : 'channel_status_changed';
      await this.outboundDelivery.deliver(event.ctx, triggerKey, {
        ...event.data,
        channelId: event.channelId,
        message: event.data.message,
      });
    } catch (error) {
      this.logError('ChannelStatusEvent', error);
    }
  }

  private async handleStockAlert(event: StockAlertEvent): Promise<void> {
    try {
      await this.outboundDelivery.deliver(event.ctx, 'stock_low', {
        ...event.data,
        channelId: event.channelId,
        productId: event.productId,
        message: event.data.message,
      });
    } catch (error) {
      this.logError('StockAlertEvent', error);
    }
  }

  private async handleCompanyRegistered(event: CompanyRegisteredEvent): Promise<void> {
    try {
      this.logger.log(`New company registered: ${event.companyDetails.companyName}`);
      await this.outboundDelivery.deliver(event.ctx, 'company_registered', {
        ...event.companyDetails,
        channelId: event.companyDetails.channelId,
      });
    } catch (error) {
      this.logError('CompanyRegisteredEvent', error);
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
      const typeLabel = typeLabels[event.approvalType] ?? event.approvalType;
      const routes: Record<string, string> = {
        overdraft: '/dashboard/purchases/create',
        customer_credit: '/dashboard/customers/create',
        below_wholesale: '/dashboard/sell',
        order_reversal: '/dashboard/orders',
      };
      const baseRoute = routes[event.approvalType] ?? '/dashboard/approvals';
      const navigateTo = `${baseRoute}?approvalId=${event.approvalId}`;

      if (event.action === 'created') {
        const adminIds = await this.channelUserService.getChannelAdminUserIds(
          event.ctx,
          event.channelId,
          { includeSuperAdmins: true }
        );
        const targetIds = adminIds.filter(id => id !== event.requestedById);
        await this.outboundDelivery.deliver(event.ctx, 'approval_created', {
          channelId: event.channelId,
          approvalId: event.approvalId,
          approvalType: event.approvalType,
          action: event.action,
          targetUserIds: targetIds,
          navigateTo: '/dashboard/approvals',
        });
      } else {
        await this.outboundDelivery.deliver(event.ctx, 'approval_resolved', {
          channelId: event.channelId,
          approvalId: event.approvalId,
          approvalType: event.approvalType,
          action: event.action,
          targetUserIds: [event.requestedById],
          message: event.data?.message,
          rejectionReasonCode: event.data?.rejectionReasonCode,
          navigateTo,
        });
      }
    } catch (error) {
      this.logError('ApprovalRequestEvent', error);
    }
  }

  private async handleShiftSession(event: ShiftSessionEvent): Promise<void> {
    try {
      const triggerKey = event.action === 'opened' ? 'shift_opened' : 'shift_closed';
      await this.outboundDelivery.deliver(event.ctx, triggerKey, {
        ...event.data,
        channelId: event.channelId,
        sessionId: event.sessionId,
      });
    } catch (error) {
      this.logError('ShiftSessionEvent', error);
    }
  }

  private logError(eventType: string, error: unknown): void {
    this.logger.error(
      `Failed to handle ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined
    );
  }
}
