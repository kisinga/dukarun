import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CatalogCacheService } from '../../core/catalog-cache.service';
import { SupabaseService } from '../../core/supabase.service';
import { ScanFeedbackService } from '../../shared/ui/scan-feedback.service';
import { MAX_SALE_LINES, CartService } from '../cart.service';
import { isRapidScannerBurst, isTextEntryTarget } from '../keyboard-wedge';
import { PosService, Variant, variantLabel } from '../pos.service';
import { SyncService } from '../offline/sync.service';

export type CatalogView = 'grid' | 'list' | 'categories';

/**
 * Catalog-side state for the POS sell screen.
 *
 * The sell page should orchestrate the transaction: cart totals, customer credit,
 * fulfillment, payment, queueing, and receipt printing. This store owns the
 * separate counter workflow of finding sellable variants: search, cached category
 * browsing, scanner/wedge handling, view persistence, image failures, and the
 * single intent of adding a variant to the cart.
 */
@Injectable()
export class SellCatalogStore {
  private readonly cart = inject(CartService);
  readonly catalogCache = inject(CatalogCacheService);
  private readonly pos = inject(PosService);
  private readonly scanFeedback = inject(ScanFeedbackService);
  private readonly supabase = inject(SupabaseService);
  private readonly sync = inject(SyncService);

  readonly search = new FormControl('', { nonNullable: true });
  private readonly searchQueryState = signal('');
  readonly searchQuery = this.searchQueryState.asReadonly();
  private readonly scannerOpenState = signal(false);
  readonly scannerOpen = this.scannerOpenState.asReadonly();
  private readonly resultsState = signal<Variant[]>([]);
  readonly results = this.resultsState.asReadonly();
  private readonly topVariantsState = signal<Variant[]>([]);
  readonly topVariants = this.topVariantsState.asReadonly();
  private readonly catalogViewState = signal<CatalogView>('list');
  readonly catalogView = this.catalogViewState.asReadonly();
  private readonly selectedCategoryIdState = signal<string | null>(null);
  readonly selectedCategoryId = this.selectedCategoryIdState.asReadonly();
  private readonly categorySearchState = signal('');
  readonly categorySearch = this.categorySearchState.asReadonly();
  private readonly categoryVisibleLimitState = signal(24);
  readonly categoryVisibleLimit = this.categoryVisibleLimitState.asReadonly();
  private readonly catalogRefreshingState = signal(false);
  readonly catalogRefreshing = this.catalogRefreshingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly brokenImagesState = signal<Set<string>>(new Set());
  readonly brokenImages = this.brokenImagesState.asReadonly();
  private readonly focusSearchRequestState = signal(0);
  readonly focusSearchRequest = this.focusSearchRequestState.asReadonly();

  readonly searchMode = computed(() => this.searchQuery().trim().length >= 2);
  readonly selectedCategory = computed(() => {
    const id = this.selectedCategoryId();
    return id
      ? (this.catalogCache.categories().find(category => category.id === id && category.active) ??
          null)
      : null;
  });

  private readonly activeCatalog = computed(() =>
    this.catalogCache
      .catalog()
      .filter(variant => variant.variant_active && variant.product_active && variant.product_id)
  );

  readonly categoryDirectory = computed(() => {
    const query = this.categorySearch().trim().toLocaleLowerCase();
    const optionCountByProduct = new Map<string, number>();
    for (const variant of this.activeCatalog()) {
      const productId = variant.product_id!;
      optionCountByProduct.set(productId, (optionCountByProduct.get(productId) ?? 0) + 1);
    }
    const productIdsByCategory = new Map<string, Set<string>>();
    for (const link of this.catalogCache.productCategories()) {
      const productIds = productIdsByCategory.get(link.category_id) ?? new Set<string>();
      productIds.add(link.product_id);
      productIdsByCategory.set(link.category_id, productIds);
    }
    return this.catalogCache
      .categories()
      .filter(
        category => category.active && (!query || category.name.toLocaleLowerCase().includes(query))
      )
      .map(category => {
        const linked = productIdsByCategory.get(category.id) ?? new Set<string>();
        const productIds = new Set(
          [...linked].filter(productId => optionCountByProduct.has(productId))
        );
        return {
          ...category,
          productCount: productIds.size,
          optionCount: [...productIds].reduce(
            (count, productId) => count + (optionCountByProduct.get(productId) ?? 0),
            0
          ),
        };
      })
      .filter(category => category.productCount > 0);
  });

  readonly categoryItems = computed(() => {
    const categoryId = this.selectedCategoryId();
    if (!categoryId) return [];
    const productIds = new Set(
      this.catalogCache
        .productCategories()
        .filter(link => link.category_id === categoryId)
        .map(link => link.product_id)
    );
    return this.activeCatalog().filter(variant => productIds.has(variant.product_id!));
  });

  readonly visibleCatalogItems = computed(() => {
    if (this.searchMode()) return this.results();
    if (this.catalogView() === 'categories') {
      return this.categoryItems().slice(0, this.categoryVisibleLimit());
    }
    return this.topVariants();
  });

  readonly showProductResults = computed(
    () =>
      this.searchMode() ||
      this.catalogView() !== 'categories' ||
      (this.catalogCache.categoryMembershipsComplete() && this.selectedCategory() !== null)
  );

  readonly resultPresentation = computed<'grid' | 'list'>(() =>
    this.catalogView() === 'list' ? 'list' : 'grid'
  );

  readonly quickAddMode = computed(() => !this.searchMode() && this.catalogView() === 'grid');

  readonly canShowMoreCategoryItems = computed(
    () =>
      !this.searchMode() &&
      this.catalogView() === 'categories' &&
      this.categoryVisibleLimit() < this.categoryItems().length
  );

  private readonly debouncedSearch = toSignal(
    this.search.valueChanges.pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: undefined }
  );
  private searchSeq = 0;
  private topVariantsRequest = 0;
  private barcodeQueue: Promise<void> = Promise.resolve();
  private searchKeystrokes: number[] = [];
  private topVariantsLoaded = false;

  constructor() {
    effect(() => {
      const query = this.debouncedSearch();
      if (query === undefined) return;
      untracked(() => {
        this.searchQueryState.set(query);
        void this.onSearch(query);
      });
    });
  }

  async loadTopVariants(force = false): Promise<void> {
    if (this.topVariantsLoaded && !force) return;
    const request = ++this.topVariantsRequest;
    try {
      const variants = await this.sync.topVariants(8);
      if (request !== this.topVariantsRequest) return;
      this.topVariantsState.set(variants);
      this.topVariantsLoaded = true;
    } catch {
      // The catalog panel can still sell through explicit search when quick-add fails.
    }
  }

  async refreshCatalog(): Promise<void> {
    if (this.catalogRefreshing()) return;
    this.catalogRefreshingState.set(true);
    this.errorState.set(null);
    try {
      const refreshed = await this.sync.refreshProductSnapshot();
      await this.loadTopVariants(true);
      if (!refreshed)
        this.errorState.set('Could not refresh the catalog; using the last saved copy.');
    } finally {
      this.catalogRefreshingState.set(false);
    }
  }

  setCatalogView(view: CatalogView): void {
    this.catalogViewState.set(view);
    this.persistCatalogView(view);
  }

  restoreCatalogView(): void {
    const key = this.catalogViewStorageKey();
    if (!key || typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(key);
      if (stored === 'grid' || stored === 'list' || stored === 'categories') {
        this.catalogViewState.set(stored);
      }
    } catch {
      // Restricted storage must not prevent the POS from starting.
    }
  }

  openCategory(categoryId: string): void {
    this.selectedCategoryIdState.set(categoryId);
    this.categoryVisibleLimitState.set(24);
  }

  leaveCategory(): void {
    this.selectedCategoryIdState.set(null);
    this.categoryVisibleLimitState.set(24);
  }

  showMoreCategoryItems(): void {
    this.categoryVisibleLimitState.update(limit => limit + 24);
  }

  catalogSectionLabel(): string {
    if (this.searchMode()) return 'Search results';
    if (this.catalogView() === 'categories') {
      return this.selectedCategory() ? 'Category' : 'Browse categories';
    }
    return 'Quick add';
  }

  imageUrl(path: string | null | undefined): string | null {
    return this.pos.imageUrl(path);
  }

  markBroken(path: string): void {
    this.brokenImagesState.update(set => new Set(set).add(path));
  }

  label(variant: Variant): string {
    return variantLabel(variant);
  }

  quantityInCart(variantId: string | null): number {
    if (!variantId) return 0;
    return this.cart.lines().find(line => line.variant.variant_id === variantId)?.quantity ?? 0;
  }

  unavailable(variant: Variant): boolean {
    return variant.kind !== 'service' && !!variant.track_inventory && (variant.stock ?? 0) <= 0;
  }

  stockLabel(variant: Variant): string {
    if (variant.kind === 'service') return 'Service';
    if (!variant.track_inventory) return 'In stock';
    const stock = variant.stock ?? 0;
    return stock > 0 ? `${stock} left` : 'Out of stock';
  }

  addVariant(variant: Variant): boolean {
    if (this.unavailable(variant)) return false;
    if (this.cart.addVariant(variant)) return true;
    this.errorState.set(
      `An order can contain at most ${MAX_SALE_LINES} different items. Complete this order, then start another.`
    );
    return false;
  }

  clearSearch(): void {
    this.searchSeq++;
    this.search.setValue('', { emitEvent: false });
    this.searchQueryState.set('');
    this.resultsState.set([]);
  }

  barcodeScanned(value: string): void {
    this.scannerOpenState.set(false);
    this.clearSearch();
    this.enqueueBarcode(value);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.recordSearchKeystroke(event.timeStamp);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.scanTypedBarcode();
      return;
    }
    if (event.key === 'Tab' && isRapidScannerBurst(this.searchKeystrokes)) {
      event.preventDefault();
      this.scanTypedBarcode();
    }
  }

  captureWedgeInput(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isTextEntryTarget(event.target) ||
      event.key.length !== 1 ||
      this.scannerOpen()
    ) {
      return;
    }
    event.preventDefault();
    this.search.setValue(this.search.value + event.key);
    this.requestSearchFocus();
    this.recordSearchKeystroke(event.timeStamp);
  }

  scanTypedBarcode(): void {
    const barcode = this.search.value.trim();
    if (!barcode) return;
    // Invalidates any pending debounced search before queueing this Enter event.
    this.clearSearch();
    this.enqueueBarcode(barcode);
  }

  clearError(): void {
    this.errorState.set(null);
  }

  openScanner(): void {
    this.scannerOpenState.set(true);
  }

  closeScanner(): void {
    this.scannerOpenState.set(false);
  }

  setCategorySearch(value: string): void {
    this.categorySearchState.set(value);
  }

  private async onSearch(query: string): Promise<void> {
    const q = query.trim();
    // Sequence guard: a slower earlier response must not overwrite newer results.
    const seq = ++this.searchSeq;
    // A scanner Enter clears the control before a pending debounce emits. Do
    // not resurrect or resolve that stale value as a second scan.
    if (this.search.value.trim() !== q) return;
    if (q.length < 2) {
      this.resultsState.set([]);
      return;
    }
    try {
      const variants = await this.sync.searchProducts(q);
      if (seq !== this.searchSeq || this.search.value.trim() !== q) return;
      if (variants.some(v => v.barcode === q)) {
        // Clear first so a scanner-sent Enter cannot enqueue the same physical
        // read while this exact search result is waiting in the queue.
        this.clearSearch();
        this.enqueueBarcode(q);
        return;
      }
      this.resultsState.set(variants);
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.errorState.set(err instanceof Error ? err.message : 'Product search failed');
    }
  }

  private recordSearchKeystroke(time: number): void {
    const previous = this.searchKeystrokes.at(-1);
    if (previous === undefined || time - previous <= 80) this.searchKeystrokes.push(time);
    else this.searchKeystrokes = [time];
    if (this.searchKeystrokes.length > 64) this.searchKeystrokes.shift();
  }

  private enqueueBarcode(value: string): void {
    const barcode = value.trim();
    if (!barcode) return;
    const resolve = () => this.resolveScannedBarcode(barcode);
    // Keep the queue usable even if an unforeseen UI-side exception escapes a
    // previous lookup; one failed read must not disable later scans.
    this.barcodeQueue = this.barcodeQueue.then(resolve, resolve);
  }

  private async resolveScannedBarcode(value: string): Promise<void> {
    const barcode = value.trim();
    if (!barcode) return;
    this.errorState.set(null);
    try {
      const result = await this.sync.resolveBarcode(barcode);
      if (result.status === 'unknown') {
        this.errorState.set(`No active product or service uses barcode "${barcode}".`);
        return;
      }
      if (result.status === 'ambiguous') {
        this.errorState.set(
          `Barcode "${barcode}" belongs to more than one variant. Assign individual barcodes before selling it.`
        );
        return;
      }
      if (result.status === 'incomplete') {
        this.errorState.set(
          'This offline catalogue is incomplete, so barcode matching is disabled. Reconnect and refresh the catalogue.'
        );
        return;
      }
      if (this.unavailable(result.variant)) {
        this.errorState.set(`${this.label(result.variant)} is out of stock at this location.`);
        return;
      }
      if (this.addVariant(result.variant)) this.scanFeedback.playSuccess();
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'Barcode lookup failed.');
    } finally {
      this.searchKeystrokes = [];
      queueMicrotask(() => this.requestSearchFocus());
    }
  }

  private requestSearchFocus(): void {
    this.focusSearchRequestState.update(request => request + 1);
  }

  private catalogViewStorageKey(): string | null {
    const identity = this.supabase.offlineIdentity();
    return identity ? `dukarun:catalog-view:${identity.companyId}:${identity.userId}` : null;
  }

  private persistCatalogView(view: CatalogView): void {
    const key = this.catalogViewStorageKey();
    if (!key || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, view);
    } catch {
      // Keep the in-memory selection when storage is unavailable or full.
    }
  }
}
