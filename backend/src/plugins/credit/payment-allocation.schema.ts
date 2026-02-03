import { gql } from 'graphql-tag';

export const PAYMENT_ALLOCATION_SCHEMA = gql`
  type PaymentAllocationResult {
    ordersPaid: [OrderPayment!]!
    remainingBalance: Float!
    totalAllocated: Float!
  }

  type OrderPayment {
    orderId: ID!
    orderCode: String!
    amountPaid: Float!
  }

  input PaymentAllocationInput {
    customerId: ID!
    paymentAmount: Float!
    orderIds: [ID!]
    debitAccountCode: String
  }

  extend type Query {
    unpaidOrdersForCustomer(customerId: ID!): [Order!]!
  }

  extend type Mutation {
    allocateBulkPayment(input: PaymentAllocationInput!): PaymentAllocationResult!
  }
`;
