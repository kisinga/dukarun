import type { GetOrderFullQuery } from '../../../../shared/graphql/generated/graphql';

/**
 * Order data type extracted from GraphQL query
 */
export type OrderData = NonNullable<GetOrderFullQuery['order']>;

/**
 * Customer data from order
 */
export type OrderCustomer = OrderData['customer'];

/**
 * Order line item
 */
export type OrderLine = OrderData['lines'][number];

/**
 * Payment data from order
 */
export type OrderPayment = NonNullable<OrderData['payments']>[number];

/**
 * Fulfillment data from order
 */
export type OrderFulfillment = NonNullable<OrderData['fulfillments']>[number];

/**
 * Address data (billing or shipping)
 */
export type OrderAddress = OrderData['billingAddress'] | OrderData['shippingAddress'];

/**
 * Component input types
 */
export interface OrderDetailHeaderInput {
  orderCode: string;
  orderState: string;
  orderDate: string | null | undefined;
}

export interface OrderCustomerInfoInput {
  customer: OrderCustomer;
}

export interface OrderAddressInput {
  address: OrderAddress | null | undefined;
  label: string;
  fallbackName?: string;
}

export interface OrderItemsTableInput {
  lines: OrderLine[];
}

export interface OrderTotalsInput {
  subtotal: number;
  tax: number;
  total: number;
}

export interface OrderPaymentInfoInput {
  payments: OrderPayment[] | null | undefined;
}

export interface OrderFulfillmentInfoInput {
  fulfillments: OrderFulfillment[] | null | undefined;
}
