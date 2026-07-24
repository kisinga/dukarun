import { graphql } from '../../shared/graphql/generated';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

export const CREATE_DRAFT_ORDER = graphql(`
  mutation CreateDraftOrder {
    createDraftOrder {
      id
      code
      state
      total
      totalWithTax
    }
  }
`);

export const CREATE_ORDER = graphql(`
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      code
      state
      total
      totalWithTax
      customer {
        id
        firstName
        lastName
        emailAddress
      }
      lines {
        id
        quantity
        linePrice
        linePriceWithTax
        productVariant {
          id
          name
        }
      }
      payments {
        id
        state
        amount
        method
        metadata
      }
    }
  }
`);

export const ADD_ITEM_TO_DRAFT_ORDER = graphql(`
  mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {
    addItemToDraftOrder(orderId: $orderId, input: $input) {
      ... on Order {
        id
        code
        state
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
          }
        }
      }
    }
  }
`);

export const REMOVE_DRAFT_ORDER_LINE = graphql(`
  mutation RemoveDraftOrderLine($orderId: ID!, $orderLineId: ID!) {
    removeDraftOrderLine(orderId: $orderId, orderLineId: $orderLineId) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
          }
        }
      }
    }
  }
`);

export const DELETE_DRAFT_ORDER = graphql(`
  mutation DeleteDraftOrder($orderId: ID!) {
    deleteDraftOrder(orderId: $orderId) {
      result
      message
    }
  }
`);

export const ADJUST_DRAFT_ORDER_LINE = graphql(`
  mutation AdjustDraftOrderLine($orderId: ID!, $input: AdjustDraftOrderLineInput!) {
    adjustDraftOrderLine(orderId: $orderId, input: $input) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
          }
        }
      }
    }
  }
`);

export const ADD_MANUAL_PAYMENT_TO_ORDER = graphql(`
  mutation AddManualPaymentToOrder($input: ManualPaymentInput!) {
    addManualPaymentToOrder(input: $input) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        payments {
          id
          state
          amount
          method
          metadata
        }
      }
      ... on ManualPaymentStateError {
        errorCode
        message
      }
    }
  }
`);

export const SET_CUSTOMER_FOR_DRAFT_ORDER = graphql(`
  mutation SetCustomerForDraftOrder($orderId: ID!, $customerId: ID!) {
    setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        customer {
          id
          firstName
          lastName
          emailAddress
        }
      }
      ... on EmailAddressConflictError {
        errorCode
        message
      }
    }
  }
`);

export const SET_DRAFT_ORDER_SHIPPING_METHOD = graphql(`
  mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {
    setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        shippingLines {
          id
          shippingMethod {
            id
            name
            code
          }
        }
      }
      ... on OrderModificationError {
        errorCode
        message
      }
    }
  }
`);

export const SET_DRAFT_ORDER_BILLING_ADDRESS = graphql(`
  mutation SetDraftOrderBillingAddress($orderId: ID!, $input: CreateAddressInput!) {
    setDraftOrderBillingAddress(orderId: $orderId, input: $input) {
      id
      code
      state
      total
      totalWithTax
      billingAddress {
        fullName
        streetLine1
        city
        postalCode
        country
      }
    }
  }
`);

export const SET_DRAFT_ORDER_SHIPPING_ADDRESS = graphql(`
  mutation SetDraftOrderShippingAddress($orderId: ID!, $input: CreateAddressInput!) {
    setDraftOrderShippingAddress(orderId: $orderId, input: $input) {
      id
      code
      state
      total
      totalWithTax
      shippingAddress {
        fullName
        streetLine1
        city
        postalCode
        country
      }
    }
  }
`);

export const TRANSITION_ORDER_TO_STATE = graphql(`
  mutation TransitionOrderToState($id: ID!, $state: String!) {
    transitionOrderToState(id: $id, state: $state) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        lines {
          id
          quantity
          linePrice
          productVariant {
            id
            name
          }
        }
      }
      ... on OrderStateTransitionError {
        errorCode
        message
        transitionError
      }
    }
  }
`);

export const VOID_ORDER = graphql(`
  mutation VoidOrder($orderId: ID!) {
    voidOrder(orderId: $orderId) {
      order {
        id
        code
        state
      }
      hadPayments
    }
  }
`);

export const REVERSE_PAYMENT = graphql(`
  mutation ReversePayment($paymentId: ID!) {
    reversePayment(paymentId: $paymentId) {
      paymentId
      reversedAmount
      orderNowUnderpaid
    }
  }
`);

export const OVERRIDE_CUSTOMER_BALANCE = graphql(`
  mutation OverrideCustomerBalance($input: OverrideCustomerBalanceInput!) {
    overrideCustomerBalance(input: $input) {
      customerId
      previousBalance
      newBalance
      adjustmentAmount
    }
  }
`);

export const ADD_FULFILLMENT_TO_ORDER = graphql(`
  mutation AddFulfillmentToOrder($input: FulfillOrderInput!) {
    addFulfillmentToOrder(input: $input) {
      ... on Fulfillment {
        id
        state
        nextStates
        createdAt
        updatedAt
        method
        lines {
          orderLineId
          quantity
        }
        trackingCode
      }
      ... on CreateFulfillmentError {
        errorCode
        message
        fulfillmentHandlerError
      }
      ... on FulfillmentStateTransitionError {
        errorCode
        message
        transitionError
      }
    }
  }
`);

export const GET_PAYMENT_METHODS = graphql(`
  query GetPaymentMethods {
    paymentMethods(options: { take: 100 }) {
      items {
        id
        code
        name
        description
        enabled
        customFields {
          imageAsset {
            id
            source
            name
            preview
          }
          isActive
        }
      }
    }
  }
`);

export const GET_ORDER_DETAILS = graphql(`
  query GetOrderDetails($id: ID!) {
    order(id: $id) {
      id
      code
      state
      lines {
        id
        quantity
        productVariant {
          id
          name
          sku
        }
      }
    }
  }
`);

export const GET_ORDER = graphql(`
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      code
      state
      total
      totalWithTax
      lines {
        id
        quantity
        linePrice
        linePriceWithTax
        productVariant {
          id
          name
        }
      }
    }
  }
`);

export const GET_ORDERS = graphql(`
  query GetOrders($options: OrderListOptions) {
    orders(options: $options) {
      items {
        id
        code
        state
        createdAt
        updatedAt
        orderPlacedAt
        total
        totalWithTax
        currencyCode
        amountOwing
        dueDate
        isOverdue
        customer {
          id
          firstName
          lastName
          emailAddress
        }
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
            sku
          }
        }
        payments {
          id
          state
          amount
          method
          createdAt
        }
        customFields {
          reversedAt
        }
      }
      totalItems
    }
  }
`);

export const GET_OVERDUE_ORDERS = graphql(`
  query GetOverdueOrders($options: OrderListOptions) {
    overdueOrders(options: $options) {
      items {
        id
        code
        state
        createdAt
        updatedAt
        orderPlacedAt
        total
        totalWithTax
        currencyCode
        amountOwing
        dueDate
        isOverdue
        customer {
          id
          firstName
          lastName
          emailAddress
        }
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
            sku
          }
        }
        payments {
          id
          state
          amount
          method
          createdAt
        }
        customFields {
          reversedAt
        }
      }
      totalItems
    }
  }
`);

export const GET_PAYMENTS = graphql(`
  query GetPayments($options: OrderListOptions) {
    orders(options: $options) {
      items {
        id
        code
        state
        createdAt
        orderPlacedAt
        payments {
          id
          state
          amount
          method
          transactionId
          createdAt
          updatedAt
          errorMessage
          metadata
        }
        customer {
          id
          firstName
          lastName
          emailAddress
        }
      }
      totalItems
    }
  }
`);

export const GET_CUSTOMER_ORDERS = graphql(`
  query GetCustomerOrders($id: ID!, $options: OrderListOptions) {
    customer(id: $id) {
      id
      firstName
      lastName
      emailAddress
      orders(options: $options) {
        items {
          id
          code
          state
          createdAt
          updatedAt
          orderPlacedAt
          total
          totalWithTax
          currencyCode
          amountOwing
          dueDate
          isOverdue
          customer {
            id
            firstName
            lastName
            emailAddress
          }
          lines {
            id
            quantity
            linePrice
            linePriceWithTax
            productVariant {
              id
              name
              sku
            }
          }
          payments {
            id
            state
            amount
            method
            transactionId
            createdAt
            updatedAt
            errorMessage
            metadata
          }
          customFields {
            reversedAt
          }
        }
        totalItems
      }
    }
  }
`);

export const GET_PAYMENT_FULL = graphql(`
  query GetPaymentFull($orderId: ID!) {
    order(id: $orderId) {
      id
      code
      state
      createdAt
      orderPlacedAt
      total
      totalWithTax
      currencyCode
      customer {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
      }
      payments {
        id
        state
        amount
        method
        transactionId
        createdAt
        updatedAt
        errorMessage
        metadata
        nextStates
        refunds {
          id
          total
          state
          reason
          createdAt
        }
      }
    }
  }
`);

export const GET_ORDER_FULL = graphql(`
  query GetOrderFull($id: ID!) {
    order(id: $id) {
      id
      code
      state
      createdAt
      updatedAt
      orderPlacedAt
      total
      totalWithTax
      currencyCode
      amountOwing
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
        linePrice
        linePriceWithTax
        productVariant {
          id
          name
          product {
            id
            name
          }
        }
      }
      payments {
        id
        state
        amount
        method
        createdAt
        metadata
      }
      customFields {
        reversedAt
      }
      fulfillments {
        id
        state
        method
        trackingCode
        createdAt
        updatedAt
      }
      billingAddress {
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        province
        country
        phoneNumber
      }
      shippingAddress {
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        province
        country
        phoneNumber
      }
    }
  }
`);

/**
 * Per-order margin (revenue vs FIFO COGS). Not part of the codegen-typed documents:
 * the schema addition postdates the last codegen run, so these ship as precompiled
 * AST documents (same runtime shape codegen emits — no graphql-tag in the bundle)
 * with hand-written types. Regenerate types (`npm run codegen`) when the backend
 * is available and migrate these to `graphql()`.
 */
export interface OrderMargin {
  netRevenueCents: number;
  cogsCents: number;
  marginCents: number;
  marginPercent: number | null;
  reliable: boolean;
  unreliableReasons: string[];
}

export interface GetOrderMarginResult {
  order: { id: string; margin: OrderMargin | null } | null;
}

export interface RetrySkippedCogsResult {
  retrySkippedCogs: OrderMargin;
}

export const GET_ORDER_MARGIN: DocumentNode<GetOrderMarginResult, { id: string }> = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetOrderMargin' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
          directives: [],
        },
      ],
      directives: [],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'order' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            directives: [],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' }, arguments: [], directives: [] },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'margin' },
                  arguments: [],
                  directives: [],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'netRevenueCents' }, arguments: [], directives: [] },
                      { kind: 'Field', name: { kind: 'Name', value: 'cogsCents' }, arguments: [], directives: [] },
                      { kind: 'Field', name: { kind: 'Name', value: 'marginCents' }, arguments: [], directives: [] },
                      { kind: 'Field', name: { kind: 'Name', value: 'marginPercent' }, arguments: [], directives: [] },
                      { kind: 'Field', name: { kind: 'Name', value: 'reliable' }, arguments: [], directives: [] },
                      { kind: 'Field', name: { kind: 'Name', value: 'unreliableReasons' }, arguments: [], directives: [] },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetOrderMarginResult, { id: string }>;

export const RETRY_SKIPPED_COGS: DocumentNode<RetrySkippedCogsResult, { orderId: string }> = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RetrySkippedCogs' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
          directives: [],
        },
      ],
      directives: [],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'retrySkippedCogs' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
              },
            ],
            directives: [],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'netRevenueCents' }, arguments: [], directives: [] },
                { kind: 'Field', name: { kind: 'Name', value: 'cogsCents' }, arguments: [], directives: [] },
                { kind: 'Field', name: { kind: 'Name', value: 'marginCents' }, arguments: [], directives: [] },
                { kind: 'Field', name: { kind: 'Name', value: 'marginPercent' }, arguments: [], directives: [] },
                { kind: 'Field', name: { kind: 'Name', value: 'reliable' }, arguments: [], directives: [] },
                { kind: 'Field', name: { kind: 'Name', value: 'unreliableReasons' }, arguments: [], directives: [] },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RetrySkippedCogsResult, { orderId: string }>;

