import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyService } from '../../../../core/services/currency.service';
import { OrderStateBadgeComponent } from './order-state-badge.component';

export interface OrderTableRowData {
  id: string;
  code: string;
  state: string;
  createdAt: string;
  orderPlacedAt?: string | null;
  total: number;
  totalWithTax: number;
  currencyCode: string;
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress?: string | null;
  } | null;
  lines: Array<{
    id: string;
    quantity: number;
    productVariant: {
      id: string;
      name: string;
    };
  }>;
  payments?: Array<{
    id: string;
    state: string;
    amount: number;
    method: string;
    createdAt: string;
  }> | null;
}

export type OrderAction = 'view' | 'print' | 'pay';

@Component({
  selector: 'tr[app-order-table-row]',
  imports: [OrderStateBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cursor-pointer transition-colors',
    '(click)': 'navigateToOrder()',
  },
  template: `
    <td>
      <div class="font-medium">{{ order().code }}</div>
      <div class="text-sm text-base-content/60">
        {{ formatDate(order().orderPlacedAt || order().createdAt) }}
      </div>
    </td>
    <td>
      @if (order().customer) {
        <div>{{ getCustomerName() }}</div>
      } @else {
        <span class="text-base-content/60">Walk-in</span>
      }
    </td>
    <td class="text-center">{{ getItemCount() }}</td>
    <td class="text-right font-medium">{{ formatCurrency(order().totalWithTax) }}</td>
    <td>
      <app-order-state-badge [state]="order().state" />
    </td>
    <td class="text-right">
      <div class="flex justify-end gap-1">
        @if (canPay()) {
          <button
            class="btn btn-xs btn-success"
            (click)="onAction('pay'); $event.stopPropagation()"
          >
            Pay
          </button>
        }
        @if (canPrint()) {
          <button
            class="btn btn-xs btn-ghost"
            (click)="onAction('print'); $event.stopPropagation()"
          >
            <svg
              class="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
          </button>
        }
      </div>
    </td>
  `,
})
export class OrderTableRowComponent {
  private readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
  readonly order = input.required<OrderTableRowData>();
  readonly action = output<{ action: OrderAction; orderId: string }>();

  getCustomerName(): string {
    const customer = this.order().customer;
    if (!customer) return 'Walk-in Customer';
    return `${customer.firstName} ${customer.lastName}`.trim() || 'Walk-in Customer';
  }

  getItemCount(): number {
    return this.order().lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }

  canPrint(): boolean {
    return this.order().state !== 'Draft';
  }

  readonly canPay = computed(() => {
    const order = this.order();
    if (order.state !== 'ArrangingPayment') return false;
    if (!order.customer) return false;

    const payments = order.payments || [];
    const settledPayments = payments
      .filter((p: any) => p.state === 'Settled')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const orderTotal = order.totalWithTax || order.total || 0;
    return orderTotal - settledPayments > 0;
  });

  navigateToOrder(): void {
    this.router.navigate(['/dashboard/orders', this.order().id]);
  }

  onAction(actionType: OrderAction): void {
    this.action.emit({ action: actionType, orderId: this.order().id });
  }
}
