import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyService } from '../../../../../core/services/currency.service';
import type { OrderPaymentInfoInput } from '../order-detail.types';
/**
 * Order Payment Info Component
 *
 * Displays all payments for the order with method, status, and link to payment detail.
 */
@Component({
  selector: 'app-order-payment-info',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-6">
      <h3 class="font-semibold mb-2">Payment</h3>
      @if (paymentList().length === 0) {
        <p class="text-sm text-base-content/60">No payments</p>
      } @else {
        <ul class="space-y-2">
          @for (p of paymentList(); track p.id) {
            <li
              class="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-base-300/50 last:border-0"
            >
              <div class="min-w-0">
                <span class="font-medium">{{ p.method }}</span>
                <span class="text-sm text-base-content/60 ml-2">{{ formatAmount(p.amount) }}</span>
                <span class="text-sm text-base-content/50 ml-1"
                  >· {{ formatDate(p.createdAt) }}</span
                >
              </div>
              <a [routerLink]="['/dashboard/payments', p.id]" class="btn btn-ghost btn-xs">
                View
              </a>
            </li>
          }
        </ul>
        <p class="text-sm text-base-content/60 mt-2">
          <strong>Status:</strong> {{ primaryPayment()?.state ?? 'N/A' }}
        </p>
      }
    </div>
  `,
})
export class OrderPaymentInfoComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly payments = input<OrderPaymentInfoInput['payments']>(null);

  readonly paymentList = computed(() => {
    const p = this.payments();
    return Array.isArray(p) ? p : [];
  });

  readonly primaryPayment = computed(() => {
    const payments = this.paymentList();
    return payments.length > 0 ? payments[0] : null;
  });

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatAmount(cents: number): string {
    return this.currencyService.format(cents ?? 0, false);
  }
}
