import { inject, Injectable, signal } from '@angular/core';
import type { OrderListOptions } from '../../../shared/graphql/generated/graphql';
import {
  GetCustomerOrdersDocument,
  GetOrderFullDocument,
  GetOverdueOrdersDocument,
} from '../../../shared/graphql/generated/graphql';
import { GET_ORDERS } from '../operations.graphql';
import { ORDER_PAYMENT_STATUS } from '@dukarun/credit';
import { ApolloService } from '../../../shared/services/apollo.service';
import { OrderCacheService } from './order-cache.service';

export interface OrderPaymentStatusResult {
  totalOwed: number;
  amountPaid: number;
  amountOwing: number;
}

/**
 * Service for order management operations
 *
 * ARCHITECTURE:
 * - Uses signals for reactive state management
 * - Follows ProductService pattern
 * - All operations are channel-aware via ApolloService
 */
@Injectable({
  providedIn: 'root',
})
export class OrdersService {
  private readonly apolloService = inject(ApolloService);
  private readonly orderCacheService = inject(OrderCacheService);

  /** Last options used for list fetch; refreshOrders() reuses these so filter state is preserved. */
  private lastListOptions: OrderListOptions | null = null;
  /** When the current list is scoped to a single customer, refreshOrders() re-fetches via customer.orders. */
  private lastCustomerId: string | null = null;

  private static readonly DEFAULT_LIST_OPTIONS: OrderListOptions = {
    take: 50,
    skip: 0,
    sort: { createdAt: 'DESC' as any },
  };

  // State signals
  private readonly ordersSignal = signal<any[]>([]);
  private readonly currentOrderSignal = signal<any | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly totalItemsSignal = signal(0);
  private readonly allOrdersForStatsSignal = signal<any[]>([]);
  private readonly isLoadingStatsSignal = signal(false);

  // Public readonly signals
  readonly orders = this.ordersSignal.asReadonly();
  readonly currentOrder = this.currentOrderSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly totalItems = this.totalItemsSignal.asReadonly();
  readonly allOrdersForStats = this.allOrdersForStatsSignal.asReadonly();
  readonly isLoadingStats = this.isLoadingStatsSignal.asReadonly();

  /**
   * Fetch orders with optional filtering and pagination
   * @param options - Order list options (pagination, filtering, sorting)
   * @param overdueOnly - When true, use the dedicated overdueOrders query
   */
  async fetchOrders(options?: OrderListOptions, overdueOnly = false): Promise<void> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);
    this.lastCustomerId = null;

    const resolved =
      options != null && Object.keys(options).length > 0
        ? (options as OrderListOptions)
        : OrdersService.DEFAULT_LIST_OPTIONS;
    if (options != null && Object.keys(options).length > 0) {
      this.lastListOptions = resolved;
    }

    try {
      const client = this.apolloService.getClient();
      if (overdueOnly) {
        const result = await client.query({
          query: GetOverdueOrdersDocument,
          variables: { options: resolved },
          fetchPolicy: 'network-only',
        });
        const items = (result.data?.overdueOrders?.items as any[]) || [];
        const total = result.data?.overdueOrders?.totalItems || 0;
        this.ordersSignal.set(items);
        this.totalItemsSignal.set(total);
      } else {
        const result = await client.query({
          query: GET_ORDERS,
          variables: {
            options: resolved,
          },
          fetchPolicy: 'network-only',
        });

        const items = result.data?.orders?.items || [];
        const total = result.data?.orders?.totalItems || 0;

        this.ordersSignal.set(items);
        this.totalItemsSignal.set(total);
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch orders:', error);
      this.errorSignal.set(error.message || 'Failed to fetch orders');
      this.ordersSignal.set([]);
      this.totalItemsSignal.set(0);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Fetch all orders for a single customer via the paginated `customer.orders` relation.
   * This is the correct, complete source for "orders by customer" — unlike the global
   * orders window used by fetchOrders(), it never silently omits a customer's orders
   * just because they aren't in the newest N.
   *
   * @param customerId - Customer ID
   * @param options - Order list options (pagination, sorting, filtering) applied to the customer's orders
   * @param overdueOnly - When true, filter the returned customer orders to overdue only
   */
  async fetchOrdersForCustomer(
    customerId: string,
    options?: OrderListOptions,
    overdueOnly = false,
  ): Promise<void> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    const resolved =
      options != null && Object.keys(options).length > 0
        ? (options as OrderListOptions)
        : OrdersService.DEFAULT_LIST_OPTIONS;

    this.lastListOptions = resolved;
    this.lastCustomerId = customerId;

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GetCustomerOrdersDocument,
        variables: { id: customerId, options: resolved },
        fetchPolicy: 'network-only',
      });

      const customer = result.data?.customer;
      if (!customer) {
        this.ordersSignal.set([]);
        this.totalItemsSignal.set(0);
        return;
      }

      let items = customer.orders?.items ?? [];
      if (overdueOnly) {
        items = items.filter((order: any) => order.isOverdue);
      }

      this.ordersSignal.set(items as any[]);
      this.totalItemsSignal.set(items.length);
    } catch (error: any) {
      console.error('❌ Failed to fetch customer orders:', error);
      this.errorSignal.set(error.message || 'Failed to fetch customer orders');
      this.ordersSignal.set([]);
      this.totalItemsSignal.set(0);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Fetch a single order by ID with full details
   * @param id - Order ID
   */
  async fetchOrderById(id: string): Promise<any | null> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GetOrderFullDocument,
        variables: { id },
        fetchPolicy: 'network-only',
      });

      const order = result.data?.order || null;
      this.currentOrderSignal.set(order);
      if (order) {
        this.orderCacheService.hydrateOrder(order);
      }
      return order;
    } catch (error: any) {
      console.error('❌ Failed to fetch order:', error);
      this.errorSignal.set(error.message || 'Failed to fetch order');
      this.currentOrderSignal.set(null);
      return null;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Refresh the current orders list using last options (preserves filter when called from header or pay modal).
   */
  async refreshOrders(): Promise<void> {
    if (this.lastCustomerId) {
      await this.fetchOrdersForCustomer(
        this.lastCustomerId,
        this.lastListOptions ?? OrdersService.DEFAULT_LIST_OPTIONS,
      );
    } else {
      await this.fetchOrders(this.lastListOptions ?? OrdersService.DEFAULT_LIST_OPTIONS);
    }
  }

  /**
   * Get order payment status from the ledger (AR by orderId). Use for pay modal outstanding amount.
   */
  async getOrderPaymentStatus(orderId: string): Promise<OrderPaymentStatusResult | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: ORDER_PAYMENT_STATUS,
        variables: { orderId },
        fetchPolicy: 'network-only',
      });
      return result.data?.orderPaymentStatus ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorSignal.set(null);
  }

  /**
   * Clear current order
   */
  clearCurrentOrder(): void {
    this.currentOrderSignal.set(null);
  }

  /**
   * Fetch all orders for statistics calculation.
   * When the current list is scoped to a customer, stats are fetched from the
   * same scoped `customer.orders` source so the numbers match the list.
   * Otherwise a large global window is fetched. Capped at 10000 to stay bounded.
   */
  async fetchAllOrdersForStats(): Promise<void> {
    this.isLoadingStatsSignal.set(true);

    try {
      const client = this.apolloService.getClient();
      const take = 10000;

      if (this.lastCustomerId) {
        const result = await client.query({
          query: GetCustomerOrdersDocument,
          variables: {
            id: this.lastCustomerId,
            options: {
              take,
              skip: 0,
              sort: { createdAt: 'DESC' as any },
            },
          },
          fetchPolicy: 'network-only',
        });
        const items = result.data?.customer?.orders?.items ?? [];
        this.allOrdersForStatsSignal.set(items as any[]);
      } else {
        const result = await client.query({
          query: GET_ORDERS,
          variables: {
            options: {
              take,
              skip: 0,
              sort: { createdAt: 'DESC' as any },
            },
          },
          fetchPolicy: 'network-only',
        });
        const items = result.data?.orders?.items || [];
        this.allOrdersForStatsSignal.set(items);
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch orders for stats:', error);
      // Don't set error signal here as it's a background operation
      this.allOrdersForStatsSignal.set([]);
    } finally {
      this.isLoadingStatsSignal.set(false);
    }
  }
}
