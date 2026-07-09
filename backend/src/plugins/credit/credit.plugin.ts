import { Injectable, OnModuleInit } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { ApprovalPlugin } from '../approval/approval.plugin';
import { CommunicationPlugin } from '../communication/communication.plugin';
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
import { OrderCancellationDetectorSubscriber } from '../../services/orders/order-cancellation-detector.subscriber';
import { OrderCancellationProcess } from '../../services/orders/order-cancellation-process';
import { OrderReversalService } from '../../services/orders/order-reversal.service';
import { OrderStateService } from '../../services/orders/order-state.service';
import { PriceOverrideService } from '../../services/orders/price-override.service';
import { OrderReconciliationService } from '../../services/payments/order-reconciliation.service';
import { PaymentAllocationService } from '../../services/payments/payment-allocation.service';
import { PaymentEventsAdapter } from '../../services/payments/payment-events.adapter';
import { CustomerStatementService } from '../../services/customers/customer-statement.service';
import { createCreditPaymentHandler } from '../../services/payments/payment-handlers';
import { SupplierPaymentAllocationService } from '../../services/payments/supplier-payment-allocation.service';
import { CreditPaymentSubscriber } from './credit-payment.subscriber';
import { CreditResolver } from './credit.resolver';
import { CustomerFieldResolver } from './customer.resolver';
import { CustomerStatementResolver } from './customer-statement.resolver';
import { OrderAmountOwingLoader } from './order-amount-owing.loader';
import { OrderFieldResolver } from './order.resolver';
import { PaymentAllocationResolver } from './payment-allocation.resolver';
import {
  ApproveCustomerCreditPermission,
  ManageCustomerCreditLimitPermission,
  OverrideCustomerBalancePermission,
  ReverseOrderPermission,
  SettleOrderPermission,
} from './permissions';
import { OrderReversalApprovalSubscriber } from './order-reversal-approval.subscriber';
import { OrderReversalResolver } from './order-reversal.resolver';
import { PaymentReversalResolver } from './payment-reversal.resolver';
import { PaymentReversalService } from '../../services/payments/payment-reversal.service';
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
    paymentMethodCode: String
    customerId: ID
    metadata: JSON
    isCreditSale: Boolean
    isCashierFlow: Boolean
    saveAsProforma: Boolean
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

  type OrderReconciliationItem {
    orderId: ID!
    orderCode: String!
    customerId: ID
    orderModelOwing: Int!
    ledgerOwing: Int!
    difference: Int!
    orderTotal: Int!
    orderModelPaid: Int!
    ledgerPaid: Int!
    orderModelTotal: Int!
    ledgerTotalOwed: Int!
  }

  type OrderReconciliationResult {
    items: [OrderReconciliationItem!]!
    totalItems: Int!
  }

  input ReconcileOrderInput {
    orderId: ID!
    strategy: String!
    note: String
  }

  type ReconcileOrderResult {
    orderId: ID!
    success: Boolean!
    message: String!
  }

  """
  Single endpoint for recording a payment. When orderId is set, pays that order; when omitted, allocates across customer's unpaid orders.
  paymentAmount in smallest currency unit (cents).
  """
  input RecordPaymentInput {
    customerId: ID!
    paymentAmount: Float!
    paymentMethodCode: String!
    referenceNumber: String
    orderId: ID
  }

  """
  paymentAmount in smallest currency unit (cents)
  """
  input PaymentAllocationInput {
    customerId: ID!
    paymentAmount: Float!
    orderIds: [ID!]
    paymentMethodCode: String
    referenceNumber: String
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

  """
  One tender in a (possibly split) cashier settlement. amount in smallest currency unit (cents).
  """
  input OrderTenderInput {
    paymentMethodCode: String!
    amount: Int!
    referenceNumber: String
  }

  """
  Settle a single order with one or more tenders (split payment). Amounts in cents.
  """
  input SettleOrderPaymentsInput {
    orderId: ID!
    tenders: [OrderTenderInput!]!
  }

  type SettledTender {
    paymentMethodCode: String!
    amount: Int!
  }

  """
  Result of settling an order at the cashier. All amounts in smallest currency unit (cents).
  """
  type SettleOrderPaymentsResult {
    orderId: ID!
    orderCode: String!
    tenders: [SettledTender!]!
    amountSettled: Int!
    remainingOwing: Int!
    fullySettled: Boolean!
  }

  """
  An order parked at the cashier awaiting collection. amountOwing in smallest currency unit (cents).
  """
  type CashierPendingOrder {
    order: Order!
    amountOwing: Int!
    pendingSince: DateTime
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
    """
    Customer balance (AR). Cents. Null when the ledger balance cannot be computed.
    """
    outstandingAmount: Float
    """
    Supplier balance (AP). Only non-zero when customer is a supplier. Cents.
    Null when the ledger balance cannot be computed.
    """
    supplierOutstandingAmount: Float
  }

  extend type Order {
    """
    Amount still owed on this order, in smallest currency unit (cents).
    Computed from the ledger (Accounts Receivable) and is the single source of truth.
    """
    amountOwing: Int!
  }

  """
  Order payment status from the ledger (AR account by orderId). Amounts in smallest currency unit (cents).
  """
  type OrderPaymentStatus {
    totalOwed: Int!
    amountPaid: Int!
    amountOwing: Int!
  }

  extend type Query {
    creditSummary(customerId: ID!): CreditSummary!
    unpaidOrdersForCustomer(customerId: ID!): [Order!]!
    orderPaymentStatus(orderId: ID!): OrderPaymentStatus
    validateCredit(input: ValidateCreditInput!): CreditValidationResult!
    """
    Orders parked at the cashier and still owing (the cashier settlement queue).
    """
    pendingCashierOrders: [CashierPendingOrder!]!
    """
    Superadmin diagnostic: orders whose order-model outstanding differs from the ledger.
    """
    divergentOrders(toleranceCents: Int): OrderReconciliationResult!
  }

  type OrderReversalResult {
    order: Order!
    """
    True if the order had settled payments before reversal (refund is not automatic).
    """
    hadPayments: Boolean!
  }

  type PaymentReversalResult {
    paymentId: ID!
    """
    The amount that was reversed, in smallest currency unit (cents).
    """
    reversedAmount: Float!
    """
    True if the order now has an outstanding balance after the payment reversal.
    """
    orderNowUnderpaid: Boolean!
  }

  """
  All monetary amounts in BalanceOverrideResult are in smallest currency unit (cents).
  """
  type BalanceOverrideResult {
    customerId: ID!
    previousBalance: Float!
    newBalance: Float!
    adjustmentAmount: Float!
  }

  input OverrideCustomerBalanceInput {
    customerId: ID!
    """
    Target balance in smallest currency unit (cents). Must be >= 0.
    """
    targetBalance: Float!
    """
    Reason for the override (required for audit trail).
    """
    reason: String!
  }

  extend type Mutation {
    approveCustomerCredit(input: ApproveCustomerCreditInput!): CreditSummary!
    updateCustomerCreditLimit(input: UpdateCustomerCreditLimitInput!): CreditSummary!
    updateCreditDuration(input: UpdateCreditDurationInput!): CreditSummary!
    createOrder(input: CreateOrderInput!): Order!
    recordPayment(input: RecordPaymentInput!): PaymentAllocationResult!
    allocateBulkPayment(input: PaymentAllocationInput!): PaymentAllocationResult!
    paySingleOrder(input: PaySingleOrderInput!): PaymentAllocationResult!
    settleOrderPayments(input: SettleOrderPaymentsInput!): SettleOrderPaymentsResult!
    reverseOrder(orderId: ID!): OrderReversalResult!
    voidOrder(orderId: ID!): OrderReversalResult!
    reversePayment(paymentId: ID!): PaymentReversalResult!
    overrideCustomerBalance(input: OverrideCustomerBalanceInput!): BalanceOverrideResult!
    sendCustomerStatementEmail(customerId: ID!): Boolean!
    """
    Superadmin action: mark a divergent order as reconciled with a chosen strategy.
    """
    reconcileOrder(input: ReconcileOrderInput!): ReconcileOrderResult!
    """
    Superadmin action: rebuild an order's state from the ledger AR balance.
    """
    rebuildOrderFromLedger(orderId: ID!, note: String): ReconcileOrderResult!
    """
    Superadmin action: rebuild the ledger AR balance from the customer's order model.
    """
    rebuildCustomerBalanceFromModel(customerId: ID!, note: String): BalanceOverrideResult!
    """
    Superadmin action: repair a Cancelled order whose ledger reversal was never posted.
    """
    repairCancelledOrder(orderId: ID!, note: String): ReconcileOrderResult!
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

  # purchaseId is String! so UUIDs are passed through (see docs/GRAPHQL_IDS_AND_UUIDS.md)
  input PaySinglePurchaseInput {
    purchaseId: String!
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
    """
    Superadmin action: rebuild a purchase's payment state from the ledger.
    """
    rebuildPurchaseFromLedger(purchaseId: ID!): StockPurchase!
    """
    Superadmin action: rebuild the ledger AP balance from the supplier's purchase model.
    """
    rebuildSupplierBalanceFromModel(supplierId: ID!, note: String): BalanceOverrideResult!
  }
`;

@VendurePlugin({
  imports: [PluginCommonModule, LedgerPlugin, ApprovalPlugin, CommunicationPlugin],
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
    OrderReversalService,
    OrderStateService,
    OrderCancellationDetectorSubscriber,
    // Payment services
    OrderReconciliationService,
    PaymentAllocationService,
    PaymentReversalService,
    SupplierPaymentAllocationService,
    // Resolvers and subscribers
    CreditResolver,
    CustomerFieldResolver,
    OrderAmountOwingLoader,
    OrderFieldResolver,
    CreditPaymentSubscriber,
    OrderReversalApprovalSubscriber,
    PaymentAllocationResolver,
    SupplierCreditResolver,
    SupplierPaymentAllocationResolver,
    PaymentEventsAdapter, // Moved from LedgerPlugin - needs FinancialService
    CustomerStatementService,
  ],
  exports: [
    // Export for use by other plugins (StockPlugin, etc.)
    FinancialService,
    ChartOfAccountsService,
    CreditService,
    CreditValidatorService,
    OrderReconciliationService,
  ],
  configuration: config => {
    // Register custom permissions
    config.authOptions.customPermissions = [
      ...(config.authOptions.customPermissions || []),
      ApproveCustomerCreditPermission,
      ManageCustomerCreditLimitPermission,
      ManageSupplierCreditPurchasesPermission,
      OverrideCustomerBalancePermission,
      ReverseOrderPermission,
      SettleOrderPermission,
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
      OrderFieldResolver,
      OrderReversalResolver,
      PaymentReversalResolver,
      PaymentAllocationResolver,
      CustomerStatementResolver,
      SupplierCreditResolver,
      SupplierPaymentAllocationResolver,
    ],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class CreditPlugin {}
