import { Injectable, OnModuleInit } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { LedgerPlugin } from '../ledger/ledger.plugin';
import { gql } from 'graphql-tag';

import { CreditService } from '../../services/credit/credit.service';
import { CreditValidatorService } from '../../services/credit/credit-validator.service';
import { ChartOfAccountsService } from '../../services/financial/chart-of-accounts.service';
import { FinancialService } from '../../services/financial/financial.service';
import { LedgerPostingService } from '../../services/financial/ledger-posting.service';
import { LedgerQueryService } from '../../services/financial/ledger-query.service';
import { LedgerTransactionService } from '../../services/financial/ledger-transaction.service';
import { PurchasePostingStrategy } from '../../services/financial/strategies/purchase-posting.strategy';
import { SalePostingStrategy } from '../../services/financial/strategies/sale-posting.strategy';
import { OrderAddressService } from '../../services/orders/order-address.service';
import { OrderCreationService } from '../../services/orders/order-creation.service';
import { OrderFulfillmentService } from '../../services/orders/order-fulfillment.service';
import { OrderItemService } from '../../services/orders/order-item.service';
import { OrderPaymentService } from '../../services/orders/order-payment.service';
import { OrderStateService } from '../../services/orders/order-state.service';
import { PriceOverrideService } from '../../services/orders/price-override.service';
import { PaymentAllocationService } from '../../services/payments/payment-allocation.service';
import { PaymentEventsAdapter } from '../../services/payments/payment-events.adapter';
import { createCreditPaymentHandler } from '../../services/payments/payment-handlers';
import { SupplierPaymentAllocationService } from '../../services/payments/supplier-payment-allocation.service';
import { CreditPaymentSubscriber } from './credit-payment.subscriber';
import { CreditResolver } from './credit.resolver';
import { CustomerFieldResolver } from './customer.resolver';
import { PaymentAllocationResolver } from './payment-allocation.resolver';
import {
  ApproveCustomerCreditPermission,
  ManageCustomerCreditLimitPermission,
} from './permissions';
import { ManageSupplierCreditPurchasesPermission } from './supplier-credit.permissions';
import { SupplierCreditResolver } from './supplier-credit.resolver';
import { SupplierPaymentAllocationResolver } from './supplier-payment-allocation.resolver';

// Merge all schemas into a single DocumentNode
const COMBINED_SCHEMA = gql`
  """
  All monetary amounts in CreditSummary are in smallest currency unit (cents)
  """
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

  """
  All monetary amounts in PaymentAllocationResult are in smallest currency unit (cents)
  """
  type PaymentAllocationResult {
    ordersPaid: [OrderPayment!]!
    remainingBalance: Float!
    totalAllocated: Float!
    excessPayment: Float!
  }

  type OrderPayment {
    orderId: ID!
    orderCode: String!
    amountPaid: Float!
  }

  """
  paymentAmount in smallest currency unit (cents)
  """
  input PaymentAllocationInput {
    customerId: ID!
    paymentAmount: Float!
    orderIds: [ID!]
  }

  """
  paymentAmount in smallest currency unit (cents)
  """
  input PaySingleOrderInput {
    orderId: ID!
    paymentAmount: Float
    paymentMethodCode: String
    referenceNumber: String
    debitAccountCode: String
  }

  type CreditValidationResult {
    isValid: Boolean!
    error: String
    availableCredit: Float!
    estimatedOrderTotal: Float!
    wouldExceedLimit: Boolean!
  }

  input ValidateCreditInput {
    customerId: ID!
    estimatedOrderTotal: Float!
  }

  extend type Customer {
    outstandingAmount: Float!
    """
    Supplier balance (AP). Only non-zero when customer is a supplier. Cents.
    """
    supplierOutstandingAmount: Float!
  }

  extend type Query {
    creditSummary(customerId: ID!): CreditSummary!
    unpaidOrdersForCustomer(customerId: ID!): [Order!]!
    validateCredit(input: ValidateCreditInput!): CreditValidationResult!
  }

  extend type Mutation {
    approveCustomerCredit(input: ApproveCustomerCreditInput!): CreditSummary!
    updateCustomerCreditLimit(input: UpdateCustomerCreditLimitInput!): CreditSummary!
    updateCreditDuration(input: UpdateCreditDurationInput!): CreditSummary!
    createOrder(input: CreateOrderInput!): Order!
    allocateBulkPayment(input: PaymentAllocationInput!): PaymentAllocationResult!
    paySingleOrder(input: PaySingleOrderInput!): PaymentAllocationResult!
  }

  """
  All monetary amounts in SupplierCreditSummary are in smallest currency unit (cents)
  """
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

  """
  All monetary amounts in SupplierPaymentAllocationResult are in smallest currency unit (cents)
  """
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

  """
  paymentAmount in smallest currency unit (cents)
  """
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

@VendurePlugin({
  imports: [PluginCommonModule, LedgerPlugin],
  providers: [
    // Financial services (ledger infrastructure)
    LedgerQueryService,
    LedgerPostingService,
    // Ledger transaction framework
    PurchasePostingStrategy,
    SalePostingStrategy,
    LedgerTransactionService,
    FinancialService,
    ChartOfAccountsService,
    // Credit services
    CreditService,
    CreditValidatorService,
    // Order services
    OrderCreationService,
    PriceOverrideService,
    OrderAddressService,
    OrderFulfillmentService,
    OrderItemService,
    OrderPaymentService,
    OrderStateService,
    // Payment services
    PaymentAllocationService,
    SupplierPaymentAllocationService,
    // Resolvers and subscribers
    CreditResolver,
    CustomerFieldResolver,
    CreditPaymentSubscriber,
    PaymentAllocationResolver,
    SupplierCreditResolver,
    SupplierPaymentAllocationResolver,
    PaymentEventsAdapter, // Moved from LedgerPlugin - needs FinancialService
  ],
  exports: [
    // Export for use by other plugins (StockPlugin, etc.)
    FinancialService,
    ChartOfAccountsService,
    CreditService,
    CreditValidatorService,
  ],
  configuration: config => {
    // Register custom permissions
    config.authOptions.customPermissions = [
      ...(config.authOptions.customPermissions || []),
      ApproveCustomerCreditPermission,
      ManageCustomerCreditLimitPermission,
      ManageSupplierCreditPurchasesPermission,
    ];

    // Replace the placeholder credit payment handler with a DI-backed instance.
    // The CreditService provider is available in the plugin context, so we can
    // construct the handler using the factory.
    const creditServiceProvider = CreditService as any;
    config.paymentOptions.paymentMethodHandlers = [
      ...config.paymentOptions.paymentMethodHandlers,
      createCreditPaymentHandler(creditServiceProvider),
    ];

    return config;
  },
  adminApiExtensions: {
    schema: COMBINED_SCHEMA,
    resolvers: [
      CreditResolver,
      CustomerFieldResolver,
      PaymentAllocationResolver,
      SupplierCreditResolver,
      SupplierPaymentAllocationResolver,
    ],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class CreditPlugin {}
