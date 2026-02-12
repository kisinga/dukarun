import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../../core/services/currency.service';
import type { OrderTotalsInput } from '../order-detail.types';

/**
 * Order Totals Component
 *
 * Displays order total with currency formatting
 */
@Component({
  selector: 'app-order-totals',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex justify-end">
      <div class="w-full sm:w-80">
        <div class="flex justify-between font-bold text-lg sm:text-xl">
          <span class="text-base-content">Total</span>
          <span class="text-primary">{{ formatCurrency(total()) }}</span>
        </div>
      </div>
    </div>
  `,
})
export class OrderTotalsComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly subtotal = input.required<number>();
  readonly tax = input.required<number>();
  readonly total = input.required<number>();

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }
}
