import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Payment State Badge Component
 *
 * Displays payment state with appropriate color and icon
 */
@Component({
  selector: 'app-payment-state-badge',
  imports: [CommonModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge badge-sm" [class]="badgeClass()">
      @if (showIcon()) {
        <ng-icon [name]="icon()" size="1rem" class="mr-1" />
      }
      {{ label() }}
    </span>
  `,
})
export class PaymentStateBadgeComponent {
  readonly state = input.required<string>();

  readonly label = computed(() => {
    const state = this.state();
    const statusMap: Record<string, string> = {
      Created: 'Created',
      Authorized: 'Authorized',
      Settled: 'Settled',
      Declined: 'Declined',
      Cancelled: 'Cancelled',
    };
    return statusMap[state] || state;
  });

  readonly badgeClass = computed(() => {
    const state = this.state();
    if (state === 'Settled') return 'badge-success';
    if (state === 'Authorized') return 'badge-info';
    if (state === 'Declined' || state === 'Cancelled') return 'badge-error';
    if (state === 'Created') return 'badge-warning';
    return 'badge-neutral';
  });

  readonly icon = computed(() => {
    const state = this.state();
    if (state === 'Settled') return 'heroCheckCircle';
    if (state === 'Authorized') return 'heroCheck';
    if (state === 'Declined' || state === 'Cancelled') return 'heroXCircle';
    return '';
  });

  readonly showIcon = computed(() => {
    const state = this.state();
    return (
      state === 'Settled' || state === 'Authorized' || state === 'Declined' || state === 'Cancelled'
    );
  });
}
