import { Component, computed, input } from '@angular/core';
import {
  formatKes,
  formatMoneyAmount,
  formatUnitCost,
  formatUnitCostAmount,
} from '../../core/money';

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
  /** Amount in shillings; fractional values require unitCost. */
  readonly amount = input.required<number>();
  /** Buying-cost rate, not a posted total or selling price. */
  readonly unitCost = input(false);
  readonly direction = input<'in' | 'out' | 'none'>('none');
  /** Show the currency code when the surrounding label does not establish it. */
  readonly showCurrency = input(false);
  /** Hide the amount (sensitive figures without permission). */
  readonly masked = input(false);

  protected readonly formatted = computed(() =>
    this.unitCost()
      ? this.showCurrency()
        ? formatUnitCost(this.amount())
        : formatUnitCostAmount(this.amount())
      : this.showCurrency()
        ? formatKes(this.amount())
        : formatMoneyAmount(this.amount())
  );
  protected readonly accessibleAmount = computed(() =>
    this.unitCost() ? formatUnitCost(this.amount()) : formatKes(this.amount())
  );
}
