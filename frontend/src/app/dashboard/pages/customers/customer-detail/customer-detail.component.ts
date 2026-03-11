import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyService } from '../../../../core/services/currency.service';
import { CustomerService } from '../../../../core/services/customer.service';
import type { CreditCustomerSummary } from '../../../../core/services/customer.service';
import { CustomerCreditService } from '../../../../core/services/customer/customer-credit.service';
import { CustomerSearchService } from '../../../../core/services/customer/customer-search.service';
import type {
  GetOrdersQuery,
  GetOrdersQueryVariables,
  OrderListOptions,
} from '../../../../core/graphql/generated/graphql';
import { GET_ORDERS } from '../../../../core/graphql/operations.graphql';
import { ApolloService } from '../../../../core/services/apollo.service';
import { HoverPreviewHostComponent } from '../../../components/shared/hover-preview-host/hover-preview-host.component';
import { OrderStateBadgeComponent } from '../../orders/components/order-state-badge.component';

const RECENT_ORDERS_TAKE = 15;

/**
 * Read-only customer detail page.
 * Shows profile, credit summary, addresses, recent orders and payments links.
 */
@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, OrderStateBadgeComponent],
  templateUrl: './customer-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly customerService = inject(CustomerService);
  private readonly creditService = inject(CustomerCreditService);
  private readonly customerSearchService = inject(CustomerSearchService);
  private readonly apollo = inject(ApolloService);
  readonly currencyService = inject(CurrencyService);

  readonly customer = signal<any | null>(null);
  readonly creditSummary = signal<CreditCustomerSummary | null>(null);
  readonly recentOrders = signal<any[]>([]);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);

  readonly customerId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  readonly customerName = computed(() => {
    const c = this.customer();
    if (!c) return 'Customer';
    return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Customer';
  });

  readonly isWalkIn = computed(() => {
    const c = this.customer();
    if (!c) return false;
    const email = (c.emailAddress ?? '').toLowerCase();
    const first = (c.firstName ?? '').toLowerCase();
    return email === 'walkin@pos.local' || first === 'walk-in';
  });

  readonly showCredit = computed(() => {
    const s = this.creditSummary();
    if (!s) return false;
    return s.isCreditApproved || (s.outstandingAmount ?? 0) !== 0 || (s.creditLimit ?? 0) > 0;
  });

  ngOnInit(): void {
    const id = this.customerId();
    if (id) {
      this.load(id);
    } else {
      this.isLoading.set(false);
      this.error.set('No customer ID');
    }
  }

  private async load(customerId: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const c = await this.customerService.getCustomerById(customerId);
      this.customer.set(c);
      if (!c) {
        this.isLoading.set(false);
        return;
      }

      const [summary, orders] = await Promise.all([
        this.loadCreditSummary(customerId, c),
        this.loadRecentOrders(customerId),
      ]);
      this.creditSummary.set(summary);
      this.recentOrders.set(orders);
      this.customerSearchService.hydrateCustomer(c, summary ?? undefined);
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load customer');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadCreditSummary(
    customerId: string,
    customer: any,
  ): Promise<CreditCustomerSummary | null> {
    try {
      const name = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
      return await this.creditService.getCreditSummary(customerId, {
        name,
        email: customer.emailAddress,
        phone: customer.phoneNumber,
      });
    } catch {
      return null;
    }
  }

  private async loadRecentOrders(customerId: string): Promise<any[]> {
    try {
      const client = this.apollo.getClient();
      const result = await client.query<GetOrdersQuery, GetOrdersQueryVariables>({
        query: GET_ORDERS,
        variables: {
          options: {
            take: RECENT_ORDERS_TAKE,
            skip: 0,
            sort: { createdAt: 'DESC' as const },
          } as OrderListOptions,
        },
        fetchPolicy: 'network-only',
      });
      const items = result.data?.orders?.items ?? [];
      return items.filter((o: any) => o.customer?.id === customerId);
    } catch {
      return [];
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents ?? 0, false);
  }

  getOrderTotal(order: any): number {
    return order?.totalWithTax ?? order?.total ?? 0;
  }

  formatAddress(addr: any): string {
    if (!addr) return '';
    const parts = [
      addr.streetLine1,
      addr.streetLine2,
      addr.city,
      addr.postalCode,
      addr.country?.name,
    ].filter(Boolean);
    return parts.join(', ');
  }

  getOutstandingAbs(summary: CreditCustomerSummary): number {
    return Math.abs(summary.outstandingAmount ?? 0);
  }
}
