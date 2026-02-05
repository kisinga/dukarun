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
