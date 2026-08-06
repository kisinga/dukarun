import { Component, computed, input } from '@angular/core';
import { formatKes, formatMoneyAmount } from '../../core/money';

/**
 * Canonical money renderer (The Counter — money talks first).
 * Repeated UI amounts omit the redundant KES prefix by default. The full
 * currency remains available to assistive technology and explicit contexts.
 */
@Component({
  selector: 'app-money',
  template: `
    <span
      class="tabular-nums"
      [class.text-success]="direction() === 'in'"
      [class.text-error]="direction() === 'out'"
      [attr.aria-label]="masked() ? 'Amount hidden' : accessibleAmount()"
    >
      @if (masked()) {
        •••
      } @else {
        {{ formatted() }}
      }
    </span>
  `,
})
export class MoneyComponent {
  /** Amount in integer shillings. */
  readonly amount = input.required<number>();
  readonly direction = input<'in' | 'out' | 'none'>('none');
  /** Show the currency code when the surrounding label does not establish it. */
  readonly showCurrency = input(false);
  /** Hide the amount (sensitive figures without permission). */
  readonly masked = input(false);

  protected readonly formatted = computed(() =>
    this.showCurrency() ? formatKes(this.amount()) : formatMoneyAmount(this.amount())
  );
  protected readonly accessibleAmount = computed(() => formatKes(this.amount()));
}
