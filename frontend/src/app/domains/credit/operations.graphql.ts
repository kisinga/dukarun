import { graphql } from '../../shared/graphql/generated';

export const GET_CREDIT_SUMMARY = graphql(`
  query GetCreditSummary($customerId: ID!) {
    creditSummary(customerId: $customerId) {
      customerId
      isCreditApproved
      creditFrozen
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const VALIDATE_CREDIT = graphql(`
  query ValidateCredit($input: ValidateCreditInput!) {
    validateCredit(input: $input) {
      isValid
      error
      availableCredit
      estimatedOrderTotal
      wouldExceedLimit
    }
  }
`);

export const APPROVE_CUSTOMER_CREDIT = graphql(`
  mutation ApproveCustomerCredit($input: ApproveCustomerCreditInput!) {
    approveCustomerCredit(input: $input) {
      customerId
      isCreditApproved
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const UPDATE_CUSTOMER_CREDIT_LIMIT = graphql(`
  mutation UpdateCustomerCreditLimit($input: UpdateCustomerCreditLimitInput!) {
    updateCustomerCreditLimit(input: $input) {
      customerId
      isCreditApproved
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const UPDATE_CREDIT_DURATION = graphql(`
  mutation UpdateCreditDuration($input: UpdateCreditDurationInput!) {
    updateCreditDuration(input: $input) {
      customerId
      isCreditApproved
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const GET_UNPAID_ORDERS_FOR_CUSTOMER = graphql(`
  query GetUnpaidOrdersForCustomer($customerId: ID!) {
    unpaidOrdersForCustomer(customerId: $customerId) {
      id
      code
      state
      total
      totalWithTax
      createdAt
      payments {
        id
        state
        amount
        method
      }
    }
  }
`);

export const ORDER_PAYMENT_STATUS = graphql(`
  query OrderPaymentStatus($orderId: ID!) {
    orderPaymentStatus(orderId: $orderId) {
      totalOwed
      amountPaid
      amountOwing
    }
  }
`);

export const RECORD_PAYMENT = graphql(`
  mutation RecordPayment($input: RecordPaymentInput!) {
    recordPayment(input: $input) {
      ordersPaid {
        orderId
        orderCode
        amountPaid
      }
      remainingBalance
      totalAllocated
    }
  }
`);

export const ALLOCATE_BULK_PAYMENT = graphql(`
  mutation AllocateBulkPayment($input: PaymentAllocationInput!) {
    allocateBulkPayment(input: $input) {
      ordersPaid {
        orderId
        orderCode
        amountPaid
      }
      remainingBalance
      totalAllocated
    }
  }
`);

export const PAY_SINGLE_ORDER = graphql(`
  mutation PaySingleOrder($input: PaySingleOrderInput!) {
    paySingleOrder(input: $input) {
      ordersPaid {
        orderId
        orderCode
        amountPaid
      }
      remainingBalance
      totalAllocated
    }
  }
`);

export const PENDING_CASHIER_ORDERS = graphql(`
  query PendingCashierOrders {
    pendingCashierOrders {
      amountOwing
      pendingSince
      createdBy {
        id
        identifier
      }
      order {
        id
        code
        state
        total
        totalWithTax
        createdAt
        orderPlacedAt
        customer {
          id
          firstName
          lastName
          emailAddress
          phoneNumber
        }
        lines {
          id
          quantity
          productVariant {
            id
            name
          }
        }
      }
    }
  }
`);

export const SETTLE_ORDER_PAYMENTS = graphql(`
  mutation SettleOrderPayments($input: SettleOrderPaymentsInput!) {
    settleOrderPayments(input: $input) {
      orderId
      orderCode
      amountSettled
      remainingOwing
      fullySettled
      tenders {
        paymentMethodCode
        amount
      }
    }
  }
`);

export const SEND_CUSTOMER_STATEMENT_EMAIL = graphql(`
  mutation SendCustomerStatementEmail($customerId: ID!) {
    sendCustomerStatementEmail(customerId: $customerId)
  }
`);

export const GET_SUPPLIER_CREDIT_SUMMARY = graphql(`
  query GetSupplierCreditSummary($supplierId: ID!) {
    supplierCreditSummary(supplierId: $supplierId) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

export const APPROVE_SUPPLIER_CREDIT = graphql(`
  mutation ApproveSupplierCredit($input: ApproveSupplierCreditInput!) {
    approveSupplierCredit(input: $input) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

export const UPDATE_SUPPLIER_CREDIT_LIMIT = graphql(`
  mutation UpdateSupplierCreditLimit($input: UpdateSupplierCreditLimitInput!) {
    updateSupplierCreditLimit(input: $input) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

export const UPDATE_SUPPLIER_CREDIT_DURATION = graphql(`
  mutation UpdateSupplierCreditDuration($input: UpdateSupplierCreditDurationInput!) {
    updateSupplierCreditDuration(input: $input) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

