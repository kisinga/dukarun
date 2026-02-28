import { Injectable, Logger } from '@nestjs/common';
import { ChannelService, RequestContext, TransactionalConnection } from '@vendure/core';
import { SubscriptionTier } from '../../plugins/subscriptions/subscription.entity';

export interface SmsUsageInfo {
  used: number;
  limit: number;
  periodEnd: Date | null;
  allowed: boolean;
  reason?: string;
}

/**
 * SMS usage and limit per channel (30-day period synced with subscription expiry).
 * Limit comes from the channel's subscription tier; usage is stored on the channel.
 */
@Injectable()
export class SmsUsageService {
  private readonly logger = new Logger(SmsUsageService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly channelService: ChannelService
  ) {}

  /**
   * Get current usage and limit for a channel, resetting the period if needed.
   * Period end is aligned with subscriptionExpiresAt or trialEndsAt.
   */
  async getOrResetUsage(ctx: RequestContext, channelId: string): Promise<SmsUsageInfo> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return { used: 0, limit: 0, periodEnd: null, allowed: true };
    }

    const customFields = (channel as any).customFields || {};
    const tierId = customFields.subscriptionTierId ?? customFields.subscriptiontierid;
    let limit = 0;
    if (tierId) {
      const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);
      const tier = await tierRepo.findOne({ where: { id: tierId } });
      if (tier && tier.smsLimit != null && tier.smsLimit > 0) {
        limit = tier.smsLimit;
      }
    }

    const now = new Date();
    let used =
      typeof customFields.smsUsedThisPeriod === 'number' ? customFields.smsUsedThisPeriod : 0;
    let periodEnd: Date | null = customFields.smsPeriodEnd
      ? new Date(customFields.smsPeriodEnd)
      : null;

    const expiresAtStr = customFields.subscriptionExpiresAt || customFields.trialEndsAt;
    const periodEndFromSubscription = expiresAtStr ? new Date(expiresAtStr) : null;

    if (!periodEnd || now > periodEnd) {
      used = 0;
      periodEnd = periodEndFromSubscription;
      await this.channelService.update(ctx, {
        id: channelId,
        customFields: {
          smsUsedThisPeriod: 0,
          smsPeriodEnd: periodEnd ?? undefined,
        },
      });
    }

    const allowed = limit <= 0 || used < limit;
    return {
      used,
      limit,
      periodEnd,
      allowed,
      reason: !allowed ? `SMS limit reached (${used}/${limit}) for this period` : undefined,
    };
  }

  /**
   * Check if the channel can send an SMS (under limit). Does not increment.
   */
  async canSendSms(
    ctx: RequestContext,
    channelId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const info = await this.getOrResetUsage(ctx, channelId);
    return { allowed: info.allowed, reason: info.reason };
  }

  /**
   * Record that one SMS was sent (increment usage). Call after successful send.
   */
  async recordSmsSent(ctx: RequestContext, channelId: string): Promise<void> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) return;

    const customFields = (channel as any).customFields || {};
    const used =
      (typeof customFields.smsUsedThisPeriod === 'number' ? customFields.smsUsedThisPeriod : 0) + 1;

    await this.channelService.update(ctx, {
      id: channelId,
      customFields: {
        smsUsedThisPeriod: used,
      },
    });
    this.logger.debug(`Channel ${channelId} SMS usage: ${used}`);
  }
}
