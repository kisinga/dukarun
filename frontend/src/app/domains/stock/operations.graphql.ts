import { graphql } from '../../shared/graphql/generated';

export const RECORD_STOCK_ADJUSTMENT = graphql(`
  mutation RecordStockAdjustment($input: RecordStockAdjustmentInput!) {
    recordStockAdjustment(input: $input) {
      id
      reason
      notes
      adjustedByUserId
      lines {
        id
        variantId
        quantityChange
        previousStock
        newStock
        stockLocationId
      }
      createdAt
      updatedAt
    }
  }
`);

export const GET_STOCK_ADJUSTMENTS = graphql(`
  query GetStockAdjustments($options: StockAdjustmentListOptions) {
    stockAdjustments(options: $options) {
      items {
        id
        reason
        notes
        adjustedByUserId
        adjustedBy {
          id
          identifier
        }
        lines {
          id
          variantId
          quantityChange
          previousStock
          newStock
          stockLocationId
          batchId
          unitCostCents
          totalCostCents
          allocations
          variant {
            id
            name
            sku
            product {
              id
              name
            }
          }
          stockLocation {
            id
            name
          }
        }
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);
