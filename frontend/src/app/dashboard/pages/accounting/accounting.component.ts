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
import { forkJoin } from 'rxjs';
import {
  JournalEntry,
  LedgerAccount,
  LedgerService,
} from '../../../core/services/ledger/ledger.service';
import {
  AccountingFilters,
  AccountingFiltersComponent,
} from './components/accounting-filters.component';
import { AccountingStats, AccountingStatsComponent } from './components/accounting-stats.component';
import type { TabType } from './components/accounting-tabs.component';
import { AccountingTabsComponent } from './components/accounting-tabs.component';
import { AccountsTabComponent, type AccountNode } from './components/accounts-tab.component';
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

  readonly transactionModal = viewChild<TransactionDetailModalComponent>('transactionModal');

  readonly accounts = this.ledgerService.accounts;
  readonly entries = this.ledgerService.entries;
  readonly totalEntries = this.ledgerService.totalEntries;
  readonly isLoading = this.ledgerService.isLoading;
  readonly error = this.ledgerService.error;

  // Tab management
  readonly activeTab = signal<TabType>('overview');

  // Filters and search
  readonly selectedAccount = signal<LedgerAccount | null>(null);
  readonly selectedEntry = signal<JournalEntry | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(50);
  readonly dateFilter = signal<{ start?: string; end?: string }>({});
  readonly searchTerm = signal('');
  readonly sourceTypeFilter = signal<string>('');
  readonly expandedEntries = signal<Set<string>>(new Set());

  // Accounts organized by type
  readonly accountsByType = computed(() => {
    const accounts = this.accounts();
    const grouped: Record<string, LedgerAccount[]> = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: [],
    };

    accounts.forEach((account) => {
      if (grouped[account.type]) {
        grouped[account.type].push(account);
      }
    });

    return grouped;
  });

  // Hierarchical account structure with parent-child relationships

  readonly hierarchicalAccounts = computed(() => {
    const accounts = this.accounts();
    const accountMap = new Map<string, AccountNode>();
    const rootAccounts: AccountNode[] = [];

    // First pass: create nodes for all accounts
    accounts.forEach((account) => {
      accountMap.set(account.id, {
        ...account,
        children: [],
        calculatedBalance: account.balance,
      });
    });

    // Second pass: build parent-child relationships
    accounts.forEach((account) => {
      const node = accountMap.get(account.id)!;
      if (account.parentAccountId) {
        const parent = accountMap.get(account.parentAccountId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        rootAccounts.push(node);
      }
    });

    // Third pass: calculate parent balances from children
    const calculateParentBalance = (node: AccountNode): number => {
      if (node.children.length === 0) {
        return node.balance;
      }
      const childrenBalance = node.children.reduce(
        (sum, child) => sum + calculateParentBalance(child),
        0,
      );
      node.calculatedBalance = childrenBalance;
      return childrenBalance;
    };

    rootAccounts.forEach((root) => calculateParentBalance(root));

    // Group root accounts by type
    const grouped: Record<string, AccountNode[]> = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: [],
    };

    rootAccounts.forEach((account) => {
      if (grouped[account.type]) {
        grouped[account.type].push(account);
      }
    });

    // Sort each type's accounts
    Object.keys(grouped).forEach((type) => {
      grouped[type].sort((a, b) => a.code.localeCompare(b.code));
      // Sort children recursively
      const sortChildren = (nodes: AccountNode[]) => {
        nodes.forEach((node) => {
          node.children.sort((a, b) => a.code.localeCompare(b.code));
          sortChildren(node.children);
        });
      };
      sortChildren(grouped[type]);
    });

    return grouped;
  });

  // Key accounts (top by absolute balance)
  readonly keyAccounts = computed(() => {
    return [...this.accounts()]
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 10);
  });

  // Filtered entries with search and filters (must be defined first)
  readonly filteredEntries = computed(() => {
    let entries = this.entries();
    const account = this.selectedAccount();
    const search = this.searchTerm().toLowerCase().trim();
    const sourceType = this.sourceTypeFilter();

    // Filter by account
    if (account) {
      entries = entries.filter((entry) =>
        entry.lines.some((line) => line.accountCode === account.code),
      );
    }

    // Filter by source type
    if (sourceType) {
      entries = entries.filter((entry) => entry.sourceType === sourceType);
    }

    // Filter by search term
    if (search) {
      entries = entries.filter(
        (entry) =>
          entry.memo?.toLowerCase().includes(search) ||
          entry.sourceId.toLowerCase().includes(search) ||
          entry.sourceType.toLowerCase().includes(search) ||
          entry.lines.some(
            (line) =>
              line.accountCode.toLowerCase().includes(search) ||
              line.accountName.toLowerCase().includes(search),
          ),
      );
    }

    // Filter by date range
    const dateFilter = this.dateFilter();
    if (dateFilter.start || dateFilter.end) {
      entries = entries.filter((entry) => {
        const entryDate = new Date(entry.entryDate);
        if (dateFilter.start && entryDate < new Date(dateFilter.start)) {
          return false;
        }
        if (dateFilter.end) {
          const endDate = new Date(dateFilter.end);
          endDate.setHours(23, 59, 59, 999);
          if (entryDate > endDate) {
            return false;
          }
        }
        return true;
      });
    }

    return entries;
  });

  // Summary statistics (depend on filteredEntries)
  readonly totalDebits = computed(() => {
    return this.filteredEntries().reduce((sum, entry) => {
      return sum + entry.lines.reduce((lineSum, line) => lineSum + line.debit, 0);
    }, 0);
  });

  readonly totalCredits = computed(() => {
    return this.filteredEntries().reduce((sum, entry) => {
      return sum + entry.lines.reduce((lineSum, line) => lineSum + line.credit, 0);
    }, 0);
  });

  readonly netBalance = computed(() => {
    return this.totalDebits() - this.totalCredits();
  });

  readonly transactionCount = computed(() => {
    return this.filteredEntries().length;
  });

  readonly dateRange = computed(() => {
    const filter = this.dateFilter();
    if (filter.start && filter.end) {
      return `${this.formatDate(filter.start)} - ${this.formatDate(filter.end)}`;
    } else if (filter.start) {
      return `From ${this.formatDate(filter.start)}`;
    } else if (filter.end) {
      return `Until ${this.formatDate(filter.end)}`;
    }
    return 'All time';
  });

  // Recent entries for overview
  readonly recentEntries = computed(() => {
    return this.filteredEntries().slice(0, 20);
  });

  // Paginated entries (one row per entry, not per line)
  readonly paginatedEntries = computed(() => {
    const filtered = this.filteredEntries();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;
    return filtered.slice(start, end);
  });

  readonly totalPages = computed(() => {
    const filtered = this.filteredEntries();
    const perPage = this.itemsPerPage();
    return Math.ceil(filtered.length / perPage) || 1;
  });

  // Computed for stats component
  readonly stats = computed<AccountingStats>(() => ({
    totalDebits: this.totalDebits(),
    totalCredits: this.totalCredits(),
    netBalance: this.netBalance(),
    transactionCount: this.transactionCount(),
    dateRange: this.dateRange(),
  }));

  // Computed for filters component
  readonly filters = computed<AccountingFilters>(() => ({
    searchTerm: this.searchTerm(),
    selectedAccount: this.selectedAccount(),
    sourceTypeFilter: this.sourceTypeFilter(),
    dateFilter: this.dateFilter(),
    accounts: this.accounts(),
    sourceTypes: this.getUniqueSourceTypes(),
    showQuickFilters: this.activeTab() === 'overview',
  }));

  ngOnInit() {
    this.loadData();
  }

  setActiveTab(tab: TabType) {
    this.activeTab.set(tab);
    this.currentPage.set(1);
  }

  loadData() {
    this.ledgerService.isLoading.set(true);
    this.ledgerService.error.set(null);

    const options: any = {
      take: 100, // Limited to prevent list-query-limit-exceeded errors
      skip: 0,
    };

    const dateFilter = this.dateFilter();
    if (dateFilter.start) {
      options.startDate = dateFilter.start;
    }
    if (dateFilter.end) {
      options.endDate = dateFilter.end;
    }

    if (this.selectedAccount()) {
      options.accountCode = this.selectedAccount()!.code;
    }

    if (this.sourceTypeFilter()) {
      options.sourceType = this.sourceTypeFilter();
    }

    // Wait for both requests to complete before clearing loading state
    forkJoin({
      accounts: this.ledgerService.loadAccounts(),
      entries: this.ledgerService.loadJournalEntries(options),
    }).subscribe({
      next: () => {
        // Both requests completed successfully
        this.ledgerService.isLoading.set(false);
      },
      error: (err) => {
        // Error is already handled in the service
        this.ledgerService.isLoading.set(false);
        console.error('Error loading accounting data:', err);
      },
    });
  }

  setQuickFilter(period: string) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    switch (period) {
      case 'today':
        this.dateFilter.set({
          start: startOfDay.toISOString().split('T')[0],
          end: endOfDay.toISOString().split('T')[0],
        });
        break;
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        this.dateFilter.set({
          start: weekStart.toISOString().split('T')[0],
          end: endOfDay.toISOString().split('T')[0],
        });
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        this.dateFilter.set({
          start: monthStart.toISOString().split('T')[0],
          end: endOfDay.toISOString().split('T')[0],
        });
        break;
      case 'all':
        this.dateFilter.set({});
        break;
    }
    this.currentPage.set(1);
  }

  toggleEntry(entryId: string) {
    const expanded = new Set(this.expandedEntries());
    if (expanded.has(entryId)) {
      expanded.delete(entryId);
    } else {
      expanded.add(entryId);
    }
    this.expandedEntries.set(expanded);
  }

  expandAll() {
    const allIds = new Set(this.paginatedEntries().map((e) => e.id));
    this.expandedEntries.set(allIds);
  }

  collapseAll() {
    this.expandedEntries.set(new Set());
  }

  getEntryTotalDebit(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  }

  getEntryTotalCredit(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + line.credit, 0);
  }

  getAccountTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      asset: 'Assets',
      liability: 'Liabilities',
      equity: 'Equity',
      income: 'Income',
      expense: 'Expenses',
    };
    return labels[type] || type;
  }

  getAccountTypeTotal(type: string): number {
    const accounts = this.accountsByType()[type] || [];
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }

  getUniqueSourceTypes(): string[] {
    const sourceTypes = new Set<string>();
    this.entries().forEach((entry) => {
      sourceTypes.add(entry.sourceType);
    });
    return Array.from(sourceTypes).sort();
  }

  selectAccount(account: LedgerAccount | null) {
    this.selectedAccount.set(account);
    this.currentPage.set(1);
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
    this.dateFilter.set({ start, end });
    this.currentPage.set(1);
    this.loadData();
  }

  clearFilters() {
    this.selectedAccount.set(null);
    this.dateFilter.set({});
    this.searchTerm.set('');
    this.sourceTypeFilter.set('');
    this.currentPage.set(1);
    this.loadData();
  }

  goToPage(page: number) {
    this.currentPage.set(page);
  }

  formatCurrency(amountInCents: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amountInCents / 100);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatDateTime(date: string): string {
    return new Date(date).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  onAccountChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const accountId = select.value;
    if (accountId) {
      const account = this.accounts().find((a) => a.id === accountId);
      this.selectAccount(account || null);
    } else {
      this.selectAccount(null);
    }
  }

  // Event handlers for filter component
  onSearchTermChange(term: string) {
    this.searchTerm.set(term);
  }

  onAccountFilterChange(accountId: string) {
    if (accountId) {
      const account = this.accounts().find((a) => a.id === accountId);
      this.selectAccount(account || null);
    } else {
      this.selectAccount(null);
    }
  }

  onSourceTypeFilterChange(sourceType: string) {
    this.sourceTypeFilter.set(sourceType);
    this.loadData();
  }

  onDateFilterChange(dateFilter: { start?: string; end?: string }) {
    this.setDateFilter(dateFilter.start, dateFilter.end);
  }

  onQuickFilterChange(period: string) {
    this.setQuickFilter(period);
  }
}
