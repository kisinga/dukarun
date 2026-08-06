import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, OrderStateTransitionEvent, StockMovementEvent } from '@vendure/core';
import {
  CreateNotificationInput,
  NotificationService,
  NotificationType,
} from './notification.service';
import { PushNotificationService } from './push-notification.service';

@Injectable()
export class NotificationHandlerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationHandlerService.name);

  constructor(
    private eventBus: EventBus,
    private notificationService: NotificationService,
    private pushNotificationService: PushNotificationService
  ) {}

  onModuleInit() {
    // Note: Order state transitions are now handled by ChannelEventRouterService
    // This service is kept for backward compatibility and ML training events

    // Subscribe to stock movements (if needed in future)
    this.eventBus.ofType(StockMovementEvent).subscribe(async event => {
      await this.handleStockMovement(event);
    });
  }

  private async handleOrderStateTransition(event: OrderStateTransitionEvent) {
    const { order, fromState, toState } = event;
    // Fix: Use proper optional chaining to safely access channels array
    const channelId = order.channels?.[0]?.id;

    if (!channelId) {
      return;
    }

    // Create notification based on state transition
    let title = '';
    let message = '';
    let type = NotificationType.ORDER;

    // Use string comparison for now
    const toStateStr = String(toState);
    switch (toStateStr) {
      case 'PaymentSettled':
        title = 'Payment Received';
        message = `Order #${order.code} payment has been settled`;
        break;
      case 'Fulfilled':
        title = 'Order Fulfilled';
        message = `Order #${order.code} has been fulfilled`;
        break;
      case 'Cancelled':
        title = 'Order Cancelled';
        message = `Order #${order.code} has been cancelled`;
        break;
      default:
        return; // Don't create notification for other states
    }

    // Create notification for all users in the channel
    await this.createChannelNotification(String(channelId), {
      type,
      title,
      message,
      data: {
        orderId: String(order.id),
        orderCode: order.code,
        fromState: String(fromState),
        toState: toStateStr,
      },
    });
  }

  private async handleStockMovement(event: StockMovementEvent) {
    // For now, skip stock movement notifications until we understand the event structure
    this.logger.log(`Stock movement event received: ${JSON.stringify(event)}`);
  }

  async handleMLTrainingEvent(
    channelId: string,
    eventType: 'started' | 'progress' | 'completed' | 'error',
    data: any
  ) {
    let title = '';
    let message = '';
    let type = NotificationType.ML_TRAINING;

    switch (eventType) {
      case 'started':
        title = 'ML Training Started';
        message = 'Machine learning model training has begun';
        break;
      case 'progress':
        title = 'ML Training Progress';
        message = `Training progress: ${data.progress}%`;
        break;
      case 'completed':
        title = 'ML Training Completed';
        message = 'Machine learning model training has completed successfully';
        break;
      case 'error':
        title = 'ML Training Error';
        message = `Training failed: ${data.error}`;
        break;
    }

    await this.createChannelNotification(channelId, {
      type,
      title,
      message,
      data,
    });
  }

  private async createChannelNotification(
    channelId: string,
    notificationData: Omit<CreateNotificationInput, 'userId' | 'channelId'>
  ) {
    try {
      // Get all users in the channel
      const userIds = await this.notificationService.getChannelUsers(channelId);

      // Create notification for each user
      for (const userId of userIds) {
        const input: CreateNotificationInput = {
          userId,
          channelId,
          ...notificationData,
        };

        // Create notification in database
        await this.notificationService.createNotification(
          { channelId } as any, // Mock RequestContext
          input
        );

        // Send push notification
        await this.pushNotificationService.sendPushNotification(
          { channelId } as any, // Mock RequestContext
          userId,
          notificationData.title,
          notificationData.message,
          notificationData.data
        );
      }
    } catch (error) {
      this.logger.error('Failed to create channel notification:', error);
    }
  }
}
