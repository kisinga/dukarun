import { gql } from 'graphql-tag';

export const STOCK_ADMIN_SCHEMA = gql`
  type StockPurchase {
    id: ID!
    supplierId: ID!
    supplier: Customer
    purchaseDate: DateTime!
    referenceNumber: String
    totalCost: Int!
    paymentStatus: String!
    notes: String
    isCreditPurchase: Boolean!
    lines: [StockPurchaseLine!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type StockPurchaseLine {
    id: ID!
    purchaseId: ID!
    variantId: ID!
    variant: ProductVariant
    quantity: Float!
    unitCost: Int!
    totalCost: Int!
    stockLocationId: ID!
    stockLocation: StockLocation
  }

  type InventoryStockAdjustment {
    id: ID!
    reason: String!
    notes: String
    adjustedByUserId: ID
    adjustedBy: User
    lines: [InventoryStockAdjustmentLine!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type InventoryStockAdjustmentLine {
    id: ID!
    adjustmentId: ID!
    variantId: ID!
    variant: ProductVariant
    quantityChange: Float!
    previousStock: Float!
    newStock: Float!
    stockLocationId: ID!
    stockLocation: StockLocation
  }

  type StockPurchaseList {
    items: [StockPurchase!]!
    totalItems: Int!
  }

  type InventoryStockAdjustmentList {
    items: [InventoryStockAdjustment!]!
    totalItems: Int!
  }

  input InlinePaymentInput {
    amount: Int!
    debitAccountCode: String
    reference: String
  }

  input RecordPurchaseInput {
    supplierId: ID!
    purchaseDate: DateTime!
    referenceNumber: String
    paymentStatus: String!
    notes: String
    lines: [PurchaseLineInput!]!
    isCreditPurchase: Boolean
    payment: InlinePaymentInput
  }

  input PurchaseLineInput {
    variantId: ID!
    quantity: Float!
    unitCost: Int!
    stockLocationId: ID!
  }

  input RecordStockAdjustmentInput {
    reason: String!
    notes: String
    lines: [StockAdjustmentLineInput!]!
  }

  input StockAdjustmentLineInput {
    variantId: ID!
    quantityChange: Float!
    stockLocationId: ID!
  }

  input PurchaseListOptions {
    skip: Int
    take: Int
    filter: PurchaseFilterInput
    sort: PurchaseSortInput
  }

  input PurchaseFilterInput {
    supplierId: ID
    startDate: DateTime
    endDate: DateTime
  }

  input PurchaseSortInput {
    purchaseDate: SortOrder
    createdAt: SortOrder
  }

  input StockAdjustmentListOptions {
    skip: Int
    take: Int
    filter: StockAdjustmentFilterInput
    sort: StockAdjustmentSortInput
  }

  input StockAdjustmentFilterInput {
    reason: String
    startDate: DateTime
    endDate: DateTime
  }

  input StockAdjustmentSortInput {
    createdAt: SortOrder
  }

  extend type Query {
    purchases(options: PurchaseListOptions): StockPurchaseList!
    stockAdjustments(options: StockAdjustmentListOptions): InventoryStockAdjustmentList!
  }

  extend type Mutation {
    recordPurchase(input: RecordPurchaseInput!): StockPurchase!
    recordStockAdjustment(input: RecordStockAdjustmentInput!): InventoryStockAdjustment!
  }
`;
