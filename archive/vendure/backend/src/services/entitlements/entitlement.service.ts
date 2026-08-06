import { Injectable } from '@nestjs/common';
import { ChannelService, RequestContext, TransactionalConnection } from '@vendure/core';
import {
  SubscriptionTier,
  SubscriptionTierLimits,
} from '../../plugins/subscriptions/subscription.entity';

export type SubscriptionLimitKey = keyof SubscriptionTierLimits;

export interface LimitCheckResult {
  allowed: boolean;
  limit: number;
  used: number;
  reason?: string;
}

/**
 * Resolves subscription-tier limits for a channel and answers allow/deny decisions.
 *
 * Usage counters remain on the channel entity; this service only provides the
 * limit side of the equation so enforcement stays consistent across features.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly channelService: ChannelService,
    private readonly connection: TransactionalConnection
  ) {}

  /**
   * Get the effective limits for a channel from its active subscription tier.
   */
  async getLimits(ctx: RequestContext, channelId: string): Promise<SubscriptionTierLimits> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return {};
    }

    const customFields = (channel as any).customFields || {};
    const tierId = customFields.subscriptionTierId ?? customFields.subscriptiontierid;
    const tier =
      tierId && tierId !== '-1'
        ? await this.connection.getRepository(ctx, SubscriptionTier).findOne({
            where: { id: tierId },
          })
        : null;

    if (!tier) {
      return {};
    }

    return { ...(tier.limits ?? {}) };
  }

  /**
   * Check whether a channel may consume one more unit of a limited resource.
   * A missing limit (undefined) is treated as unlimited.
   */
  async checkLimit(
    ctx: RequestContext,
    channelId: string,
    limitKey: SubscriptionLimitKey,
    used: number
  ): Promise<LimitCheckResult> {
    const limit = await this.getLimit(ctx, channelId, limitKey);

    if (limit == null || limit <= 0) {
      return { allowed: true, limit: limit ?? 0, used };
    }

    const allowed = used < limit;
    return {
      allowed,
      limit,
      used,
      reason: allowed ? undefined : `${this.labelFor(limitKey)} limit reached (${used}/${limit})`,
    };
  }

  /**
   * Get the effective value for a single limit key.
   * Returns undefined when the limit is not configured for this channel.
   */
  async getLimit(
    ctx: RequestContext,
    channelId: string,
    limitKey: SubscriptionLimitKey
  ): Promise<number | undefined> {
    const limits = await this.getLimits(ctx, channelId);
    return limits[limitKey];
  }

  private labelFor(key: SubscriptionLimitKey): string {
    const labels: Record<SubscriptionLimitKey, string> = {
      maxAdmins: 'Admin',
      maxProducts: 'Product',
      maxStockLocations: 'Stock location',
      maxOrdersPerMonth: 'Order',
      smsPerPeriod: 'SMS',
    };
    return labels[key] ?? key;
  }
}
