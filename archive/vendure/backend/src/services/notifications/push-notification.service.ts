import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import * as webpush from 'web-push';
import { BRAND_CONFIG } from '../../constants/brand.constants';
import { NotificationService, PushSubscription } from './notification.service';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_EMAIL || `mailto:admin@${BRAND_CONFIG.emailDomain}`,
  };

  constructor(
    private notificationService: NotificationService,
    private connection: TransactionalConnection
  ) {
    // Configure web-push with VAPID keys only if they are provided
    if (this.vapidKeys.publicKey && this.vapidKeys.privateKey) {
      try {
        webpush.setVapidDetails(
          this.vapidKeys.subject,
          this.vapidKeys.publicKey,
          this.vapidKeys.privateKey
        );
        this.logger.log('Push notifications enabled with VAPID keys');
      } catch (error) {
        this.logger.warn(
          'Failed to configure VAPID keys, push notifications will be disabled:',
          error
        );
      }
    } else {
      this.logger.warn(
        'VAPID keys not configured. Push notifications will be disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable.'
      );
    }
  }

  async subscribeToPush(
    ctx: RequestContext,
    userId: string,
    channelId: string,
    subscription: any
  ): Promise<boolean> {
    try {
      // Check if subscription already exists
      const existing = await this.connection.rawConnection.getRepository(PushSubscription).findOne({
        where: {
          endpoint: subscription.endpoint,
        },
      });

      if (existing) {
        // Update keys/user if changed (though endpoint usually uniquely identifies subscription)
        if (existing.userId !== userId) {
          existing.userId = userId;
          existing.channelId = channelId;
          existing.keys = subscription.keys;
          await this.connection.rawConnection.getRepository(PushSubscription).save(existing);
        }
        return true;
      }

      const newSubscription = new PushSubscription();
      newSubscription.userId = userId;
      newSubscription.channelId = channelId;
      newSubscription.endpoint = subscription.endpoint;
      newSubscription.keys = subscription.keys;
      newSubscription.createdAt = new Date();

      await this.connection.rawConnection.getRepository(PushSubscription).save(newSubscription);

      this.logger.log(`Push subscription saved for user: ${userId} channel: ${channelId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to save push subscription:', error);
      return false;
    }
  }

  async unsubscribeFromPush(ctx: RequestContext, userId: string): Promise<boolean> {
    try {
      // Remove all subscriptions for this user
      // Ideally we should unsubscribe only the current device, but the current API
      // doesn't pass the subscription endpoint to unsubscribe.
      const result = await this.connection.rawConnection
        .getRepository(PushSubscription)
        .delete({ userId });

      this.logger.log(`Removed ${result.affected} push subscriptions for user: ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to remove push subscription:', error);
      return false;
    }
  }

  async sendPushNotification(
    ctx: RequestContext,
    userId: string,
    title: string,
    message: string,
    data?: any
  ): Promise<boolean> {
    if (!this.vapidKeys.publicKey || !this.vapidKeys.privateKey) {
      this.logger.debug('Push notifications disabled (VAPID keys not configured)');
      return false;
    }

    try {
      const subscriptions = await this.connection.rawConnection
        .getRepository(PushSubscription)
        .find({
          where: { userId },
        });

      if (subscriptions.length === 0) {
        return false;
      }

      const payload = this.createNotificationPayload(title, message, data);
      let sentCount = 0;

      const promises = subscriptions.map(async sub => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload
          );
          sentCount++;
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription is no longer valid, delete it
            await this.connection.rawConnection
              .getRepository(PushSubscription)
              .delete({ id: sub.id });
            this.logger.debug(`Removed invalid subscription for user ${userId}`);
          } else {
            this.logger.error(`Failed to send push to subscription ${sub.id}:`, error);
          }
        }
      });

      await Promise.all(promises);

      if (sentCount > 0) {
        this.logger.log(`Push notification sent to ${sentCount} devices for user: ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to send push notification:', error);
      return false;
    }
  }

  async sendToChannel(
    ctx: RequestContext,
    channelId: string,
    title: string,
    message: string,
    data?: any
  ): Promise<number> {
    try {
      // Get all users in the channel
      const userIds = await this.notificationService.getChannelUsers(channelId);

      // Send push notification to each user
      const promises = userIds.map(userId =>
        this.sendPushNotification(ctx, userId, title, message, data)
      );

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(
        result => result.status === 'fulfilled' && result.value === true
      ).length;

      this.logger.log(
        `Push notifications sent to ${successCount}/${userIds.length} users in channel ${channelId}`
      );
      return successCount;
    } catch (error) {
      this.logger.error('Failed to send push notifications to channel:', error);
      return 0;
    }
  }

  private createNotificationPayload(title: string, message: string, data?: any) {
    return JSON.stringify({
      notification: {
        title,
        body: message,
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-96x96.png',
        vibrate: [100, 50, 100],
        data: {
          ...data,
          url: '/', // Default open URL
        },
      },
    });
  }
}
