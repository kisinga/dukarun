import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../../core/services/currency.service';

/**
 * Purchase Totals Component
 *
 * Displays total cost with currency formatting
 */
@Component({
  selector: 'app-purchase-totals',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex justify-end">
      <div class="w-full sm:w-80">
        <div class="space-y-2.5">
          <div
            class="flex justify-between pt-3 border-t border-base-300/50 font-bold text-lg sm:text-xl"
          >
            <span class="text-base-content">Total Cost:</span>
            <span class="text-primary">{{ formatCurrency(totalCost()) }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PurchaseTotalsComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly totalCost = input.required<number>();

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }
}
