import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../../core/services/currency.service';

@Component({
  selector: 'app-checkout-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-base-200 rounded-xl p-4 sm:p-6 anim-fade-in-up">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs sm:text-sm text-base-content/60">Items</span>
        <span class="font-semibold text-base sm:text-lg">{{ itemCount() }}</span>
      </div>
      @if (paymentMethodName()) {
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs sm:text-sm text-base-content/60">Payment</span>
          <span class="badge badge-success badge-xs sm:badge-sm">{{ paymentMethodName() }}</span>
        </div>
      }
      <div class="divider my-2"></div>
      <div class="flex justify-between items-center">
        <span class="font-bold text-base sm:text-xl">{{ totalLabel() }}</span>
        <span
          class="text-2xl sm:text-3xl font-bold text-tabular"
          [class.text-info]="totalColor() === 'info'"
          [class.text-warning]="totalColor() === 'warning'"
          [class.text-success]="totalColor() === 'success'"
          [class.text-primary]="totalColor() === 'primary'"
        >
          {{ currencyService.format(total()) }}
        </span>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutSummaryComponent {
  readonly currencyService = inject(CurrencyService);

  readonly itemCount = input.required<number>();
  readonly total = input.required<number>();
  readonly totalLabel = input<string>('Total');
  readonly totalColor = input<'info' | 'warning' | 'success' | 'primary'>('primary');
  readonly paymentMethodName = input<string | null>(null);
  readonly delay = input<boolean>(false);
}
