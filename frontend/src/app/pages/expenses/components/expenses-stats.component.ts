import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  StatBarComponent,
  type StatItem,
} from '../../../shared/components/dashboard/stat-bar.component';
import { CurrencyService } from '../../../shared/services/currency.service';

export interface ExpensesStats {
  /** Expense entries recorded (count). */
  count: number;
  /** Sum of all loaded entries, in cents. */
  totalAmount: number;
  /** This month's spend, in cents. */
  monthAmount: number;
}

/**
 * Expenses summary — a compact inline stat line. All values are plain totals,
 * so they stay neutral (no state here needs action).
 */
@Component({
  selector: 'app-expenses-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" />`,
})
export class ExpensesStatsComponent {
  private readonly currencyService = inject(CurrencyService);

  readonly stats = input.required<ExpensesStats>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    return [
      { label: 'expenses', value: s.count },
      { label: 'total spent', value: this.currencyService.format(s.totalAmount) },
      { label: 'this month', value: this.currencyService.format(s.monthAmount) },
    ];
  });
}
