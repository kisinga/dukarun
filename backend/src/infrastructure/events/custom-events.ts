import { VendureEvent, RequestContext } from '@vendure/core';

/**
 * Base class for all DukaHub custom events.
 *
 * Events are simple data carriers - they just broadcast "something happened".
 * Customization (user preferences, channel config) is handled in the notification layer.
 */
export abstract class DukaHubEvent extends VendureEvent {
  constructor(
    public readonly ctx: RequestContext,
    public readonly channelId: string,
    public readonly data: Record<string, any>
  ) {
    super();
  }
}

/**
 * Order-related notifications (payment settled, fulfilled, cancelled)
 */
export class OrderNotificationEvent extends DukaHubEvent {
  static readonly type = 'order';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly orderCode: string,
    public readonly state: 'payment_settled' | 'fulfilled' | 'cancelled',
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, { orderCode, state, ...data });
  }
}

/**
 * Subscription-related alerts (expiring soon, expired, renewed)
 */
export class SubscriptionAlertEvent extends DukaHubEvent {
  static readonly type = 'subscription';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly alertType: 'expiring_soon' | 'expired' | 'renewed',
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, { alertType, ...data });
  }
}

/**
 * ML training/extraction status updates
 */
export class MLStatusEvent extends DukaHubEvent {
  static readonly type = 'ml_status';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly operation: 'training' | 'extraction',
    public readonly status: 'queued' | 'started' | 'progress' | 'completed' | 'failed',
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, { operation, status, ...data });
  }
}

/**
 * Admin/user action events (created, updated)
 */
export class AdminActionEvent extends DukaHubEvent {
  static readonly type = 'admin_action';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly entity: 'admin' | 'user',
    public readonly action: 'created' | 'updated',
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, { entity, action, ...data });
  }
}

/**
 * Customer-related events (created, credit approved, balance changed)
 */
export class CustomerNotificationEvent extends DukaHubEvent {
  static readonly type = 'customer';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly eventType:
      | 'created'
      | 'credit_approved'
      | 'balance_changed'
      | 'repayment_deadline',
    public readonly customerId: string,
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, { eventType, customerId, ...data });
  }
}

/**
 * Channel-level events (approved, status changed)
 */
export class ChannelStatusEvent extends DukaHubEvent {
  static readonly type = 'channel_status';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly statusChange: 'approved' | 'status_changed',
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, { statusChange, ...data });
  }
}

/**
 * Stock-related alerts
 */
export class StockAlertEvent extends DukaHubEvent {
  static readonly type = 'stock';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly productId: string,
    public readonly alertType: 'low_stock',
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, { productId, alertType, ...data });
  }
}

/**
 * Approval request events (created, approved, rejected)
 * Used to notify admins of pending approvals and authors of decisions.
 */
export class ApprovalRequestEvent extends DukaHubEvent {
  static readonly type = 'approval';

  constructor(
    ctx: RequestContext,
    channelId: string,
    public readonly approvalId: string,
    public readonly approvalType: string,
    public readonly action: 'created' | 'approved' | 'rejected',
    public readonly requestedById: string,
    public readonly reviewedById?: string,
    data: Record<string, any> = {}
  ) {
    super(ctx, channelId, {
      approvalId,
      approvalType,
      action,
      requestedById,
      reviewedById,
      ...data,
    });
  }
}

/**
 * Company registration event
 * Fired when a new company completes registration
 * Used to notify platform admins for approval
 */
export class CompanyRegisteredEvent extends VendureEvent {
  constructor(
    public readonly ctx: RequestContext,
    public readonly companyDetails: {
      companyName: string;
      companyCode: string;
      channelId: string;
      adminName: string;
      adminPhone: string;
      adminEmail?: string;
      storeName: string;
    }
  ) {
    super();
  }
}
