import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StatBarComponent, type StatItem } from '../../../components/shared/stat-bar.component';

export interface SupplierStats {
  totalSuppliers: number;
  verifiedSuppliers: number;
  suppliersWithAddresses: number;
  recentSuppliers: number;
}

/**
 * Supplier summary — a compact inline stat line. The three meaningful states are
 * independent toggle filters (multi-select); none is a problem state, so all
 * stay neutral (no tone).
 */
@Component({
  selector: 'app-supplier-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onFilterClick($event)" />`,
})
export class SupplierStatsComponent {
  readonly stats = input.required<SupplierStats>();
  readonly activeFilters = input<{
    verified?: boolean;
    withAddresses?: boolean;
    recent?: boolean;
  }>({});
  readonly filterClick = output<{ type: string; color: string }>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    const f = this.activeFilters();
    return [
      { label: 'suppliers', value: s.totalSuppliers },
      { label: 'verified', value: s.verifiedSuppliers, filter: 'verified', active: !!f.verified },
      {
        label: 'addressed',
        value: s.suppliersWithAddresses,
        filter: 'withAddresses',
        active: !!f.withAddresses,
      },
      { label: 'recent', value: s.recentSuppliers, filter: 'recent', active: !!f.recent },
    ];
  });

  onFilterClick(type: string): void {
    const colorMap: Record<string, string> = {
      verified: 'success',
      withAddresses: 'info',
      recent: 'warning',
    };
    this.filterClick.emit({ type, color: colorMap[type] || 'primary' });
  }
}
