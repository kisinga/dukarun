import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  StatBarComponent,
  type StatItem,
} from '../../../shared/components/dashboard/stat-bar.component';

export interface CustomerStats {
  totalCustomers: number;
  verifiedCustomers: number;
  creditApprovedCustomers: number;
  frozenCustomers: number;
  recentCustomers: number;
}

/**
 * Customer summary — a compact inline stat line. The three meaningful states are
 * independent toggle filters (multi-select); only "frozen" (a problem state) is
 * coloured.
 */
@Component({
  selector: 'app-customer-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onFilterClick($event)" />`,
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

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    const f = this.activeFilters();
    return [
      { label: 'customers', value: s.totalCustomers },
      { label: 'verified', value: s.verifiedCustomers, filter: 'verified', active: !!f.verified },
      {
        label: 'on credit',
        value: s.creditApprovedCustomers,
        filter: 'creditApproved',
        active: !!f.creditApproved,
      },
      {
        label: 'frozen',
        value: s.frozenCustomers,
        tone: s.frozenCustomers > 0 ? 'error' : 'neutral',
        filter: 'frozen',
        active: !!f.frozen,
      },
    ];
  });

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
