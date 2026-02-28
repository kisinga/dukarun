import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyService } from '../../../../../core/services/currency.service';
import type { OrderPaymentInfoInput } from '../order-detail.types';

/**
 * Order Payment Info Component
 *
 * Displays all payments for the order in a table-like layout with method, amount, date,
 * and a total row. Links to payment detail.
 */
@Component({
  selector: 'app-order-payment-info',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h3 class="font-semibold mb-3">Payments</h3>
      @if (paymentList().length === 0) {
        <p class="text-sm text-base-content/60">No payments</p>
      } @else {
        <div class="overflow-x-auto rounded-lg border border-base-300/60">
          <table class="table table-sm table-zebra">
            <thead>
              <tr>
                <th class="w-0">Method</th>
                <th class="text-right">Amount</th>
                <th class="text-base-content/70">Date</th>
                <th class="w-0"></th>
              </tr>
            </thead>
            <tbody>
              @for (p of paymentList(); track p.id) {
                <tr>
                  <td class="font-medium">{{ p.method }}</td>
                  <td class="text-right">{{ formatAmount(p.amount) }}</td>
                  <td class="text-sm text-base-content/70">{{ formatDate(p.createdAt) }}</td>
                  <td>
                    <a [routerLink]="['/dashboard/payments', p.id]" class="btn btn-ghost btn-xs">
                      View
                    </a>
                  </td>
                </tr>
              }
            </tbody>
            @if (totalPaid() > 0) {
              <tfoot>
                <tr class="border-t-2 border-base-300 font-semibold">
                  <td>Total paid</td>
                  <td class="text-right">{{ formatAmount(totalPaid()) }}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
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

  readonly totalPaid = computed(() => {
    return this.paymentList().reduce((sum, payment) => sum + (Number(payment.amount) ?? 0), 0);
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
