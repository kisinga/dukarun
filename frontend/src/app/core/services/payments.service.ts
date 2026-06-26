import { inject, Injectable, signal } from '@angular/core';
import type { OrderListOptions } from '../graphql/generated/graphql';
import { GET_PAYMENTS, GET_PAYMENT_FULL } from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';

/**
 * Payment data with order context
 */
export interface PaymentWithOrder {
  id: string;
  state: string;
  amount: number;
  method: string;
  transactionId?: string | null;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string | null;
  metadata?: any;
  order: {
    id: string;
    code: string;
    state: string;
    createdAt: string;
    orderPlacedAt?: string | null;
    customer?: {
      id: string;
      firstName: string;
      lastName: string;
      emailAddress?: string | null;
    } | null;
  };
}

/**
 * Service for payment management operations
 *
 * ARCHITECTURE:
 * - Fetches orders with payments and flattens payments
 * - Uses signals for reactive state management
 * - Follows OrdersService pattern
 */
@Injectable({
  providedIn: 'root',
})
export class PaymentsService {
  private readonly apolloService = inject(ApolloService);

  // State signals
  private readonly paymentsSignal = signal<PaymentWithOrder[]>([]);
  private readonly currentPaymentSignal = signal<PaymentWithOrder | null>(null);
  private readonly currentOrderSignal = signal<any | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly totalItemsSignal = signal(0);

  // Public readonly signals
  readonly payments = this.paymentsSignal.asReadonly();
  readonly currentPayment = this.currentPaymentSignal.asReadonly();
  readonly currentOrder = this.currentOrderSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly totalItems = this.totalItemsSignal.asReadonly();

  /**
   * Fetch payments by fetching orders and extracting payments
   * @param options - Order list options (pagination, filtering, sorting)
   */
  async fetchPayments(options?: OrderListOptions): Promise<void> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GET_PAYMENTS,
        variables: {
          options: (options as OrderListOptions) || {
            take: 100,
            skip: 0,
            sort: { createdAt: 'DESC' as any },
          },
        },
        fetchPolicy: 'network-only',
      });

      const orders = result.data?.orders?.items || [];
      const total = result.data?.orders?.totalItems || 0;

      // Flatten payments from orders
      const payments: PaymentWithOrder[] = [];
      orders.forEach((order) => {
        if (order.payments && order.payments.length > 0) {
          order.payments.forEach((payment) => {
            payments.push({
              id: payment.id,
              state: payment.state,
              amount: payment.amount,
              method: payment.method,
              transactionId: payment.transactionId || null,
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt || payment.createdAt,
              errorMessage: payment.errorMessage || null,
              metadata: payment.metadata,
              order: {
                id: order.id,
                code: order.code,
                state: order.state,
                createdAt: order.createdAt,
                orderPlacedAt: order.orderPlacedAt || null,
                customer: order.customer || null,
              },
            });
          });
        }
      });

      // Sort by creation date descending
      payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      this.paymentsSignal.set(payments);
      this.totalItemsSignal.set(payments.length);
    } catch (error: any) {
      console.error('❌ Failed to fetch payments:', error);
      this.errorSignal.set(error.message || 'Failed to fetch payments');
      this.paymentsSignal.set([]);
      this.totalItemsSignal.set(0);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Fetch a single payment by ID (finds the order containing the payment)
   * @param paymentId - Payment ID
   */
  async fetchPaymentById(paymentId: string): Promise<PaymentWithOrder | null> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      // First, find the payment in our cached list
      const cachedPayment = this.payments().find((p) => p.id === paymentId);
      if (cachedPayment) {
        // Fetch full order details
        const client = this.apolloService.getClient();
        const result = await client.query({
          query: GET_PAYMENT_FULL,
          variables: { orderId: cachedPayment.order.id },
          fetchPolicy: 'network-only',
        });

        const order = result.data?.order;
        if (order && order.payments) {
          const payment = order.payments.find((p: any) => p.id === paymentId);
          if (payment) {
            const paymentWithOrder: PaymentWithOrder = {
              id: payment.id,
              state: payment.state,
              amount: payment.amount,
              method: payment.method,
              transactionId: payment.transactionId || null,
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt || payment.createdAt,
              errorMessage: payment.errorMessage || null,
              metadata: payment.metadata,
              order: {
                id: order.id,
                code: order.code,
                state: order.state,
                createdAt: order.createdAt,
                orderPlacedAt: order.orderPlacedAt || null,
                customer: order.customer || null,
              },
            };
            this.currentPaymentSignal.set(paymentWithOrder);
            this.currentOrderSignal.set(order);
            return paymentWithOrder;
          }
        }
      }

      // Payment not in cache or not found in order
      this.errorSignal.set('Payment not found. Please refresh the payments list.');
      return null;
    } catch (error: any) {
      console.error('❌ Failed to fetch payment:', error);
      this.errorSignal.set(error.message || 'Failed to fetch payment');
      this.currentPaymentSignal.set(null);
      this.currentOrderSignal.set(null);
      return null;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Refresh the current payments list
   */
  async refreshPayments(): Promise<void> {
    await this.fetchPayments();
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorSignal.set(null);
  }

  /**
   * Clear current payment
   */
  clearCurrentPayment(): void {
    this.currentPaymentSignal.set(null);
    this.currentOrderSignal.set(null);
  }
}
