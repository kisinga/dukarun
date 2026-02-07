import { Injectable } from '@nestjs/common';
import { ChannelService, EventBus, RequestContext } from '@vendure/core';
import { SubscriptionAlertEvent } from '../../infrastructure/events/custom-events';
import {
  NotificationService,
  NotificationType,
} from '../../services/notifications/notification.service';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import { WorkerBackgroundTaskBase } from '../../infrastructure/utils/worker-background-task.base';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * Subscription Expiry Subscriber
 *
 * Checks for expiring subscriptions daily and emits notification events.
 * Only runs in worker process to avoid duplicate execution.
 *
 * Behavior is documented in docs/SUBSCRIPTION_EXPIRY_NOTIFICATIONS.md.
 */
@Injectable()
export class SubscriptionExpirySubscriber extends WorkerBackgroundTaskBase {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily

  constructor(
    workerContext: WorkerContextService,
    private channelService: ChannelService,
    private eventBus: EventBus,
    private subscriptionService: SubscriptionService,
    private notificationService: NotificationService
  ) {
    super(workerContext, SubscriptionExpirySubscriber.name);
  }

  protected initializeTask(): void {
    // Start daily checks
    this.intervalId = setInterval(() => this.checkExpiringSubscriptions(), this.CHECK_INTERVAL_MS);
    // Run once on startup after a short delay
    setTimeout(() => this.checkExpiringSubscriptions(), 5000);
    this.logger.log('Subscription expiry checker initialized (daily interval)');
  }

  /**
   * Check for expiring subscriptions and emit events
   */
  private async checkExpiringSubscriptions(): Promise<void> {
    try {
      this.logger.debug('Checking for expiring subscriptions...');
      const ctx = RequestContext.empty();

      // Query all channels
      const channelsResult = await this.channelService.findAll(ctx);
      const channels = channelsResult.items;

      const now = new Date();

      let checkedCount = 0;
      let notifiedCount = 0;

      for (const channel of channels) {
        const customFields = (channel as any).customFields || {};
        const subscriptionStatus = customFields.subscriptionStatus;

        // Skip if not in trial or active status
        if (subscriptionStatus !== 'trial' && subscriptionStatus !== 'active') {
          continue;
        }

        checkedCount++;

        // Get expiry date (either subscriptionExpiresAt or trialEndsAt)
        const expiresAtStr = customFields.subscriptionExpiresAt || customFields.trialEndsAt;
        if (!expiresAtStr) {
          continue;
        }

        const expiresAt = new Date(expiresAtStr);

        const channelId = channel.id.toString();

        const hasPrefsEnabled =
          await this.notificationService.hasAnyAdminWithPaymentNotificationsEnabled(ctx, channelId);

        // Check if expired
        if (expiresAt <= now) {
          if (hasPrefsEnabled) {
            // Normal flow: 7-day throttle
            const shouldSend = await this.subscriptionService.shouldSendExpiredReminder(
              ctx,
              channelId
            );
            if (!shouldSend) continue;
            this.eventBus.publish(
              new SubscriptionAlertEvent(ctx, channelId, 'expired', {
                expiresAt: expiresAt.toISOString(),
              })
            );
            await this.subscriptionService.markExpiredReminderSent(ctx, channelId);
          } else {
            // One-time bypass: all admins have notifications disabled; send exactly one
            const alreadySent = await this.subscriptionService.hasEverSentExpiredReminder(
              ctx,
              channelId
            );
            if (alreadySent) continue;
            const adminIds = await this.notificationService.getChannelUsers(channelId);
            if (adminIds.length > 0) {
              await this.notificationService.createNotification(ctx, {
                userId: adminIds[0],
                channelId,
                type: NotificationType.PAYMENT,
                title: 'Subscription Expired',
                message: 'Your subscription has expired. Please renew to continue.',
                data: { expiresAt: expiresAt.toISOString() },
              });
              await this.subscriptionService.markExpiredReminderSent(ctx, channelId);
            }
          }
          notifiedCount++;
          continue;
        }

        // Check if expiring soon (1, 3, or 7 days)
        if (!hasPrefsEnabled) continue;

        const daysRemaining = Math.ceil(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysRemaining === 1 || daysRemaining === 3 || daysRemaining === 7) {
          const lastThreshold = await this.notificationService.getLastExpiringSoonThreshold(
            ctx,
            channelId
          );
          const shouldNotify = lastThreshold === null || daysRemaining < lastThreshold;
          if (!shouldNotify) continue;
          this.eventBus.publish(
            new SubscriptionAlertEvent(ctx, channelId, 'expiring_soon', {
              expiresAt: expiresAt.toISOString(),
              daysRemaining,
            })
          );
          notifiedCount++;
        }
      }

      if (checkedCount > 0) {
        this.logger.debug(
          `Checked ${checkedCount} channels, emitted ${notifiedCount} expiry notifications`
        );
      }
    } catch (error) {
      this.logger.error(
        `Error checking expiring subscriptions: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
}
