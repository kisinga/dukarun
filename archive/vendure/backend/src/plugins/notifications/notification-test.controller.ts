import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { NotificationService } from '../../services/notifications/notification.service';
import { PushNotificationService } from '../../services/notifications/push-notification.service';

@Controller('test-notifications')
export class NotificationTestController {
  constructor(
    private notificationService: NotificationService,
    private pushNotificationService: PushNotificationService
  ) {}

  @Get('trigger')
  async triggerTestNotification(
    @Query('type') type: string = 'ORDER',
    @Query('title') title?: string,
    @Query('message') message?: string,
    @Query('userId') userId?: string,
    @Query('channelId') channelId?: string
  ) {
    const ctx = RequestContext.empty();
    const targetUserId = userId || (ctx.activeUserId ? String(ctx.activeUserId) : '2');
    const targetChannelId = channelId || (ctx.channelId ? String(ctx.channelId) : '2');

    // Generate test notification data
    const testData = this.generateTestNotification(type, title, message);

    try {
      // Create notification in the system
      const notification = await this.notificationService.createNotification(ctx, {
        userId: targetUserId,
        channelId: targetChannelId,
        type: testData.type as any,
        title: testData.title,
        message: testData.message,
        data: testData.data,
      });

      // Send push notification if enabled
      await this.pushNotificationService.sendPushNotification(
        ctx,
        targetUserId,
        testData.title,
        testData.message,
        testData.data
      );

      return {
        success: true,
        notification,
        message: `Test ${type} notification created and sent`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Post('trigger-all')
  async triggerAllTestNotifications(
    @Body('userId') userId?: string,
    @Body('channelId') channelId?: string
  ) {
    const ctx = RequestContext.empty();
    const results = [];
    const targetUserId = userId || (ctx.activeUserId ? String(ctx.activeUserId) : '2');
    const targetChannelId = channelId || (ctx.channelId ? String(ctx.channelId) : '2');

    const testTypes = ['ORDER', 'STOCK', 'ML_TRAINING', 'PAYMENT'];

    for (const type of testTypes) {
      try {
        const testData = this.generateTestNotification(type);
        const notification = await this.notificationService.createNotification(ctx, {
          userId: targetUserId,
          channelId: targetChannelId,
          type: testData.type as any,
          title: testData.title,
          message: testData.message,
          data: testData.data,
        });

        await this.pushNotificationService.sendPushNotification(
          ctx,
          targetUserId,
          testData.title,
          testData.message,
          testData.data
        );

        results.push({ type, success: true, notification });
      } catch (error) {
        results.push({
          type,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: true,
      results,
      message: 'All test notifications triggered',
    };
  }

  @Get('status')
  async getNotificationStatus() {
    return {
      pushServiceEnabled: true,
      vapidKeysConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      timestamp: new Date().toISOString(),
    };
  }

  private generateTestNotification(type: string, customTitle?: string, customMessage?: string) {
    const now = new Date().toISOString();

    switch (type.toUpperCase()) {
      case 'ORDER':
        return {
          type: 'ORDER',
          title: customTitle || 'New Order Received',
          message: customMessage || `Order #TEST-${Date.now()} has been placed for KES 1,500`,
          data: { orderId: `TEST-${Date.now()}`, amount: 1500, timestamp: now },
        };
      case 'STOCK':
        return {
          type: 'STOCK',
          title: customTitle || 'Low Stock Alert',
          message: customMessage || 'Product "Test Product" is running low (3 units remaining)',
          data: { productId: 'prod-test', stockOnHand: 3, timestamp: now },
        };
      case 'ML_TRAINING':
        return {
          type: 'ML_TRAINING',
          title: customTitle || 'ML Model Training Complete',
          message: customMessage || 'Your demand forecasting model has been updated with new data',
          data: { modelId: 'demand-forecast', accuracy: 0.95, timestamp: now },
        };
      case 'PAYMENT':
        return {
          type: 'PAYMENT',
          title: customTitle || 'Payment Confirmed',
          message: customMessage || `Payment of KES 1,500 has been successfully processed`,
          data: { transactionId: `txn-${Date.now()}`, amount: 1500, timestamp: now },
        };
      default:
        return {
          type: 'ORDER',
          title: customTitle || 'Test Notification',
          message: customMessage || 'This is a test notification message',
          data: { test: true, timestamp: now },
        };
    }
  }
}
