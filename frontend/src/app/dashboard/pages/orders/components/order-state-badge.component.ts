import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Order State Badge Component
 *
 * Displays order state with appropriate color and icon
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
  readonly state = input.required<string>();

  readonly label = computed(() => {
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
    const state = this.state();
    if (state === 'Draft') return 'badge-neutral';
    if (state === 'ArrangingPayment') return 'badge-warning';
    if (state === 'PaymentSettled' || state === 'Fulfilled') return 'badge-success';
    return 'badge-neutral';
  });

  readonly icon = computed(() => {
    const state = this.state();
    if (state === 'Fulfilled') return '✓';
    if (state === 'PaymentSettled') return '○';
    if (state === 'ArrangingPayment') return '⚠';
    return '';
  });

  readonly showIcon = computed(() => {
    const state = this.state();
    return state === 'Fulfilled' || state === 'PaymentSettled' || state === 'ArrangingPayment';
  });
}
