import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HoverPreviewHostComponent } from '../../../components/shared/hover-preview-host/hover-preview-host.component';
import { CurrencyService } from '../../../../core/services/currency.service';
import { OrderStateBadgeComponent } from './order-state-badge.component';
import { getOrderAmountOwing } from '../utils/order-payment.util';
import { toDisplayDate } from '../../../../core/utils/date.util';

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
  customFields?: { reversedAt?: string | null } | null;
}

export type OrderAction = 'view' | 'print' | 'pay' | 'void';

@Component({
  selector: 'tr[app-order-table-row]',
  imports: [OrderStateBadgeComponent, RouterLink, HoverPreviewHostComponent, NgIcon],
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
      @if (order().customer?.id) {
        <app-hover-preview-host previewKey="customer" [entityId]="order().customer!.id">
          <a
            [routerLink]="['/dashboard/customers', order().customer!.id]"
            class="link link-hover"
            (click)="$event.stopPropagation()"
            >{{ getCustomerName() }}</a
          >
        </app-hover-preview-host>
      } @else if (order().customer) {
        <div>{{ getCustomerName() }}</div>
      } @else {
        <span class="text-base-content/60">Walk-in</span>
      }
    </td>
    <td class="text-center">{{ getItemCount() }}</td>
    <td class="text-right font-medium">{{ formatCurrency(order().totalWithTax) }}</td>
    <td class="text-right">
      @if (amountOwing() > 0) {
        <span class="font-medium text-warning">{{ formatCurrency(amountOwing()) }}</span>
      } @else {
        <span class="text-base-content/40">-</span>
      }
    </td>
    <td>
      <app-order-state-badge
        [state]="order().state"
        [reversedAt]="order().customFields?.reversedAt ?? null"
      />
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
            <ng-icon name="heroPrinter" size="1rem" />
          </button>
        }
        @if (canVoid()) {
          <button
            class="btn btn-xs btn-ghost btn-error"
            (click)="onAction('void'); $event.stopPropagation()"
          >
            Void
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
    return toDisplayDate(dateString, 'medium');
  }

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }

  canPrint(): boolean {
    return this.order().state !== 'Draft';
  }

  canVoid(): boolean {
    const order = this.order();
    return (
      order.state !== 'Draft' &&
      order.state !== 'Cancelled' &&
      !(order.customFields?.reversedAt != null)
    );
  }

  readonly amountOwing = computed(() => getOrderAmountOwing(this.order()));

  readonly canPay = computed(() => {
    const order = this.order();
    if (order.state !== 'ArrangingPayment') return false;
    if (!order.customer) return false;

    return this.amountOwing() > 0;
  });

  navigateToOrder(): void {
    this.router.navigate(['/dashboard/orders', this.order().id]);
  }

  onAction(actionType: OrderAction): void {
    this.action.emit({ action: actionType, orderId: this.order().id });
  }
}
