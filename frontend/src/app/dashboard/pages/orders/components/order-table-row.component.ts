import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
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

/**
 * Order Table Row Component for desktop view
 */
@Component({
  selector: 'tr[app-order-table-row]',
  imports: [CommonModule, RouterLink, OrderStateBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      <div class="flex justify-end gap-2">
        <button
          class="btn btn-sm btn-ghost"
          (click)="onAction('view')"
          [routerLink]="['/dashboard/orders', order().id]"
        >
          View
        </button>
        @if (canPay()) {
          <button
            class="btn btn-sm btn-success"
            (click)="onAction('pay'); $event.preventDefault(); $event.stopPropagation()"
          >
            Pay
          </button>
        }
        @if (canPrint()) {
          <button
            class="btn btn-sm btn-primary"
            (click)="onAction('print')"
            [routerLink]="['/dashboard/orders', order().id]"
            [queryParams]="{ print: true }"
          >
            Print
          </button>
        }
      </div>
    </td>
  `,
})
export class OrderTableRowComponent {
  private readonly currencyService = inject(CurrencyService);
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
    const state = this.order().state;
    return state !== 'Draft';
  }

  readonly canPay = computed(() => {
    const order = this.order();
    // Only show pay button for unpaid credit orders
    if (order.state !== 'ArrangingPayment') return false;
    if (!order.customer) return false; // Credit orders have customers

    // Check if order has outstanding balance
    const payments = order.payments || [];
    const settledPayments = payments
      .filter((p: any) => p.state === 'Settled')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const orderTotal = order.totalWithTax || order.total || 0;
    const outstandingAmount = orderTotal - settledPayments;

    // Only show if there's outstanding balance
    return outstandingAmount > 0;
  });

  onAction(actionType: OrderAction): void {
    this.action.emit({ action: actionType, orderId: this.order().id });
  }
}
