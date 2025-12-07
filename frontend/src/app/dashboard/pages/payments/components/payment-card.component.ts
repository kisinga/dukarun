import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import { PaymentWithOrder } from '../../../../core/services/payments.service';
import { OrderDetailComponent } from '../../orders/order-detail/order-detail.component';
import { PaymentStateBadgeComponent } from './payment-state-badge.component';

export type PaymentAction = 'view' | 'viewOrder';

/**
 * Payment Card Component for mobile view
 */
@Component({
  selector: 'app-payment-card',
  imports: [CommonModule, PaymentStateBadgeComponent, OrderDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="card bg-base-100 shadow-sm border border-base-300/60 rounded-lg overflow-hidden active:scale-[0.98] transition-transform hover:shadow-md hover:border-base-300 touch-manipulation"
    >
      <div class="card-body p-3 sm:p-4 lg:p-5">
        <!-- Header: Order Code & Status -->
        <div class="flex items-start justify-between gap-2 sm:gap-3 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-base-300/50">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 sm:mb-1.5 flex-wrap">
              <h3 class="font-bold text-sm sm:text-base lg:text-lg truncate text-base-content">
                Order {{ payment().order.code }}
              </h3>
              <app-payment-state-badge [state]="payment().state" />
            </div>
            <p class="text-xs text-base-content/50">{{ formatDate(payment().createdAt) }}</p>
          </div>
        </div>

        <!-- Quick Info Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 lg:gap-4 mb-3 sm:mb-4">
          <!-- Customer -->
          @if (payment().order.customer) {
            <div class="flex items-start gap-2 sm:gap-2.5 min-w-0 p-2 sm:p-2.5 rounded-lg bg-base-200/50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-base-content/50 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-base-content/50 leading-tight mb-0.5">Customer</p>
                <p class="text-sm font-medium truncate text-base-content">
                  {{ getCustomerName() }}
                </p>
              </div>
            </div>
          }

          <!-- Payment Method -->
          <div class="flex items-start gap-2 sm:gap-2.5 min-w-0 p-2 sm:p-2.5 rounded-lg bg-base-200/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-base-content/50 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            <div class="min-w-0 flex-1">
              <p class="text-xs text-base-content/50 leading-tight mb-0.5">Method</p>
              <p class="text-sm font-medium text-base-content truncate">{{ payment().method }}</p>
            </div>
          </div>
        </div>

        <!-- Transaction ID -->
        @if (payment().transactionId) {
          <div class="mb-3 sm:mb-4 p-2 sm:p-2.5 rounded-lg bg-base-200/30">
            <p class="text-xs text-base-content/50 mb-0.5">Transaction ID</p>
            <p class="text-xs font-mono text-base-content/70 break-all">
              {{ payment().transactionId }}
            </p>
          </div>
        }

        <!-- Amount & Actions -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 sm:pt-4 border-t border-base-300/50">
          <div class="flex-1 min-w-0">
            <p class="text-xs text-base-content/50 mb-1">Amount</p>
            <p class="text-lg sm:text-xl font-bold text-primary">
              {{ formatCurrency(payment().amount) }}
            </p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              class="btn btn-sm btn-primary w-full sm:w-auto touch-manipulation"
              (click)="onAction('view')"
              title="View payment"
            >
              View
            </button>
            <button
              class="btn btn-sm btn-outline w-full sm:w-auto touch-manipulation"
              (click)="onAction('viewOrder')"
              title="View order"
            >
              Order
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Order Modal -->
    @if (selectedOrderId()) {
      <app-order-detail
        [orderId]="selectedOrderId()!"
        [modalMode]="true"
        [showHeader]="false"
        [showPrintControls]="false"
        (closed)="onOrderModalClosed()"
      />
    }
  `,
})
export class PaymentCardComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly payment = input.required<PaymentWithOrder>();
  readonly action = output<{ action: PaymentAction; paymentId: string; orderId?: string }>();
  readonly selectedOrderId = signal<string | null>(null);

  getCustomerName(): string {
    const customer = this.payment().order.customer;
    if (!customer) return 'Walk-in Customer';
    return `${customer.firstName} ${customer.lastName}`.trim() || 'Walk-in Customer';
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

  onAction(actionType: PaymentAction): void {
    if (actionType === 'viewOrder') {
      this.selectedOrderId.set(this.payment().order.id);
    } else {
      this.action.emit({ action: actionType, paymentId: this.payment().id });
    }
  }

  onOrderModalClosed(): void {
    this.selectedOrderId.set(null);
  }
}
