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
    amountOwing: Int
    dueDate: DateTime
    isOverdue: Boolean!
    notes: String
    isCreditPurchase: Boolean!
    status: String!
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
    "Batch the adjustment applied to (UUID), when a specific batch was used"
    batchId: String
    "Unit cost in cents captured at adjustment time (null when unknown/mixed)"
    unitCostCents: Int
    "Signed change in batch valuation for this line, in cents"
    totalCostCents: Int
    "Per-batch cost breakdown: [{ batchId, quantity, unitCostCents, totalCostCents }]"
    allocations: JSON
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
    debitAccountCode: String!
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
    approvalId: ID
    saveAsDraft: Boolean
  }

  input UpdateDraftPurchaseInput {
    supplierId: ID
    purchaseDate: DateTime
    referenceNumber: String
    notes: String
    lines: [PurchaseLineInput!]
  }

  input PurchaseLineInput {
    variantId: ID!
    quantity: Float!
    unitCost: Int!
    stockLocationId: ID!
    batchNumber: String
    expiryDate: DateTime
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
    """
    Selects which open batch an increase merges into. Without batchId (and without unitCost),
    the most recent batch is used. UUID (use String!, not ID!, per GRAPHQL_IDS_AND_UUIDS.md).
    """
    batchId: String
    """
    Unit cost in cents for increases. When it differs from the target batch's cost, a new batch
    is created at this cost (costs are never blended). Required when the variant has no stock.
    """
    unitCost: Int
  }

  input PurchaseListOptions {
    skip: Int
    take: Int
    filter: PurchaseFilterInput
    sort: PurchaseSortInput
  }

  input PurchaseFilterInput {
    supplierId: ID
    status: String
    startDate: DateTime
    endDate: DateTime
    overdueOnly: Boolean
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

  type InventoryBatch {
    id: ID!
    channelId: ID!
    stockLocationId: ID!
    productVariantId: ID!
    quantity: Float!
    unitCost: Int!
    expiryDate: DateTime
    sourceType: String!
    sourceId: ID!
    batchNumber: String
    consumePriority: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  extend type ProductVariant {
    inventoryBatches: [InventoryBatch!]!
  }

  extend type Query {
    purchases(options: PurchaseListOptions): StockPurchaseList!
    purchase(id: ID!): StockPurchase
    stockAdjustments(options: StockAdjustmentListOptions): InventoryStockAdjustmentList!
  }

  extend type Mutation {
    recordPurchase(input: RecordPurchaseInput!): StockPurchase!
    confirmPurchase(id: ID!): StockPurchase!
    updateDraftPurchase(id: ID!, input: UpdateDraftPurchaseInput!): StockPurchase!
    recordStockAdjustment(input: RecordStockAdjustmentInput!): InventoryStockAdjustment!
  }
`;
