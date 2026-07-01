import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatCardComponent, StatTone } from '../../../components/shared/stat-card.component';
import { StatStripComponent } from '../../../components/shared/stat-strip.component';

export interface AccountingStats {
  totalDebits: number;
  totalCredits: number;
  netBalance: number;
  transactionCount: number;
  dateRange: string;
}

@Component({
  selector: 'app-accounting-stats',
  standalone: true,
  imports: [StatCardComponent, StatStripComponent],
  templateUrl: './accounting-stats.component.html',
  styleUrl: './accounting-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingStatsComponent {
  stats = input.required<AccountingStats>();
  formatCurrency = input.required<(amount: number) => string>();

  /** Net balance is meaningful: positive = success, negative = error. */
  readonly netBalanceTone = computed<StatTone>(() =>
    this.stats().netBalance >= 0 ? 'success' : 'error',
  );
}
