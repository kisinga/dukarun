import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HoverPreviewHostComponent } from '../../../shared/components/dashboard/hover-preview-host/hover-preview-host.component';
import { CurrencyService } from '../../../shared/services/currency.service';
import { PaymentWithOrder } from '@dukarun/payments';
import { toDisplayDate } from '../../../shared/utils/date.util';
import { OrderDetailComponent } from '@dukarun/order/components';
import { PaymentStateBadgeComponent } from './payment-state-badge.component';

export type PaymentAction = 'view' | 'viewOrder';

/**
 * Payment Card Component for mobile view
 */
@Component({
  selector: 'app-payment-card',
  imports: [
    CommonModule,
    NgIcon,
    RouterLink,
    HoverPreviewHostComponent,
    PaymentStateBadgeComponent,
    OrderDetailComponent,
  ],
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
              <ng-icon name="heroCreditCard" size="1.25rem" class="text-primary" />
            </div>
          </div>

          <!-- Payment Summary -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2 mb-1">
              <app-hover-preview-host previewKey="order" [entityId]="payment().order.id">
                <a
                  [routerLink]="['/dashboard/orders', payment().order.id]"
                  class="link link-hover text-sm line-clamp-1 leading-tight font-medium"
                  (click)="$event.stopPropagation()"
                >
                  {{ payment().order.code }}
                </a>
              </app-hover-preview-host>
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
              <ng-icon name="heroUser" size="1rem" class="text-base-content/50 shrink-0" />
              @if (payment().order.customer?.id) {
                <app-hover-preview-host
                  previewKey="customer"
                  [entityId]="payment().order.customer!.id"
                >
                  <a
                    [routerLink]="['/dashboard/customers', payment().order.customer!.id]"
                    class="link link-hover text-sm font-medium text-base-content"
                    >{{ getCustomerName() }}</a
                  >
                </app-hover-preview-host>
              } @else {
                <p class="text-sm font-medium text-base-content">{{ getCustomerName() }}</p>
              }
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
            <ng-icon name="heroEye" size="1rem" />
            View
          </button>
          <button
            (click)="onAction('viewOrder')"
            class="btn btn-outline btn-sm flex-1 gap-1.5 touch-manipulation"
          >
            <ng-icon name="heroDocumentText" size="1rem" />
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
    return toDisplayDate(dateString, 'medium');
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
