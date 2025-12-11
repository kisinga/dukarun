import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface OrderStats {
  totalOrders: number;
  draftOrders: number;
  unpaidOrders: number;
  paidOrders: number;
}

/**
 * Order Statistics Component
 *
 * Displays order statistics in compact gradient cards.
 * Uses secondary color theme for Orders page identity.
 */
@Component({
  selector: 'app-order-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Stats - Label-first design for mobile readability -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      <!-- Total Orders -->
      <div class="rounded-xl p-2.5 sm:p-3 bg-base-200/60 border border-base-300/20 shadow-sm">
        <span
          class="text-[9px] sm:text-[10px] text-secondary font-bold uppercase tracking-wide text-base-content/50 block mb-1"
        >
          Total
        </span>
        <p class="text-xl sm:text-2xl font-extrabold text-secondary tabular-nums leading-none">
          {{ stats().totalOrders }}
        </p>
      </div>

      <!-- Draft Orders -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-base-200/60 border border-base-300/20 shadow-sm active:scale-[0.97] transition-transform touch-manipulation"
        [class.ring-2]="activeStateFilter() === 'Draft'"
        [class.ring-info]="activeStateFilter() === 'Draft'"
        (click)="onFilterClick('Draft')"
      >
        <span
          class="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-info block mb-1"
        >
          Draft
        </span>
        <p class="text-xl sm:text-2xl font-extrabold text-info tabular-nums leading-none">
          {{ stats().draftOrders }}
        </p>
      </button>

      <!-- Unpaid Orders -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-warning/10 border border-warning/20 shadow-sm active:scale-[0.97] transition-transform touch-manipulation"
        [class.ring-2]="activeStateFilter() === 'ArrangingPayment'"
        [class.ring-warning]="activeStateFilter() === 'ArrangingPayment'"
        (click)="onFilterClick('ArrangingPayment')"
      >
        <span
          class="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-warning block mb-1"
        >
          Unpaid
        </span>
        <p class="text-xl sm:text-2xl font-extrabold text-warning tabular-nums leading-none">
          {{ stats().unpaidOrders }}
        </p>
      </button>

      <!-- Paid Orders -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-success/10 border border-success/20 shadow-sm active:scale-[0.97] transition-transform touch-manipulation"
        [class.ring-2]="activeStateFilter() === 'PaymentSettled'"
        [class.ring-success]="activeStateFilter() === 'PaymentSettled'"
        (click)="onFilterClick('PaymentSettled')"
      >
        <span
          class="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-success block mb-1"
        >
          Paid
        </span>
        <p class="text-xl sm:text-2xl font-extrabold text-success tabular-nums leading-none">
          {{ stats().paidOrders }}
        </p>
      </button>
    </div>
  `,
})
export class OrderStatsComponent {
  readonly stats = input.required<OrderStats>();
  readonly activeStateFilter = input<string>('');
  readonly filterClick = output<{ type: string; value: string; color: string }>();

  onFilterClick(value: string): void {
    // Map filter values to their badge colors
    const colorMap: Record<string, string> = {
      Draft: 'neutral',
      ArrangingPayment: 'warning',
      PaymentSettled: 'success',
    };
    this.filterClick.emit({ type: 'state', value, color: colorMap[value] || 'primary' });
  }
}
