import { inject, Injectable, signal } from '@angular/core';
import type {
  GetOrdersQuery,
  GetOrdersQueryVariables,
  GetOrderFullQuery,
  GetOrderFullQueryVariables,
  OrderListOptions,
} from '../graphql/generated/graphql';
import { GetOrderFullDocument } from '../graphql/generated/graphql';
import { GET_ORDERS } from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';

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
   */
  async fetchOrders(options?: OrderListOptions): Promise<void> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<GetOrdersQuery, GetOrdersQueryVariables>({
        query: GET_ORDERS,
        variables: {
          options: (options as OrderListOptions) || {
            take: 50,
            skip: 0,
            sort: { createdAt: 'DESC' as any },
          },
        },
        fetchPolicy: 'network-only',
      });

      const items = result.data?.orders?.items || [];
      const total = result.data?.orders?.totalItems || 0;

      this.ordersSignal.set(items);
      this.totalItemsSignal.set(total);
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
   * Fetch a single order by ID with full details
   * @param id - Order ID
   */
  async fetchOrderById(id: string): Promise<any | null> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<GetOrderFullQuery, GetOrderFullQueryVariables>({
        query: GetOrderFullDocument,
        variables: { id },
        fetchPolicy: 'network-only',
      });

      const order = result.data?.order || null;
      this.currentOrderSignal.set(order);
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
   * Refresh the current orders list
   */
  async refreshOrders(): Promise<void> {
    // Re-fetch with current options (could be enhanced to store last options)
    await this.fetchOrders();
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
   * Fetch all orders for statistics calculation
   * This fetches a large number of orders to ensure accurate stats
   * Uses the totalItems count to determine how many orders to fetch
   */
  async fetchAllOrdersForStats(): Promise<void> {
    this.isLoadingStatsSignal.set(true);

    try {
      const client = this.apolloService.getClient();
      const totalItems = this.totalItemsSignal();

      // If we don't have totalItems yet, fetch a large number (10000)
      // Otherwise, fetch min(totalItems, 10000) to ensure we get all orders
      // if there are fewer than 10000, or at least the first 10000 if there are more
      const take = totalItems > 0 ? Math.min(totalItems, 10000) : 10000;

      const result = await client.query<GetOrdersQuery, GetOrdersQueryVariables>({
        query: GET_ORDERS,
        variables: {
          options: {
            take,
            skip: 0,
            sort: { createdAt: 'DESC' as any },
          },
        },
        fetchPolicy: 'network-only', // Always fetch fresh data for accurate stats
      });

      const items = result.data?.orders?.items || [];
      this.allOrdersForStatsSignal.set(items);
    } catch (error: any) {
      console.error('❌ Failed to fetch orders for stats:', error);
      // Don't set error signal here as it's a background operation
      this.allOrdersForStatsSignal.set([]);
    } finally {
      this.isLoadingStatsSignal.set(false);
    }
  }
}
