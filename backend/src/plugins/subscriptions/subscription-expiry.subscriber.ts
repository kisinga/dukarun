import { Injectable } from '@nestjs/common';
import { ChannelService, EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { SubscriptionAlertEvent } from '../../infrastructure/events/custom-events';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import {
  getDefaultGracePeriodEnd,
  parseDate,
} from '../../services/subscriptions/subscription-access.policy';
import { getSellerForChannel } from '../../utils/seller-access.util';
import { NotificationService } from '../../services/notifications/notification.service';
import { WorkerBackgroundTaskBase } from '../../infrastructure/utils/worker-background-task.base';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * Subscription Expiry Subscriber
 *
 * Checks for expiring subscriptions daily and emits events.
 * Only runs in worker process to avoid duplicate execution.
 *
 * Lifecycle:
 *   1. Before expiry: "expiring_soon" reminders at 7/3/1 days.
 *   2. On expiry: flip status to expired, set grace period end, emit "expired".
 *   3. During 14-day grace period: "grace_period_ending" reminders at 7/3/1 days.
 *   4. After grace period: emit "hard_expired".
 *
 * Behavior is documented in archive/docs/2026-07-10/SUBSCRIPTION_EXPIRY_NOTIFICATIONS.md.
 */
@Injectable()
export class SubscriptionExpirySubscriber extends WorkerBackgroundTaskBase {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
  private readonly REMINDER_DAYS = [7, 3, 1];
  private readonly HARD_EXPIRED_LOOKBACK_DAYS = 365 * 100; // Permanent-ish dedupe for suspension

  constructor(
    workerContext: WorkerContextService,
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private notificationService: NotificationService,
    private subscriptionService: SubscriptionService
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
      const now = new Date();

      let checkedCount = 0;
      let notifiedCount = 0;
      const take = 1000;
      let skip = 0;
      let channels: any[] = [];

      do {
        const channelsResult = await this.channelService.findAll(ctx, { take, skip } as any);
        channels = channelsResult.items;
        skip += channels.length;

        for (const channel of channels) {
          const customFields = (channel as any).customFields || {};
          const subscriptionStatus = customFields.subscriptionStatus;
          const channelId = channel.id.toString();

          // Active exemptions override all expiry processing.
          const exemptUntil = parseDate(customFields.subscriptionExemptUntil);
          if (exemptUntil && exemptUntil > now) {
            continue;
          }

          if (subscriptionStatus === 'trial' || subscriptionStatus === 'active') {
            checkedCount++;

            // Get expiry date (either subscriptionExpiresAt or trialEndsAt)
            const expiresAtStr = customFields.subscriptionExpiresAt || customFields.trialEndsAt;
            if (!expiresAtStr) {
              continue;
            }

            const expiresAt = new Date(expiresAtStr);
            // If an exemption covered the channel past the subscription expiry and has
            // itself lapsed, the grace period must start from the exemption end date.
            const graceBaseDate = exemptUntil && exemptUntil <= now ? exemptUntil : expiresAt;

            if (expiresAt <= now) {
              // Subscription just expired: flip status, set grace period, notify once.
              const transitioned = await this.subscriptionService.enterGracePeriod(ctx, channelId, {
                baseDate: graceBaseDate,
                expiryDate: expiresAt,
                silent: true,
              });
              if (!transitioned) {
                continue;
              }

              const gracePeriodEnd = getDefaultGracePeriodEnd(graceBaseDate);
              if (gracePeriodEnd <= now) {
                const shouldNotify = await this.shouldNotifyAtThreshold(
                  ctx,
                  channelId,
                  'Subscription Suspended',
                  0,
                  this.HARD_EXPIRED_LOOKBACK_DAYS
                );
                if (shouldNotify) {
                  await this.publishAlert(ctx, channel, channelId, 'hard_expired', {
                    gracePeriodEnd: gracePeriodEnd.toISOString(),
                    daysRemaining: 0,
                  });
                  notifiedCount++;
                }
              } else {
                await this.publishAlert(ctx, channel, channelId, 'expired', {
                  expiresAt: expiresAt.toISOString(),
                  gracePeriodEnd: gracePeriodEnd.toISOString(),
                });
                notifiedCount++;
              }
              continue;
            }

            // Pre-expiry reminders
            const daysRemaining = Math.ceil(
              (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (this.REMINDER_DAYS.includes(daysRemaining)) {
              const shouldNotify = await this.shouldNotifyAtThreshold(
                ctx,
                channelId,
                'Subscription Expiring Soon',
                daysRemaining
              );
              if (shouldNotify) {
                await this.publishAlert(ctx, channel, channelId, 'expiring_soon', {
                  expiresAt: expiresAt.toISOString(),
                  daysRemaining,
                });
                notifiedCount++;
              }
            }

            continue;
          }

          if (subscriptionStatus === 'expired') {
            checkedCount++;

            const gracePeriodEndStr = customFields.subscriptionGracePeriodEnd;
            if (!gracePeriodEndStr) {
              // Legacy expired channel without a grace period: backfill and notify.
              const legacyExpiry =
                (exemptUntil && exemptUntil <= now ? exemptUntil : undefined) ??
                parseDate(customFields.subscriptionExpiresAt) ??
                parseDate(customFields.trialEndsAt);

              let transitioned: boolean;
              let gracePeriodEnd: Date;
              if (legacyExpiry) {
                transitioned = await this.subscriptionService.enterGracePeriod(ctx, channelId, {
                  baseDate: legacyExpiry,
                  silent: true,
                });
                gracePeriodEnd = getDefaultGracePeriodEnd(legacyExpiry);
              } else {
                transitioned = await this.subscriptionService.suspendLegacyExpired(ctx, channelId);
                gracePeriodEnd = now;
              }
              if (!transitioned) {
                continue;
              }

              if (gracePeriodEnd <= now) {
                const shouldNotify = await this.shouldNotifyAtThreshold(
                  ctx,
                  channelId,
                  'Subscription Suspended',
                  0,
                  this.HARD_EXPIRED_LOOKBACK_DAYS
                );
                if (shouldNotify) {
                  await this.publishAlert(ctx, channel, channelId, 'hard_expired', {
                    gracePeriodEnd: gracePeriodEnd.toISOString(),
                    daysRemaining: 0,
                  });
                  notifiedCount++;
                }
              } else {
                await this.publishAlert(ctx, channel, channelId, 'expired', {
                  gracePeriodEnd: gracePeriodEnd.toISOString(),
                });
                notifiedCount++;
              }
              continue;
            }

            const gracePeriodEnd = new Date(gracePeriodEndStr);

            if (gracePeriodEnd <= now) {
              // Grace period has ended: hard expired.
              const shouldNotify = await this.shouldNotifyAtThreshold(
                ctx,
                channelId,
                'Subscription Suspended',
                0,
                this.HARD_EXPIRED_LOOKBACK_DAYS
              );
              if (shouldNotify) {
                await this.publishAlert(ctx, channel, channelId, 'hard_expired', {
                  gracePeriodEnd: gracePeriodEnd.toISOString(),
                  daysRemaining: 0,
                });
                notifiedCount++;
              }
              continue;
            }

            // During grace period: reminders at 7/3/1 days before suspension.
            const daysRemaining = Math.ceil(
              (gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (this.REMINDER_DAYS.includes(daysRemaining)) {
              const shouldNotify = await this.shouldNotifyAtThreshold(
                ctx,
                channelId,
                'Subscription Access Ending Soon',
                daysRemaining
              );
              if (shouldNotify) {
                await this.publishAlert(ctx, channel, channelId, 'grace_period_ending', {
                  gracePeriodEnd: gracePeriodEnd.toISOString(),
                  daysRemaining,
                });
                notifiedCount++;
              }
            }
          }
        }
      } while (channels.length === take);

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

  private async publishAlert(
    ctx: RequestContext,
    channel: any,
    channelId: string,
    alertType: 'expiring_soon' | 'expired' | 'grace_period_ending' | 'hard_expired',
    data: Record<string, any>
  ): Promise<void> {
    try {
      const seller = await getSellerForChannel(ctx, channelId, this.connection);
      const company = seller?.name?.replace(/\s+Seller$/, '') || channel?.code || 'your company';
      this.eventBus.publish(
        new SubscriptionAlertEvent(ctx, channelId, alertType, { ...data, company })
      );
    } catch (error) {
      this.logger.warn(
        `Failed to resolve seller for channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`
      );
      this.eventBus.publish(
        new SubscriptionAlertEvent(ctx, channelId, alertType, {
          ...data,
          company: channel?.code || 'your company',
        })
      );
    }
  }

  private async shouldNotifyAtThreshold(
    ctx: RequestContext,
    channelId: string,
    title: string,
    daysRemaining: number,
    withinDays: number = 35
  ): Promise<boolean> {
    const hasPrefsEnabled =
      await this.notificationService.hasAnyAdminWithPaymentNotificationsEnabled(ctx, channelId);
    if (!hasPrefsEnabled) {
      return false;
    }

    const lastThreshold = await this.notificationService.getLastNotificationThreshold(
      ctx,
      channelId,
      title,
      withinDays
    );
    return lastThreshold === null || daysRemaining < lastThreshold;
  }
}
