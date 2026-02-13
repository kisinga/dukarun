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
 * Compact label-first stats cards with colored left border accent.
 */
@Component({
  selector: 'app-order-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      <!-- Total Orders -->
      <div class="rounded-xl p-2.5 sm:p-3 bg-secondary/5 border-l-[3px] border-secondary shadow-sm">
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Total
        </span>
        <p class="text-lg sm:text-xl font-bold text-secondary tabular-nums leading-none">
          {{ stats().totalOrders }}
        </p>
      </div>

      <!-- Draft Orders -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-info/5 border-l-[3px] border-info shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeStateFilter() === 'Draft'"
        [class.ring-info]="activeStateFilter() === 'Draft'"
        (click)="onFilterClick('Draft')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Draft
        </span>
        <p class="text-lg sm:text-xl font-bold text-info tabular-nums leading-none">
          {{ stats().draftOrders }}
        </p>
      </button>

      <!-- Unpaid Orders -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-warning/5 border-l-[3px] border-warning shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeStateFilter() === 'ArrangingPayment'"
        [class.ring-warning]="activeStateFilter() === 'ArrangingPayment'"
        (click)="onFilterClick('ArrangingPayment')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Unpaid
        </span>
        <p class="text-lg sm:text-xl font-bold text-warning tabular-nums leading-none">
          {{ stats().unpaidOrders }}
        </p>
      </button>

      <!-- Paid Orders -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-success/5 border-l-[3px] border-success shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeStateFilter() === 'PaymentSettled'"
        [class.ring-success]="activeStateFilter() === 'PaymentSettled'"
        (click)="onFilterClick('PaymentSettled')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Paid
        </span>
        <p class="text-lg sm:text-xl font-bold text-success tabular-nums leading-none">
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
    const colorMap: Record<string, string> = {
      Draft: 'neutral',
      ArrangingPayment: 'warning',
      PaymentSettled: 'success',
    };
    this.filterClick.emit({ type: 'state', value, color: colorMap[value] || 'primary' });
  }
}
