import { Injectable, computed, inject, signal } from '@angular/core';
import {
  JournalEntry,
  LedgerAccount,
  LedgerService,
} from '../../../../core/services/ledger/ledger.service';
import type { AccountingStats } from '../components/accounting-stats.component';
import { formatDate as formatDateUtil } from '../utils/accounting-formatting';

@Injectable({
  providedIn: 'root',
})
export class AccountingListStateService {
  private readonly ledgerService = inject(LedgerService);

  readonly selectedAccount = signal<LedgerAccount | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(50);
  readonly dateFilter = signal<{ start?: string; end?: string }>({});
  readonly searchTerm = signal('');
  readonly sourceTypeFilter = signal<string>('');
  readonly expandedEntries = signal<Set<string>>(new Set());

  private readonly entries = this.ledgerService.entries;

  readonly filteredEntries = computed(() => {
    let entries = this.entries();
    const account = this.selectedAccount();
    const search = this.searchTerm().toLowerCase().trim();
    const sourceType = this.sourceTypeFilter();

    if (account) {
      entries = entries.filter((entry) =>
        entry.lines.some((line) => line.accountCode === account.code),
      );
    }

    if (sourceType) {
      entries = entries.filter((entry) => entry.sourceType === sourceType);
    }

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

  readonly totalDebits = computed(() =>
    this.filteredEntries().reduce(
      (sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.debit, 0),
      0,
    ),
  );

  readonly totalCredits = computed(() =>
    this.filteredEntries().reduce(
      (sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.credit, 0),
      0,
    ),
  );

  readonly netBalance = computed(() => this.totalDebits() - this.totalCredits());

  readonly transactionCount = computed(() => this.filteredEntries().length);

  readonly dateRange = computed(() => {
    const filter = this.dateFilter();
    if (filter.start && filter.end) {
      return `${formatDateUtil(filter.start)} - ${formatDateUtil(filter.end)}`;
    }
    if (filter.start) {
      return `From ${formatDateUtil(filter.start)}`;
    }
    if (filter.end) {
      return `Until ${formatDateUtil(filter.end)}`;
    }
    return 'All time';
  });

  readonly recentEntries = computed(() => this.filteredEntries().slice(0, 20));

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

  readonly stats = computed<AccountingStats>(() => ({
    totalDebits: this.totalDebits(),
    totalCredits: this.totalCredits(),
    netBalance: this.netBalance(),
    transactionCount: this.transactionCount(),
    dateRange: this.dateRange(),
  }));

  readonly sourceTypes = computed(() => {
    const types = new Set<string>();
    this.entries().forEach((entry) => types.add(entry.sourceType));
    return Array.from(types).sort();
  });

  setQuickFilter(period: string): void {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999,
    );

    switch (period) {
      case 'today':
        this.dateFilter.set({
          start: startOfDay.toISOString().split('T')[0],
          end: endOfDay.toISOString().split('T')[0],
        });
        break;
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        this.dateFilter.set({
          start: weekStart.toISOString().split('T')[0],
          end: endOfDay.toISOString().split('T')[0],
        });
        break;
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        this.dateFilter.set({
          start: monthStart.toISOString().split('T')[0],
          end: endOfDay.toISOString().split('T')[0],
        });
        break;
      }
      case 'all':
        this.dateFilter.set({});
        break;
    }
    this.currentPage.set(1);
  }

  clearFilters(): void {
    this.selectedAccount.set(null);
    this.dateFilter.set({});
    this.searchTerm.set('');
    this.sourceTypeFilter.set('');
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
  }

  toggleEntry(entryId: string): void {
    const expanded = new Set(this.expandedEntries());
    if (expanded.has(entryId)) {
      expanded.delete(entryId);
    } else {
      expanded.add(entryId);
    }
    this.expandedEntries.set(expanded);
  }

  expandAll(): void {
    const allIds = new Set(this.paginatedEntries().map((e: JournalEntry) => e.id));
    this.expandedEntries.set(allIds);
  }

  collapseAll(): void {
    this.expandedEntries.set(new Set());
  }

  setDateFilter(start?: string, end?: string): void {
    this.dateFilter.set({ start, end });
    this.currentPage.set(1);
  }

  setSearchTerm(term: string): void {
    this.searchTerm.set(term);
  }

  setSelectedAccount(account: LedgerAccount | null): void {
    this.selectedAccount.set(account);
    this.currentPage.set(1);
  }

  setSourceTypeFilter(sourceType: string): void {
    this.sourceTypeFilter.set(sourceType);
  }
}
