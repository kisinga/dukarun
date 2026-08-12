import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { DrawerComponent } from '../../shared/ui/drawer.component';

@Component({
  selector: 'app-money-transfers',
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
    DrawerComponent,
  ],
  template: `
    <div class="mb-3 flex items-start gap-3">
      <div>
        <h2 class="section-title">Transfers</h2>
        <p class="type-caption mt-1">Move money between controlled accounts with a clear trail.</p>
      </div>
      <button
        appButton
        variant="ghost"
        [iconOnly]="true"
        class="ml-auto"
        [loading]="loading()"
        type="button"
        title="Refresh transfers"
        aria-label="Refresh transfers"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
      <button appButton type="button" (click)="formOpen.set(true)">
        <app-icon name="heroPlus" /> New transfer
      </button>
    </div>

    @if (!cashierSession.canTakePayment()) {
      <app-session-required-notice action="moving money between accounts" />
    }

    @if (formOpen()) {
      <app-drawer
        #transferDrawer
        [open]="true"
        title="New transfer"
        subtitle="Move money between controlled accounts"
        [dirty]="transferFormDirty()"
        (closed)="resetTransferForm()"
      >
        <form
          id="transfer-form"
          (submit)="$event.preventDefault(); submit()"
          class="grid gap-3 sm:grid-cols-2"
        >
          <app-form-field label="From">
            <select class="select select-bordered select-sm w-full" [formControl]="from">
              @for (a of accounts(); track a.code) {
                <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="To">
            <select class="select select-bordered select-sm w-full" [formControl]="to">
              @for (a of accounts(); track a.code) {
                <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="Principal (KES)">
            <input
              type="text"
              inputmode="numeric"
              class="input input-bordered input-sm w-full"
              placeholder="0"
              [formControl]="principal"
            />
          </app-form-field>
          <app-form-field label="Fee (KES, optional)">
            <input
              type="text"
              inputmode="numeric"
              class="input input-bordered input-sm w-full"
              placeholder="0"
              [formControl]="fee"
            />
          </app-form-field>
          <app-form-field label="Memo" class="sm:col-span-2">
            <input
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="e.g. Bank the day's cash"
              [formControl]="memo"
            />
          </app-form-field>
          @if (sameAccount()) {
            <p class="text-sm text-warning sm:col-span-2">
              Source and destination are the same account.
            </p>
          }
        </form>
        @if (error()) {
          <p class="mt-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mt-2 text-sm text-success">{{ notice() }}</p>
        }
        <div drawerFooter class="flex justify-end gap-2">
          <button appButton variant="ghost" type="button" (click)="transferDrawer.requestClose()">
            Cancel
          </button>
          <button
            appButton
            type="submit"
            form="transfer-form"
            [loading]="busy()"
            [disabled]="sameAccount() || !cashierSession.canTakePayment()"
          >
            Post transfer
          </button>
        </div>
      </app-drawer>
    }

    <app-list-search-bar
      placeholder="Search memo or reference…"
      [searchQuery]="historySearch()"
      (searchQueryChange)="onHistorySearch($event)"
      [sortOptions]="historySortOptions"
      [sortKey]="historySort()"
      (sortKeyChange)="historySort.set($event); reloadHistory()"
      [sortDirection]="historyDirection()"
      (sortDirectionChange)="historyDirection.set($event); reloadHistory()"
      [filtersEnabled]="true"
      [activeFilterCount]="historyFilterCount()"
      (clearFilters)="clearHistoryFilters()"
    >
      <app-stat-bar summary [stats]="historyStats()" />
      <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        <app-form-field label="Account involved" class="lg:w-52">
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
        <app-form-field label="From" class="lg:w-40"
          ><input
            type="date"
            class="input input-bordered input-sm w-full"
            [value]="historyFrom()"
            (change)="setHistoryDate('from', $event)"
        /></app-form-field>
        <app-form-field label="To" class="lg:w-40"
          ><input
            type="date"
            class="input input-bordered input-sm w-full"
            [value]="historyTo()"
            (change)="setHistoryDate('to', $event)"
        /></app-form-field>
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
      emptyText="No transfers posted yet."
    />
    <app-pagination
      class="mt-3 block"
      [currentPage]="historyPage()"
      [totalPages]="historyTotalPages()"
      [totalItems]="historyTotal()"
      [itemsPerPage]="historyPageSize()"
      itemLabel="transfers"
      [showItemsPerPage]="true"
      (pageChange)="changeHistoryPage($event)"
      (itemsPerPageChange)="historyPageSize.set($event); reloadHistory()"
    />
  `,
})
export class MoneyTransfersComponent implements OnInit, OnDestroy {
  private readonly money = inject(MoneyService);
  protected readonly cashierSession = inject(CashierSessionService);

  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly entries = signal<JournalEntryWithLines[]>([]);
  protected readonly from = new FormControl('', { nonNullable: true });
  protected readonly to = new FormControl('', { nonNullable: true });
  private readonly fromValue = toSignal(this.from.valueChanges, { initialValue: this.from.value });
  private readonly toValue = toSignal(this.to.valueChanges, { initialValue: this.to.value });
  protected readonly principal = new FormControl('', { nonNullable: true });
  protected readonly fee = new FormControl('', { nonNullable: true });
  protected readonly memo = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly sameAccount = computed(
    () => this.fromValue() !== '' && this.fromValue() === this.toValue()
  );
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
    { value: 'posted_at', label: 'Transfer date' },
    { value: 'memo', label: 'Memo' },
  ];
  protected readonly historyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.historyTotal() / this.historyPageSize()))
  );
  protected readonly historyStats = computed(() => [
    { label: 'Matching transfers', value: this.historyTotal() },
  ]);
  private historySearchTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSequence = 0;

  /** Idempotency key for the in-progress transfer form (regenerated after success). */
  private transferId = crypto.randomUUID();

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
          sourceType: 'InterAccountTransfer',
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
      if (!this.from.value && accounts.length > 0) this.from.setValue(accounts[0].code);
      if (!this.to.value && accounts.length > 1) this.to.setValue(accounts[1].code);
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
  protected historyFilterCount(): number {
    return Number(Boolean(this.historyAccount())) + Number(!this.monthActive());
  }
  protected clearHistoryFilters(): void {
    this.historyAccount.set('');
    this.setMonth();
  }
  protected transferFormDirty(): boolean {
    return Boolean(this.principal.value.trim() || this.fee.value.trim() || this.memo.value.trim());
  }
  protected resetTransferForm(): void {
    this.formOpen.set(false);
    this.principal.setValue('');
    this.fee.setValue('');
    this.memo.setValue('');
    this.error.set(null);
    this.transferId = crypto.randomUUID();
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
      await this.cashierSession.assertOpen('moving money between accounts');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const principalAmount = parseKes(this.principal.value);
    if (principalAmount === null || principalAmount <= 0) {
      this.error.set('Enter a valid principal amount');
      return;
    }
    const feeAmount = this.fee.value.trim() ? parseKes(this.fee.value) : null;
    if (this.fee.value.trim() && (feeAmount === null || feeAmount < 0)) {
      this.error.set('Enter a valid fee amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postTransfer(
        this.from.value,
        this.to.value,
        principalAmount,
        feeAmount,
        this.transferId,
        this.memo.value.trim() || undefined
      );
      this.notice.set('Transfer posted');
      this.principal.setValue('');
      this.fee.setValue('');
      this.memo.setValue('');
      this.formOpen.set(false);
      this.transferId = crypto.randomUUID();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to post transfer');
    } finally {
      this.busy.set(false);
    }
  }
}
