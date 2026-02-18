import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyService } from '../../../../core/services/currency.service';
import { OrderStateBadgeComponent } from './order-state-badge.component';

export interface OrderCardData {
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
  selector: 'app-order-card',
  imports: [OrderStateBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-base-100 border border-base-300 rounded-xl shadow-sm cursor-pointer
             transition-colors hover:bg-base-200/30 active:bg-base-200/50"
      (click)="navigateToOrder()"
    >
      <div class="p-4">
        <div class="flex gap-3">
          <div class="avatar shrink-0">
            <div
              class="w-14 h-14 rounded-lg ring-2 ring-base-300 ring-offset-1 bg-base-200 flex items-center justify-center"
            >
              <svg
                class="h-7 w-7 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="text-base font-bold line-clamp-1 leading-tight">{{ order().code }}</h3>
              <app-order-state-badge [state]="order().state" />
            </div>
            <div class="flex items-center gap-2 mb-1 text-xs text-base-content/60">
              <span>{{ getItemCount() }} items</span>
              <span class="w-1 h-1 rounded-full bg-base-content/30"></span>
              <span>
                @if (order().customer) {
                  {{ getCustomerName() }}
                } @else {
                  Walk-in
                }
              </span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-base-content/50">
                {{ formatDate(order().orderPlacedAt || order().createdAt) }}
              </p>
              <p class="text-lg font-bold text-primary font-mono tracking-tight">
                {{ formatCurrency(order().totalWithTax) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      @if (canPay() || canPrint()) {
        <div class="border-t border-base-300/50 px-4 py-2 flex justify-end gap-2">
          @if (canPay()) {
            <button
              type="button"
              (click)="onAction('pay'); $event.stopPropagation()"
              class="btn btn-success btn-xs gap-1"
            >
              Pay
            </button>
          }
          @if (canPrint()) {
            <button
              type="button"
              (click)="onAction('print'); $event.stopPropagation()"
              class="btn btn-ghost btn-xs gap-1"
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
              Print
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class OrderCardComponent {
  private readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
  readonly order = input.required<OrderCardData>();
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
