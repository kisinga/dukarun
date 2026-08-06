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

  """
  Per-period profit from source tables (not the analytics MVs), on the per-order margin basis.
  Amounts in cents. See basis for the exact computation disclosure.
  """
  type PeriodProfit {
    netRevenueCents: Int!
    cogsCents: Int!
    grossMarginCents: Int!
    expensesCents: Int!
    "Expense totals by category for the period"
    expenseBreakdown: [AccountBreakdown!]!
    "Net inventory write-downs (INVENTORY_ADJUSTMENT debits), clamped at 0 for net-gain periods"
    inventoryLossesCents: Int!
    netProfitCents: Int!
    "Orders in the period whose COGS figure is estimated or missing"
    unreliableOrderCount: Int!
    basis: String!
  }

  extend type Query {
    dashboardStats(startDate: DateTime, endDate: DateTime): DashboardStats!
    periodProfit(startDate: DateTime!, endDate: DateTime!): PeriodProfit!
    stockValueStats(stockLocationId: ID, forceRefresh: Boolean): StockValueStats!
    stockValueRanking(
      valuationType: StockValuationType!
      limit: Int
      stockLocationId: ID
    ): StockValueRankingResult!
  }
`;
