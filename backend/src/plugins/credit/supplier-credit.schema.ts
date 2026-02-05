import { gql } from 'graphql-tag';

export const SUPPLIER_CREDIT_SCHEMA = gql`
  type SupplierCreditSummary {
    supplierId: ID!
    isSupplierCreditApproved: Boolean!
    supplierCreditLimit: Float!
    outstandingAmount: Float!
    availableCredit: Float!
    lastRepaymentDate: DateTime
    lastRepaymentAmount: Float!
    supplierCreditDuration: Int!
  }

  input ApproveSupplierCreditInput {
    supplierId: ID!
    approved: Boolean!
    supplierCreditLimit: Float
    supplierCreditDuration: Int
  }

  input UpdateSupplierCreditLimitInput {
    supplierId: ID!
    supplierCreditLimit: Float!
    supplierCreditDuration: Int
  }

  input UpdateSupplierCreditDurationInput {
    supplierId: ID!
    supplierCreditDuration: Int!
  }

  type SupplierPaymentAllocationResult {
    purchasesPaid: [SupplierPurchasePayment!]!
    remainingBalance: Float!
    totalAllocated: Float!
    excessPayment: Float!
  }

  type SupplierPurchasePayment {
    purchaseId: ID!
    purchaseReference: String!
    amountPaid: Float!
  }

  input SupplierPaymentAllocationInput {
    supplierId: ID!
    paymentAmount: Float!
    purchaseIds: [ID!]
    debitAccountCode: String
  }

  input PaySinglePurchaseInput {
    purchaseId: ID!
    paymentAmount: Float
    debitAccountCode: String
  }

  extend type Query {
    supplierCreditSummary(supplierId: ID!): SupplierCreditSummary!
    unpaidPurchasesForSupplier(supplierId: ID!): [StockPurchase!]!
  }

  extend type Mutation {
    approveSupplierCredit(input: ApproveSupplierCreditInput!): SupplierCreditSummary!
    updateSupplierCreditLimit(input: UpdateSupplierCreditLimitInput!): SupplierCreditSummary!
    updateSupplierCreditDuration(input: UpdateSupplierCreditDurationInput!): SupplierCreditSummary!
    allocateBulkSupplierPayment(
      input: SupplierPaymentAllocationInput!
    ): SupplierPaymentAllocationResult!
    paySinglePurchase(input: PaySinglePurchaseInput!): SupplierPaymentAllocationResult!
  }
`;
