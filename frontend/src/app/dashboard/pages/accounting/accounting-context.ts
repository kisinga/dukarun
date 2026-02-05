import type { Reconciliation } from '../../../core/services/cashier-session/cashier-session.service';
import type { JournalEntry, LedgerAccount } from '../../../core/services/ledger/ledger.service';
import type { AccountNode } from './account-node.types';
import type { AccountingFilters } from './components/accounting-filters.component';
import type { AccountingStats } from './components/accounting-stats.component';

/** Shared data and helpers passed from accounting root to tabs. Single source for common inputs. */
export interface AccountingContext {
  accounts: LedgerAccount[];
  hierarchicalAccounts: Record<string, AccountNode[]>;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  getAccountTypeLabel: (type: string) => string;
  getAccountTypeTotal: (type: string) => number;
  getEntryTotalDebit: (entry: JournalEntry) => number;
  getEntryTotalCredit: (entry: JournalEntry) => number;
  isLoading: boolean;
  error: string | null;
  selectedAccount: LedgerAccount | null;
  keyAccounts: LedgerAccount[];
  recentEntries: JournalEntry[];
  stats: AccountingStats;
  filters: AccountingFilters;
}

/** Context for the Transactions tab: paginated entries, filters snapshot, formatters. */
export interface TransactionsTabContext {
  entries: JournalEntry[];
  isLoading: boolean;
  expandedEntries: Set<string>;
  totalPages: number;
  currentPage: number;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  getEntryTotalDebit: (entry: JournalEntry) => number;
  getEntryTotalCredit: (entry: JournalEntry) => number;
  filters: {
    searchTerm: string;
    selectedAccount: LedgerAccount | null;
    sourceTypeFilter: string;
    dateFilter: { start?: string; end?: string };
  };
}

/** Context for the Reconciliation tab. */
export interface ReconciliationTabContext {
  reconciliations: Reconciliation[];
  /** Cash child accounts for the manual reconciliation table. */
  reconciliationTableAccounts: LedgerAccount[];
  channelId: number;
  isLoading: boolean;
  totalItems: number;
  currentPage: number;
  pageSize: number;
  formatDate: (date: string) => string;
  formatCurrency: (amountCentsOrString: string) => string;
}
