import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { ChannelService } from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { AuditTrailFilters } from '../../infrastructure/audit/audit.types';
import { AnalyticsQueryService } from '../../services/analytics/analytics-query.service';
import { ChannelSettingsService } from '../../services/channels/channel-settings.service';
import {
  NotificationService,
  NotificationType,
} from '../../services/notifications/notification.service';
import { PendingRegistrationsService } from './pending-registrations.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformStatsService } from './platform-stats.service';

const VALID_STATUSES = ['UNAPPROVED', 'APPROVED', 'DISABLED', 'BANNED'] as const;

@Resolver()
export class SuperAdminResolver {
  constructor(
    private readonly platformStatsService: PlatformStatsService,
    private readonly platformAdminService: PlatformAdminService,
    private readonly analyticsQueryService: AnalyticsQueryService,
    private readonly auditService: AuditService,
    private readonly channelSettingsService: ChannelSettingsService,
    private readonly channelService: ChannelService,
    private readonly notificationService: NotificationService,
    private readonly pendingRegistrationsService: PendingRegistrationsService
  ) {}

  @Query()
  @Allow(Permission.SuperAdmin)
  async platformChannels() {
    return this.platformStatsService.getPlatformChannels();
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async platformStats() {
    return this.platformStatsService.getPlatformStats();
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async administratorsForChannel(@Args('channelId') channelId: string) {
    return this.platformAdminService.getAdministratorsForChannel(channelId);
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async platformAdministrators(
    @Args('options', { nullable: true })
    options?: {
      skip?: number;
      take?: number;
      channelId?: string;
      superAdminOnly?: boolean;
    }
  ) {
    return this.platformAdminService.getPlatformAdministrators(options ?? {});
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async notificationsForChannel(
    @Args('channelId') channelId: string,
    @Args('options', { nullable: true })
    options?: { skip?: number; take?: number; type?: string }
  ) {
    const opts = options ?? {};
    const serviceOptions = {
      skip: opts.skip,
      take: opts.take,
      type: opts.type as NotificationType | undefined,
    };
    return this.notificationService.getNotificationsForChannel(channelId, serviceOptions);
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async pendingRegistrations() {
    return this.pendingRegistrationsService.getPendingRegistrations();
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async analyticsStatsForChannel(
    @Args('channelId') channelId: string,
    @Args('timeRange')
    timeRange: {
      startDate: string;
      endDate: string;
      previousStartDate?: string;
      previousEndDate?: string;
    },
    @Args('limit', { nullable: true }) limit?: number
  ) {
    const channelIdNum = parseInt(channelId, 10);
    if (Number.isNaN(channelIdNum)) {
      throw new Error('Invalid channelId');
    }
    const params = {
      channelId: channelIdNum,
      startDate: timeRange.startDate,
      endDate: timeRange.endDate,
      previousStartDate: timeRange.previousStartDate,
      previousEndDate: timeRange.previousEndDate,
      limit: limit ?? 10,
    };
    const [
      topSelling,
      highestRevenue,
      highestMargin,
      trending,
      salesTrend,
      orderVolumeTrend,
      customerGrowthTrend,
      averageProfitMargin,
      totalRevenue,
      totalOrders,
    ] = await Promise.all([
      this.analyticsQueryService.getTopSelling(params),
      this.analyticsQueryService.getHighestRevenue(params),
      this.analyticsQueryService.getHighestMargin(params),
      this.analyticsQueryService.getTrending(params),
      this.analyticsQueryService.getSalesTrend(params),
      this.analyticsQueryService.getOrderVolumeTrend(params),
      this.analyticsQueryService.getCustomerGrowthTrend(params),
      this.analyticsQueryService.getAverageProfitMargin(params),
      this.analyticsQueryService.getTotalRevenue(params),
      this.analyticsQueryService.getTotalOrders(params),
    ]);
    return {
      topSelling,
      highestRevenue,
      highestMargin,
      trending,
      salesTrend,
      orderVolumeTrend,
      customerGrowthTrend,
      averageProfitMargin,
      totalRevenue,
      totalOrders,
    };
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async auditLogsForChannel(
    @Args('channelId') channelId: string,
    @Args('options', { nullable: true })
    options?: {
      entityType?: string;
      entityId?: string;
      userId?: string;
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      skip?: number;
    }
  ) {
    const filters: AuditTrailFilters & { limit?: number; skip?: number } = {};
    if (options?.entityType) filters.entityType = options.entityType;
    if (options?.entityId) filters.entityId = options.entityId;
    if (options?.userId) filters.userId = options.userId;
    if (options?.eventType) filters.eventType = options.eventType;
    if (options?.startDate) {
      filters.startDate =
        options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
    }
    if (options?.endDate) {
      filters.endDate =
        options.endDate instanceof Date ? options.endDate : new Date(options.endDate);
    }
    if (options?.limit !== undefined) filters.limit = options.limit;
    if (options?.skip !== undefined) filters.skip = options.skip;
    return this.auditService.getAuditTrailForChannel(channelId, filters);
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async updateChannelStatusPlatform(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: string,
    @Args('status') status: string
  ) {
    if (!VALID_STATUSES.includes(status as any)) {
      throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    return this.channelSettingsService.updateChannelStatusForPlatform(
      ctx,
      channelId,
      status as 'UNAPPROVED' | 'APPROVED' | 'DISABLED' | 'BANNED'
    );
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async extendTrialPlatform(
    @Args('channelId') channelId: string,
    @Args('trialEndsAt') trialEndsAt: Date
  ) {
    const ctx = RequestContext.empty();
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }
    const date =
      trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt as unknown as string);
    await this.channelService.update(ctx, {
      id: channelId,
      customFields: { trialEndsAt: date },
    });
    const updated = await this.channelService.findOne(ctx, channelId);
    if (!updated) throw new Error('Channel not found after update');
    return updated;
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async updateChannelFeatureFlagsPlatform(
    @Args('input')
    input: {
      channelId: string;
      maxAdminCount?: number;
      cashierFlowEnabled?: boolean;
      cashControlEnabled?: boolean;
      enablePrinter?: boolean;
    }
  ) {
    const ctx = RequestContext.empty();
    const channel = await this.channelService.findOne(ctx, input.channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }
    const cf = (channel.customFields ?? {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (input.maxAdminCount !== undefined) updates.maxAdminCount = input.maxAdminCount;
    if (input.cashierFlowEnabled !== undefined)
      updates.cashierFlowEnabled = input.cashierFlowEnabled;
    if (input.cashControlEnabled !== undefined)
      updates.cashControlEnabled = input.cashControlEnabled;
    if (input.enablePrinter !== undefined) updates.enablePrinter = input.enablePrinter;
    if (Object.keys(updates).length === 0) {
      return channel;
    }
    await this.channelService.update(ctx, {
      id: input.channelId,
      customFields: { ...cf, ...updates },
    });
    const updated = await this.channelService.findOne(ctx, input.channelId);
    if (!updated) throw new Error('Channel not found after update');
    return updated;
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async approveUser(@Args('userId') userId: string) {
    const user = await this.pendingRegistrationsService.approveUser(userId);
    const cf = (user.customFields ?? {}) as Record<string, unknown>;
    return {
      id: user.id.toString(),
      identifier: user.identifier ?? '',
      authorizationStatus: (cf.authorizationStatus as string) ?? 'APPROVED',
    };
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async rejectUser(
    @Args('userId') userId: string,
    @Args('reason', { nullable: true }) reason?: string
  ) {
    const user = await this.pendingRegistrationsService.rejectUser(userId, reason ?? undefined);
    const cf = (user.customFields ?? {}) as Record<string, unknown>;
    return {
      id: user.id.toString(),
      identifier: user.identifier ?? '',
      authorizationStatus: (cf.authorizationStatus as string) ?? 'REJECTED',
    };
  }
}
