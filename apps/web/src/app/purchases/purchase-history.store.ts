import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { CashierSessionService } from '../core/cashier-session.service';
import { LocationContextService } from '../core/location-context.service';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import {
  LedgerAccount,
  MoneyService,
  PurchaseDraft,
  PurchaseExpense,
  PurchaseHistoryRow,
  PurchaseLine,
  PurchasePayment,
} from '../money/money.service';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import type { ListSortDirection, ListSortOption } from '../shared/ui/list-search-bar.component';
import type { SearchableFilterOption } from '../shared/ui/searchable-filter.component';
import type { BadgeType } from '../shared/ui/status-badge.component';

export type PurchaseRow = PurchaseHistoryRow;
export interface PurchaseHistoryInit {
  supplierId?: string | null;
  paymentStatus?: string | null;
  query?: string | null;
  page?: number | null;
  allTime?: boolean;
  purchaseId?: string | null;
  purchaseRecorded?: boolean;
}

export interface PurchaseHistoryUrlRequest {
  id: number;
  queryParams: Record<string, string | number | null>;
}

const SUPPLIER_SEARCH_ID_LIMIT = 50;

/**
 * Route-scoped owner for purchase history and one open purchase aggregate.
 *
 * Purchase creation deliberately lives in PurchaseEditorStore. This store owns only history,
 * detail inspection and post-purchase AP corrections. Payment client references stay here so a
 * retry cannot accidentally post the same supplier payment twice.
 */
@Injectable()
export class PurchaseHistoryStore implements OnDestroy {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly parties = inject(PartyCacheService);
  private readonly locationsContext = inject(LocationContextService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  readonly permissions = inject(PermissionsService);
  readonly cashierSession = inject(CashierSessionService);

  private readonly purchasesState = signal<PurchaseRow[]>([]);
  readonly purchases = this.purchasesState.asReadonly();
  private readonly totalState = signal(0);
  readonly total = this.totalState.asReadonly();
  private readonly draftsState = signal<PurchaseDraft[]>([]);
  readonly drafts = this.draftsState.asReadonly();
  private readonly accountsState = signal<LedgerAccount[]>([]);
  readonly accounts = this.accountsState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly detailLoadingState = signal(false);
  readonly detailLoading = this.detailLoadingState.asReadonly();
  private readonly busyState = signal(false);
  readonly busy = this.busyState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly noticeState = signal<string | null>(null);
  readonly notice = this.noticeState.asReadonly();
  private readonly accountsErrorState = signal<string | null>(null);
  readonly accountsError = this.accountsErrorState.asReadonly();
  private readonly printerEnabledState = signal(false);
  readonly printerEnabled = this.printerEnabledState.asReadonly();
  private readonly urlRequestState = signal<PurchaseHistoryUrlRequest | null>(null);
  readonly urlRequest = this.urlRequestState.asReadonly();

  private readonly queryState = signal('');
  readonly query = this.queryState.asReadonly();
  private readonly sortState = signal('created');
  readonly sort = this.sortState.asReadonly();
  private readonly sortDirectionState = signal<ListSortDirection>('desc');
  readonly sortDirection = this.sortDirectionState.asReadonly();
  private readonly pageState = signal(1);
  readonly page = this.pageState.asReadonly();
  private readonly pageSizeState = signal(10);
  readonly pageSize = this.pageSizeState.asReadonly();
  private readonly supplierFilterState = signal('all');
  readonly supplierFilter = this.supplierFilterState.asReadonly();
  private readonly paymentFilterState = signal('all');
  readonly paymentFilter = this.paymentFilterState.asReadonly();
  private readonly locationFilterState = signal('');
  readonly locationFilter = this.locationFilterState.asReadonly();
  private readonly fromState = signal(this.monthStartIso());
  readonly from = this.fromState.asReadonly();
  private readonly toState = signal(this.todayIso());
  readonly to = this.toState.asReadonly();
  readonly locations = this.locationsContext.locations;

  private readonly selectedPurchaseState = signal<PurchaseRow | null>(null);
  readonly selectedPurchase = this.selectedPurchaseState.asReadonly();
  private readonly linesState = signal<PurchaseLine[]>([]);
  readonly lines = this.linesState.asReadonly();
  private readonly expensesState = signal<PurchaseExpense[]>([]);
  readonly expenses = this.expensesState.asReadonly();
  private readonly paymentsState = signal<PurchasePayment[]>([]);
  readonly payments = this.paymentsState.asReadonly();
  private readonly variantsState = signal<Map<string, Variant>>(new Map());
  private readonly supplierAdvanceState = signal(0);
  readonly supplierAdvance = this.supplierAdvanceState.asReadonly();

  private readonly paymentOpenState = signal(false);
  readonly paymentOpen = this.paymentOpenState.asReadonly();
  readonly paymentAmount = new FormControl('', { nonNullable: true });
  readonly paymentAccount = new FormControl('', { nonNullable: true });
  readonly reversalReason = new FormControl('', { nonNullable: true });
  private readonly reversingState = signal(false);
  readonly reversing = this.reversingState.asReadonly();

  readonly suppliers = computed(() => this.parties.suppliers());
  readonly supplierOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.suppliers()
      .filter(supplier => supplier.supplier_active)
      .map(supplier => ({
        value: supplier.id,
        label: this.supplierName(supplier.id),
        description: supplier.phone || undefined,
        searchText: supplier.email ?? undefined,
      }))
  );
  readonly sortOptions = computed<readonly ListSortOption[]>(() => [
    { value: 'created', label: 'Purchase date' },
    ...(this.permissions.has('ViewFinancials')
      ? [{ value: 'total', label: 'Purchase value' }]
      : []),
  ]);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly summary = computed(() => {
    const value = this.purchases().reduce((sum, purchase) => sum + purchase.total_cost, 0);
    const outstanding = this.purchases().reduce(
      (sum, purchase) => sum + Math.max(0, purchase.total_cost - purchase.paid),
      0
    );
    return [
      { label: 'Matching purchases', value: this.total(), mobilePriority: 'primary' as const },
      {
        label: 'Value on page',
        value: this.permissions.has('ViewFinancials') ? formatKes(value) : 'Hidden',
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Still to pay on page',
        value: this.permissions.has('ViewFinancials') ? formatKes(outstanding) : 'Hidden',
        tone: outstanding > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Drafts',
        value: this.drafts().length,
        tone: this.drafts().length > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'secondary' as const,
      },
    ];
  });
  readonly activeFilterCount = computed(
    () =>
      [
        this.supplierFilter() !== 'all',
        this.paymentFilter() !== 'all',
        this.locationFilter() !== (this.locationsContext.activeId() ?? ''),
        !this.monthActive(),
      ].filter(Boolean).length
  );
  readonly accountSelectionError = computed(() =>
    this.accounts().length > 0 || this.loading()
      ? null
      : (this.accountsError() ?? 'No payment accounts are configured.')
  );

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private listRequest = 0;
  private detailRequest = 0;
  private nextUrlRequestId = 0;
  private paymentAttempt: { fingerprint: string; clientRef: string } | null = null;
  private advanceAttempt: { purchaseId: string; clientRef: string } | null = null;

  async initialize(request: PurchaseHistoryInit): Promise<void> {
    this.supplierFilterState.set(request.supplierId ?? 'all');
    this.paymentFilterState.set(request.paymentStatus ?? 'all');
    this.queryState.set(request.query ?? '');
    this.pageState.set(Math.max(1, request.page ?? 1));
    this.locationFilterState.set(this.locationsContext.requireActiveId());
    if (request.allTime) {
      this.fromState.set('');
      this.toState.set('');
    }
    if (request.purchaseRecorded) {
      this.noticeState.set('Purchase recorded successfully. Stock and accounting are up to date.');
    }

    await Promise.all([
      this.parties.ensureLoaded(),
      this.receiptData
        .printerEnabled()
        .then(enabled => this.printerEnabledState.set(enabled))
        .catch(() => this.printerEnabledState.set(false)),
    ]);
    await this.load();

    if (request.purchaseId) await this.openById(request.purchaseId, false);
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  async load(silent = false): Promise<boolean> {
    const request = ++this.listRequest;
    if (!silent) this.loadingState.set(true);
    this.errorState.set(null);
    const [purchases, drafts, accounts] = await Promise.allSettled([
      this.money.purchasesPage(this.pageInput()),
      this.money.purchaseDrafts(),
      this.money.transactableAccounts(),
    ]);
    if (request !== this.listRequest) return false;

    const errors: string[] = [];
    if (purchases.status === 'fulfilled') {
      this.purchasesState.set(purchases.value.rows as PurchaseRow[]);
      this.totalState.set(purchases.value.count);
    } else {
      errors.push(this.message(purchases.reason, 'Failed to load purchase history'));
    }
    if (drafts.status === 'fulfilled') this.draftsState.set(drafts.value);
    else errors.push(this.message(drafts.reason, 'Failed to load purchase drafts'));
    if (accounts.status === 'fulfilled') {
      this.accountsState.set(accounts.value);
      this.accountsErrorState.set(null);
      if (!this.paymentAccount.value && accounts.value.length > 0) {
        this.paymentAccount.setValue(accounts.value[0].code);
      }
    } else {
      this.accountsErrorState.set(this.message(accounts.reason, 'Failed to load payment accounts'));
    }
    this.errorState.set(errors.length > 0 ? errors.join('. ') : null);
    this.loadingState.set(false);
    return (
      purchases.status === 'fulfilled' &&
      drafts.status === 'fulfilled' &&
      accounts.status === 'fulfilled'
    );
  }

  search(value: string): void {
    this.queryState.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.resetAndLoad(), 250);
  }

  async setSupplier(value: string): Promise<void> {
    this.supplierFilterState.set(value);
    await this.resetAndLoad();
  }

  async setPayment(value: string): Promise<void> {
    this.paymentFilterState.set(value);
    await this.resetAndLoad();
  }

  async setLocation(value: string): Promise<void> {
    this.locationFilterState.set(value);
    await this.resetAndLoad();
  }

  async setDate(kind: 'from' | 'to', value: string): Promise<void> {
    (kind === 'from' ? this.fromState : this.toState).set(value);
    await this.resetAndLoad();
  }

  async setSort(value: string): Promise<void> {
    this.sortState.set(value);
    await this.resetAndLoad();
  }

  async setSortDirection(value: ListSortDirection): Promise<void> {
    this.sortDirectionState.set(value);
    await this.resetAndLoad();
  }

  async setPage(value: number): Promise<void> {
    this.pageState.set(value);
    this.requestFilterUrl();
    await this.load();
  }

  async setPageSize(value: number): Promise<void> {
    this.pageSizeState.set(value);
    await this.resetAndLoad();
  }

  async setMonth(): Promise<void> {
    this.fromState.set(this.monthStartIso());
    this.toState.set(this.todayIso());
    await this.resetAndLoad();
  }

  async setAllTime(): Promise<void> {
    this.fromState.set('');
    this.toState.set('');
    await this.resetAndLoad();
  }

  monthActive(): boolean {
    return this.from() === this.monthStartIso() && this.to() === this.todayIso();
  }

  allTimeActive(): boolean {
    return !this.from() && !this.to();
  }

  async clearFilters(): Promise<void> {
    this.supplierFilterState.set('all');
    this.paymentFilterState.set('all');
    this.locationFilterState.set(this.locationsContext.requireActiveId());
    await this.setMonth();
  }

  async cancelDraft(id: string): Promise<void> {
    try {
      await this.money.cancelPurchaseDraft(id);
      this.noticeState.set('Purchase draft cancelled');
      await this.load(true);
    } catch (error) {
      this.errorState.set(this.message(error, 'Cancel failed'));
    }
  }

  closePayment(): void {
    this.paymentOpenState.set(false);
  }

  async openPurchase(purchase: PurchaseRow, updateUrl = true): Promise<void> {
    const request = ++this.detailRequest;
    this.selectedPurchaseState.set(purchase);
    this.clearDetail();
    this.detailLoadingState.set(true);
    this.errorState.set(null);
    try {
      const [lines, expenses, payments, advance] = await Promise.all([
        this.money.purchaseLines(purchase.id),
        this.money.purchaseExpenses(purchase.id),
        this.money.purchasePayments(purchase.id),
        this.money.supplierAdvanceAvailable(purchase.supplier_id),
      ]);
      const variants = await this.pos.variantsByIds([
        ...new Set(lines.map(line => line.variant_id)),
      ]);
      if (request !== this.detailRequest || this.selectedPurchase()?.id !== purchase.id) return;
      this.linesState.set(lines);
      this.expensesState.set(expenses);
      this.paymentsState.set(payments);
      this.supplierAdvanceState.set(advance);
      this.variantsState.set(
        new Map(
          variants.flatMap(variant => (variant.variant_id ? [[variant.variant_id, variant]] : []))
        )
      );
    } catch (error) {
      if (request === this.detailRequest) {
        this.errorState.set(this.message(error, 'Failed to load purchase details'));
      }
    } finally {
      if (request === this.detailRequest) this.detailLoadingState.set(false);
    }
    if (updateUrl) this.requestPurchaseUrl(purchase.id);
  }

  async openById(id: string, updateUrl = true): Promise<void> {
    const purchase =
      this.purchases().find(row => row.id === id) ?? (await this.money.purchaseById(id));
    if (!purchase) {
      this.errorState.set('The linked purchase was not found');
      return;
    }
    await this.openPurchase(purchase as PurchaseRow, updateUrl);
  }

  closePurchase(): void {
    this.detailRequest++;
    this.selectedPurchaseState.set(null);
    this.clearDetail();
    this.detailLoadingState.set(false);
    this.reversalReason.setValue('');
    this.reversingState.set(false);
    this.requestPurchaseUrl(null);
  }

  startPayment(): void {
    const purchase = this.selectedPurchase();
    if (!purchase) return;
    this.paymentAmount.setValue(formatKesInput(Math.max(0, purchase.total_cost - purchase.paid)));
    this.paymentOpenState.set(true);
  }

  async paySelectedPurchase(): Promise<void> {
    const purchase = this.selectedPurchase();
    const amount = parseKes(this.paymentAmount.value);
    if (!purchase || amount === null || amount <= 0) {
      this.errorState.set('Enter a valid payment amount');
      return;
    }
    const fingerprint = [purchase.supplier_id, purchase.id, amount, this.paymentAccount.value].join(
      ':'
    );
    if (this.paymentAttempt?.fingerprint !== fingerprint) {
      this.paymentAttempt = { fingerprint, clientRef: crypto.randomUUID() };
    }
    try {
      await this.cashierSession.assertOpen('paying a supplier');
      this.busyState.set(true);
      this.errorState.set(null);
      await this.money.payPurchase(
        purchase.supplier_id,
        purchase.id,
        amount,
        this.paymentAccount.value,
        this.paymentAttempt.clientRef
      );
      this.paymentAttempt = null;
      this.paymentOpenState.set(false);
      this.noticeState.set('Purchase payment recorded');
      await this.refreshAfterCommit(purchase.id);
    } catch (error) {
      this.errorState.set(this.message(error, 'Payment failed'));
    } finally {
      this.busyState.set(false);
    }
  }

  async applyAdvance(): Promise<void> {
    const purchase = this.selectedPurchase();
    if (!purchase) return;
    const amount = Math.min(this.supplierAdvance(), purchase.total_cost - purchase.paid);
    if (amount <= 0) return;
    if (this.advanceAttempt?.purchaseId !== purchase.id) {
      this.advanceAttempt = { purchaseId: purchase.id, clientRef: crypto.randomUUID() };
    }
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      await this.money.applySupplierAdvance(purchase.id, amount, this.advanceAttempt.clientRef);
      this.advanceAttempt = null;
      this.noticeState.set(`${formatKes(amount)} supplier advance applied`);
      await this.refreshAfterCommit(purchase.id);
    } catch (error) {
      this.errorState.set(this.message(error, 'Could not apply supplier advance'));
    } finally {
      this.busyState.set(false);
    }
  }

  async reversePurchase(): Promise<void> {
    const purchase = this.selectedPurchase();
    const reason = this.reversalReason.value.trim();
    if (!purchase || !reason) {
      this.errorState.set('Explain why this purchase is being reversed');
      return;
    }
    try {
      await this.cashierSession.assertOpen('reversing a purchase');
      this.busyState.set(true);
      this.reversingState.set(true);
      this.errorState.set(null);
      await this.money.reverseCreditPurchase(purchase.id, reason);
      this.closePurchase();
      this.noticeState.set('Purchase reversed. Stock, supplier balance, and ledger were restored.');
      await this.load(true);
    } catch (error) {
      const message = this.message(error, 'Purchase could not be reversed');
      this.errorState.set(
        message.includes('purchase_stock_already_moved')
          ? 'This purchase cannot be reversed because some stock was sold, adjusted, or moved.'
          : message.includes('purchase_has_payments')
            ? 'Reverse this purchase’s supplier payments first.'
            : message.includes('purchase_has_separate_expenses')
              ? 'Finance must reverse this purchase’s separately paid expenses first.'
              : message
      );
    } finally {
      this.reversingState.set(false);
      this.busyState.set(false);
    }
  }

  async printPurchase(id: string): Promise<void> {
    try {
      const [purchase, company] = await Promise.all([
        this.receiptData.buildPurchaseData(id),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printPurchase(
        purchase,
        company.name,
        company.logoUrl,
        undefined,
        company.address
      );
    } catch (error) {
      this.errorState.set(this.message(error, 'Print failed'));
    }
  }

  setNotice(message: string): void {
    this.noticeState.set(message);
  }

  setError(message: string): void {
    this.errorState.set(message);
  }

  clearError(): void {
    this.errorState.set(null);
  }

  supplierName(id: string): string {
    const supplier = this.suppliers().find(row => row.id === id);
    return supplier
      ? [supplier.first_name, supplier.last_name].filter(Boolean).join(' ')
      : id.slice(0, 8);
  }

  statusType(purchase: PurchaseRow): BadgeType {
    return purchase.paid >= purchase.total_cost ? 'success' : 'warning';
  }

  statusLabel(purchase: PurchaseRow): string {
    if (purchase.paid >= purchase.total_cost) return 'Paid';
    if (!this.permissions.has('ViewFinancials')) return purchase.paid > 0 ? 'Part-paid' : 'We owe';
    const due = formatKes(purchase.total_cost - purchase.paid);
    return purchase.paid > 0 ? `Part-paid · we owe ${due}` : `We owe ${due}`;
  }

  settlementLabel(purchase: PurchaseRow): string {
    if (purchase.paid >= purchase.total_cost) return 'Paid';
    return purchase.paid > 0 ? 'Part paid' : 'Unpaid';
  }

  variant(variantId: string): Variant | null {
    return this.variantsState().get(variantId) ?? null;
  }

  lineLabel(variantId: string): string {
    const variant = this.variant(variantId);
    return variant ? variantLabel(variant) : 'Item';
  }

  date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      month: 'short',
      day: 'numeric',
    });
  }

  private async resetAndLoad(): Promise<void> {
    this.pageState.set(1);
    this.requestFilterUrl();
    await this.load();
  }

  private pageInput(): Parameters<MoneyService['purchasesPage']>[0] {
    const search = this.query().trim().toLowerCase();
    const matchingSupplierIds = search
      ? this.suppliers()
          .filter(supplier => this.supplierName(supplier.id).toLowerCase().includes(search))
          .slice(0, SUPPLIER_SEARCH_ID_LIMIT)
          .map(supplier => supplier.id)
      : [];
    return {
      page: this.page(),
      pageSize: this.pageSize(),
      supplierId: this.supplierFilter() === 'all' ? undefined : this.supplierFilter(),
      paymentStatus:
        this.paymentFilter() === 'all'
          ? undefined
          : (this.paymentFilter() as 'paid' | 'part_paid' | 'unpaid'),
      locationId: this.locationFilter() || undefined,
      search: search || undefined,
      matchingSupplierIds,
      from: this.from() || undefined,
      to: this.to() || undefined,
      sortBy: this.sort() === 'total' ? 'total_cost' : 'purchase_date',
      sortDirection: this.sortDirection(),
    };
  }

  private requestFilterUrl(): void {
    this.requestUrl({
      supplier: this.supplierFilter() === 'all' ? null : this.supplierFilter(),
      payment: this.paymentFilter() === 'all' ? null : this.paymentFilter(),
      q: this.query().trim() || null,
      page: this.page() > 1 ? this.page() : null,
      range: this.allTimeActive() ? 'all' : null,
    });
  }

  private requestPurchaseUrl(id: string | null): void {
    this.requestUrl({ purchase: id });
  }

  private requestUrl(queryParams: PurchaseHistoryUrlRequest['queryParams']): void {
    this.urlRequestState.set({
      id: ++this.nextUrlRequestId,
      queryParams,
    });
  }

  /** A committed payment is successful even when one of the read models fails to refresh. */
  private async refreshAfterCommit(purchaseId: string): Promise<void> {
    const detailRequest = this.detailRequest;
    const selected = this.selectedPurchase();
    const supplierId = selected?.id === purchaseId ? selected.supplier_id : null;
    const results = await Promise.allSettled([
      this.load(true),
      this.money.purchasePayments(purchaseId),
      this.money.purchaseById(purchaseId),
      supplierId ? this.money.supplierAdvanceAvailable(supplierId) : Promise.resolve(0),
    ]);
    const detailStillCurrent =
      detailRequest === this.detailRequest && this.selectedPurchase()?.id === purchaseId;
    if (!detailStillCurrent) return;
    if (results[1].status === 'fulfilled') {
      this.paymentsState.set(results[1].value);
    }
    if (results[2].status === 'fulfilled' && results[2].value?.id === purchaseId) {
      this.selectedPurchaseState.set(results[2].value as PurchaseRow);
    }
    if (results[3].status === 'fulfilled') this.supplierAdvanceState.set(results[3].value);
    const listRefreshFailed = results[0].status === 'rejected' || !results[0].value;
    if (listRefreshFailed || results.slice(1).some(result => result.status === 'rejected')) {
      this.errorState.set(
        'The transaction was recorded, but the latest purchase details could not be refreshed.'
      );
    }
  }

  private clearDetail(): void {
    this.linesState.set([]);
    this.expensesState.set([]);
    this.paymentsState.set([]);
    this.variantsState.set(new Map());
    this.supplierAdvanceState.set(0);
    this.paymentOpenState.set(false);
    this.paymentAmount.setValue('');
    this.reversalReason.setValue('');
  }

  private todayIso(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }

  private monthStartIso(): string {
    const today = this.todayIso();
    return `${today.slice(0, 8)}01`;
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
