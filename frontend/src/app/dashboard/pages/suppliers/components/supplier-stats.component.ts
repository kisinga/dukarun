import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface SupplierStats {
  totalSuppliers: number;
  verifiedSuppliers: number;
  suppliersWithAddresses: number;
  recentSuppliers: number;
}

/**
 * Supplier Statistics Component
 *
 * Compact label-first stats cards with colored left border accent.
 */
@Component({
  selector: 'app-supplier-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      <!-- Total Suppliers -->
      <div class="rounded-xl p-2.5 sm:p-3 bg-accent/5 border-l-[3px] border-accent shadow-sm">
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Suppliers
        </span>
        <p class="text-lg sm:text-xl font-bold text-accent tabular-nums leading-none">
          {{ stats().totalSuppliers }}
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
          {{ stats().verifiedSuppliers }}
        </p>
      </button>

      <!-- With Addresses -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-info/5 border-l-[3px] border-info shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeFilters().withAddresses"
        [class.ring-info]="activeFilters().withAddresses"
        (click)="onFilterClick('withAddresses')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Addressed
        </span>
        <p class="text-lg sm:text-xl font-bold text-info tabular-nums leading-none">
          {{ stats().suppliersWithAddresses }}
        </p>
      </button>

      <!-- Recent -->
      <button
        type="button"
        class="rounded-xl p-2.5 sm:p-3 text-left bg-warning/5 border-l-[3px] border-warning shadow-sm hover:shadow-md active:scale-[0.97] transition-all touch-manipulation"
        [class.ring-2]="activeFilters().recent"
        [class.ring-warning]="activeFilters().recent"
        (click)="onFilterClick('recent')"
      >
        <span
          class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-base-content/50 block mb-0.5"
        >
          Recent
        </span>
        <p class="text-lg sm:text-xl font-bold text-warning tabular-nums leading-none">
          {{ stats().recentSuppliers }}
        </p>
      </button>
    </div>
  `,
})
export class SupplierStatsComponent {
  readonly stats = input.required<SupplierStats>();
  readonly activeFilters = input<{
    verified?: boolean;
    withAddresses?: boolean;
    recent?: boolean;
  }>({});
  readonly filterClick = output<{ type: string; color: string }>();

  onFilterClick(type: string): void {
    const colorMap: Record<string, string> = {
      verified: 'success',
      withAddresses: 'info',
      recent: 'warning',
    };
    this.filterClick.emit({ type, color: colorMap[type] || 'primary' });
  }
}
