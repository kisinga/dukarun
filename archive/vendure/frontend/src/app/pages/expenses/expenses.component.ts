import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { getExpenseCategoryLabel } from '../../shared/constants/expense-categories';
import { CashierSessionService } from '@dukarun/cashier-session';
import { CompanyService } from '@dukarun/company';
import { CurrencyService } from '../../shared/services/currency.service';
import { DashboardService } from '@dukarun/analytics';
import { JournalEntry, LedgerService } from '@dukarun/ledger';
import { toDisplayDate } from '../../shared/utils/date.util';
import { EmptyStateComponent } from '../../shared/components/dashboard/empty-state.component';
import { TrendCardComponent } from '../../shared/components/dashboard/trend-card.component';
import { EchartContainerComponent } from '../../shared/components/dashboard/charts/echart-container.component';
import { RecordExpenseModalComponent } from '@dukarun/stock/components';
import { ExpensesStatsComponent } from './components/expenses-stats.component';

const EXPENSE_SOURCE_TYPE = 'Expense';

/**
 * Expenses page - lists recorded expenses and provides Record expense action.
 * Renders inside the accounting tab layout (no page-header in that section), so
 * the stats pill row + Record expense button sit directly above the list.
 */
@Component({
  selector: 'app-expenses',
  imports: [
    CommonModule,
    NgIcon,
    RecordExpenseModalComponent,
    EmptyStateComponent,
    ExpensesStatsComponent,
    TrendCardComponent,
    EchartContainerComponent,
  ],
  templateUrl: './expenses.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly ledgerService = inject(LedgerService);
  private readonly companyService = inject(CompanyService);
  private readonly currencyService = inject(CurrencyService);
  protected readonly cashierSessionService = inject(CashierSessionService);

  private readonly recordExpenseModal = viewChild(RecordExpenseModalComponent);

  readonly isLoading = this.ledgerService.isLoading;
  readonly error = this.ledgerService.error;
  readonly entries = this.ledgerService.entries;
  readonly totalEntries = this.ledgerService.totalEntries;

  readonly expenseStats = computed(() => {
    const stats = this.dashboardService.stats();
    return stats?.expenses ?? { today: 0, week: 0, month: 0, accounts: [] };
  });

  /** The spend summary rendered by app-expenses-stats — derived from loaded entries + dashboard stats. */
  readonly listStats = computed(() => ({
    count: this.totalEntries(),
    totalAmount: this.entries().reduce((sum, entry) => sum + this.getEntryAmount(entry), 0),
    monthAmount: this.expenseStats().month,
  }));

  readonly sessionOpen = this.cashierSessionService.hasActiveSession;

  // Expense trend (collapsible; built from already-loaded journal entries, no extra fetch)
  readonly trendOpen = signal(false);

  /** Monthly expense totals from loaded entries; values are in cents, formatters display as currency */
  readonly expenseTrendChartOption = computed(() => {
    const byMonth = new Map<string, number>();
    for (const entry of this.entries()) {
      const monthKey = (entry.entryDate ?? '').slice(0, 7); // YYYY-MM
      if (!monthKey) continue;
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + this.getEntryAmount(entry));
    }
    const months = [...byMonth.keys()].sort();
    const labels = months.map((m) =>
      new Date(`${m}-01`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    );
    const values = months.map((m) => byMonth.get(m) ?? 0);
    const currencyService = this.currencyService;
    return {
      xAxis: { type: 'category' as const, data: labels },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          formatter: (value: number) => currencyService.format(value),
        },
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const p = Array.isArray(params)
            ? (params as { name: string; value: number }[])[0]
            : (params as { name: string; value: number });
          return p ? `${p.name}<br/>${currencyService.format(p.value)}` : '';
        },
      },
      series: [{ type: 'bar' as const, data: values }],
      grid: { left: '3%', right: '4%', bottom: '3%', top: '4%', containLabel: true },
    };
  });

  constructor() {
    effect(
      () => {
        const companyId = this.companyService.activeCompanyId();
        if (companyId) {
          this.dashboardService.fetchDashboardData();
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.loadExpenses();
  }

  loadExpenses(): void {
    this.ledgerService.isLoading.set(true);
    this.ledgerService.error.set(null);
    this.ledgerService
      .loadJournalEntries({
        sourceType: EXPENSE_SOURCE_TYPE,
        take: 100,
        skip: 0,
      })
      .subscribe({
        next: () => this.ledgerService.isLoading.set(false),
        error: () => this.ledgerService.isLoading.set(false),
      });
  }

  async refresh(): Promise<void> {
    await this.dashboardService.fetchDashboardData();
    this.loadExpenses();
  }

  openRecordExpense(): void {
    this.recordExpenseModal()?.show();
  }

  onExpenseRecorded(): void {
    this.refresh();
  }

  onExpenseCancelled(): void {}

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents);
  }

  formatDate(dateStr: string): string {
    return toDisplayDate(dateStr, 'medium');
  }

  getEntryAmount(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  }

  getCategoryLabel(entry: JournalEntry): string {
    const expensesLine = entry.lines.find((l) => l.accountCode === 'EXPENSES');
    const code = expensesLine?.meta?.['expenseCategory'];
    return getExpenseCategoryLabel(code);
  }
}
