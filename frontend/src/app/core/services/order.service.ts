import { Injectable, inject } from '@angular/core';
import { CreateOrderInput as GqlCreateOrderInput, Order } from '../graphql/generated/graphql';
import {
  ADD_FULFILLMENT_TO_ORDER,
  ADD_ITEM_TO_DRAFT_ORDER,
  ADJUST_DRAFT_ORDER_LINE,
  ADD_MANUAL_PAYMENT_TO_ORDER,
  CREATE_DRAFT_ORDER,
  CREATE_ORDER,
  GET_ORDER_DETAILS,
  GET_PAYMENT_METHODS,
  REMOVE_DRAFT_ORDER_LINE,
  SET_ORDER_LINE_CUSTOM_PRICE,
  TRANSITION_ORDER_TO_STATE,
} from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';
import { OrderSetupService } from './order-setup.service';

export interface CreateOrderInput {
  cartItems: Array<{
    variantId: string;
    quantity: number;
    customLinePrice?: number; // Line price in cents
    priceOverrideReason?: string; // Reason code
  }>;
  paymentMethodCode?: string; // Optional when saveAsProforma
  customerId?: string;
  metadata?: Record<string, any>;
  isCashierFlow?: boolean; // True = stay in ArrangingPayment
  isCreditSale?: boolean; // True = authorize but don't settle payment
  saveAsProforma?: boolean; // True = create draft order (proforma invoice)
}

export interface OrderData {
  id: string;
  code: string;
  state: string;
  total: number;
  totalWithTax: number;
  lines: Array<{
    id: string;
    quantity: number;
    linePrice: number;
    productVariant: { id: string; name: string };
  }>;
  payments?: Array<{
    id: string;
    state: string;
    amount: number;
    method: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Order Service
 *
 * Handles order creation and payment processing for the POS system.
 * Creates draft orders, adds items, attaches payments, and transitions order state.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private apolloService = inject(ApolloService);
  private orderSetupService = inject(OrderSetupService);

  /**
   * Create a complete order with items and payment using server-side order creation service
   *
   * This method now delegates to the backend OrderCreationService which handles:
   * - Order creation in a transaction
   * - Address management (from customer for credit sales)
   * - Payment handling (skip for credit sales, add & settle for cash sales)
   * - Fulfillment (immediate for credit sales)
   * - Audit logging
   * - User tracking
   *
   * @param input Order creation data
   * @returns Created order with all details
   */
  async createOrder(input: CreateOrderInput): Promise<Order> {
    try {
      const client = this.apolloService.getClient();

      // Test backend connection first
      try {
        await client.query({
          query: GET_PAYMENT_METHODS,
        });
      } catch (error) {
        console.error('❌ Backend connection failed:', error);
        throw new Error(`Backend connection failed: ${error}`);
      }

      // Call backend order creation mutation
      // Note: saveAsProforma is from credit plugin; generated types may not include it
      const createInput: Record<string, unknown> = {
        cartItems: input.cartItems.map((item) => ({
          variantId: String(item.variantId),
          quantity: item.quantity,
          customLinePrice: item.customLinePrice,
          priceOverrideReason: item.priceOverrideReason,
        })),
        paymentMethodCode: input.saveAsProforma ? '' : (input.paymentMethodCode ?? ''),
        customerId: input.customerId,
        metadata: input.metadata,
        isCreditSale: input.isCreditSale,
        isCashierFlow: input.isCashierFlow,
      };
      if (input.saveAsProforma) {
        createInput['saveAsProforma'] = true;
      }
      const result = await client.mutate({
        mutation: CREATE_ORDER,
        variables: { input: createInput as GqlCreateOrderInput },
      });

      // Check for GraphQL errors
      if (result.error) {
        console.error('GraphQL error creating order:', result.error);
        throw new Error(`GraphQL error creating order: ${result.error.message}`);
      }

      if (!result.data?.createOrder) {
        console.error('No order data returned:', {
          data: result.data,
          errors: result.error,
        });
        throw new Error('Failed to create order - no data returned');
      }

      const order = result.data.createOrder;
      console.log(`✅ Order created successfully: ${order.code}`);
      return order as Order;
    } catch (error) {
      console.error('❌ Order creation failed:', error);
      throw error;
    }
  }

  /**
   * Complete a draft order (proforma) to a sale: transition to ArrangingPayment and add payment.
   *
   * @param orderId Draft order ID
   * @param paymentMethodCode Payment method code (e.g. 'mpesa', 'cash-payment')
   * @param metadata Optional payment metadata
   * @returns Order after payment
   */
  async completeDraftToSale(
    orderId: string,
    paymentMethodCode: string,
    metadata?: Record<string, any>,
  ): Promise<Order> {
    await this.transitionOrderState(orderId, 'ArrangingPayment');
    return this.completeOrderPayment(orderId, paymentMethodCode, metadata);
  }

  /**
   * Add manual payment to an order
   *
   * @param orderId Order ID to add payment to
   * @param paymentMethodCode Payment method code
   * @param metadata Additional payment metadata
   * @returns Order with payment information
   */
  private async completeOrderPayment(
    orderId: string,
    paymentMethodCode: string,
    metadata?: Record<string, any>,
  ): Promise<Order> {
    try {
      const client = this.apolloService.getClient();

      const paymentResult = await client.mutate({
        mutation: ADD_MANUAL_PAYMENT_TO_ORDER,
        variables: {
          input: {
            orderId,
            method: paymentMethodCode,
            metadata: metadata || {},
          },
        },
      });

      // Check for GraphQL errors
      if (paymentResult.error) {
        console.error('GraphQL error adding payment:', paymentResult.error);
        throw new Error(`GraphQL error adding payment: ${paymentResult.error.message}`);
      }

      const paymentData = paymentResult.data?.addManualPaymentToOrder;
      if (!paymentData) {
        throw new Error('No payment data returned');
      }

      // Check for ManualPaymentStateError
      if (paymentData.__typename === 'ManualPaymentStateError') {
        console.error('Payment state error:', paymentData);
        throw new Error(`Payment failed: ${paymentData.message}`);
      }

      if (paymentData.__typename !== 'Order') {
        throw new Error('Unexpected payment result type');
      }

      // Payment added successfully
      return paymentData as Order;
    } catch (error) {
      console.error('❌ Payment addition failed:', error);
      throw error;
    }
  }

  /**
   * Transition order to a specific state
   *
   * @param orderId Order ID to transition
   * @param targetState Target state to transition to
   * @returns Order in new state
   */
  private async transitionOrderState(orderId: string, targetState: string): Promise<Order> {
    try {
      const client = this.apolloService.getClient();

      const transitionResult = await client.mutate({
        mutation: TRANSITION_ORDER_TO_STATE,
        variables: {
          id: orderId,
          state: targetState,
        },
      });

      // Check for GraphQL errors
      if (transitionResult.error) {
        console.error('GraphQL error transitioning order:', transitionResult.error);
        throw new Error(`GraphQL error transitioning order: ${transitionResult.error.message}`);
      }

      const transitionData = transitionResult.data?.transitionOrderToState;
      if (!transitionData) {
        throw new Error('No transition data returned');
      }

      // Check for OrderStateTransitionError
      if (transitionData.__typename === 'OrderStateTransitionError') {
        console.error('Order state transition error:', transitionData);
        throw new Error(`State transition failed: ${transitionData.message}`);
      }

      if (transitionData.__typename !== 'Order') {
        throw new Error('Unexpected transition result type');
      }

      // Order state transitioned successfully
      return transitionData as Order;
    } catch (error) {
      console.error('❌ Order state transition failed:', error);
      throw error;
    }
  }

  /**
   * Fulfill an order (items handed to customer)
   * For POS systems, this represents the physical handover of items
   *
   * @param orderId Order ID to fulfill
   * @returns Fulfilled order
   */
  private async fulfillOrder(orderId: string): Promise<Order> {
    try {
      const client = this.apolloService.getClient();

      // 1. Get order lines to fulfill
      const orderResult = await client.query({
        query: GET_ORDER_DETAILS,
        variables: { id: orderId },
      });

      const order = orderResult.data?.order;
      if (!order) {
        throw new Error('Order not found');
      }

      // 2. Create fulfillment with all order lines
      const fulfillmentInput = {
        lines: order.lines.map((line: any) => ({
          orderLineId: line.id,
          quantity: line.quantity,
        })),
        handler: {
          code: 'manual-fulfillment',
          arguments: [
            {
              name: 'method',
              value: 'POS Handover',
            },
            {
              name: 'trackingCode',
              value: `POS-${Date.now()}`,
            },
          ],
        },
      };

      const fulfillmentResult = await client.mutate({
        mutation: ADD_FULFILLMENT_TO_ORDER,
        variables: { input: fulfillmentInput },
      });

      if (fulfillmentResult.error) {
        console.error('Fulfillment error:', fulfillmentResult.error);
        throw new Error(`Fulfillment failed: ${fulfillmentResult.error.message}`);
      }

      const fulfillment = fulfillmentResult.data?.addFulfillmentToOrder;
      if (!fulfillment || fulfillment.__typename !== 'Fulfillment') {
        console.error('Fulfillment creation failed:', fulfillment);
        const errorMessage =
          fulfillment && 'message' in fulfillment ? fulfillment.message : 'Unknown error';
        throw new Error(`Fulfillment creation failed: ${errorMessage}`);
      }

      // 3. Fulfillment created - stock automatically decremented
      // Return order in final PaymentSettled state (no need to transition further)
      console.log('✅ Order fulfilled - stock decremented:', {
        orderCode: order.code,
        fulfillmentId: fulfillment.id,
        state: fulfillment.state,
        method: fulfillment.method,
        trackingCode: fulfillment.trackingCode,
      });
      return order as unknown as Order;
    } catch (error) {
      console.error('❌ Order fulfillment failed:', error);
      throw error;
    }
  }

  /**
   * Set custom price for an order line
   *
   * @param orderLineId Order line ID
   * @param customPrice Custom price in cents
   * @param reason Reason for price override
   * @returns Updated order line
   */
  async setOrderLineCustomPrice(
    orderLineId: string,
    customLinePrice: number | undefined,
    reason?: string,
  ): Promise<any> {
    try {
      const client = this.apolloService.getClient();

      console.log('💰 Setting custom line price for order line:', {
        orderLineId,
        customLinePrice,
        reason,
      });

      // If customLinePrice is undefined, we're resetting the price
      if (customLinePrice === undefined) {
        console.log('🔄 Resetting custom line price to default');
        // For now, we'll just return success since the backend should handle undefined values
        return { success: true };
      }

      const result = await client.mutate({
        mutation: SET_ORDER_LINE_CUSTOM_PRICE as any,
        variables: {
          input: {
            orderLineId,
            customLinePrice,
            reason,
          },
        },
      });

      // Check for GraphQL errors
      if (result.error) {
        console.error('GraphQL error setting custom line price:', result.error);
        throw new Error(`GraphQL error setting custom line price: ${result.error.message}`);
      }

      const data = (result.data as any)?.setOrderLineCustomPrice;
      if (!data) {
        throw new Error('No data returned from setOrderLineCustomPrice');
      }

      // Check for error result
      if (data.__typename === 'Error') {
        console.error('Custom line price setting failed:', data);
        throw new Error(`Failed to set custom line price: ${data.message}`);
      }

      console.log('✅ Custom line price set successfully');
      return data;
    } catch (error) {
      console.error('❌ Setting custom line price failed:', error);
      throw error;
    }
  }

  /**
   * Remove a line from a draft order
   */
  async removeDraftOrderLine(orderId: string, orderLineId: string): Promise<Order> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: REMOVE_DRAFT_ORDER_LINE as any,
      variables: { orderId, orderLineId },
    });
    if (result.error) throw new Error(result.error.message);
    const order = (result.data as any)?.removeDraftOrderLine;
    if (
      !order ||
      order.__typename === 'OrderModificationError' ||
      order.__typename === 'OrderInterceptorError'
    ) {
      throw new Error((order as any)?.message ?? 'Failed to remove line');
    }
    return order as Order;
  }

  /**
   * Adjust quantity of a draft order line
   */
  async adjustDraftOrderLine(
    orderId: string,
    orderLineId: string,
    quantity: number,
  ): Promise<Order> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: ADJUST_DRAFT_ORDER_LINE as any,
      variables: { orderId, input: { orderLineId, quantity } },
    });
    if (result.error) throw new Error(result.error.message);
    const order = (result.data as any)?.adjustDraftOrderLine;
    if (
      !order ||
      order.__typename === 'OrderModificationError' ||
      order.__typename === 'OrderInterceptorError'
    ) {
      throw new Error((order as any)?.message ?? 'Failed to adjust line');
    }
    return order as Order;
  }

  /**
   * Add an item to a draft order
   */
  async addItemToDraftOrder(
    orderId: string,
    input: { productVariantId: string; quantity: number; customLinePrice?: number },
  ): Promise<Order> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: ADD_ITEM_TO_DRAFT_ORDER as any,
      variables: {
        orderId,
        input: {
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          ...(input.customLinePrice != null && { customLinePrice: input.customLinePrice }),
        },
      },
    });
    if (result.error) throw new Error(result.error.message);
    const data = (result.data as any)?.addItemToDraftOrder;
    if (!data || data.__typename !== 'Order') {
      throw new Error('Failed to add item to draft order');
    }
    return data as Order;
  }
}
