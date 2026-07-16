import { graphql } from '../../core/graphql/generated';

/**
 * Analytics operations for the super-admin app.
 */

export const ANALYTICS_STATS_FOR_CHANNEL = graphql(`
  query AnalyticsStatsForChannel($channelId: ID!, $timeRange: AnalyticsTimeRange!, $limit: Int) {
    analyticsStatsForChannel(channelId: $channelId, timeRange: $timeRange, limit: $limit) {
      totalRevenue
      totalOrders
      averageProfitMargin
      salesTrend { date value }
      orderVolumeTrend { date value }
      customerGrowthTrend { date value }
    }
  }
`);
