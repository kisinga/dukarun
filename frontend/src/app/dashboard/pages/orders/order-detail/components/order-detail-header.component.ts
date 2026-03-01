import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OrderStateBadgeComponent } from '../../components/order-state-badge.component';
import type { OrderDetailHeaderInput } from '../order-detail.types';

/**
 * Order Detail Header Component
 *
 * Displays order code, state badge (balance-aware), and order date
 */
@Component({
  selector: 'app-order-detail-header',
  imports: [CommonModule, OrderStateBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-base-300/50"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
          <h2 class="text-xl sm:text-2xl font-bold text-base-content">Order {{ orderCode() }}</h2>
          <app-order-state-badge
            [state]="orderState()"
            [outstandingAmount]="outstandingAmount() ?? 0"
          />
        </div>
        <p class="text-xs sm:text-sm text-base-content/60">Placed: {{ formattedDate() }}</p>
      </div>
    </div>
  `,
})
export class OrderDetailHeaderComponent {
  readonly orderCode = input.required<string>();
  readonly orderState = input.required<string>();
  readonly orderDate = input<string | null | undefined>(null);
  /** Outstanding balance in cents; when > 0, badge shows "Balance due" instead of "Paid". */
  readonly outstandingAmount = input<number | undefined>(undefined);

  readonly formattedDate = computed(() => {
    const date = this.orderDate();
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });
}
