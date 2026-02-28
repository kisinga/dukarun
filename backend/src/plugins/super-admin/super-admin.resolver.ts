import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  Allow,
  Channel,
  ChannelService,
  Ctx,
  Permission,
  RequestContext,
  RequestContextService,
  TaxRate,
  TaxRateService,
  TransactionalConnection,
  User,
  Zone,
  ZoneService,
} from '@vendure/core';
import { getChannelStatus } from '../../domain/channel-custom-fields';
import { ChannelAdminService } from '../../services/channels/channel-admin.service';
import { AdminLoginAttemptService } from '../../infrastructure/audit/admin-login-attempt.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { AuditTrailFilters } from '../../infrastructure/audit/audit.types';
import { AnalyticsQueryService } from '../../services/analytics/analytics-query.service';
import { ChannelSettingsService } from '../../services/channels/channel-settings.service';
import { RoleProvisionerService } from '../../services/auth/provisioning/role-provisioner.service';
import { RoleTemplateService } from '../../services/channels/role-template.service';
import {
  NotificationService,
  NotificationType,
} from '../../services/notifications/notification.service';
import { PendingRegistrationsService } from './pending-registrations.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformStatsService } from './platform-stats.service';
import { SubscriptionTier } from '../subscriptions/subscription.entity';

const VALID_STATUSES = ['UNAPPROVED', 'APPROVED', 'DISABLED', 'BANNED'] as const;

@Resolver()
export class SuperAdminResolver {
  constructor(
    private readonly platformStatsService: PlatformStatsService,
    private readonly platformAdminService: PlatformAdminService,
    private readonly analyticsQueryService: AnalyticsQueryService,
    private readonly auditService: AuditService,
    private readonly adminLoginAttemptService: AdminLoginAttemptService,
    private readonly channelSettingsService: ChannelSettingsService,
    private readonly channelService: ChannelService,
    private readonly notificationService: NotificationService,
    private readonly pendingRegistrationsService: PendingRegistrationsService,
    private readonly roleTemplateService: RoleTemplateService,
    private readonly channelAdminService: ChannelAdminService,
    private readonly requestContextService: RequestContextService,
    private readonly connection: TransactionalConnection,
    private readonly zoneService: ZoneService,
    private readonly taxRateService: TaxRateService
  ) {}

  @Query()
  @Allow(Permission.SuperAdmin)
  async registrationSeedContext(@Ctx() ctx: RequestContext) {
    const KENYA_ZONE_NAME = 'Kenya';
    const zones = await this.zoneService.findAll(ctx);
    const kenyaZone = zones.items.find(z => z.name === KENYA_ZONE_NAME);
    if (!kenyaZone) {
      throw new Error(
        `Registration zone "${KENYA_ZONE_NAME}" not found. Run Kenya seed or create the zone in Settings → Zones.`
      );
    }
    const zoneRepo = this.connection.getRepository(ctx, Zone);
    const zoneWithMembers = await zoneRepo.findOne({
      where: { id: kenyaZone.id },
      relations: ['members'],
    });
    const members = (zoneWithMembers?.members ?? []).map(m => ({
      id: String(m.id),
      name: m.name ?? '',
      code: m.code ?? '',
    }));

    const taxRateRepo = this.connection.getRepository(ctx, TaxRate);
    const kenyaRates = await taxRateRepo.find({
      where: { zone: { id: kenyaZone.id } },
      relations: ['category'],
    });
    const kenyaRate = kenyaRates[0];
    const taxRatePayload = kenyaRate
      ? {
          id: kenyaRate.id,
          name: kenyaRate.name,
          categoryName: kenyaRate.category?.name ?? '',
          value: kenyaRate.value,
        }
      : null;

    return {
      zone: {
        id: kenyaZone.id,
        name: kenyaZone.name,
        members,
      },
      taxRate: taxRatePayload,
    };
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async platformChannels() {
    return this.platformStatsService.getPlatformChannels();
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async platformZones(@Ctx() ctx: RequestContext) {
    const result = await this.zoneService.findAll(ctx);
    return result.items.map(z => ({ id: String(z.id), name: z.name ?? '' }));
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async channelDetailPlatform(@Ctx() ctx: RequestContext, @Args('channelId') channelId: string) {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const ch = await channelRepo.findOne({
      where: { id: channelId as any },
      relations: ['defaultShippingZone', 'defaultTaxZone'],
    });
    if (!ch) return null;
    const cf = (ch.customFields ?? {}) as Record<string, unknown>;
    const status = getChannelStatus(cf);
    let smsLimitFromTier: number | null = null;
    const tierId = cf.subscriptionTierId ?? (cf as any).subscriptiontierid;
    if (tierId) {
      const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);
      const tier = await tierRepo.findOne({ where: { id: tierId as string } });
      if (tier?.smsLimit != null && tier.smsLimit > 0) {
        smsLimitFromTier = tier.smsLimit;
      }
    }
    return {
      id: String(ch.id),
      code: ch.code ?? '',
      token: ch.token ?? '',
      customFields: {
        status,
        trialEndsAt: cf.trialEndsAt ?? null,
        subscriptionStatus: cf.subscriptionStatus ?? 'trial',
        maxAdminCount: typeof cf.maxAdminCount === 'number' ? cf.maxAdminCount : 5,
        cashierFlowEnabled: cf.cashierFlowEnabled === true,
        cashControlEnabled: cf.cashControlEnabled !== false,
        enablePrinter: cf.enablePrinter !== false,
        smsUsedThisPeriod: typeof cf.smsUsedThisPeriod === 'number' ? cf.smsUsedThisPeriod : 0,
        smsPeriodEnd: cf.smsPeriodEnd ?? null,
        smsLimitFromTier,
      },
      defaultShippingZone: ch.defaultShippingZone
        ? { id: String(ch.defaultShippingZone.id), name: ch.defaultShippingZone.name ?? '' }
        : null,
      defaultTaxZone: ch.defaultTaxZone
        ? { id: String(ch.defaultTaxZone.id), name: ch.defaultTaxZone.name ?? '' }
        : null,
    };
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
  async platformRoleTemplates(@Ctx() ctx: RequestContext) {
    const templates = await this.roleTemplateService.getAllTemplates(ctx);
    return templates.map(t => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description ?? null,
      permissions: t.permissions ?? [],
    }));
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async assignablePermissions() {
    return RoleProvisionerService.getAssignablePermissionStrings();
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async administratorDetail(
    @Ctx() ctx: RequestContext,
    @Args('administratorId') administratorId: string
  ) {
    const detail = await this.platformAdminService.getAdministratorDetail(ctx, administratorId);
    if (!detail) {
      throw new Error('Administrator not found');
    }
    return detail;
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

  @Query()
  @Allow(Permission.SuperAdmin)
  async adminLoginAttempts(
    @Args('limit', { nullable: true }) limit?: number,
    @Args('skip', { nullable: true }) skip?: number,
    @Args('since', { nullable: true }) since?: Date
  ) {
    return this.adminLoginAttemptService.getAttempts({
      limit,
      skip,
      since: since instanceof Date ? since : since ? new Date(since) : undefined,
    });
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async updateRegistrationTaxRate(
    @Ctx() ctx: RequestContext,
    @Args('input') input: { percentage: number }
  ) {
    const KENYA_ZONE_NAME = 'Kenya';
    const percentage = input.percentage;
    if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be a number between 0 and 100');
    }
    const zones = await this.zoneService.findAll(ctx);
    const kenyaZone = zones.items.find(z => z.name === KENYA_ZONE_NAME);
    if (!kenyaZone) {
      throw new Error(`Registration zone "${KENYA_ZONE_NAME}" not found.`);
    }
    const taxRateRepo = this.connection.getRepository(ctx, TaxRate);
    const kenyaRates = await taxRateRepo.find({
      where: { zone: { id: kenyaZone.id } },
      relations: ['category'],
    });
    const kenyaRate = kenyaRates[0];
    if (!kenyaRate) {
      throw new Error(`No tax rate found for zone "${KENYA_ZONE_NAME}". Run Kenya seed first.`);
    }
    const updated = await this.taxRateService.update(ctx, {
      id: kenyaRate.id,
      value: percentage,
    });
    return {
      id: updated.id,
      name: updated.name,
      categoryName: updated.category?.name ?? '',
      value: updated.value,
    };
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async updateChannelZonesPlatform(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: { channelId: string; defaultShippingZoneId?: string; defaultTaxZoneId?: string }
  ) {
    const updatePayload: { id: string; defaultShippingZoneId?: number; defaultTaxZoneId?: number } =
      {
        id: input.channelId,
      };
    if (input.defaultShippingZoneId != null) {
      updatePayload.defaultShippingZoneId = Number(input.defaultShippingZoneId);
    }
    if (input.defaultTaxZoneId != null) {
      updatePayload.defaultTaxZoneId = Number(input.defaultTaxZoneId);
    }
    return this.channelService.update(ctx, updatePayload as any);
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

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async createRoleTemplate(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: { code: string; name: string; description?: string; permissions: string[] }
  ) {
    const t = await this.roleTemplateService.create(ctx, input);
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description ?? null,
      permissions: t.permissions ?? [],
    };
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async updateRoleTemplate(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string,
    @Args('input') input: { name?: string; description?: string; permissions?: string[] }
  ) {
    const t = await this.roleTemplateService.update(ctx, id, input);
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description ?? null,
      permissions: t.permissions ?? [],
    };
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async deleteRoleTemplate(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    return this.roleTemplateService.delete(ctx, id);
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async updateAdministratorPermissions(
    @Ctx() ctx: RequestContext,
    @Args('administratorId') administratorId: string,
    @Args('channelId') channelId: string,
    @Args('permissions', { type: () => [String] }) permissions: string[]
  ) {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }
    const userRepo = this.connection.getRepository(ctx, User);
    const user = await userRepo.findOne({
      where: { id: ctx.activeUserId! },
      relations: ['roles', 'roles.channels'],
    });
    if (!user) {
      throw new Error('Current user not found');
    }
    const channelCtx = await this.requestContextService.create({
      apiType: 'admin',
      user,
      channelOrToken: channel,
      languageCode: channel.defaultLanguageCode,
    });
    const updated = await this.channelAdminService.updateChannelAdministrator(channelCtx, {
      id: administratorId,
      permissions: permissions as import('@vendure/core').Permission[],
    });
    const detail = await this.platformAdminService.getAdministratorDetail(
      ctx,
      updated.id.toString()
    );
    if (!detail) {
      throw new Error('Failed to load updated administrator');
    }
    return detail;
  }
}
