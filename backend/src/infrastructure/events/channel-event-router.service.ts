import { Injectable, Logger, OnModuleInit, Inject, forwardRef, Optional } from '@nestjs/common';
import {
  ChannelService,
  EventBus,
  OrderStateTransitionEvent,
  RequestContext,
  StockMovementEvent,
  UserService,
  TransactionalConnection,
  Role,
  User,
} from '@vendure/core';
import { ChannelActionTrackingService } from './channel-action-tracking.service';
import { IChannelActionHandler } from './handlers/action-handler.interface';
import { InAppActionHandler } from './handlers/in-app-action.handler';
import { PushActionHandler } from './handlers/push-action.handler';
import { SmsActionHandler } from './handlers/sms-action.handler';
import { NotificationPreferenceService } from './notification-preference.service';
import { EVENT_METADATA_MAP } from './config/event-metadata';
import { ActionCategory } from './types/action-category.enum';
import { ChannelActionType } from './types/action-type.enum';
import { ActionConfig, ChannelEvent, ChannelEventConfig } from './types/channel-event.interface';
import { ChannelEventType } from './types/event-type.enum';
import { AuditService } from '../audit/audit.service';
import { UserContextResolver } from '../audit/user-context.resolver';
import { ChannelUserService } from '../../services/auth/channel-user.service';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import { WorkerContextService } from '../utils/worker-context.service';

/**
 * Channel Event Router Service
 *
 * Central router that receives events and routes them to appropriate action handlers.
 * Handles both system events (channel-level) and customer-facing events (user-subscribable).
 */
@Injectable()
export class ChannelEventRouterService implements OnModuleInit {
  private readonly logger = new Logger('ChannelEventRouterService');
  private eventMetadataCache: Map<string, any> | null = null;
  private handlers: Map<ChannelActionType, IChannelActionHandler> = new Map();

  constructor(
    private readonly eventBus: EventBus,
    private readonly channelService: ChannelService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => ChannelActionTrackingService))
    private readonly actionTrackingService: ChannelActionTrackingService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
    private readonly inAppHandler: InAppActionHandler,
    private readonly pushHandler: PushActionHandler,
    private readonly smsHandler: SmsActionHandler,
    private readonly auditService: AuditService,
    private readonly userContextResolver: UserContextResolver,
    private readonly connection: TransactionalConnection,
    private readonly channelUserService: ChannelUserService,
    @Optional()
    @Inject(forwardRef(() => SubscriptionService))
    private readonly subscriptionService?: SubscriptionService,
    @Optional()
    private readonly workerContext?: WorkerContextService
  ) {
    // Register handlers
    this.handlers.set(ChannelActionType.IN_APP_NOTIFICATION, inAppHandler);
    this.handlers.set(ChannelActionType.PUSH_NOTIFICATION, pushHandler);
    this.handlers.set(ChannelActionType.SMS, smsHandler);
  }

  onModuleInit(): void {
    // Subscribe to Vendure events
    // CRITICAL: Wrap async callbacks in try-catch to prevent unhandled promise rejections
    // that can crash the server process
    this.eventBus.ofType(OrderStateTransitionEvent).subscribe(async event => {
      try {
        await this.handleOrderStateTransition(event);
      } catch (error) {
        this.logger.error(
          `Unhandled error in OrderStateTransitionEvent subscription: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );
        // Don't rethrow - prevent server crash
      }
    });

    this.eventBus.ofType(StockMovementEvent).subscribe(async event => {
      try {
        await this.handleStockMovement(event);
      } catch (error) {
        this.logger.error(
          `Unhandled error in StockMovementEvent subscription: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );
        // Don't rethrow - prevent server crash
      }
    });

    // Load event metadata
    this.loadEventMetadata();
  }

  /**
   * Handle order state transition events
   */
  private async handleOrderStateTransition(event: OrderStateTransitionEvent): Promise<void> {
    try {
      const { order, toState } = event;

      // Validate order exists
      if (!order) {
        this.logger.warn('OrderStateTransitionEvent received with no order data');
        return;
      }

      // Safely access channels array with proper optional chaining
      const channelId = order.channels?.[0]?.id?.toString();

      if (!channelId) {
        this.logger.debug(
          `Skipping order state transition event: order ${order.id?.toString() || order.code || 'unknown'} has no channels loaded`
        );
        return;
      }

      let eventType: ChannelEventType | null = null;
      const toStateStr = String(toState);

      switch (toStateStr) {
        case 'PaymentSettled':
          eventType = ChannelEventType.ORDER_PAYMENT_SETTLED;
          break;
        case 'Fulfilled':
          eventType = ChannelEventType.ORDER_FULFILLED;
          break;
        case 'Cancelled':
          eventType = ChannelEventType.ORDER_CANCELLED;
          break;
        default:
          return; // Don't handle other states
      }

      if (eventType) {
        await this.routeEvent({
          type: eventType,
          channelId,
          category: ActionCategory.SYSTEM_NOTIFICATIONS,
          context: event.ctx,
          data: {
            orderId: order.id?.toString() || 'unknown',
            orderCode: order.code || 'unknown',
            toState: toStateStr,
          },
          targetCustomerId: order.customer?.id?.toString(),
          targetUserId: order.customer?.user?.id?.toString(),
        });
      }
    } catch (error) {
      // This catch is a safety net - the subscription wrapper should catch most errors
      // but we log here for additional context
      this.logger.error(
        `Error in handleOrderStateTransition for order ${event.order?.id?.toString() || event.order?.code || 'unknown'}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      // Don't rethrow - let the subscription wrapper handle it
    }
  }

  /**
   * Handle stock movement events
   */
  private async handleStockMovement(event: StockMovementEvent): Promise<void> {
    // For now, skip stock movement notifications
    // Can be implemented later if needed
    this.logger.debug('Stock movement event received (not yet implemented)');
  }

  /**
   * Route a channel event to appropriate handlers
   */
  async routeEvent(event: ChannelEvent): Promise<void> {
    try {
      // Check if this is a background-task-generated event that should only run in worker
      const backgroundTaskEvents = [
        ChannelEventType.SUBSCRIPTION_EXPIRED,
        ChannelEventType.SUBSCRIPTION_EXPIRING_SOON,
        ChannelEventType.ML_EXTRACTION_QUEUED,
        ChannelEventType.ML_EXTRACTION_STARTED,
        ChannelEventType.ML_EXTRACTION_COMPLETED,
        ChannelEventType.ML_EXTRACTION_FAILED,
      ];

      if (backgroundTaskEvents.includes(event.type)) {
        // Background-task events MUST only run in worker process
        // If we can't determine context or we're not in worker, skip
        if (!this.workerContext || !this.workerContext.isWorkerProcess()) {
          this.logger.debug(
            `Skipping ${event.type} event - background task events only process in worker process`
          );
          return;
        }
      }

      // Log to audit system before processing
      // Extract user context from event data or context
      // This captures both regular admins and superadmins
      const userId =
        event.data?.userId ||
        event.targetUserId ||
        this.userContextResolver.getUserId(event.context) ||
        null;

      // Check if the user is a superadmin (for audit tracking)
      const isSuperAdmin = userId
        ? await this.userContextResolver.isSuperAdmin(event.context)
        : false;

      await this.auditService
        .log(event.context, `channel_event.${event.type}`, {
          entityType: event.data?.entityType || null,
          entityId:
            event.data?.entityId ||
            event.data?.orderId ||
            event.data?.adminId ||
            event.data?.userId ||
            null,
          userId: userId,
          data: {
            ...event.data,
            targetUserId: event.targetUserId,
            targetCustomerId: event.targetCustomerId,
            isSuperAdmin, // Explicitly mark superadmin actions
          },
        })
        .catch(err => {
          this.logger.warn(
            `Failed to log channel event to audit: ${err instanceof Error ? err.message : String(err)}`
          );
        });

      // Check reminder state for SUBSCRIPTION_EXPIRED events
      if (event.type === ChannelEventType.SUBSCRIPTION_EXPIRED && this.subscriptionService) {
        const shouldSend = await this.subscriptionService.shouldSendExpiredReminder(
          event.context,
          event.channelId
        );
        if (!shouldSend) {
          this.logger.debug(
            `Skipping subscription expired reminder for channel ${event.channelId} - reminder sent recently`
          );
          return;
        }
      }

      // Get metadata FIRST to determine routing strategy
      const metadata = this.getEventMetadata(event.type);
      if (!metadata) {
        this.logger.warn(`No metadata found for event type ${event.type}`);
        return;
      }

      // Determine if this is a system event (non-subscribable, non-customer-facing)
      const isSystemEvent = !metadata.subscribable && !metadata.customerFacing;

      // Get effective config based on event type
      let effectiveConfig: Record<string, ActionConfig>;
      if (isSystemEvent) {
        // System events use default config - no channel setup required
        effectiveConfig = this.getDefaultSystemEventConfig(event.type);
      } else {
        // Subscribable events require channel config
        const channelConfig = await this.getChannelConfig(event.channelId);
        if (!channelConfig?.[event.type]) {
          this.logger.debug(
            `No config found for event type ${event.type} in channel ${event.channelId}`
          );
          return;
        }
        effectiveConfig = channelConfig[event.type];
      }

      // Determine target users
      // Priority: explicit targetUserId > customer-facing event target > all channel admins (system events)
      let targetUserIds: string[] = [];

      if (event.targetUserId) {
        // Explicit target user provided (for both system and customer-facing events)
        targetUserIds = [event.targetUserId];
      } else if (metadata.subscribable && metadata.customerFacing) {
        // Customer-facing event: targetUserId should be provided, but if not, we can't route
        // (customer-facing events require explicit target)
        this.logger.warn(
          `Customer-facing event ${event.type} requires targetUserId but none provided`
        );
        return;
      } else {
        // System event: get all channel admins (only if no specific targetUserId provided)
        targetUserIds = await this.getChannelAdminUserIds(event.context, event.channelId);
      }

      // Early validation: fail fast if no target users found
      if (targetUserIds.length === 0) {
        this.logger.warn(
          `No target users found for event ${event.type} in channel ${event.channelId}. ` +
            `System events require at least one channel admin.`
        );
        return;
      }

      // For each target user, check preferences and route to handlers
      for (const userId of targetUserIds) {
        await this.routeEventForUser(event, userId, effectiveConfig, metadata);
      }

      // Mark reminder as sent for SUBSCRIPTION_EXPIRED events after routing
      if (event.type === ChannelEventType.SUBSCRIPTION_EXPIRED && this.subscriptionService) {
        await this.subscriptionService
          .markExpiredReminderSent(event.context, event.channelId)
          .catch(err => {
            this.logger.warn(
              `Failed to mark expired reminder as sent: ${err instanceof Error ? err.message : String(err)}`
            );
          });
      }
    } catch (error) {
      this.logger.error(
        `Failed to route event ${event.type} for channel ${event.channelId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Route event for a specific user
   */
  private async routeEventForUser(
    event: ChannelEvent,
    userId: string,
    eventConfig: any,
    metadata: any
  ): Promise<void> {
    // Get user preferences if event is subscribable
    let userPreferences = {};
    if (metadata.subscribable) {
      userPreferences = await this.notificationPreferenceService.getUserPreferences(
        event.context,
        userId,
        event.channelId
      );
    }

    // Create user-specific event
    const userEvent: ChannelEvent = {
      ...event,
      targetUserId: userId,
    };

    // Route to each enabled action
    for (const [actionType, actionConfig] of Object.entries(eventConfig)) {
      const config = actionConfig as ActionConfig;

      // Check if action should be sent
      const shouldSend = this.notificationPreferenceService.shouldSendNotification(
        userPreferences as any,
        { [event.type]: eventConfig } as any,
        event.type as ChannelEventType,
        actionType
      );

      if (!shouldSend || !config.enabled) {
        continue;
      }

      // Get handler
      const handler = this.handlers.get(actionType as ChannelActionType);
      if (!handler) {
        this.logger.warn(`No handler found for action type ${actionType}`);
        continue;
      }

      if (!handler.canHandle(userEvent)) {
        this.logger.debug(
          `Handler ${actionType} cannot handle event ${event.type} (missing phone number or customer ID)`
        );
        continue;
      }

      // Execute handler
      try {
        const result = await handler.execute(event.context, userEvent, config);
        if (!result.success) {
          this.logger.warn(`Handler ${actionType} failed for event ${event.type}: ${result.error}`);
        }
      } catch (error) {
        this.logger.error(
          `Handler ${actionType} threw error for event ${event.type}: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }
    }
  }

  /**
   * Get channel configuration
   */
  private async getChannelConfig(channelId: string): Promise<ChannelEventConfig | null> {
    try {
      const channel = await this.channelService.findOne(RequestContext.empty(), channelId);
      if (!channel) {
        return null;
      }

      const eventConfig = (channel.customFields as any)?.eventConfig;
      if (!eventConfig) {
        return null;
      }

      return typeof eventConfig === 'string' ? JSON.parse(eventConfig) : eventConfig;
    } catch (error) {
      this.logger.error(
        `Failed to get channel config for channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get channel admin user IDs
   */
  private async getChannelAdminUserIds(ctx: RequestContext, channelId: string): Promise<string[]> {
    // Use centralized service to get admin users (includes SuperAdmins)
    return this.channelUserService.getChannelAdminUserIds(ctx, channelId, {
      includeSuperAdmins: true,
    });
  }

  /**
   * Get event metadata (cached)
   */
  private getEventMetadata(eventType: ChannelEventType): any {
    if (!this.eventMetadataCache) {
      this.loadEventMetadata();
    }
    return this.eventMetadataCache?.get(eventType);
  }

  /**
   * Load event metadata from JSON file
   */
  private loadEventMetadata(): void {
    this.eventMetadataCache = new Map(EVENT_METADATA_MAP);
  }

  /**
   * Get default configuration for system events
   * System events always fire to channel admins with in-app notifications enabled
   */
  private getDefaultSystemEventConfig(eventType?: ChannelEventType): Record<string, ActionConfig> {
    const config: Record<string, ActionConfig> = {
      [ChannelActionType.IN_APP_NOTIFICATION]: { enabled: true },
      [ChannelActionType.SMS]: { enabled: true },
    };

    return config;
  }
}
