import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, startWith } from 'rxjs';
import {
  CashierSessionService,
  type Reconciliation,
} from '../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../core/services/company.service';
import {
  JournalEntry,
  LedgerAccount,
  LedgerService,
} from '../../../core/services/ledger/ledger.service';
import type {
  AccountingContext,
  ReconciliationTabContext,
  TransactionsTabContext,
} from './accounting-context';
import { AccountingListStateService } from './services/accounting-list-state.service';
import {
  buildHierarchicalAccounts,
  getAccountsByType,
  getKeyAccounts,
} from './utils/accounting-derived';
import {
  formatCurrency as formatCurrencyUtil,
  formatDate as formatDateUtil,
  formatDateTime as formatDateTimeUtil,
  getAccountTypeLabel as getAccountTypeLabelUtil,
} from './utils/accounting-formatting';
import {
  AccountingFilters,
  AccountingFiltersComponent,
} from './components/accounting-filters.component';
import { AccountingStats, AccountingStatsComponent } from './components/accounting-stats.component';
import type { TabType } from './components/accounting-tabs.component';
import { AccountingTabsComponent } from './components/accounting-tabs.component';
import { AccountsTabComponent } from './components/accounts-tab.component';
import { OverviewTabComponent } from './components/overview-tab.component';
import { ReconciliationTabComponent } from './components/reconciliation-tab.component';
import { TransactionDetailModalComponent } from './components/transaction-detail-modal.component';
import { TransactionsTabComponent } from './components/transactions-tab.component';

@Component({
  selector: 'app-accounting',
  imports: [
    CommonModule,
    TransactionDetailModalComponent,
    AccountingStatsComponent,
    AccountingFiltersComponent,
    AccountingTabsComponent,
    OverviewTabComponent,
    AccountsTabComponent,
    TransactionsTabComponent,
    ReconciliationTabComponent,
  ],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingComponent implements OnInit {
  private readonly ledgerService = inject(LedgerService);
  private readonly listState = inject(AccountingListStateService);
  private readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly transactionModal = viewChild<TransactionDetailModalComponent>('transactionModal');

  readonly accounts = this.ledgerService.accounts;
  readonly eligibleDebitAccountsList = this.ledgerService.eligibleDebitAccountsList;
  readonly entries = this.ledgerService.entries;
  readonly totalEntries = this.ledgerService.totalEntries;
  readonly isLoading = this.ledgerService.isLoading;
  readonly error = this.ledgerService.error;

  readonly activeTab = signal<TabType>('overview');

  readonly reconciliations = signal<Reconciliation[]>([]);
  readonly reconciliationsTotal = signal(0);
  readonly reconciliationsLoading = signal(false);
  readonly reconciliationPage = signal(1);
  readonly reconciliationPageSize = 50;

  readonly selectedEntry = signal<JournalEntry | null>(null);

  readonly selectedAccount = this.listState.selectedAccount;
  readonly currentPage = this.listState.currentPage;
  readonly dateFilter = this.listState.dateFilter;
  readonly searchTerm = this.listState.searchTerm;
  readonly sourceTypeFilter = this.listState.sourceTypeFilter;
  readonly expandedEntries = this.listState.expandedEntries;
  readonly filteredEntries = this.listState.filteredEntries;
  readonly paginatedEntries = this.listState.paginatedEntries;
  readonly totalPages = this.listState.totalPages;
  readonly stats = this.listState.stats;
  readonly recentEntries = this.listState.recentEntries;

  readonly accountsByType = computed(() => getAccountsByType(this.accounts()));
  readonly hierarchicalAccounts = computed(() => buildHierarchicalAccounts(this.accounts()));
  readonly keyAccounts = computed(() => getKeyAccounts(this.accounts(), 10));

  readonly filters = computed<AccountingFilters>(() => ({
    searchTerm: this.listState.searchTerm(),
    selectedAccount: this.listState.selectedAccount(),
    sourceTypeFilter: this.listState.sourceTypeFilter(),
    dateFilter: this.listState.dateFilter(),
    accounts: this.accounts(),
    sourceTypes: this.listState.sourceTypes(),
    showQuickFilters: this.activeTab() === 'overview',
  }));

  readonly accountingContext = computed<AccountingContext>(() => ({
    accounts: this.accounts(),
    hierarchicalAccounts: this.hierarchicalAccounts(),
    formatCurrency: this.formatCurrency,
    formatDate: this.formatDate,
    getAccountTypeLabel: this.getAccountTypeLabel,
    getAccountTypeTotal: this.getAccountTypeTotal.bind(this),
    getEntryTotalDebit: this.getEntryTotalDebit.bind(this),
    getEntryTotalCredit: this.getEntryTotalCredit.bind(this),
    isLoading: this.isLoading(),
    error: this.error(),
    selectedAccount: this.listState.selectedAccount(),
    keyAccounts: this.keyAccounts(),
    recentEntries: this.listState.recentEntries(),
    stats: this.listState.stats(),
    filters: this.filters(),
  }));

  readonly transactionsContext = computed<TransactionsTabContext>(() => ({
    entries: this.listState.paginatedEntries(),
    isLoading: this.isLoading(),
    expandedEntries: this.listState.expandedEntries(),
    totalPages: this.listState.totalPages(),
    currentPage: this.listState.currentPage(),
    formatCurrency: this.formatCurrency,
    formatDate: this.formatDate,
    getEntryTotalDebit: this.getEntryTotalDebit.bind(this),
    getEntryTotalCredit: this.getEntryTotalCredit.bind(this),
    filters: {
      searchTerm: this.listState.searchTerm(),
      selectedAccount: this.listState.selectedAccount(),
      sourceTypeFilter: this.listState.sourceTypeFilter(),
      dateFilter: this.listState.dateFilter(),
    },
  }));

  readonly reconciliationContext = computed<ReconciliationTabContext>(() => ({
    reconciliations: this.reconciliations(),
    reconciliationTableAccounts: this.eligibleDebitAccountsList(),
    channelId: this.channelId,
    isLoading: this.reconciliationsLoading(),
    totalItems: this.reconciliationsTotal(),
    currentPage: this.reconciliationPage(),
    pageSize: this.reconciliationPageSize,
    formatDate: this.formatDate,
    formatCurrency: this.formatReconciliationAmount,
  }));

  ngOnInit() {
    this.loadData();
    const syncTab = (params: Record<string, string>) => {
      const tab = params['tab'] as TabType | undefined;
      const valid: TabType[] = ['overview', 'accounts', 'transactions', 'reconciliation'];
      const next = tab && valid.includes(tab) ? tab : 'overview';
      this.activeTab.set(next);
      this.listState.goToPage(1);
      if (next === 'reconciliation') {
        this.reconciliationPage.set(1);
        this.loadReconciliations();
      }
    };
    syncTab(this.route.snapshot.queryParams as Record<string, string>);
    this.route.queryParams
      .pipe(startWith(this.route.snapshot.queryParams as Record<string, string>))
      .subscribe(syncTab);
  }

  goToTransactionsTab(account: LedgerAccount) {
    this.listState.setSelectedAccount(account);
    this.loadData();
    this.router.navigate(['/dashboard/accounting/ledger'], {
      queryParams: { tab: 'transactions' },
      queryParamsHandling: 'merge',
    });
  }

  loadReconciliations() {
    const channelId = this.channelId;
    if (!channelId || Number.isNaN(channelId)) {
      this.reconciliations.set([]);
      this.reconciliationsTotal.set(0);
      this.reconciliationsLoading.set(false);
      return;
    }
    this.reconciliationsLoading.set(true);
    const page = this.reconciliationPage();
    const take = this.reconciliationPageSize;
    const skip = (page - 1) * take;
    this.cashierSessionService.getReconciliations(channelId, { take, skip }).subscribe({
      next: (res) => {
        this.reconciliations.set(res.items ?? []);
        this.reconciliationsTotal.set(res.totalItems ?? 0);
        this.reconciliationsLoading.set(false);
      },
      error: () => {
        this.reconciliations.set([]);
        this.reconciliationsTotal.set(0);
        this.reconciliationsLoading.set(false);
      },
    });
  }

  get channelId(): number {
    const id = this.companyService.activeCompanyId();
    if (!id) return 0;
    const num = parseInt(id, 10);
    return Number.isNaN(num) ? 0 : num;
  }

  loadData() {
    this.ledgerService.isLoading.set(true);
    this.ledgerService.error.set(null);

    const options: Record<string, unknown> = {
      take: 100,
      skip: 0,
    };

    const dateFilter = this.listState.dateFilter();
    if (dateFilter['start']) options['startDate'] = dateFilter['start'];
    if (dateFilter['end']) options['endDate'] = dateFilter['end'];
    const account = this.listState.selectedAccount();
    if (account) options['accountCode'] = account.code;
    const sourceType = this.listState.sourceTypeFilter();
    if (sourceType) options['sourceType'] = sourceType;

    forkJoin({
      accounts: this.ledgerService.loadAccounts(),
      entries: this.ledgerService.loadJournalEntries(options),
      eligibleDebitAccounts: this.ledgerService.loadEligibleDebitAccounts(),
    }).subscribe({
      next: () => this.ledgerService.isLoading.set(false),
      error: (err) => {
        this.ledgerService.isLoading.set(false);
        console.error('Error loading accounting data:', err);
      },
    });
  }

  setQuickFilter(period: string) {
    this.listState.setQuickFilter(period);
    this.loadData();
  }

  toggleEntry(entryId: string) {
    this.listState.toggleEntry(entryId);
  }

  expandAll() {
    this.listState.expandAll();
  }

  collapseAll() {
    this.listState.collapseAll();
  }

  getEntryTotalDebit(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  }

  getEntryTotalCredit(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + line.credit, 0);
  }

  readonly getAccountTypeLabel = (type: string) => getAccountTypeLabelUtil(type);

  getAccountTypeTotal(type: string): number {
    const accounts = this.accountsByType()[type] || [];
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }

  selectAccount(account: LedgerAccount | null) {
    this.listState.setSelectedAccount(account);
    this.loadData();
  }

  viewTransaction(entry: JournalEntry) {
    this.selectedEntry.set(entry);
    this.transactionModal()?.open();
  }

  closeTransactionModal() {
    this.selectedEntry.set(null);
  }

  setDateFilter(start?: string, end?: string) {
    this.listState.setDateFilter(start, end);
    this.loadData();
  }

  clearFilters() {
    this.listState.clearFilters();
    this.loadData();
  }

  goToPage(page: number) {
    this.listState.goToPage(page);
  }

  goToReconciliationPage(page: number) {
    this.reconciliationPage.set(page);
    this.loadReconciliations();
  }

  /** Format reconciliation amount string (cents) for display */
  readonly formatReconciliationAmount = (amountCentsStr: string): string =>
    formatCurrencyUtil(parseInt(amountCentsStr || '0', 10));

  readonly formatCurrency = (amountInCents: number) => formatCurrencyUtil(amountInCents);
  readonly formatDate = (date: string) => formatDateUtil(date);
  readonly formatDateTime = (date: string) => formatDateTimeUtil(date);

  onSearchTermChange(term: string) {
    this.listState.setSearchTerm(term);
  }

  onAccountFilterChange(accountId: string) {
    const account = accountId ? (this.accounts().find((a) => a.id === accountId) ?? null) : null;
    this.selectAccount(account);
  }

  onSourceTypeFilterChange(sourceType: string) {
    this.listState.setSourceTypeFilter(sourceType);
    this.loadData();
  }

  onDateFilterChange(dateFilter: { start?: string; end?: string }) {
    this.setDateFilter(dateFilter.start, dateFilter.end);
  }

  onQuickFilterChange(period: string) {
    this.setQuickFilter(period);
  }
}
