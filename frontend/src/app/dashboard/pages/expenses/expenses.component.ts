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
import { getExpenseCategoryLabel } from '../../../core/constants/expense-categories';
import { CashierSessionService } from '../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../core/services/company.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { DashboardService } from '../../../core/services/dashboard.service';
import { JournalEntry, LedgerService } from '../../../core/services/ledger/ledger.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { RecordExpenseModalComponent } from '../shifts/record-expense-modal.component';

const EXPENSE_SOURCE_TYPE = 'Expense';

/**
 * Expenses page - lists recorded expenses and provides Record expense action.
 * Follows products page UX: page-header, stats, list, Record expense in header + FAB.
 */
@Component({
  selector: 'app-expenses',
  imports: [CommonModule, PageHeaderComponent, RecordExpenseModalComponent],
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

  readonly sessionOpen = this.cashierSessionService.hasActiveSession;

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
    return new Date(dateStr).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  getEntryAmount(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  }

  getCategoryLabel(entry: JournalEntry): string {
    const expensesLine = entry.lines.find((l) => l.accountCode === 'EXPENSES');
    const code = expensesLine?.meta?.expenseCategory;
    return getExpenseCategoryLabel(code);
  }
}
