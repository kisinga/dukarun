import { Injectable } from '@nestjs/common';
import { ChannelService, RequestContext } from '@vendure/core';
import { ChannelEventRouterService } from '../../infrastructure/events/channel-event-router.service';
import { ChannelEventType } from '../../infrastructure/events/types/event-type.enum';
import { ActionCategory } from '../../infrastructure/events/types/action-category.enum';
import { WorkerBackgroundTaskBase } from '../../infrastructure/utils/worker-background-task.base';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * Subscription Expiry Subscriber
 *
 * Checks for expiring subscriptions daily and emits notification events.
 * Only runs in worker process to avoid duplicate execution.
 */
@Injectable()
export class SubscriptionExpirySubscriber extends WorkerBackgroundTaskBase {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily

  constructor(
    workerContext: WorkerContextService,
    private channelService: ChannelService,
    private eventRouter: ChannelEventRouterService
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
      const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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

        // Check if expired
        if (expiresAt <= now) {
          // Emit expired event
          await this.eventRouter
            .routeEvent({
              type: ChannelEventType.SUBSCRIPTION_EXPIRED,
              channelId: channel.id.toString(),
              category: ActionCategory.SYSTEM_NOTIFICATIONS,
              context: ctx,
              data: {
                expiresAt: expiresAt.toISOString(),
              },
            })
            .catch(err => {
              this.logger.warn(
                `Failed to emit subscription expired event for channel ${channel.id}: ${err instanceof Error ? err.message : String(err)}`
              );
            });
          notifiedCount++;
          continue;
        }

        // Check if expiring soon (1, 3, or 7 days)
        const daysRemaining = Math.ceil(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysRemaining === 1 || daysRemaining === 3 || daysRemaining === 7) {
          // Emit expiring soon event
          await this.eventRouter
            .routeEvent({
              type: ChannelEventType.SUBSCRIPTION_EXPIRING_SOON,
              channelId: channel.id.toString(),
              category: ActionCategory.SYSTEM_NOTIFICATIONS,
              context: ctx,
              data: {
                expiresAt: expiresAt.toISOString(),
                daysRemaining,
              },
            })
            .catch(err => {
              this.logger.warn(
                `Failed to emit subscription expiring soon event for channel ${channel.id}: ${err instanceof Error ? err.message : String(err)}`
              );
            });
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
