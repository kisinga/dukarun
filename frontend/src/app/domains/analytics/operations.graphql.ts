import { graphql } from '../../shared/graphql/generated';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

export const GET_ORDERS_FOR_PERIOD = graphql(`
  query GetOrdersForPeriod($startDate: DateTime!) {
    orders(options: { filter: { orderPlacedAt: { after: $startDate } }, take: 100 }) {
      items {
        id
        total
        totalWithTax
        orderPlacedAt
        state
        payments {
          id
          amount
          method
          state
        }
      }
    }
  }
`);

export const GET_DASHBOARD_STATS = graphql(`
  query GetDashboardStats($startDate: DateTime, $endDate: DateTime) {
    dashboardStats(startDate: $startDate, endDate: $endDate) {
      sales {
        today
        week
        month
        accounts {
          label
          value
          icon
        }
      }
      purchases {
        today
        week
        month
        accounts {
          label
          value
          icon
        }
      }
      expenses {
        today
        week
        month
        accounts {
          label
          value
          icon
        }
      }
      salesSummary {
        today {
          revenue
          cogs
          margin
          orderCount
        }
        week {
          revenue
          cogs
          margin
          orderCount
        }
        month {
          revenue
          cogs
          margin
          orderCount
        }
      }
    }
  }
`);

export const GET_PLATFORM_METRICS = graphql(`
  query GetPlatformMetrics {
    platformMetrics {
      onlineUsers
      mau
    }
  }
`);

export const GET_STOCK_VALUE_STATS = graphql(`
  query GetStockValueStats($stockLocationId: ID, $forceRefresh: Boolean) {
    stockValueStats(stockLocationId: $stockLocationId, forceRefresh: $forceRefresh) {
      retail
      wholesale
      cost
    }
  }
`);

export const GET_INVENTORY_ALERTS = graphql(`
  query GetInventoryAlerts($expiryThresholdDays: Int) {
    inventoryAlerts(expiryThresholdDays: $expiryThresholdDays) {
      lowStockCount
      expiringSoonCount
      expiredCount
    }
  }
`);

export const GET_STOCK_VALUE_RANKING = graphql(`
  query GetStockValueRanking(
    $valuationType: StockValuationType!
    $limit: Int
    $stockLocationId: ID
  ) {
    stockValueRanking(
      valuationType: $valuationType
      limit: $limit
      stockLocationId: $stockLocationId
    ) {
      items {
        productVariantId
        productId
        productName
        variantName
        value
      }
      total
    }
  }
`);

export const GET_PRODUCT_STATS = graphql(`
  query GetProductStats {
    products(options: { take: 1 }) {
      totalItems
    }
    productVariants(options: { take: 1 }) {
      totalItems
    }
  }
`);

export const GET_RECENT_ORDERS = graphql(`
  query GetRecentOrders {
    orders(options: { take: 10, sort: { createdAt: DESC } }) {
      items {
        id
        code
        total
        totalWithTax
        state
        createdAt
        orderPlacedAt
        currencyCode
        customer {
          id
          firstName
          lastName
          emailAddress
        }
        lines {
          id
          quantity
          productVariant {
            id
            name
            sku
            product {
              id
              name
            }
          }
        }
        payments {
          id
          state
          amount
          method
          createdAt
        }
      }
    }
  }
`);

export const GET_ANALYTICS_STATS = graphql(`
  query GetAnalyticsStats($timeRange: AnalyticsTimeRange!, $limit: Int) {
    analyticsStats(timeRange: $timeRange, limit: $limit) {
      topSelling {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        totalRevenue
        totalMargin
        marginPercent
        quantityChangePercent
      }
      highestRevenue {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        totalRevenue
        totalMargin
        marginPercent
      }
      highestMargin {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        totalRevenue
        totalMargin
        marginPercent
      }
      trending {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        quantityChangePercent
      }
      salesTrend {
        date
        value
      }
      orderVolumeTrend {
        date
        value
      }
      customerGrowthTrend {
        date
        value
      }
      averageProfitMargin
      totalRevenue
      totalOrders
    }
  }
`);

export const REFRESH_ANALYTICS = graphql(`
  mutation RefreshAnalytics {
    refreshAnalytics
  }
`);

/**
 * Period profit (tax-exclusive revenue vs FIFO COGS, minus expenses and inventory losses).
 * Not part of the codegen-typed documents (schema addition postdates the last codegen run);
 * ships as a precompiled AST document, same pattern as the order margin operations.
 */
export interface PeriodProfit {
  netRevenueCents: number;
  cogsCents: number;
  grossMarginCents: number;
  expensesCents: number;
  expenseBreakdown: Array<{ label: string; value: number; icon: string }>;
  inventoryLossesCents: number;
  netProfitCents: number;
  unreliableOrderCount: number;
  basis: string;
}

export interface GetPeriodProfitResult {
  periodProfit: PeriodProfit;
}

export const GET_PERIOD_PROFIT = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: {
        kind: 'Name',
        value: 'GetPeriodProfit',
      },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: {
              kind: 'Name',
              value: 'startDate',
            },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: {
                kind: 'Name',
                value: 'DateTime',
              },
            },
          },
          directives: [],
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: {
              kind: 'Name',
              value: 'endDate',
            },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: {
                kind: 'Name',
                value: 'DateTime',
              },
            },
          },
          directives: [],
        },
      ],
      directives: [],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'periodProfit',
            },
            arguments: [
              {
                kind: 'Argument',
                name: {
                  kind: 'Name',
                  value: 'startDate',
                },
                value: {
                  kind: 'Variable',
                  name: {
                    kind: 'Name',
                    value: 'startDate',
                  },
                },
              },
              {
                kind: 'Argument',
                name: {
                  kind: 'Name',
                  value: 'endDate',
                },
                value: {
                  kind: 'Variable',
                  name: {
                    kind: 'Name',
                    value: 'endDate',
                  },
                },
              },
            ],
            directives: [],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'netRevenueCents',
                  },
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'cogsCents',
                  },
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'grossMarginCents',
                  },
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'expensesCents',
                  },
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'expenseBreakdown',
                  },
                  arguments: [],
                  directives: [],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'label',
                        },
                        arguments: [],
                        directives: [],
                      },
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'value',
                        },
                        arguments: [],
                        directives: [],
                      },
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'icon',
                        },
                        arguments: [],
                        directives: [],
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'inventoryLossesCents',
                  },
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'netProfitCents',
                  },
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'unreliableOrderCount',
                  },
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'basis',
                  },
                  arguments: [],
                  directives: [],
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetPeriodProfitResult, { startDate: string; endDate: string }>;
