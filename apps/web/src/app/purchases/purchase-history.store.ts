import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { LocationContextService } from '../core/location-context.service';
import { formatKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { MoneyService, PurchaseDraft, PurchaseHistoryRow } from '../money/money.service';
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
 * Route-scoped owner for purchase-history list, filters, drafts and selection.
 *
 * Purchase creation lives in PurchaseEditorStore; one purchase's detail and financial commands
 * live in the component-scoped PurchaseDetailStore. Keeping those aggregates separate prevents
 * drawer retries and refreshes from mutating route-level list state implicitly.
 */
@Injectable()
export class PurchaseHistoryStore implements OnDestroy {
  private readonly money = inject(MoneyService);
  private readonly parties = inject(PartyCacheService);
  private readonly locationsContext = inject(LocationContextService);
  readonly permissions = inject(PermissionsService);

  private readonly purchasesState = signal<PurchaseRow[]>([]);
  readonly purchases = this.purchasesState.asReadonly();
  private readonly totalState = signal(0);
  readonly total = this.totalState.asReadonly();
  private readonly draftsState = signal<PurchaseDraft[]>([]);
  readonly drafts = this.draftsState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly noticeState = signal<string | null>(null);
  readonly notice = this.noticeState.asReadonly();
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
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private listRequest = 0;
  private nextUrlRequestId = 0;

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

    await this.parties.ensureLoaded();
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
    const [purchases, drafts] = await Promise.allSettled([
      this.money.purchasesPage(this.pageInput()),
      this.money.purchaseDrafts(),
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
    this.errorState.set(errors.length > 0 ? errors.join('. ') : null);
    this.loadingState.set(false);
    return purchases.status === 'fulfilled' && drafts.status === 'fulfilled';
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

  openPurchase(purchase: PurchaseRow, updateUrl = true): void {
    this.selectedPurchaseState.set(purchase);
    if (updateUrl) this.requestPurchaseUrl(purchase.id);
  }

  async openById(id: string, updateUrl = true): Promise<void> {
    const purchase =
      this.purchases().find(row => row.id === id) ?? (await this.money.purchaseById(id));
    if (!purchase) {
      this.errorState.set('The linked purchase was not found');
      return;
    }
    this.openPurchase(purchase as PurchaseRow, updateUrl);
  }

  closePurchase(): void {
    this.selectedPurchaseState.set(null);
    this.requestPurchaseUrl(null);
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
