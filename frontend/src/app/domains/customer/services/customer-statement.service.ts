import { inject, Injectable, signal } from '@angular/core';
import type { OrderListOptions } from '../../../shared/graphql/generated/graphql';
import { GET_CUSTOMER_ORDERS } from '@dukarun/order';
import { SEND_CUSTOMER_STATEMENT_EMAIL } from '@dukarun/credit';
import { ApolloService } from '../../../shared/services/apollo.service';
import { CustomerService } from './customer.service';

/**
 * Customer Statement Service
 *
 * Loads customer and their orders for the statement page.
 * Sends statement via email or mini statement via SMS via backend.
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerStatementService {
  private readonly apollo = inject(ApolloService);
  private readonly customerService = inject(CustomerService);

  private readonly customerSignal = signal<any | null>(null);
  private readonly ordersSignal = signal<any[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly customer = this.customerSignal.asReadonly();
  readonly ordersForCustomer = this.ordersSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  async loadStatement(customerId: string): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const c = await this.customerService.getCustomerById(customerId);
      this.customerSignal.set(c);
      if (!c) {
        this.ordersSignal.set([]);
        return;
      }
      const client = this.apollo.getClient();
      const result = await client.query({
        query: GET_CUSTOMER_ORDERS,
        variables: {
          id: customerId,
          options: {
            take: 500,
            skip: 0,
            sort: { createdAt: 'DESC' as any },
          } as OrderListOptions,
        },
        fetchPolicy: 'network-only',
      });
      this.ordersSignal.set(result.data?.customer?.orders?.items ?? []);
    } catch (err: any) {
      this.errorSignal.set(err?.message ?? 'Failed to load statement');
      this.ordersSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async sendStatementEmail(customerId: string): Promise<boolean> {
    try {
      const client = this.apollo.getClient();
      const result = await client.mutate({
        mutation: SEND_CUSTOMER_STATEMENT_EMAIL,
        variables: { customerId },
      });
      return result.data?.sendCustomerStatementEmail ?? false;
    } catch {
      return false;
    }
  }
}
