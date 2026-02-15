import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/**
 * Floating Action Button for checkout with visible total
 */
@Component({
  selector: 'app-checkout-fab',
  imports: [CommonModule],
  template: `
    <button
      class="fixed bottom-20 right-4 btn btn-primary btn-lg shadow-xl z-40 flex items-center gap-3 rounded-full px-5 sm:bottom-24 sm:right-6 anim-scale-in"
      [class.btn-disabled]="disabled() || total() === 0"
      [class.anim-pulse-once]="cartJustUpdated()"
      (click)="checkout.emit()"
      aria-label="Proceed to checkout"
    >
      <!-- Total Amount (NO currency symbol) -->
      <span class="text-xl font-bold tabular-nums">
        {{ formatAmount(total()) }}
      </span>

      <!-- Checkout Arrow Icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutFabComponent {
  // Inputs
  readonly total = input.required<number>(); // in cents
  readonly disabled = input<boolean>(false);
  readonly cartJustUpdated = input<boolean>(false);

  // Outputs
  readonly checkout = output<void>();

  // Services
  private readonly currencyService = inject(CurrencyService);

  formatAmount(totalCents: number): string {
    // Convert cents to whole currency amount, no symbol
    return Math.round(totalCents / 100).toString();
  }
}
