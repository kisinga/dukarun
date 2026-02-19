import { gql } from 'graphql-tag';

export const DASHBOARD_STATS_SCHEMA = gql`
  type AccountBreakdown {
    label: String!
    value: Float!
    icon: String!
  }

  type PeriodStats {
    today: Float!
    week: Float!
    month: Float!
    accounts: [AccountBreakdown!]!
  }

  """
  COGS-derived sales totals for a single period (cents; orderCount from order stats).
  """
  type SalesSummaryPeriod {
    revenue: Float!
    cogs: Float!
    margin: Float!
    orderCount: Int!
  }

  """
  COGS-derived sales summary for dashboard (today / week / month).
  """
  type SalesSummary {
    today: SalesSummaryPeriod!
    week: SalesSummaryPeriod!
    month: SalesSummaryPeriod!
  }

  type DashboardStats {
    sales: PeriodStats!
    purchases: PeriodStats!
    expenses: PeriodStats!
    salesSummary: SalesSummary
  }

  """
  Stock value at retail, wholesale, and cost (cents). Cached per channel; use forceRefresh to recompute.
  """
  type StockValueStats {
    retail: Float!
    wholesale: Float!
    cost: Float!
  }

  enum StockValuationType {
    RETAIL
    WHOLESALE
    COST
  }

  type StockValueRankingItem {
    productVariantId: ID!
    productId: ID!
    productName: String!
    variantName: String
    value: Float!
  }

  type StockValueRankingResult {
    items: [StockValueRankingItem!]!
    total: Float!
  }

  extend type Query {
    dashboardStats(startDate: DateTime, endDate: DateTime): DashboardStats!
    stockValueStats(stockLocationId: ID, forceRefresh: Boolean): StockValueStats!
    stockValueRanking(
      valuationType: StockValuationType!
      limit: Int
      stockLocationId: ID
    ): StockValueRankingResult!
  }
`;
