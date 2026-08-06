import { Component, computed, input } from '@angular/core';
import { formatKes } from '../../core/money';

@Component({
  selector: 'app-money',
  template: `
    <span
      class="tabular-nums"
      [class.text-success]="direction() === 'in'"
      [class.text-error]="direction() === 'out'"
      [attr.aria-label]="accessibleAmount()"
    >
      {{ formatted() }}
    </span>
  `,
})
export class MoneyComponent {
  readonly amount = input.required<number>();
  readonly direction = input<'in' | 'out' | 'none'>('none');
  readonly showCurrency = input(false);

  protected readonly accessibleAmount = computed(() => formatKes(this.amount()));
  protected readonly formatted = computed(() => {
    if (this.showCurrency()) return this.accessibleAmount();
    return Math.round(this.amount()).toLocaleString('en-KE');
  });
}
