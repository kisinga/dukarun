import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/**
 * Order State Badge Component
 *
 * Displays order state with appropriate color and icon.
 * When outstandingAmount > 0, overrides to show "Balance due" so the order is not
 * incorrectly shown as "Paid" while a balance remains.
 */
@Component({
  selector: 'app-order-state-badge',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge badge-sm" [class]="badgeClass()">
      @if (showIcon()) {
        <span class="mr-1">{{ icon() }}</span>
      }
      {{ label() }}
    </span>
  `,
})
export class OrderStateBadgeComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly state = input.required<string>();
  /** When set and > 0, overrides display to "Balance due" (amount) so UI is not misleading. */
  readonly outstandingAmount = input<number>(0);

  readonly label = computed(() => {
    const outstanding = this.outstandingAmount();
    if (outstanding != null && outstanding > 0) {
      return `Balance due ${this.currencyService.format(outstanding, false)}`;
    }
    const state = this.state();
    const statusMap: Record<string, string> = {
      Draft: 'Draft',
      ArrangingPayment: 'Unpaid',
      PaymentSettled: 'Paid',
      Fulfilled: 'Paid',
    };
    return statusMap[state] || state;
  });

  readonly badgeClass = computed(() => {
    const outstanding = this.outstandingAmount();
    if (outstanding != null && outstanding > 0) return 'badge-warning';
    const state = this.state();
    if (state === 'Draft') return 'badge-neutral';
    if (state === 'ArrangingPayment') return 'badge-warning';
    if (state === 'PaymentSettled' || state === 'Fulfilled') return 'badge-success';
    return 'badge-neutral';
  });

  readonly icon = computed(() => {
    const outstanding = this.outstandingAmount();
    if (outstanding != null && outstanding > 0) return '⚠';
    const state = this.state();
    if (state === 'Fulfilled') return '✓';
    if (state === 'PaymentSettled') return '○';
    if (state === 'ArrangingPayment') return '⚠';
    return '';
  });

  readonly showIcon = computed(() => {
    const outstanding = this.outstandingAmount();
    if (outstanding != null && outstanding > 0) return true;
    const state = this.state();
    return state === 'Fulfilled' || state === 'PaymentSettled' || state === 'ArrangingPayment';
  });
}
