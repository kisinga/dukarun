import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { parseKes } from '../../core/money';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { JournalListComponent } from '../journal-list.component';
import { JournalEntryWithLines, LedgerAccount, MoneyService } from '../money.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { IconComponent } from '../../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../../shared/ui/list-search-bar.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatBarComponent } from '../../shared/ui/stat-bar.component';

@Component({
  selector: 'app-money-expenses',
  imports: [
    ReactiveFormsModule,
    JournalListComponent,
    FormFieldComponent,
    ButtonComponent,
    SessionRequiredNoticeComponent,
    IconComponent,
    ListSearchBarComponent,
    PaginationComponent,
    StatBarComponent,
  ],
  template: `
    <div class="mb-3 flex items-start gap-3">
      <div>
        <h2 class="section-title">Expenses</h2>
        <p class="type-caption mt-1">Record business spending and review recent postings.</p>
      </div>
      <button
        appButton
        variant="ghost"
        [iconOnly]="true"
        class="ml-auto"
        [loading]="loading()"
        type="button"
        title="Refresh expenses"
        aria-label="Refresh expenses"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
    </div>

    @if (!cashierSession.canTakePayment()) {
      <app-session-required-notice action="recording an expense" />
    }

    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">Record expense</h2>
        <form (submit)="$event.preventDefault(); submit()" class="grid gap-3 sm:grid-cols-2">
          <app-form-field label="Paid from">
            <select class="select select-bordered select-sm w-full" [formControl]="account">
              @for (a of accounts(); track a.code) {
                <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="Amount (KES)">
            <input
              type="text"
              inputmode="numeric"
              class="input input-bordered input-sm w-full"
              placeholder="0"
              [formControl]="amount"
            />
          </app-form-field>
          <app-form-field label="Category">
            <input
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="e.g. Rent, Transport"
              [formControl]="category"
            />
          </app-form-field>
          <app-form-field label="Memo">
            <input
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="Optional note"
              [formControl]="memo"
            />
          </app-form-field>
          <div class="sm:col-span-2">
            <button
              appButton
              type="submit"
              [loading]="busy()"
              [disabled]="!cashierSession.canTakePayment()"
            >
              Post expense
            </button>
          </div>
        </form>
        @if (error()) {
          <p class="mt-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mt-2 text-sm text-success">{{ notice() }}</p>
        }
      </div>
    </div>

    <app-list-search-bar
      placeholder="Search category, memo, or reference…"
      [searchQuery]="historySearch()"
      (searchQueryChange)="onHistorySearch($event)"
      [sortOptions]="historySortOptions"
      [sortKey]="historySort()"
      (sortKeyChange)="historySort.set($event); reloadHistory()"
      [sortDirection]="historyDirection()"
      (sortDirectionChange)="historyDirection.set($event); reloadHistory()"
    >
      <app-stat-bar summary [stats]="historyStats()" />
      <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        <app-form-field label="Paid from" class="lg:w-52">
          <select
            class="select select-bordered select-sm w-full"
            [value]="historyAccount()"
            (change)="setHistoryAccount($event)"
          >
            <option value="">All accounts</option>
            @for (a of accounts(); track a.code) {
              <option [value]="a.code">{{ a.name }}</option>
            }
          </select>
        </app-form-field>
        <app-form-field label="From" class="lg:w-40">
          <input
            type="date"
            class="input input-bordered input-sm w-full"
            [value]="historyFrom()"
            (change)="setHistoryDate('from', $event)"
          />
        </app-form-field>
        <app-form-field label="To" class="lg:w-40">
          <input
            type="date"
            class="input input-bordered input-sm w-full"
            [value]="historyTo()"
            (change)="setHistoryDate('to', $event)"
          />
        </app-form-field>
        <div class="flex gap-2 sm:col-span-2">
          <button
            appButton
            [variant]="monthActive() ? 'soft' : 'ghost'"
            type="button"
            (click)="setMonth()"
          >
            @if (monthActive()) {
              <app-icon name="heroCheck" size="sm" />
            }
            This month
          </button>
          <button
            appButton
            [variant]="allTimeActive() ? 'soft' : 'ghost'"
            type="button"
            (click)="setAllTime()"
          >
            @if (allTimeActive()) {
              <app-icon name="heroCheck" size="sm" />
            }
            All time
          </button>
        </div>
      </div>
    </app-list-search-bar>
    <app-journal-list
      [entries]="entries()"
      [loading]="loading()"
      emptyText="No expenses posted yet."
    />
    <app-pagination
      class="mt-3 block"
      [currentPage]="historyPage()"
      [totalPages]="historyTotalPages()"
      [totalItems]="historyTotal()"
      [itemsPerPage]="historyPageSize()"
      itemLabel="expenses"
      [showItemsPerPage]="true"
      (pageChange)="changeHistoryPage($event)"
      (itemsPerPageChange)="historyPageSize.set($event); reloadHistory()"
    />
  `,
})
export class MoneyExpensesComponent implements OnInit, OnDestroy {
  private readonly money = inject(MoneyService);
  protected readonly cashierSession = inject(CashierSessionService);

  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly entries = signal<JournalEntryWithLines[]>([]);
  protected readonly account = new FormControl('', { nonNullable: true });
  protected readonly amount = new FormControl('', { nonNullable: true });
  protected readonly category = new FormControl('', { nonNullable: true });
  protected readonly memo = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly historySearch = signal('');
  protected readonly historyAccount = signal('');
  protected readonly historyFrom = signal(this.monthStartIso());
  protected readonly historyTo = signal(this.todayIso());
  protected readonly historyPage = signal(1);
  protected readonly historyPageSize = signal(10);
  protected readonly historyTotal = signal(0);
  protected readonly historySort = signal('posted_at');
  protected readonly historyDirection = signal<ListSortDirection>('desc');
  protected readonly historySortOptions: readonly ListSortOption[] = [
    { value: 'posted_at', label: 'Expense date' },
    { value: 'memo', label: 'Category or memo' },
  ];
  protected readonly historyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.historyTotal() / this.historyPageSize()))
  );
  protected readonly historyStats = computed(() => [
    { label: 'Matching expenses', value: this.historyTotal() },
  ]);
  private historySearchTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSequence = 0;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.historySearchTimer) clearTimeout(this.historySearchTimer);
  }

  protected async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    try {
      const [accounts, result] = await Promise.all([
        this.money.transactableAccounts(),
        this.money.journalPage({
          page: this.historyPage(),
          pageSize: this.historyPageSize(),
          // Expense history is account-driven so costs posted atomically with purchases appear too.
          requiredAccountCode: 'EXPENSES',
          search: this.historySearch(),
          accountCode: this.historyAccount() || undefined,
          from: this.historyFrom() || undefined,
          to: this.historyTo() || undefined,
          sortBy: this.historySort() as 'posted_at' | 'memo',
          sortDirection: this.historyDirection(),
        }),
      ]);
      if (sequence !== this.loadSequence) return;
      this.accounts.set(accounts);
      this.entries.set(result.rows);
      this.historyTotal.set(result.count);
      if (!this.account.value && accounts.length > 0) this.account.setValue(accounts[0].code);
      this.error.set(null);
    } catch (err) {
      if (sequence === this.loadSequence)
        this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  protected onHistorySearch(value: string): void {
    this.historySearch.set(value);
    if (this.historySearchTimer) clearTimeout(this.historySearchTimer);
    this.historySearchTimer = setTimeout(() => this.reloadHistory(), 250);
  }
  protected setHistoryAccount(event: Event): void {
    this.historyAccount.set((event.target as HTMLSelectElement).value);
    this.reloadHistory();
  }
  protected setHistoryDate(kind: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    kind === 'from' ? this.historyFrom.set(value) : this.historyTo.set(value);
    this.reloadHistory();
  }
  protected setMonth(): void {
    this.historyFrom.set(this.monthStartIso());
    this.historyTo.set(this.todayIso());
    this.reloadHistory();
  }
  protected setAllTime(): void {
    this.historyFrom.set('');
    this.historyTo.set('');
    this.reloadHistory();
  }
  protected monthActive(): boolean {
    return this.historyFrom() === this.monthStartIso() && this.historyTo() === this.todayIso();
  }
  protected allTimeActive(): boolean {
    return !this.historyFrom() && !this.historyTo();
  }
  protected reloadHistory(): void {
    this.historyPage.set(1);
    void this.load();
  }
  protected changeHistoryPage(page: number): void {
    this.historyPage.set(page);
    void this.load();
  }
  private todayIso(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }
  private monthStartIso(): string {
    return `${this.todayIso().slice(0, 8)}01`;
  }

  protected async submit(): Promise<void> {
    try {
      await this.cashierSession.assertOpen('recording an expense');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const amount = parseKes(this.amount.value);
    if (amount === null || amount <= 0) {
      this.error.set('Enter a valid amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postExpense(
        amount,
        this.account.value,
        this.category.value.trim() || undefined,
        this.memo.value.trim() || undefined
      );
      this.notice.set('Expense posted');
      this.amount.setValue('');
      this.category.setValue('');
      this.memo.setValue('');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to post expense');
    } finally {
      this.busy.set(false);
    }
  }
}
