import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../../core/services/currency.service';

/**
 * Purchase Payment Info Component
 *
 * Displays payment status and credit purchase information
 */
@Component({
  selector: 'app-purchase-payment-info',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h3 class="font-bold text-base mb-3 text-base-content">Payment Information</h3>
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm text-base-content/70">Status:</span>
          <span class="badge badge-sm" [ngClass]="getPaymentStatusBadgeClass()">
            {{ paymentStatus() }}
          </span>
        </div>
        @if (isCreditPurchase()) {
          <div class="flex items-center justify-between">
            <span class="text-sm text-base-content/70">Type:</span>
            <span class="badge badge-xs badge-info">Credit Purchase</span>
          </div>
        }
        <div class="flex items-center justify-between pt-2 border-t border-base-300/50">
          <span class="text-sm font-medium text-base-content">Total Amount:</span>
          <span class="text-sm font-semibold text-primary">{{ formatCurrency(totalCost()) }}</span>
        </div>
      </div>
    </div>
  `,
})
export class PurchasePaymentInfoComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly paymentStatus = input.required<string>();
  readonly isCreditPurchase = input<boolean>(false);
  readonly totalCost = input.required<number>();

  getPaymentStatusBadgeClass(): string {
    const status = this.paymentStatus().toLowerCase();
    if (status === 'paid') return 'badge-success';
    if (status === 'partial') return 'badge-warning';
    return 'badge-error';
  }

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }
}
