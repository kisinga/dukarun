import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface CustomerStats {
  totalCustomers: number;
  verifiedCustomers: number;
  creditApprovedCustomers: number;
  frozenCustomers: number;
  recentCustomers: number;
}

/**
 * Customer Statistics Component
 *
 * Compact label-first stats cards with colored left border accent.
 */
@Component({
  selector: 'app-customer-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      <!-- Total Customers -->
      <div class="rounded-xl p-2.5 sm:p-3 bg-info/5 border-l-[3px] border-info shadow-sm">
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Customers
        </span>
        <p class="text-lg sm:text-xl font-bold text-info tabular-nums leading-none">
          {{ stats().totalCustomers }}
        </p>
      </div>

      <!-- Verified -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-success/5 border-l-[3px] border-success shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeFilters().verified"
        [class.ring-success]="activeFilters().verified"
        (click)="onFilterClick('verified')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Verified
        </span>
        <p class="text-lg sm:text-xl font-bold text-success tabular-nums leading-none">
          {{ stats().verifiedCustomers }}
        </p>
      </button>

      <!-- Credit Approved -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-primary/5 border-l-[3px] border-primary shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeFilters().creditApproved"
        [class.ring-primary]="activeFilters().creditApproved"
        (click)="onFilterClick('creditApproved')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Credit
        </span>
        <p class="text-lg sm:text-xl font-bold text-primary tabular-nums leading-none">
          {{ stats().creditApprovedCustomers }}
        </p>
      </button>

      <!-- Frozen -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-error/5 border-l-[3px] border-error shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeFilters().frozen"
        [class.ring-error]="activeFilters().frozen"
        (click)="onFilterClick('frozen')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Frozen
        </span>
        <p class="text-lg sm:text-xl font-bold text-error tabular-nums leading-none">
          {{ stats().frozenCustomers }}
        </p>
      </button>
    </div>
  `,
})
export class CustomerStatsComponent {
  readonly stats = input.required<CustomerStats>();
  readonly activeFilters = input<{
    verified?: boolean;
    creditApproved?: boolean;
    frozen?: boolean;
    recent?: boolean;
  }>({});
  readonly filterClick = output<{ type: string; color: string }>();

  onFilterClick(type: string): void {
    const colorMap: Record<string, string> = {
      verified: 'success',
      creditApproved: 'primary',
      frozen: 'error',
      recent: 'warning',
    };
    this.filterClick.emit({ type, color: colorMap[type] || 'primary' });
  }
}
