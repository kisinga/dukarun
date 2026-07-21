import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ProductSearchResult, ProductVariant } from '@dukarun/product';
import { NgIcon } from '@ng-icons/core';
import { CurrencyService } from '../../../services/currency.service';
import { ProductLabelComponent } from './product-label.component';
import type { VariantListItem } from './variant-list.component';
import { VariantListComponent } from './variant-list.component';

/**
 * Shared product search UI: card with search input, optional camera/action button,
 * and a list of product results (image, label, variant count, expandable variants).
 * Used on sell and purchase pages for consistent UX.
 *
 * Search does not filter by availability; the search service returns all matching products.
 * Callers decide how to handle out-of-stock items via `restrictVariantSelectionToInStock`:
 *
 * - When true (default, e.g. sell page): single-variant OOS rows are not selectable (disabled
 *   styling, no click), and OOS variant rows in the expandable list are disabled. Stock shown in red for OOS.
 * - When false (e.g. purchases page): all products and variants are selectable; OOS is informational only.
 *
 * Results-only mode (resultsOnly = true): hides the search input and shows only the
 * product list. Used by sell page Quick Select to reuse the same list UI and handlers.
 */
@Component({
  selector: 'app-product-search-view',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIcon, ProductLabelComponent, VariantListComponent],
  template: `
    @if (resultsOnly()) {
      <!-- List only: no card (parent e.g. Quick Select is the card) -->
      @if (searchResults().length > 0) {
        <div
          class="divide-y divide-base-300 overflow-y-auto"
          [class.max-h-[40vh]]="compact()"
          [class.max-h-[50vh]]="!compact()"
        >
          @for (product of searchResults(); track product.id) {
            @let expanded = product.variants.length > 1 && isExpanded(product.id);
            <div class="bg-base-100">
              <div class="flex items-center py-1.5 pl-2 pr-2 gap-0 min-h-0">
                <button
                  type="button"
                  class="w-12 shrink-0 flex items-center justify-center gap-0.5 text-base-content/50 hover:text-base-content transition-colors py-1"
                  [class.cursor-pointer]="product.variants.length > 1"
                  [class.cursor-default]="product.variants.length <= 1"
                  [attr.aria-label]="
                    product.variants.length > 1
                      ? isExpanded(product.id)
                        ? 'Collapse variants'
                        : 'Expand variants'
                      : 'Single variant'
                  "
                  (click)="onExpandClick($event, product)"
                >
                  @if (product.variants.length > 1) {
                    @if (isExpanded(product.id)) {
                      <ng-icon name="heroChevronDown" size="1rem" class="shrink-0" />
                    } @else {
                      <ng-icon name="heroChevronRight" size="1rem" class="shrink-0" />
                    }
                    <span class="badge badge-xs badge-ghost text-base-content/60">{{
                      product.variants.length
                    }}</span>
                  } @else {
                    <span
                      class="w-3 h-0.5 rounded bg-base-content/30 block shrink-0"
                      aria-hidden="true"
                    ></span>
                  }
                </button>
                <button
                  type="button"
                  class="flex-1 flex items-center gap-2 min-w-0 py-1 pl-2 pr-1 bg-base-100 transition-colors text-left"
                  [class.hover:bg-base-200]="isProductRowSelectable(product)"
                  [class.cursor-pointer]="isProductRowSelectable(product)"
                  [class.cursor-not-allowed]="!isProductRowSelectable(product)"
                  [class.opacity-60]="!isProductRowSelectable(product)"
                  (click)="onProductRowClick(product)"
                >
                  @if (product.featuredAsset) {
                    <img
                      [src]="product.featuredAsset.preview"
                      [alt]="product.name"
                      class="w-8 h-8 rounded object-cover shrink-0"
                    />
                  } @else {
                    <div
                      class="w-8 h-8 rounded bg-base-300 flex items-center justify-center shrink-0"
                    >
                      @if (isService(product)) {
                        <ng-icon name="heroCog6Tooth" size="1rem" class="text-accent" />
                      } @else {
                        <ng-icon name="heroCube" size="1rem" class="text-primary" />
                      }
                    </div>
                  }
                  <div class="flex-1 min-w-0">
                    <app-product-label
                      [productName]="product.name"
                      [facetValues]="product.facetValues ?? []"
                    />
                  </div>
                  <div class="w-14 shrink-0 text-right">
                    <div class="text-xs uppercase tracking-wider text-base-content/70">Stock</div>
                    <div
                      class="text-xs font-mono tabular-nums"
                      [class.text-error]="isSingleVariantOutOfStock(product)"
                      [class.text-base-content]="!isSingleVariantOutOfStock(product)"
                    >
                      {{ product.variants.length === 1 ? getSingleVariantStock(product) : '—' }}
                    </div>
                  </div>
                  <div class="w-16 shrink-0 text-right">
                    <div class="text-xs uppercase tracking-wider text-base-content/70">Price</div>
                    <div class="text-xs font-mono tabular-nums text-base-content">
                      {{
                        product.variants.length === 1
                          ? currencyService.format(product.variants[0].priceWithTax, false)
                          : '—'
                      }}
                    </div>
                  </div>
                </button>
              </div>
              @if (expanded) {
                <div class="bg-base-200 pl-2 pr-2 pb-1.5 pt-0.5">
                  <app-variant-list
                    [variants]="getVariantListItems(product)"
                    [display]="'table'"
                    [selectable]="true"
                    (variantSelected)="onVariantItemSelected($event, product)"
                  />
                </div>
              }
            </div>
          }
        </div>
      }
    } @else {
      <!-- Search mode: one card with search input + list -->
      <div class="card bg-base-100 shadow-md border border-base-300">
        <div class="card-body p-3 md:p-4">
          <div
            class="rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 flex items-center gap-2"
          >
            <ng-icon
              name="heroMagnifyingGlass"
              size="1.25rem"
              class="text-base-content/60 shrink-0"
            />
            <input
              type="text"
              class="input input-ghost flex-1 text-base p-0 focus:outline-none min-h-0 h-auto bg-transparent"
              [placeholder]="placeholder()"
              title="Search by name or manufacturer"
              [(ngModel)]="searchTerm"
              (ngModelChange)="searchTermChange.emit($event)"
            />
            @if (shouldShowCameraButton()) {
              <button
                class="btn btn-circle btn-sm btn-primary"
                (click)="cameraToggle.emit()"
                aria-label="Back to camera"
              >
                <ng-icon name="heroCamera" size="1.25rem" />
              </button>
            }
          </div>
          @if (searchResults().length > 0) {
            <div
              class="mt-2 divide-y divide-base-300 overflow-y-auto -mx-1 px-1"
              [class.max-h-[55vh]]="!compact()"
              [class.max-h-[35vh]]="compact()"
            >
              @for (product of searchResults(); track product.id) {
                @let expanded = product.variants.length > 1 && isExpanded(product.id);
                <div class="bg-base-100">
                  <div class="flex items-center py-1.5 pl-2 pr-2 gap-0 min-h-0">
                    <button
                      type="button"
                      class="w-12 shrink-0 flex items-center justify-center gap-0.5 text-base-content/50 hover:text-base-content transition-colors py-1"
                      [class.cursor-pointer]="product.variants.length > 1"
                      [class.cursor-default]="product.variants.length <= 1"
                      [attr.aria-label]="
                        product.variants.length > 1
                          ? isExpanded(product.id)
                            ? 'Collapse variants'
                            : 'Expand variants'
                          : 'Single variant'
                      "
                      (click)="onExpandClick($event, product)"
                    >
                      @if (product.variants.length > 1) {
                        @if (isExpanded(product.id)) {
                          <ng-icon name="heroChevronDown" size="1rem" class="shrink-0" />
                        } @else {
                          <ng-icon name="heroChevronRight" size="1rem" class="shrink-0" />
                        }
                        <span class="badge badge-xs badge-ghost text-base-content/60">{{
                          product.variants.length
                        }}</span>
                      } @else {
                        <span
                          class="w-3 h-0.5 rounded bg-base-content/30 block shrink-0"
                          aria-hidden="true"
                        ></span>
                      }
                    </button>
                    <button
                      type="button"
                      class="flex-1 flex items-center gap-2 min-w-0 py-1 pl-2 pr-1 bg-base-100 transition-colors text-left"
                      [class.hover:bg-base-200]="isProductRowSelectable(product)"
                      [class.cursor-pointer]="isProductRowSelectable(product)"
                      [class.cursor-not-allowed]="!isProductRowSelectable(product)"
                      [class.opacity-60]="!isProductRowSelectable(product)"
                      (click)="onProductRowClick(product)"
                    >
                      @if (product.featuredAsset) {
                        <img
                          [src]="product.featuredAsset.preview"
                          [alt]="product.name"
                          class="w-8 h-8 rounded object-cover shrink-0"
                        />
                      } @else {
                        <div
                          class="w-8 h-8 rounded bg-base-300 flex items-center justify-center shrink-0"
                        >
                          @if (isService(product)) {
                            <ng-icon name="heroCog6Tooth" size="1rem" class="text-accent" />
                          } @else {
                            <ng-icon name="heroCube" size="1rem" class="text-primary" />
                          }
                        </div>
                      }
                      <div class="flex-1 min-w-0">
                        <app-product-label
                          [productName]="product.name"
                          [facetValues]="product.facetValues ?? []"
                        />
                      </div>
                      <div class="w-14 shrink-0 text-right">
                        <div class="text-xs uppercase tracking-wider text-base-content/70">
                          Stock
                        </div>
                        <div
                          class="text-xs font-mono tabular-nums"
                          [class.text-error]="isSingleVariantOutOfStock(product)"
                          [class.text-base-content]="!isSingleVariantOutOfStock(product)"
                        >
                          {{ product.variants.length === 1 ? getSingleVariantStock(product) : '—' }}
                        </div>
                      </div>
                      <div class="w-16 shrink-0 text-right">
                        <div class="text-xs uppercase tracking-wider text-base-content/70">
                          Price
                        </div>
                        <div class="text-xs font-mono tabular-nums text-base-content">
                          {{
                            product.variants.length === 1
                              ? currencyService.format(product.variants[0].priceWithTax, false)
                              : '—'
                          }}
                        </div>
                      </div>
                    </button>
                  </div>
                  @if (expanded) {
                    <div class="bg-base-200 pl-2 pr-2 pb-1.5 pt-0.5">
                      <app-variant-list
                        [variants]="getVariantListItems(product)"
                        [display]="'table'"
                        [selectable]="true"
                        (variantSelected)="onVariantItemSelected($event, product)"
                      />
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductSearchViewComponent implements OnDestroy {
  readonly searchResults = input.required<ProductSearchResult[]>();
  readonly isSearching = input<boolean>(false);
  readonly showCameraButton = input<boolean>(false);
  readonly placeholder = input<string>('Search by name or manufacturer');
  readonly compact = input<boolean>(false);
  /**
   * When true (default), out-of-stock variants are disabled and show "Out of stock".
   * When false, all variants are selectable (e.g. purchase page).
   */
  readonly restrictVariantSelectionToInStock = input<boolean>(true);
  /** When true, only the results list is shown (no search input). Used by Quick Select. */
  readonly resultsOnly = input<boolean>(false);
  /** When false, multi-variant products show variants collapsed. Used by Quick Select. */
  readonly variantsExpandedByDefault = input<boolean>(true);

  readonly searchTermChange = output<string>();
  readonly productSelected = output<ProductSearchResult>();
  readonly variantSelected = output<{ product: ProductSearchResult; variant: ProductVariant }>();
  readonly cameraToggle = output<void>();

  readonly currencyService = inject(CurrencyService);
  searchTerm = '';
  readonly isMobile = signal<boolean>(false);
  private resizeListener?: () => void;

  /** Product ids whose variant list is expanded. */
  readonly expandedProductIds = signal<Set<string>>(new Set());

  readonly shouldShowCameraButton = computed(() => {
    return this.isMobile() || this.showCameraButton();
  });

  constructor() {
    effect(() => {
      const results = this.searchResults();
      const byDefault = this.variantsExpandedByDefault();
      const next = new Set<string>();
      for (const p of results) {
        if (p.variants.length > 1 && byDefault) next.add(p.id);
      }
      this.expandedProductIds.set(next);
    });
    if (typeof window !== 'undefined') {
      this.checkMobile();
      this.resizeListener = () => this.checkMobile();
      window.addEventListener('resize', this.resizeListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  private checkMobile(): void {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 768);
    }
  }

  isService(product: ProductSearchResult): boolean {
    return product.variants?.some((v) => v.trackInventory === false) || false;
  }

  /** Stock display for single-variant products: "∞" if no inventory tracking, else remaining count. */
  getSingleVariantStock(product: ProductSearchResult): string {
    const v = product.variants?.[0];
    if (!v) return '–';
    if (v.trackInventory === false) return '∞';
    return String(v.stockOnHand ?? 0);
  }

  /** True when single-variant product is OOS and tracked (for styling stock in red). */
  isSingleVariantOutOfStock(product: ProductSearchResult): boolean {
    const v = product.variants?.[0];
    return !!(
      v &&
      product.variants!.length === 1 &&
      v.trackInventory !== false &&
      v.stockLevel === 'OUT_OF_STOCK'
    );
  }

  /**
   * When restrictVariantSelectionToInStock is true: single-variant OOS (tracked) rows are not selectable.
   * Multi-variant products remain selectable (user picks variant; OOS variants are disabled in the list).
   */
  isProductRowSelectable(product: ProductSearchResult): boolean {
    if (!this.restrictVariantSelectionToInStock()) return true;
    if (product.variants?.length !== 1) return true;
    const v = product.variants[0]!;
    return v.trackInventory === false || v.stockLevel !== 'OUT_OF_STOCK';
  }

  isExpanded(productId: string): boolean {
    return this.expandedProductIds().has(productId);
  }

  toggleExpanded(productId: string): void {
    this.expandedProductIds.update((s) => {
      const next = new Set(s);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  onExpandClick(event: Event, product: ProductSearchResult): void {
    event.stopPropagation();
    if (product.variants.length > 1) this.toggleExpanded(product.id);
  }

  getVariantListItems(product: ProductSearchResult): VariantListItem[] {
    return (product.variants ?? []).map((v) => ({
      name: v.name,
      sku: v.sku,
      priceWithTax: v.priceWithTax,
      stockOnHand: v.stockOnHand,
      trackInventory: v.trackInventory,
      isDisabled: this.restrictVariantSelectionToInStock() && v.stockLevel === 'OUT_OF_STOCK',
    }));
  }

  onProductRowClick(product: ProductSearchResult): void {
    if (this.isProductRowSelectable(product)) {
      this.productSelected.emit(product);
    }
  }

  onVariantItemSelected(item: VariantListItem, product: ProductSearchResult): void {
    const variant = product.variants?.find((v) => v.sku === item.sku);
    if (variant) {
      this.variantSelected.emit({ product, variant });
    }
  }
}
