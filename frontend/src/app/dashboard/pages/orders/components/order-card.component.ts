import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
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
}

export type OrderAction = 'view' | 'print';

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
    <div
      class="card bg-base-100 shadow-sm border border-base-300/60 rounded-lg overflow-hidden active:scale-[0.98] transition-transform hover:shadow-md hover:border-base-300"
    >
      <div class="card-body p-4 sm:p-5">
        <!-- Header: Order Code & Status -->
        <div class="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-base-300/50">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5">
              <h3 class="font-bold text-base sm:text-lg truncate text-base-content">
                {{ order().code }}
              </h3>
              <app-order-state-badge [state]="order().state" />
            </div>
            <p class="text-xs text-base-content/50">
              {{ formatDate(order().orderPlacedAt || order().createdAt) }}
            </p>
          </div>
        </div>

        <!-- Quick Info Grid -->
        <div class="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
          <!-- Customer -->
          <div class="flex items-start gap-2.5 min-w-0 p-2.5 rounded-lg bg-base-200/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-base-content/50 shrink-0 mt-0.5"
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
            <div class="min-w-0 flex-1">
              <p class="text-xs text-base-content/50 leading-tight mb-0.5">Customer</p>
              <p class="text-sm font-medium truncate text-base-content">
                @if (order().customer) {
                  {{ getCustomerName() }}
                } @else {
                  <span class="text-base-content/60">Walk-in</span>
                }
              </p>
            </div>
          </div>

          <!-- Items -->
          <div class="flex items-start gap-2.5 min-w-0 p-2.5 rounded-lg bg-base-200/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-base-content/50 shrink-0 mt-0.5"
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
            <div class="min-w-0 flex-1">
              <p class="text-xs text-base-content/50 leading-tight mb-0.5">Items</p>
              <p class="text-sm font-medium text-base-content">{{ getItemCount() }}</p>
            </div>
          </div>
        </div>

        <!-- Total & Actions -->
        <div class="flex items-center justify-between gap-3 pt-4 border-t border-base-300/50">
          <div class="flex-1 min-w-0">
            <p class="text-xs text-base-content/50 mb-1">Total</p>
            <p class="text-lg sm:text-xl font-bold text-primary">
              {{ formatCurrency(order().totalWithTax) }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button
              class="btn btn-sm btn-ghost btn-square"
              (click)="onAction('view')"
              [routerLink]="['/dashboard/orders', order().id]"
              title="View order"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
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
            </button>
            @if (canPrint()) {
              <button
                class="btn btn-sm btn-primary btn-square"
                (click)="onAction('print')"
                [routerLink]="['/dashboard/orders', order().id]"
                [queryParams]="{ print: true }"
                title="Print order"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
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
              </button>
            }
          </div>
        </div>
      </div>
    </div>
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

  onAction(actionType: OrderAction): void {
    this.action.emit({ action: actionType, orderId: this.order().id });
  }
}
