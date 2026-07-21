import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  StatBarComponent,
  type StatItem,
} from '../../../shared/components/dashboard/stat-bar.component';

export interface StockAdjustmentStats {
  totalAdjustments: number;
  thisMonthAdjustments: number;
}

/**
 * Stock adjustment summary — a compact inline stat line. Counts are plain
 * metrics (no filter toggles); the bar's zero-guard handles tones.
 */
@Component({
  selector: 'app-stock-adjustment-stats',
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" />`,
})
export class StockAdjustmentStatsComponent {
  readonly stats = input.required<StockAdjustmentStats>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    return [
      { label: 'adjustments', value: s.totalAdjustments },
      { label: 'this month', value: s.thisMonthAdjustments },
    ];
  });
}
