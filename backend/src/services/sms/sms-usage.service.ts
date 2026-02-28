import { Injectable, Logger } from '@nestjs/common';
import { ChannelService, RequestContext, TransactionalConnection } from '@vendure/core';
import { SubscriptionTier } from '../../plugins/subscriptions/subscription.entity';
import {
  type SmsCategory,
  type SmsUsageByCategory,
  isCountedCategory,
} from '../../domain/sms-categories';

export interface SmsUsageInfo {
  used: number;
  limit: number;
  periodEnd: Date | null;
  allowed: boolean;
  reason?: string;
  usedByCategory?: SmsUsageByCategory;
}

function parseUsageByCategory(raw: unknown): SmsUsageByCategory {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as SmsUsageByCategory;
      }
    } catch {
      // ignore
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as SmsUsageByCategory;
  return {};
}

function totalCounted(byCategory: SmsUsageByCategory): number {
  let sum = 0;
  for (const [cat, n] of Object.entries(byCategory)) {
    if (isCountedCategory(cat as SmsCategory) && typeof n === 'number' && n > 0) sum += n;
  }
  return sum;
}

/**
 * SMS usage and limit per channel (30-day period synced with subscription expiry).
 * Usage can be stored per category (smsUsageByCategory) or legacy single counter (smsUsedThisPeriod).
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
   * Prefers smsUsageByCategory when present (sum of counted categories); falls back to smsUsedThisPeriod.
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
    const byCategory = parseUsageByCategory(customFields.smsUsageByCategory);
    const hasCategoryData = Object.keys(byCategory).length > 0;
    const usedFromCategory = totalCounted(byCategory);
    const usedLegacy =
      typeof customFields.smsUsedThisPeriod === 'number' ? customFields.smsUsedThisPeriod : 0;
    let used = hasCategoryData ? usedFromCategory : usedLegacy;

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
          ...customFields,
          smsUsedThisPeriod: 0,
          smsPeriodEnd: periodEnd ?? undefined,
          smsUsageByCategory: JSON.stringify({}),
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
      usedByCategory: hasCategoryData ? byCategory : undefined,
    };
  }

  async canSendSms(
    ctx: RequestContext,
    channelId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const info = await this.getOrResetUsage(ctx, channelId);
    return { allowed: info.allowed, reason: info.reason };
  }

  /**
   * Record one SMS sent for the given category. Uses read-modify-write on smsUsageByCategory
   * so other categories are never overwritten.
   */
  async recordSmsSent(
    ctx: RequestContext,
    channelId: string,
    category: SmsCategory
  ): Promise<void> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) return;

    const customFields = { ...((channel as any).customFields || {}) };
    const current = parseUsageByCategory(customFields.smsUsageByCategory);
    const next: SmsUsageByCategory = { ...current, [category]: (current[category] ?? 0) + 1 };
    const totalCountedNow = totalCounted(next);

    await this.channelService.update(ctx, {
      id: channelId,
      customFields: {
        ...customFields,
        smsUsageByCategory: JSON.stringify(next),
        smsUsedThisPeriod: totalCountedNow,
      },
    });
    this.logger.debug(`Channel ${channelId} SMS usage: ${totalCountedNow} (${category}+1)`);
  }
}
