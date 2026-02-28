import { inject, Injectable, signal } from '@angular/core';
import type { DocumentNode } from 'graphql';
import type {
  GetOrdersQuery,
  GetOrdersQueryVariables,
  OrderListOptions,
} from '../../graphql/generated/graphql';
import {
  GET_ORDERS,
  SEND_CUSTOMER_STATEMENT_EMAIL,
  SEND_CUSTOMER_STATEMENT_SMS,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { CustomerService } from '../customer.service';

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
      const result = await client.query<GetOrdersQuery, GetOrdersQueryVariables>({
        query: GET_ORDERS,
        variables: {
          options: {
            take: 500,
            skip: 0,
            sort: { createdAt: 'DESC' as any },
          } as OrderListOptions,
        },
        fetchPolicy: 'network-only',
      });
      const items = result.data?.orders?.items ?? [];
      const forCustomer = items.filter((o: any) => o.customer?.id === customerId);
      this.ordersSignal.set(forCustomer);
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
      const result = await client.mutate<{ sendCustomerStatementEmail: boolean }>({
        mutation: SEND_CUSTOMER_STATEMENT_EMAIL as DocumentNode,
        variables: { customerId },
      });
      return result.data?.sendCustomerStatementEmail ?? false;
    } catch {
      return false;
    }
  }

  async sendMiniStatementSms(customerId: string): Promise<boolean> {
    try {
      const client = this.apollo.getClient();
      const result = await client.mutate<{ sendCustomerStatementSms: boolean }>({
        mutation: SEND_CUSTOMER_STATEMENT_SMS as DocumentNode,
        variables: { customerId },
      });
      return result.data?.sendCustomerStatementSms ?? false;
    } catch {
      return false;
    }
  }
}
