import {
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { MoneyService, type VariantPurchaseHistoryRow } from '../money/money.service';
import { PartyCacheService } from '../core/party-cache.service';
import {
  type InventoryBatch,
  PosService,
  type Product,
  type SupplierStockRow,
  type Variant,
} from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PermissionsService } from '../core/permissions.service';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PublicProductLinkService } from './public-product-link.service';

type StockInfo = { stock: number; stock_value: number };
type DrawerVariant = Variant & { stock_value?: number | null };
type ProductGroup = { family: Product; variants: DrawerVariant[] };
type ShareFeedback = { kind: 'success' | 'error'; message: string };

/**
 * Product detail LOB surface.
 *
 * The inventory page decides which product is selected; this drawer owns the inspection workflow:
 * bounded product loading, stock lots, purchase history, public sharing and variant-level actions.
 * Keep editor state out of this component and emit edit/label intents back to the page shell.
 */
@Component({
  selector: 'app-product-detail-drawer',
  imports: [
    RouterLink,
    ButtonComponent,
    DrawerComponent,
    EmptyStateComponent,
    IconComponent,
    MoneyComponent,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  template: `
    @if (productId()) {
      <app-drawer
        [open]="true"
        (closed)="closed.emit()"
        [title]="group()?.family?.name ?? 'Product'"
        [subtitle]="subtitle()"
      >
        @if (group(); as group) {
          @if (canShareProduct(group)) {
            <button
              drawerActions
              appButton
              variant="ghost"
              [iconOnly]="true"
              [loading]="shareBusy()"
              type="button"
              title="Share product"
              aria-label="Share product"
              (click)="shareProduct(group)"
            >
              <app-icon name="heroShare" />
            </button>
          }
          @if (perms.has('ManageStockAdjustments')) {
            <button
              drawerActions
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Edit product"
              aria-label="Edit product"
              (click)="editProduct.emit(group.family)"
            >
              <app-icon name="heroPencilSquare" />
            </button>
          }

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="type-caption">Manufacturer</p>
              <p class="mt-0.5 text-sm font-semibold">
                {{ manufacturerName(group.family.manufacturer_id) || 'Manufacturer not set' }}
              </p>
            </div>
            <div class="text-right">
              <p class="type-caption">Product status</p>
              <app-status-badge
                size="xs"
                [type]="group.family.active ? 'neutral' : 'warning'"
                [label]="group.family.active ? 'active' : 'inactive'"
              />
            </div>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <app-stat-card label="Variants" [value]="group.variants.length + ''" />
            <app-stat-card
              label="Stock"
              [value]="
                group.variants.length === 0
                  ? 'No variants'
                  : familyTracksInventory(group.variants)
                    ? familyStock(group.variants) + ' units'
                    : 'Not tracked'
              "
              [sub]="
                familyTracksInventory(group.variants)
                  ? fmt(familyRetailStockValue(group.variants)) + ' retail value'
                  : undefined
              "
            />
          </div>

          <section class="mt-4 border-t border-base-300/60 pt-4">
            <h3 class="section-title">Categories</h3>
            @if (!categoryMembershipsComplete()) {
              <p class="type-caption mt-2">{{ categoryDataStatusLabel() }}</p>
            } @else if (productCategoryNames(group.family.id); as categoryNames) {
              @if (categoryNames.length > 0) {
                <div class="mt-2 flex flex-wrap gap-1.5">
                  @for (name of categoryNames; track name) {
                    <span class="badge badge-ghost">{{ name }}</span>
                  }
                </div>
              } @else {
                <p class="type-caption mt-2">Uncategorized</p>
              }
            }
          </section>

          @if (familyBarcodeAmbiguous(group)) {
            <div class="alert alert-warning mt-4 text-sm">
              <app-icon name="heroExclamationTriangle" />
              <span>
                The shared barcode <span class="font-mono">{{ group.family.barcode }}</span>
                resolves to multiple variants. Assign individual variant barcodes before scanning or
                printing it.
              </span>
            </div>
          }

          <div class="mt-4 border-t border-base-300/60 pt-4">
            <div class="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 class="section-title">Variants</h3>
                <p class="type-caption mt-0.5">Pricing, identifiers, and inventory</p>
              </div>
              <span class="type-caption tabular-nums"> {{ group.variants.length }} total </span>
            </div>
            @if (group.variants.length === 0) {
              <app-empty-state
                [compact]="true"
                icon="heroCube"
                title="No variants yet"
                description="Edit the product to add one before selling it."
              />
            } @else {
              <ul
                class="overflow-hidden rounded-box border border-base-300/60 bg-base-100 shadow-sm"
              >
                @for (v of group.variants; track v.variant_id) {
                  <li
                    class="p-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-base-200"
                    [id]="'product-variant-' + v.variant_id"
                    [class.bg-base-200]="selectedVariantId() === v.variant_id"
                    [class.outline]="selectedVariantId() === v.variant_id"
                    [class.outline-1]="selectedVariantId() === v.variant_id"
                    [class.outline-primary]="selectedVariantId() === v.variant_id"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                          <p class="truncate text-sm font-semibold">{{ v.variant_name }}</p>
                          @if (!v.variant_active) {
                            <app-status-badge size="xs" type="warning" label="inactive" />
                          }
                        </div>
                        <p class="type-caption mt-0.5">
                          SKU <span class="font-mono text-base-content/80">{{ v.sku }}</span>
                        </p>
                      </div>
                      <div class="shrink-0 text-right">
                        <p class="type-caption">Retail price</p>
                        <p class="mt-0.5 text-sm font-semibold tabular-nums">
                          <app-money [amount]="v.price ?? 0" [showCurrency]="true" />
                        </p>
                      </div>
                    </div>

                    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      @if (v.barcode) {
                        <p class="type-caption">
                          Barcode
                          <span class="font-mono text-base-content/80">{{ v.barcode }}</span>
                        </p>
                      } @else {
                        <p class="type-caption text-warning">
                          No barcode · edit this variant or generate one from Print labels
                        </p>
                      }
                      @if (v.kind === 'service') {
                        <p class="type-caption">Service · Inventory not tracked</p>
                      } @else if (v.track_inventory) {
                        <p class="type-caption tabular-nums">
                          <span class="font-semibold text-base-content/80">
                            {{ stockOf(v.variant_id!)?.stock ?? 0 }} in stock
                          </span>
                          @if (supplierFilter() !== 'all') {
                            · {{ supplierStockOf(v.variant_id!)?.stock ?? 0 }} sourced from
                            {{ selectedSupplierName() }}
                          }
                          · <app-money [amount]="variantRetailStockValue(v)" /> retail value
                        </p>
                      } @else {
                        <p class="type-caption">Inventory not tracked</p>
                      }
                    </div>

                    <div class="mt-3 flex flex-wrap gap-1.5 border-t border-base-200 pt-2">
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        type="button"
                        [disabled]="!v.variant_active || !v.product_active"
                        (click)="printLabel.emit(v.variant_id!)"
                      >
                        <app-icon name="heroPrinter" /> Print label
                      </button>
                      @if (perms.has('ManageStockAdjustments')) {
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          type="button"
                          (click)="editVariant.emit(group.family.id)"
                        >
                          <app-icon name="heroPencilSquare" /> Edit
                        </button>
                      }
                      @if (v.kind !== 'service' && v.track_inventory) {
                        @if (perms.has('ManageStockAdjustments')) {
                          <a
                            appButton
                            variant="soft"
                            size="sm"
                            routerLink="/inventory/adjustments"
                            [queryParams]="{ variant: v.variant_id }"
                          >
                            <app-icon name="heroArrowsRightLeft" /> Adjust stock
                          </a>
                        }
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="toggleBatches(v.variant_id!)"
                        >
                          <app-icon name="heroQueueList" />
                          {{ batchesFor() === v.variant_id ? 'Hide stock lots' : 'Stock lots' }}
                        </button>
                      }
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        (click)="togglePurchaseHistory(v.variant_id!)"
                      >
                        <app-icon name="heroDocumentText" />
                        {{ purchaseHistoryFor() === v.variant_id ? 'Hide purchases' : 'Purchases' }}
                      </button>
                    </div>
                    @if (batchesFor() === v.variant_id) {
                      <div class="mt-3 rounded-field bg-base-200/70 p-3">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <h4 class="type-caption">Stock lots</h4>
                          <a routerLink="/suppliers" class="link text-xs">Restock</a>
                        </div>
                        <ul class="divide-y divide-base-200">
                          @for (b of batches(); track b.id) {
                            <li class="py-1.5">
                              <div class="flex items-center gap-2 text-xs">
                                <span class="font-medium">{{ b.batch_number || 'Batch' }}</span>
                                <span class="text-base-content/60">{{ date(b.purchased_at) }}</span>
                                <span class="ml-auto tabular-nums"
                                  >{{ b.remaining }} of {{ b.quantity }} left</span
                                >
                              </div>
                              <p class="type-caption mt-0.5">
                                Cost
                                <app-money
                                  [amount]="b.unit_cost"
                                  [masked]="!perms.has('ViewFinancials')"
                                />
                                @if (preferences.batchExpiryEnabled()) {
                                  · {{ b.expiry_date ? 'Expires ' + b.expiry_date : 'No expiry' }}
                                }
                              </p>
                            </li>
                          } @empty {
                            <p class="type-caption py-1">No stock batches yet.</p>
                          }
                        </ul>
                      </div>
                    }
                    @if (purchaseHistoryFor() === v.variant_id) {
                      <div class="mt-3 rounded-field border border-base-300 p-3">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <h4 class="type-caption">Purchase history</h4>
                          <span class="type-caption">{{ purchaseHistoryTotal() }} records</span>
                        </div>
                        @if (purchaseHistoryLoading() && purchaseHistory().length === 0) {
                          <div class="flex items-center gap-2 py-3 text-sm text-base-content/60">
                            <span class="loading loading-spinner loading-sm"></span>
                            Loading purchases
                          </div>
                        } @else {
                          <ul class="divide-y divide-base-200">
                            @for (row of purchaseHistory(); track row.id) {
                              <li class="py-2">
                                <div class="flex flex-wrap items-start justify-between gap-2">
                                  <div class="min-w-0">
                                    <a
                                      class="link text-sm font-medium"
                                      routerLink="/purchases"
                                      [queryParams]="{ purchase: row.purchase.id }"
                                      >{{ row.purchase.reference || 'Purchase' }}</a
                                    >
                                    <p class="type-caption">
                                      {{ supplierName(row.purchase.supplier_id) }} ·
                                      {{ date(row.purchase.purchase_date) }} ·
                                      {{ row.purchase.status }}
                                    </p>
                                  </div>
                                  <div class="text-right text-sm">
                                    <p>
                                      {{ row.quantity }} ×
                                      <app-money
                                        [amount]="row.unit_cost"
                                        [masked]="!perms.has('ViewFinancials')"
                                      />
                                    </p>
                                    <p class="type-caption">
                                      Total
                                      <app-money
                                        [amount]="row.line_total"
                                        [masked]="!perms.has('ViewFinancials')"
                                      />
                                    </p>
                                  </div>
                                </div>
                              </li>
                            } @empty {
                              <p class="type-caption py-2">
                                No purchases recorded for this variant.
                              </p>
                            }
                          </ul>
                          @if (purchaseHistory().length < purchaseHistoryTotal()) {
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              class="mt-2"
                              [loading]="purchaseHistoryLoading()"
                              (click)="loadMorePurchaseHistory(v.variant_id!)"
                            >
                              Load more
                            </button>
                          }
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        } @else if (loadError()) {
          <div role="alert" class="alert alert-error text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ loadError() }}</span>
          </div>
        } @else {
          <div class="flex min-h-40 items-center justify-center gap-2 text-sm text-base-content/60">
            <span class="loading loading-spinner loading-sm"></span>
            Loading product…
          </div>
        }
      </app-drawer>
    }

    @if (shareFeedback(); as feedback) {
      <div
        class="toast toast-bottom toast-end z-[70]"
        [attr.aria-live]="feedback.kind === 'error' ? 'assertive' : 'polite'"
      >
        <div
          class="alert max-w-sm shadow-overlay"
          [class.alert-error]="feedback.kind === 'error'"
          [class.alert-success]="feedback.kind === 'success'"
          [attr.role]="feedback.kind === 'error' ? 'alert' : 'status'"
        >
          <app-icon
            [name]="feedback.kind === 'error' ? 'heroExclamationTriangle' : 'heroCheckCircle'"
          />
          <span>{{ feedback.message }}</span>
        </div>
      </div>
    }
  `,
})
export class ProductDetailDrawerComponent implements OnDestroy {
  private readonly catalogCache = inject(CatalogCacheService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly money = inject(MoneyService);
  private readonly parties = inject(PartyCacheService);
  private readonly pos = inject(PosService);
  private readonly publicProductLinks = inject(PublicProductLinkService);
  protected readonly perms = inject(PermissionsService);
  protected readonly preferences = inject(CompanyPreferencesService);

  readonly productId = input<string | null>(null);
  readonly selectedVariantId = input<string | null>(null);
  readonly supplierFilter = input('all');
  readonly supplierStock = input<Map<string, SupplierStockRow>>(new Map());
  readonly selectedSupplierName = input('supplier');

  readonly closed = output<void>();
  readonly editProduct = output<Product>();
  readonly editVariant = output<string>();
  readonly printLabel = output<string>();

  protected readonly fmt = formatKes;
  protected readonly categoryMembershipsComplete = this.catalogCache.categoryMembershipsComplete;
  protected readonly batchesFor = signal<string | null>(null);
  protected readonly batches = signal<InventoryBatch[]>([]);
  protected readonly purchaseHistoryFor = signal<string | null>(null);
  protected readonly purchaseHistory = signal<VariantPurchaseHistoryRow[]>([]);
  protected readonly purchaseHistoryTotal = signal(0);
  protected readonly purchaseHistoryLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly shareBusy = signal(false);
  protected readonly shareFeedback = signal<ShareFeedback | null>(null);
  private readonly loadedGroup = signal<ProductGroup | null>(null);
  private productRequest = 0;
  private purchaseHistoryRequest = 0;
  private activeProductId: string | null = null;
  private shareFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly group = computed<ProductGroup | null>(() => {
    const productId = this.productId();
    if (!productId) return null;
    const loaded = this.loadedGroup();
    if (loaded?.family.id === productId) return loaded;
    return this.cachedGroup(productId);
  });
  protected readonly subtitle = computed(() => {
    const group = this.group();
    if (!group) return 'Loading details';
    return `${group.variants.length} ${group.variants.length === 1 ? 'variant' : 'variants'}`;
  });

  constructor() {
    effect(() => {
      const productId = this.productId();
      const variantId = this.selectedVariantId();
      untracked(() => void this.loadProduct(productId, variantId));
    });

    effect(() => {
      const group = this.group();
      const variantId = this.selectedVariantId();
      if (!group || !variantId) return;
      setTimeout(() =>
        document
          .getElementById(`product-variant-${variantId}`)
          ?.scrollIntoView({ block: 'nearest' })
      );
    });
  }

  ngOnDestroy(): void {
    this.clearShareFeedback();
  }

  private async loadProduct(productId: string | null, variantId: string | null): Promise<void> {
    const request = ++this.productRequest;
    if (this.activeProductId !== productId) {
      this.activeProductId = productId;
      this.resetDetailPanels();
    }
    this.loadedGroup.set(null);
    this.loadError.set(null);
    if (!productId) return;
    void this.publicProductLinks.load().catch(() => undefined);
    if (this.cachedGroup(productId)) return;
    try {
      const group = await this.pos.productGroupById(productId, variantId);
      if (request !== this.productRequest) return;
      if (!group) throw new Error('Product not found');
      this.loadedGroup.set(group);
    } catch (error) {
      if (request !== this.productRequest) return;
      this.loadError.set(error instanceof Error ? error.message : 'Could not load product');
    }
  }

  private cachedGroup(productId: string): ProductGroup | null {
    const family = this.catalogCache.families().find(item => item.id === productId);
    if (!family) return null;
    return {
      family,
      variants: this.catalogCache.catalog().filter(variant => variant.product_id === productId),
    };
  }

  protected manufacturerName(id: string | null): string | null {
    if (!id) return null;
    return (
      this.catalogCache.manufacturers().find(manufacturer => manufacturer.id === id)?.name ??
      this.catalogCache.catalog().find(variant => variant.manufacturer_id === id)
        ?.manufacturer_name ??
      null
    );
  }

  protected productCategoryNames(productId: string): string[] {
    const ids = new Set(
      this.catalogCache
        .productCategories()
        .filter(link => link.product_id === productId)
        .map(link => link.category_id)
    );
    return this.catalogCache
      .categories()
      .filter(category => ids.has(category.id))
      .map(category => category.name);
  }

  protected categoryDataStatusLabel(): string {
    return this.connectivity.online()
      ? 'Refreshing category data…'
      : 'Reconnect to load category data.';
  }

  protected familyBarcodeAmbiguous(group: ProductGroup): boolean {
    const shared = group.family.barcode?.trim();
    return !!shared && group.variants.filter(variant => variant.barcode === shared).length > 1;
  }

  protected familyStock(variants: Variant[]): number {
    return variants.reduce(
      (sum, variant) =>
        sum +
        (variant.kind === 'service' || !variant.track_inventory || !variant.variant_id
          ? 0
          : (this.stockOf(variant.variant_id)?.stock ?? 0)),
      0
    );
  }

  protected familyTracksInventory(variants: Variant[]): boolean {
    return variants.some(variant => variant.kind !== 'service' && variant.track_inventory);
  }

  protected familyRetailStockValue(variants: Variant[]): number {
    return variants.reduce((sum, variant) => sum + this.variantRetailStockValue(variant), 0);
  }

  protected variantRetailStockValue(variant: Variant): number {
    const quantity = this.stockOf(variant.variant_id ?? '')?.stock ?? 0;
    return quantity * (variant.price ?? 0);
  }

  protected stockOf(variantId: string): StockInfo | undefined {
    const cached = this.catalogCache.stock().get(variantId);
    if (cached) return cached;
    const variant = this.group()?.variants.find(item => item.variant_id === variantId);
    if (!variant) return undefined;
    return {
      stock: Number(variant.stock ?? 0),
      stock_value: Number(variant.stock_value ?? 0),
    };
  }

  protected supplierStockOf(variantId: string): SupplierStockRow | undefined {
    return this.supplierStock().get(variantId);
  }

  protected canShareProduct(group: ProductGroup): boolean {
    return group.family.active && group.variants.some(variant => variant.variant_active);
  }

  protected async shareProduct(group: ProductGroup): Promise<void> {
    if (this.shareBusy()) return;
    this.shareBusy.set(true);
    this.clearShareFeedback();
    try {
      const url = await this.publicProductLinks.productUrl(group.family.id);
      if (!url) throw new Error('This product is not available on the public storefront.');
      if (navigator.share) {
        // URL-only lets WhatsApp build the current preview through the public renderer.
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        this.showShareFeedback('success', 'Product link copied');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.showShareFeedback(
        'error',
        error instanceof Error ? error.message : 'Could not share product'
      );
    } finally {
      this.shareBusy.set(false);
    }
  }

  protected async toggleBatches(variantId: string): Promise<void> {
    if (this.batchesFor() === variantId) {
      this.batchesFor.set(null);
      return;
    }
    this.batchesFor.set(variantId);
    try {
      this.batches.set(await this.pos.variantBatches(variantId));
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Failed to load batches');
    }
  }

  protected async togglePurchaseHistory(variantId: string): Promise<void> {
    if (this.purchaseHistoryFor() === variantId) {
      this.purchaseHistoryRequest++;
      this.purchaseHistoryFor.set(null);
      this.purchaseHistoryLoading.set(false);
      return;
    }
    this.purchaseHistoryRequest++;
    this.purchaseHistoryLoading.set(false);
    this.purchaseHistoryFor.set(variantId);
    this.purchaseHistory.set([]);
    this.purchaseHistoryTotal.set(0);
    await this.loadMorePurchaseHistory(variantId);
  }

  protected async loadMorePurchaseHistory(variantId: string): Promise<void> {
    if (this.purchaseHistoryLoading() || this.purchaseHistoryFor() !== variantId) return;
    const request = ++this.purchaseHistoryRequest;
    this.purchaseHistoryLoading.set(true);
    try {
      const result = await this.money.variantPurchaseHistory(
        variantId,
        this.purchaseHistory().length,
        25
      );
      if (request !== this.purchaseHistoryRequest || this.purchaseHistoryFor() !== variantId) {
        return;
      }
      this.purchaseHistory.update(rows => [...rows, ...result.rows]);
      this.purchaseHistoryTotal.set(result.total);
    } catch (error) {
      if (request === this.purchaseHistoryRequest && this.purchaseHistoryFor() === variantId) {
        this.loadError.set(
          error instanceof Error ? error.message : 'Could not load purchase history'
        );
      }
    } finally {
      if (request === this.purchaseHistoryRequest) this.purchaseHistoryLoading.set(false);
    }
  }

  protected supplierName(supplierId: string): string {
    const supplier = this.parties.suppliers().find(item => item.id === supplierId);
    return supplier
      ? [supplier.first_name, supplier.last_name].filter(Boolean).join(' ')
      : 'Unknown supplier';
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  private resetDetailPanels(): void {
    this.batchesFor.set(null);
    this.batches.set([]);
    this.purchaseHistoryRequest++;
    this.purchaseHistoryFor.set(null);
    this.purchaseHistory.set([]);
    this.purchaseHistoryTotal.set(0);
    this.purchaseHistoryLoading.set(false);
  }

  private showShareFeedback(kind: ShareFeedback['kind'], message: string): void {
    this.clearShareFeedback();
    this.shareFeedback.set({ kind, message });
    this.shareFeedbackTimer = setTimeout(() => this.clearShareFeedback(), 4_000);
  }

  private clearShareFeedback(): void {
    if (this.shareFeedbackTimer) clearTimeout(this.shareFeedbackTimer);
    this.shareFeedbackTimer = null;
    this.shareFeedback.set(null);
  }
}
