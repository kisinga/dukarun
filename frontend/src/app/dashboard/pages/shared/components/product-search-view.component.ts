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
import {
  ProductSearchResult,
  ProductVariant,
} from '../../../../core/services/product/product-search.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { ProductLabelComponent } from './product-label.component';
import type { VariantListItem } from './variant-list.component';
import { VariantListComponent } from './variant-list.component';

/**
 * Shared product search UI: card with search input, optional camera/action button,
 * and a list of product results (image, label, variant count, expandable variants).
 * Used on sell and purchase pages for consistent UX.
 * Search matches when all words appear in product name or manufacturer.
 *
 * Variant selection guard (contract):
 * - `restrictVariantSelectionToInStock`: when true (default), out-of-stock variants are
 *   disabled (preventive toggle); when false, all variants are selectable (e.g. purchase/restock).
 *   The "Out of stock" indicator is always shown for OOS variants for information; only the
 *   ability to select them is controlled by this input. Set to false on purchase page so
 *   OOS items can be selected.
 *
 * Results-only mode (resultsOnly = true): hides the search input and shows only the
 * product list. Used by sell page Quick Select to reuse the same list UI and handlers.
 */
@Component({
  selector: 'app-product-search-view',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductLabelComponent, VariantListComponent],
  template: `
    <div class="card bg-base-100 shadow-lg border border-base-200">
      <div
        class="card-body"
        [class.p-3]="!compact()"
        [class.md:p-4]="!compact()"
        [class.p-3]="compact()"
      >
        @if (!resultsOnly()) {
          <div
            class="rounded-xl border border-base-300 bg-base-200/50 px-3 py-2.5 flex items-center gap-2"
          >
            <!-- Search Icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-base-content/60 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>

            <!-- Search Input -->
            <input
              type="text"
              class="input input-ghost flex-1 text-base p-0 focus:outline-none min-h-0 h-auto bg-transparent"
              [placeholder]="placeholder()"
              title="Search by name or manufacturer"
              [(ngModel)]="searchTerm"
              (ngModelChange)="searchTermChange.emit($event)"
            />

            <!-- Camera Toggle Button (when searching or on mobile) -->
            @if (shouldShowCameraButton()) {
              <button
                class="btn btn-circle btn-sm btn-primary"
                (click)="cameraToggle.emit()"
                aria-label="Back to camera"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            }
          </div>
        }

        <!-- Search Results -->
        @if (searchResults().length > 0) {
          <div
            class="mt-3 space-y-3 overflow-y-auto"
            [class.max-h-[60vh]]="!compact()"
            [class.max-h-[40vh]]="compact()"
          >
            @for (product of searchResults(); track product.id) {
              <div class="border border-base-300 rounded-lg overflow-hidden bg-base-100">
                <div class="flex items-stretch min-h-11">
                  <!-- Expansion icon (left, for all products) -->
                  <button
                    type="button"
                    class="w-10 min-h-[2.75rem] shrink-0 flex items-center justify-center text-base-content/60 hover:text-base-content hover:bg-base-300/50 transition-colors border-r border-base-300"
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      } @else {
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      }
                    } @else {
                      <span
                        class="w-4 h-0.5 rounded bg-base-content/30 block shrink-0"
                        aria-hidden="true"
                      ></span>
                    }
                  </button>
                  <!-- Product row (image, info, add) -->
                  <button
                    class="flex-1 flex items-center gap-3 p-3 min-h-11 bg-base-200 hover:bg-base-300 transition-colors text-left"
                    (click)="productSelected.emit(product)"
                  >
                    <!-- Product Image -->
                    @if (product.featuredAsset) {
                      <img
                        [src]="product.featuredAsset.preview"
                        [alt]="product.name"
                        class="w-10 h-10 rounded object-cover shrink-0"
                      />
                    } @else {
                      <div
                        class="w-10 h-10 rounded bg-base-300 flex items-center justify-center shrink-0"
                      >
                        @if (isService(product)) {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5 text-accent"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        } @else {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5 text-primary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                          </svg>
                        }
                      </div>
                    }

                    <!-- Product Info -->
                    <div class="flex-1 min-w-0">
                      <app-product-label
                        [productName]="product.name"
                        [facetValues]="product.facetValues ?? []"
                      />
                      <div class="text-xs text-base-content/70">
                        {{ product.variants.length }} variant{{
                          product.variants.length > 1 ? 's' : ''
                        }}
                      </div>
                    </div>

                    <!-- Stock (single-variant only) -->
                    @if (product.variants.length === 1) {
                      <div class="text-right shrink-0">
                        <div class="text-[10px] uppercase tracking-wider text-base-content/50">
                          Stock
                        </div>
                        <div class="text-sm font-mono tabular-nums">
                          {{ getSingleVariantStock(product) }}
                        </div>
                      </div>
                    }

                    <!-- Add Icon -->
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 text-primary shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                </div>
                <!-- Variant list (when expanded) — same panel as products page -->
                @if (product.variants.length > 1 && isExpanded(product.id)) {
                  <div class="border-t border-base-300 bg-base-200/60 pr-2 pb-1.5 pt-0">
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

  onVariantItemSelected(item: VariantListItem, product: ProductSearchResult): void {
    const variant = product.variants?.find((v) => v.sku === item.sku);
    if (variant) {
      this.variantSelected.emit({ product, variant });
    }
  }
}
