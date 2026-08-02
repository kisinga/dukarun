import { Component, computed, input } from '@angular/core';
import { formatKes } from '../../core/money';

/**
 * Canonical money renderer (The Counter — money talks first).
 * Cents in, KES out; tabular-nums always; semantic color carries money
 * meaning only (`in` = received, `out` = owed/spent). Never decorate.
 */
@Component({
  selector: 'app-money',
  template: `
    <span
      class="tabular-nums"
      [class.text-success]="direction() === 'in'"
      [class.text-error]="direction() === 'out'"
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
  /** Amount in integer cents. */
  readonly cents = input.required<number>();
  readonly direction = input<'in' | 'out' | 'none'>('none');
  /** Hide the amount (sensitive figures without permission). */
  readonly masked = input(false);

  protected readonly formatted = computed(() => formatKes(this.cents()));
}
