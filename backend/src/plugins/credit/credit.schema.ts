import { gql } from 'graphql-tag';

export const CREDIT_ADMIN_SCHEMA = gql`
  type CreditSummary {
    customerId: ID!
    isCreditApproved: Boolean!
    creditFrozen: Boolean!
    creditLimit: Float!
    outstandingAmount: Float!
    availableCredit: Float!
    lastRepaymentDate: DateTime
    lastRepaymentAmount: Float!
    creditDuration: Int!
  }

  input ApproveCustomerCreditInput {
    customerId: ID!
    approved: Boolean!
    creditLimit: Float
    creditDuration: Int
  }

  input UpdateCustomerCreditLimitInput {
    customerId: ID!
    creditLimit: Float!
    creditDuration: Int
  }

  input UpdateCreditDurationInput {
    customerId: ID!
    creditDuration: Int!
  }

  input CartItemInput {
    variantId: ID!
    quantity: Float!
    customLinePrice: Int
    priceOverrideReason: String
  }

  input CreateOrderInput {
    cartItems: [CartItemInput!]!
    paymentMethodCode: String!
    customerId: ID
    metadata: JSON
    isCreditSale: Boolean
    isCashierFlow: Boolean
  }

  extend type Query {
    creditSummary(customerId: ID!): CreditSummary!
  }

  extend type Mutation {
    approveCustomerCredit(input: ApproveCustomerCreditInput!): CreditSummary!
    updateCustomerCreditLimit(input: UpdateCustomerCreditLimitInput!): CreditSummary!
    updateCreditDuration(input: UpdateCreditDurationInput!): CreditSummary!
    createOrder(input: CreateOrderInput!): Order!
  }
`;
