import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyService } from '../../../shared/services/currency.service';
import { toDisplayDate } from '../../../shared/utils/date.util';
import {
  CustomerService,
  CustomerCreditService,
  CustomerSearchService,
  type CreditCustomerSummary,
} from '@dukarun/customer';
import { AuthPermissionsService } from '@dukarun/auth';
import type { OrderListOptions } from '../../../shared/graphql/generated/graphql';
import { GET_CUSTOMER_ORDERS } from '@dukarun/order';
import { ApolloService } from '../../../shared/services/apollo.service';
import { OrderStateBadgeComponent } from '@dukarun/order/components';
import {
  BalanceOverrideModalComponent,
  BalanceOverrideModalData,
} from '../components/balance-override-modal.component';

const RECENT_ORDERS_TAKE = 25;

/**
 * Read-only customer detail page.
 * Shows profile, credit summary, addresses, recent orders and payments links.
 */
@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, OrderStateBadgeComponent, BalanceOverrideModalComponent],
  templateUrl: './customer-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly customerService = inject(CustomerService);
  private readonly creditService = inject(CustomerCreditService);
  private readonly customerSearchService = inject(CustomerSearchService);
  private readonly authPermissions = inject(AuthPermissionsService);
  private readonly apollo = inject(ApolloService);
  readonly currencyService = inject(CurrencyService);

  readonly customer = signal<any | null>(null);
  readonly creditSummary = signal<CreditCustomerSummary | null>(null);
  readonly recentOrders = signal<any[]>([]);
  readonly recentPayments = signal<any[]>([]);
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

  readonly canOverrideBalance = computed(() =>
    this.authPermissions.hasOverrideCustomerBalancePermission(),
  );
  readonly balanceOverrideData = signal<BalanceOverrideModalData | null>(null);
  private readonly balanceOverrideModal = viewChild(BalanceOverrideModalComponent);

  constructor() {
    effect(() => {
      const data = this.balanceOverrideData();
      const modal = this.balanceOverrideModal();
      if (data && modal) {
        setTimeout(() => void modal.show(), 0);
      }
    });
  }

  handleOverrideBalance(): void {
    const summary = this.creditSummary();
    if (!summary) return;
    this.balanceOverrideData.set({
      customerId: this.customerId(),
      customerName: this.customerName(),
      currentBalance: summary.outstandingAmount ?? 0,
    });
  }

  async onBalanceOverridden(): Promise<void> {
    this.balanceOverrideData.set(null);
    // Reload customer data to reflect the new balance
    const id = this.customerId();
    if (id) {
      await this.load(id);
    }
  }

  onBalanceOverrideCancelled(): void {
    this.balanceOverrideData.set(null);
  }

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
        // Never blank the page: getCustomerById() swallows errors and returns
        // null, so surface it as an error instead of rendering nothing.
        this.error.set('Customer not found or could not be loaded.');
        this.isLoading.set(false);
        return;
      }

      const [summary, activity] = await Promise.all([
        this.loadCreditSummary(customerId, c),
        this.loadCustomerActivity(customerId),
      ]);
      this.creditSummary.set(summary);
      this.recentOrders.set(activity.orders);
      this.recentPayments.set(activity.payments);
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

  /**
   * Load this customer's recent orders AND payments from the paginated
   * customer.orders relation (complete + scoped — not a global window that a
   * customer's rows can fall outside of).
   */
  private async loadCustomerActivity(
    customerId: string,
  ): Promise<{ orders: any[]; payments: any[] }> {
    try {
      const client = this.apollo.getClient();
      const result = await client.query({
        query: GET_CUSTOMER_ORDERS,
        variables: {
          id: customerId,
          options: {
            take: RECENT_ORDERS_TAKE,
            skip: 0,
            sort: { createdAt: 'DESC' as const },
          } as OrderListOptions,
        },
        fetchPolicy: 'network-only',
      });
      const orders = result.data?.customer?.orders?.items ?? [];
      const payments = orders
        .flatMap((o: any) =>
          (o.payments ?? []).map((p: any) => ({ ...p, orderId: o.id, orderCode: o.code })),
        )
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8); // summary card — full history is behind "View all payments"
      return { orders, payments };
    } catch {
      return { orders: [], payments: [] };
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    // datetime: orders/payments on the same day must stay distinguishable
    return toDisplayDate(value, 'datetime');
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
