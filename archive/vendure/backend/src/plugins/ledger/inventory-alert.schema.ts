import { gql } from 'graphql-tag';

export const INVENTORY_ALERT_SCHEMA = gql`
  enum InventoryAlertFilter {
    LOW_STOCK
    EXPIRING_SOON
    EXPIRED
  }

  type InventoryAlertCounts {
    lowStockCount: Int!
    expiringSoonCount: Int!
    expiredCount: Int!
  }

  extend type Query {
    inventoryAlerts(expiryThresholdDays: Int): InventoryAlertCounts!
    productsByInventoryAlert(
      filter: InventoryAlertFilter!
      options: ProductListOptions
    ): ProductList!
  }
`;
