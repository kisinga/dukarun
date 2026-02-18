import gql from 'graphql-tag';

export const ANALYTICS_STATS_SCHEMA = gql`
  type TimeSeriesPoint {
    date: String!
    value: Float!
  }

  type ProductPerformance {
    productVariantId: ID!
    productId: ID!
    productName: String!
    variantName: String
    totalQuantity: Int!
    totalRevenue: Float!
    totalCost: Float
    totalMargin: Float
    marginPercent: Float
    quantityChangePercent: Float
  }

  type AnalyticsStats {
    topSelling: [ProductPerformance!]!
    highestRevenue: [ProductPerformance!]!
    highestMargin: [ProductPerformance!]!
    trending: [ProductPerformance!]!
    salesTrend: [TimeSeriesPoint!]!
    orderVolumeTrend: [TimeSeriesPoint!]!
    customerGrowthTrend: [TimeSeriesPoint!]!
    averageProfitMargin: Float!
    totalRevenue: Float!
    totalOrders: Int!
  }

  input AnalyticsTimeRange {
    startDate: String!
    endDate: String!
    previousStartDate: String
    previousEndDate: String
  }

  extend type Query {
    analyticsStats(timeRange: AnalyticsTimeRange!, limit: Int): AnalyticsStats!
  }

  extend type Mutation {
    refreshAnalytics: Boolean!
  }
`;
