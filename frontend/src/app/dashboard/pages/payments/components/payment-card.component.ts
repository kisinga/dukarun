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
    <details
      class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-xl shadow-sm"
    >
      <summary class="collapse-title p-4 min-h-0">
        <div class="flex gap-3">
          <!-- Payment Icon/Avatar -->
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
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
          </div>

          <!-- Payment Summary -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="text-sm line-clamp-1 leading-tight">
                {{ payment().order.code }}
              </h3>
              <app-payment-state-badge [state]="payment().state" />
            </div>

            <!-- Key Metrics -->
            <div class="flex items-center gap-2 mb-1 text-xs text-base-content/60">
              <span>{{ formatDate(payment().createdAt) }}</span>
              <span class="w-1 h-1 rounded-full bg-base-content/30"></span>
              <span class="font-medium">{{ payment().method }}</span>
            </div>

            <!-- Amount -->
            <div class="text-lg font-bold text-primary font-mono tracking-tight">
              {{ formatCurrency(payment().amount) }}
            </div>
          </div>
        </div>
      </summary>

      <!-- Expanded Content -->
      <div class="collapse-content px-4 pb-4 pt-0">
        <div class="divider my-2"></div>

        <!-- Customer Info -->
        @if (payment().order.customer) {
          <div class="mb-3">
            <h4 class="text-xs font-semibold mb-1.5">Customer</h4>
            <div class="flex items-center gap-2 p-2.5 rounded-lg bg-base-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-base-content/50 shrink-0"
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
              <p class="text-sm font-medium text-base-content">{{ getCustomerName() }}</p>
            </div>
          </div>
        }

        <!-- Transaction ID -->
        @if (payment().transactionId) {
          <div class="mb-3">
            <h4 class="text-xs font-semibold mb-1.5">Transaction ID</h4>
            <div class="p-2.5 rounded-lg bg-base-200">
              <p class="text-xs font-mono text-base-content/70 break-all">
                {{ payment().transactionId }}
              </p>
            </div>
          </div>
        }

        <!-- Action Buttons -->
        <div class="flex gap-2">
          <button
            (click)="onAction('view')"
            class="btn btn-primary btn-sm flex-1 gap-1.5 touch-manipulation"
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
          <button
            (click)="onAction('viewOrder')"
            class="btn btn-outline btn-sm flex-1 gap-1.5 touch-manipulation"
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Order
          </button>
        </div>
      </div>
    </details>

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
