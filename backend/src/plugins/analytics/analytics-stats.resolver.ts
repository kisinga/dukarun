import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import {
  AnalyticsQueryParams,
  AnalyticsQueryService,
} from '../../services/analytics/analytics-query.service';

@Resolver()
export class AnalyticsStatsResolver {
  constructor(private readonly analyticsQueryService: AnalyticsQueryService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async analyticsStats(
    @Ctx() ctx: RequestContext,
    @Args('timeRange')
    timeRange: {
      startDate: string;
      endDate: string;
      previousStartDate?: string;
      previousEndDate?: string;
    },
    @Args('limit', { nullable: true }) limit?: number
  ) {
    const channelId = ctx.channelId as number;
    const params: AnalyticsQueryParams = {
      channelId,
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

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async refreshAnalytics(): Promise<boolean> {
    await this.analyticsQueryService.refreshAll();
    return true;
  }
}
