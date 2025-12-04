import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
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

/**
 * Order Card Component for mobile view
 *
 * Mobile-optimized design with:
 * - Information-dense layout
 * - Quick visual scanning
 * - Large touch targets
 * - Progressive disclosure
 */
@Component({
  selector: 'app-order-card',
  imports: [CommonModule, RouterLink, OrderStateBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details
      class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-xl shadow-sm"
    >
      <summary class="collapse-title p-4 min-h-0">
        <div class="flex gap-3">
          <!-- Order Icon/Status -->
          <div class="avatar shrink-0">
            <div
              class="w-16 h-16 rounded-lg ring-2 ring-base-300 ring-offset-1 bg-base-200 flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-8 w-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>

          <!-- Order Summary -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="text-base font-bold line-clamp-1 leading-tight">{{ order().code }}</h3>
              <app-order-state-badge [state]="order().state" />
            </div>

            <!-- Key Metrics -->
            <div class="flex items-center gap-2 mb-1 text-xs text-base-content/60">
              <span>{{ getItemCount() }} items</span>
              <span class="w-1 h-1 rounded-full bg-base-content/30"></span>
              <span class="text-base-content/60">
                @if (order().customer) {
                  {{ getCustomerName() }}
                } @else {
                  Walk-in
                }
              </span>
            </div>

            <!-- Date & Total -->
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
      </summary>

      <!-- Expanded Content -->
      <div class="collapse-content px-4 pb-4 pt-0">
        <div class="divider my-2"></div>

        <!-- Detailed Info Grid -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-base-200 rounded-lg p-2.5">
            <div class="text-xs text-base-content/60 mb-0.5">Items</div>
            <div class="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              <span class="text-base font-bold">{{ getItemCount() }}</span>
            </div>
          </div>

          <div class="bg-base-200 rounded-lg p-2.5">
            <div class="text-xs text-base-content/60 mb-0.5">Customer</div>
            <div class="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span class="text-base font-bold truncate">
                @if (order().customer) {
                  {{ getCustomerName() }}
                } @else {
                  Walk-in
                }
              </span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-2">
          <button
            type="button"
            (click)="onAction('view')"
            [routerLink]="['/dashboard/orders', order().id]"
            class="btn btn-primary btn-sm flex-1 gap-1.5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            View
          </button>
          @if (canPay()) {
            <button
              type="button"
              (click)="onAction('pay'); $event.preventDefault(); $event.stopPropagation()"
              class="btn btn-success btn-sm flex-1 gap-1.5"
              aria-label="Pay order"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              Pay
            </button>
          }
          @if (canPrint()) {
            <button
              type="button"
              (click)="onAction('print')"
              [routerLink]="['/dashboard/orders', order().id]"
              [queryParams]="{ print: true }"
              class="btn btn-ghost btn-sm flex-1 gap-1.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              Print
            </button>
          }
        </div>
      </div>
    </details>
  `,
})
export class OrderCardComponent {
  private readonly currencyService = inject(CurrencyService);
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
