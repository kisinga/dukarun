import {
  HistoryDateRangeComponent,
  type HistoryDateRange,
} from '../../shared/ui/history-date-range.component';
import { bindListQuery, listQueryField } from '../../shared/list/list-query';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatKes } from '../../core/money';
import {
  DataTableShellComponent,
  TableRowsDirective,
  type TableColumn,
} from '../../shared/ui/data-table-shell.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../../shared/ui/list-search-bar.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { JournalEntryWithLines, LedgerAccountWithBalance, MoneyService } from '../money.service';
import { MobileListComponent } from '../../shared/ui/mobile-list.component';

const JOURNAL_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'posted_at', label: 'Posted date' },
  { value: 'source_type', label: 'Source' },
  { value: 'memo', label: 'Description' },
];

@Component({
  selector: 'app-money-ledger',
  imports: [
    HistoryDateRangeComponent,
    DatePipe,
    FormsModule,
    DataTableShellComponent,
    TableRowsDirective,
    EmptyStateComponent,
    ListSearchBarComponent,
    PaginationComponent,
    MobileListComponent,
  ],
  template: `
    <div class="space-y-4">
      <section>
        <label class="form-control md:hidden">
          <span class="label-text mb-1 text-xs font-semibold">Account</span>
          <select
            class="select select-bordered min-h-11 w-full"
            [value]="accountCode()"
            (change)="selectAccount($event)"
          >
            <option value="">All accounts</option>
            @for (account of accounts(); track account.id) {
              <option [value]="account.code">
                {{ account.code }} — {{ account.name }} — {{ fmt(account.balance) }}
              </option>
            }
          </select>
        </label>
        <h2 class="type-section mb-2 hidden md:block">Account balances</h2>
        <div class="hidden gap-2 sm:grid-cols-2 md:grid xl:grid-cols-4">
          @for (account of accounts(); track account.id) {
            <button
              type="button"
              class="rounded-box border border-base-300/70 bg-base-100 p-3 text-left hover:border-primary/40"
              [class.border-primary]="accountCode() === account.code"
              (click)="filterByAccount(account.code)"
            >
              <span class="type-caption font-mono">{{ account.code }}</span>
              <span class="mt-1 block text-sm font-medium">{{ account.name }}</span>
              <strong class="mt-2 block text-lg tabular-nums">{{ fmt(account.balance) }}</strong>
            </button>
          }
        </div>
      </section>

      <app-list-search-bar
        searchLabel="Search journal entries"
        placeholder="Description or source reference…"
        [searchQuery]="search()"
        (searchQueryChange)="search.set($event); applyFilters()"
        [sortOptions]="journalSortOptions"
        [sortKey]="journalSort()"
        (sortKeyChange)="changeSort($event, journalSortDirection())"
        [sortDirection]="journalSortDirection()"
        (sortDirectionChange)="changeSort(journalSort(), $event)"
        [filtersEnabled]="true"
        [activeFilters]="filterChips()"
        (removeFilter)="removeChip($event)"
        (clearFilters)="clearFilters()"
      >
        <div filters class="flex flex-wrap items-end gap-2">
          <label class="form-control">
            <span class="label-text text-xs">Source</span>
            <select
              class="select select-bordered select-sm"
              [(ngModel)]="sourceType"
              (ngModelChange)="applyFilters()"
            >
              <option value="">All sources</option>
              @for (source of sourceTypes(); track source) {
                <option [value]="source">{{ source }}</option>
              }
            </select>
          </label>
        </div>
        <div scope>
          <app-history-date-range
            [from]="from()"
            [to]="to()"
            (rangeChange)="applyHistoryDates($event)"
          />
        </div>
      </app-list-search-bar>

      @if (accountCode()) {
        <div class="flex items-center gap-2 text-sm">
          <span class="badge badge-primary badge-outline font-mono">{{ accountCode() }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            aria-label="Clear account filter"
            (click)="clearAccountFilter()"
          >
            clear
          </button>
        </div>
      }
      @if (error()) {
        <div role="alert" class="alert alert-error text-sm">
          {{ error() }}
          <button class="btn btn-ghost btn-sm min-h-11" (click)="load()">Retry</button>
        </div>
      }
      @if (loading() && rows().length === 0) {
        <div class="flex justify-center p-8">
          <span class="loading loading-spinner loading-md"></span>
        </div>
      } @else if (rows().length === 0 && !error()) {
        <app-empty-state
          [compact]="true"
          icon="heroDocumentText"
          title="No journal entries"
          description="Try a wider date range or clear the filters."
        />
      } @else if (rows().length > 0) {
        <app-mobile-list>
          @for (entry of rows(); track entry.id) {
            <div [attr.data-list-record]="entry.id" mobileListRow>
              <button
                type="button"
                class="flex min-h-20 w-full items-center gap-3 p-3 text-left"
                [attr.aria-expanded]="expanded() === entry.id"
                (click)="toggle(entry.id)"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-ghost badge-xs">{{ entry.source_type }}</span>
                    <span class="type-caption">{{ entry.posted_at | date: 'mediumDate' }}</span>
                  </div>
                  <p class="mt-1 truncate text-sm font-medium">
                    {{ entry.memo || 'No description' }}
                  </p>
                </div>
                <div class="shrink-0 text-right text-sm tabular-nums">
                  @if (entryDebit(entry) > 0) {
                    <p class="font-semibold">Dr {{ fmt(entryDebit(entry)) }}</p>
                  }
                  @if (entryCredit(entry) > 0) {
                    <p class="font-semibold">Cr {{ fmt(entryCredit(entry)) }}</p>
                  }
                </div>
              </button>
              @if (expanded() === entry.id) {
                <div class="border-t border-base-200 bg-base-200/30 px-3 py-2">
                  @for (line of entry.ledger_journal_lines; track line.id) {
                    <div class="flex items-center gap-2 py-1 text-xs">
                      <span class="font-mono font-semibold">{{ line.ledger_accounts?.code }}</span>
                      <span class="min-w-0 flex-1 truncate text-base-content/60">{{
                        line.ledger_accounts?.name
                      }}</span>
                      <span class="shrink-0 tabular-nums">
                        {{ line.debit ? 'Dr ' + fmt(line.debit) : 'Cr ' + fmt(line.credit) }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </app-mobile-list>
        <div class="hidden lg:block">
          <app-data-table-shell
            [columns]="tableColumns1"
            tableClass="table-sm"
            heading="Journal"
            [description]="total() + ' entries'"
          >
            <ng-template tableRows>
              @for (entry of rows(); track entry.id) {
                <tr [attr.data-list-record]="entry.id">
                  <td class="whitespace-nowrap text-sm">
                    {{ entry.posted_at | date: 'medium' }}
                  </td>
                  <td>
                    <span class="badge badge-ghost badge-sm">{{ entry.source_type }}</span>
                    <div class="max-w-36 truncate font-mono text-xs text-base-content/50">
                      {{ entry.source_id }}
                    </div>
                  </td>
                  <td>{{ entry.memo }}</td>
                  <td class="text-right font-medium">{{ fmt(entryDebit(entry)) }}</td>
                  <td class="text-right font-medium">{{ fmt(entryCredit(entry)) }}</td>
                  <td class="text-right">
                    <button class="btn btn-ghost btn-xs" (click)="toggle(entry.id)">
                      {{ expanded() === entry.id ? 'Hide' : 'Details' }}
                    </button>
                  </td>
                </tr>
                @if (expanded() === entry.id) {
                  <tr class="row-detail">
                    <td colspan="6">
                      <div class="grid gap-2 sm:grid-cols-2">
                        @for (line of entry.ledger_journal_lines; track line.id) {
                          <div
                            class="flex items-center gap-3 rounded-field border border-base-300/60 bg-base-100 p-2 text-sm"
                          >
                            <span
                              ><strong class="font-mono">{{ line.ledger_accounts?.code }}</strong
                              ><br /><span class="text-base-content/60">{{
                                line.ledger_accounts?.name
                              }}</span></span
                            >
                            <span class="ml-auto tabular-nums">{{
                              line.debit ? 'Dr ' + fmt(line.debit) : 'Cr ' + fmt(line.credit)
                            }}</span>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </ng-template>
          </app-data-table-shell>
        </div>
        <div class="mt-3">
          <app-pagination
            [currentPage]="page()"
            [totalPages]="totalPages()"
            [totalItems]="total()"
            [itemsPerPage]="pageSize()"
            [showItemsPerPage]="true"
            itemLabel="entries"
            (pageChange)="changePage($event)"
            (itemsPerPageChange)="changePageSize($event)"
          />
        </div>
      }
    </div>
  `,
})
export class MoneyLedgerComponent implements OnInit {
  protected readonly tableColumns1: TableColumn[] = [
    { key: 'column0', label: 'Date', pinned: true },
    { key: 'column1', label: 'Source' },
    { key: 'column2', label: 'Description' },
    { key: 'column3', label: 'Debit', align: 'right' },
    { key: 'column4', label: 'Credit', align: 'right' },
    { key: 'column5', label: 'Details' },
  ];
  private readonly money = inject(MoneyService);
  protected readonly fmt = formatKes;
  protected readonly accounts = signal<LedgerAccountWithBalance[]>([]);
  protected readonly rows = signal<JournalEntryWithLines[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly search = signal('');
  protected readonly journalSortOptions = JOURNAL_SORT_OPTIONS;
  protected readonly journalSort = signal('posted_at');
  protected readonly journalSortDirection = signal<ListSortDirection>('desc');
  protected readonly accountCode = signal('');
  protected readonly sourceType = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly expanded = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize()))
  );
  /**
   * Filter options must not collapse to the applied filter's type, so they
   * accumulate across every loaded page instead of deriving from current rows.
   */
  protected readonly sourceTypes = signal<string[]>([]);

  constructor() {
    bindListQuery(
      {
        account: listQueryField(this.accountCode),
        source: listQueryField(this.sourceType),
        search: listQueryField(this.search),
        sort: listQueryField(this.journalSort),
        direction: listQueryField(this.journalSortDirection),
        from: listQueryField(this.from),
        to: listQueryField(this.to),
        page: listQueryField(this.page),
        pageSize: listQueryField(this.pageSize, { max: 100 }),
      },
      () => void this.load()
    );
  }

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.loadAccounts(), this.load()]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load ledger');
    }
  }
  protected async loadAccounts(): Promise<void> {
    this.accounts.set(await this.money.ledgerAccountsWithBalances());
  }
  private listRequest = 0;
  protected async load(): Promise<void> {
    if (this.from() && this.to() && this.from() > this.to()) return;
    const request = ++this.listRequest;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.money.journalPage({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search(),
        accountCode: this.accountCode() || undefined,
        sourceType: this.sourceType(),
        from: this.from(),
        to: this.to(),
        sortBy: this.journalSort() as 'posted_at' | 'source_type' | 'memo',
        sortDirection: this.journalSortDirection(),
      });
      if (request !== this.listRequest) return;
      this.rows.set(result.rows);
      this.total.set(result.count);
      this.sourceTypes.update(types =>
        [...new Set([...types, ...result.rows.map(row => row.source_type)])].sort()
      );
    } catch (error) {
      if (request !== this.listRequest) return;
      this.error.set(error instanceof Error ? error.message : 'Failed to load ledger');
    } finally {
      if (request === this.listRequest) this.loading.set(false);
    }
  }
  protected async applyHistoryDates(range: HistoryDateRange): Promise<void> {
    this.from.set(range.from);
    this.to.set(range.to);
    await this.applyFilters();
  }

  protected async applyFilters(): Promise<void> {
    this.page.set(1);
    await this.load();
  }
  protected async filterByAccount(code: string): Promise<void> {
    this.accountCode.set(code);
    this.search.set('');
    this.sourceType.set('');
    await this.applyFilters();
  }
  protected selectAccount(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    if (code) void this.filterByAccount(code);
    else void this.clearAccountFilter();
  }
  protected readonly filterChips = computed(() => [
    ...(this.accountCode() ? [{ key: 'account', label: 'Account: ' + this.accountCode() }] : []),
    ...(this.sourceType() ? [{ key: 'source', label: 'Source: ' + this.sourceType() }] : []),
  ]);
  protected removeChip(key: string): void {
    if (key === 'account') this.accountCode.set('');
    if (key === 'source') this.sourceType.set('');
    if (key === 'dates') {
      this.from.set('');
      this.to.set('');
    }
    void this.applyFilters();
  }
  protected async clearAccountFilter(): Promise<void> {
    this.accountCode.set('');
    await this.applyFilters();
  }
  protected async clearFilters(): Promise<void> {
    this.accountCode.set('');
    this.sourceType.set('');
    await this.applyFilters();
  }
  protected async changePage(page: number): Promise<void> {
    this.page.set(page);
    await this.load();
  }
  protected async changePageSize(size: number): Promise<void> {
    this.pageSize.set(size);
    this.page.set(1);
    await this.load();
  }
  protected changeSort(key: string, direction: ListSortDirection): void {
    this.journalSort.set(key);
    this.journalSortDirection.set(direction);
    this.page.set(1);
    void this.load();
  }
  protected toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }
  protected entryDebit(entry: JournalEntryWithLines): number {
    return entry.ledger_journal_lines.reduce((sum, line) => sum + line.debit, 0);
  }
  protected entryCredit(entry: JournalEntryWithLines): number {
    return entry.ledger_journal_lines.reduce((sum, line) => sum + line.credit, 0);
  }
}
