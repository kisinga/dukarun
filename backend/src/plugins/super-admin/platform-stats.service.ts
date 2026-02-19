import { Injectable } from '@nestjs/common';
import { ChannelService, RequestContext } from '@vendure/core';
import { getChannelStatus } from '../../domain/channel-custom-fields';
import { ChannelStatus } from '../../domain/channel-custom-fields';

export interface PlatformStatsResult {
  totalChannels: number;
  channelsByStatus: { UNAPPROVED: number; APPROVED: number; DISABLED: number; BANNED: number };
  trialExpiringSoonCount: number;
  activeSubscriptionsCount: number;
}

export interface PlatformChannelResult {
  id: string;
  code: string;
  token: string;
  customFields: {
    status: string;
    trialEndsAt: Date | null;
    subscriptionStatus: string;
    maxAdminCount: number;
    cashierFlowEnabled: boolean;
    cashControlEnabled: boolean;
    enablePrinter: boolean;
  };
}

const TRIAL_EXPIRING_DAYS = 7;

@Injectable()
export class PlatformStatsService {
  constructor(private readonly channelService: ChannelService) {}

  async getPlatformChannels(): Promise<PlatformChannelResult[]> {
    const ctx = RequestContext.empty();
    const result = await this.channelService.findAll(ctx);
    return result.items.map((ch: any) => this.toPlatformChannel(ch));
  }

  async getPlatformStats(): Promise<PlatformStatsResult> {
    const channels = await this.getPlatformChannels();
    const totalChannels = channels.length;
    const channelsByStatus = {
      UNAPPROVED: 0,
      APPROVED: 0,
      DISABLED: 0,
      BANNED: 0,
    };
    let trialExpiringSoonCount = 0;
    let activeSubscriptionsCount = 0;

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + TRIAL_EXPIRING_DAYS);

    for (const ch of channels) {
      const status = ch.customFields.status as ChannelStatus;
      if (status in channelsByStatus) {
        channelsByStatus[status]++;
      }
      if (ch.customFields.trialEndsAt) {
        const trialEnd = new Date(ch.customFields.trialEndsAt);
        if (trialEnd > now && trialEnd <= cutoff) {
          trialExpiringSoonCount++;
        }
      }
      if (ch.customFields.subscriptionStatus === 'active') {
        activeSubscriptionsCount++;
      }
    }

    return {
      totalChannels,
      channelsByStatus,
      trialExpiringSoonCount,
      activeSubscriptionsCount,
    };
  }

  private toPlatformChannel(ch: any): PlatformChannelResult {
    const cf = (ch.customFields ?? {}) as Record<string, any>;
    const status = getChannelStatus(cf);
    return {
      id: String(ch.id),
      code: ch.code ?? '',
      token: ch.token ?? '',
      customFields: {
        status,
        trialEndsAt: cf.trialEndsAt ? new Date(cf.trialEndsAt) : null,
        subscriptionStatus: cf.subscriptionStatus ?? 'trial',
        maxAdminCount: typeof cf.maxAdminCount === 'number' ? cf.maxAdminCount : 5,
        cashierFlowEnabled: cf.cashierFlowEnabled === true,
        cashControlEnabled: cf.cashControlEnabled !== false,
        enablePrinter: cf.enablePrinter !== false,
      },
    };
  }
}
