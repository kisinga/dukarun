import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ConnectivityService } from '../offline/connectivity.service';
import { BarcodeScannerComponent } from '../../shared/ui/barcode-scanner.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { SellCatalogStore } from './sell-catalog.store';

/**
 * Counter-facing product finder for Sell.
 *
 * This is intentionally a smart feature component: search, category browsing and barcode
 * handling are one operational workflow at the till. The parent receives only cart/payment
 * consequences through CartService and stays focused on completing the sale.
 */
@Component({
  selector: 'app-sell-catalog-panel',
  imports: [
    ReactiveFormsModule,
    BarcodeScannerComponent,
    ButtonComponent,
    IconComponent,
    MoneyComponent,
  ],
  template: `
    <section class="card order-1 min-w-0 bg-base-100 xl:col-start-1 xl:row-start-1 xl:h-full">
      <div class="card-body p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="type-heading">Add products</h2>
            <p class="mt-0.5 text-sm text-base-content/60">
              Search by product, manufacturer, or SKU, or scan a barcode.
            </p>
          </div>
          @if (itemCount() > 0) {
            <span class="badge badge-primary shrink-0"> {{ itemCount() }} in cart </span>
          }
        </div>

        <div class="mt-3 flex gap-2">
          <div class="relative min-w-0 flex-1">
            <span
              class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50"
            >
              <app-icon name="heroMagnifyingGlass" size="lg" />
            </span>
            <input
              #productSearch
              type="search"
              data-learning-anchor="sell-product-search"
              class="search-with-custom-clear input input-bordered min-h-11 w-full pr-12 pl-11"
              placeholder="Search or scan barcode..."
              autocomplete="off"
              aria-label="Search products or scan barcode"
              [formControl]="catalog.search"
              (keydown)="catalog.onSearchKeydown($event)"
            />
            @if (catalog.search.value) {
              <button
                appButton
                variant="ghost"
                size="md"
                [iconOnly]="true"
                type="button"
                class="absolute inset-y-0 right-0 my-auto mr-1"
                aria-label="Clear product search"
                (click)="catalog.clearSearch()"
              >
                <app-icon name="heroXMark" />
              </button>
            }
          </div>
          <button
            appButton
            variant="outline"
            size="md"
            type="button"
            data-learning-anchor="sell-barcode-scan"
            class="min-h-11"
            (click)="catalog.openScanner()"
          >
            <app-icon name="heroCamera" /> <span class="hidden sm:inline">Scan</span>
          </button>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="type-caption">
              {{ catalog.catalogSectionLabel() }}
            </p>
            @if (catalog.selectedCategory(); as category) {
              @if (!catalog.searchMode()) {
                <p class="truncate text-sm font-semibold">{{ category.name }}</p>
              }
            }
          </div>
          <div class="join shrink-0" role="group" aria-label="Product catalogue view">
            <button
              appButton
              type="button"
              variant="outline"
              size="sm"
              class="join-item"
              aria-label="Grid view"
              title="Grid view"
              [attr.aria-pressed]="catalog.catalogView() === 'grid'"
              [class.btn-active]="catalog.catalogView() === 'grid'"
              (click)="catalog.setCatalogView('grid')"
            >
              <app-icon name="heroSquares2x2" />
              <span class="hidden sm:inline">Grid</span>
            </button>
            <button
              appButton
              type="button"
              variant="outline"
              size="sm"
              class="join-item"
              aria-label="List view"
              title="List view"
              [attr.aria-pressed]="catalog.catalogView() === 'list'"
              [class.btn-active]="catalog.catalogView() === 'list'"
              (click)="catalog.setCatalogView('list')"
            >
              <app-icon name="heroBars3" />
              <span class="hidden sm:inline">List</span>
            </button>
            <button
              appButton
              type="button"
              variant="outline"
              size="sm"
              class="join-item"
              aria-label="Categories view"
              title="Categories view"
              [attr.aria-pressed]="catalog.catalogView() === 'categories'"
              [class.btn-active]="catalog.catalogView() === 'categories'"
              (click)="catalog.setCatalogView('categories')"
            >
              <app-icon name="heroQueueList" />
              <span class="hidden sm:inline">Categories</span>
            </button>
          </div>
        </div>

        @if (catalog.catalogView() === 'categories' && !catalog.searchMode()) {
          @if (!catalog.catalogCache.categoryMembershipsComplete()) {
            <div role="status" class="alert alert-warning mt-3 text-sm">
              <app-icon name="heroSignalSlash" />
              <span>
                {{
                  connectivity.online()
                    ? 'Refreshing category browsing...'
                    : 'Reconnect to load category browsing for this catalogue.'
                }}
              </span>
            </div>
          } @else if (catalog.selectedCategory(); as category) {
            <div class="mt-3 flex items-center justify-between gap-2">
              <button
                appButton
                type="button"
                variant="ghost"
                size="sm"
                (click)="catalog.leaveCategory()"
              >
                <app-icon name="heroChevronLeft" /> All categories
              </button>
              <span class="type-caption">{{ catalog.categoryItems().length }} options</span>
            </div>
          } @else {
            <label class="input input-bordered input-sm mt-3 flex items-center gap-2">
              <app-icon name="heroMagnifyingGlass" class="text-base-content/50" />
              <input
                type="search"
                class="min-w-0 grow"
                placeholder="Search categories..."
                [value]="catalog.categorySearch()"
                (input)="catalog.setCategorySearch($any($event.target).value)"
              />
            </label>
            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              @for (category of catalog.categoryDirectory(); track category.id) {
                <button
                  type="button"
                  class="min-h-24 rounded-box border border-base-300/70 bg-base-100 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  (click)="catalog.openCategory(category.id)"
                >
                  <span class="line-clamp-2 text-sm font-semibold">{{ category.name }}</span>
                  <span class="type-caption mt-3 block">
                    {{ category.productCount }}
                    {{ category.productCount === 1 ? 'product' : 'products' }} &middot;
                    {{ category.optionCount }} options
                  </span>
                </button>
              } @empty {
                <div class="col-span-full py-6 text-center">
                  <p class="text-sm font-medium">No categories found</p>
                  <p class="mt-1 text-sm text-base-content/60">
                    {{
                      catalog.categorySearch().trim()
                        ? 'Try another category name.'
                        : 'Active categories with products appear here.'
                    }}
                  </p>
                </div>
              }
            </div>
          }
        }

        @if (catalog.showProductResults()) {
          @if (catalog.resultPresentation() === 'list') {
            <div class="mt-2 overflow-hidden rounded-box border border-base-300/70">
              @for (v of catalog.visibleCatalogItems(); track v.variant_id) {
                <button
                  type="button"
                  class="flex min-h-16 w-full items-center gap-3 border-b border-base-200 px-3 py-2 text-left transition-colors last:border-0 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45"
                  [disabled]="catalog.unavailable(v)"
                  (click)="catalog.addVariant(v)"
                >
                  @if (catalog.imageUrl(v.image_path); as thumb) {
                    @if (!catalog.brokenImages().has(v.image_path!)) {
                      <img
                        [src]="thumb"
                        alt=""
                        class="h-11 w-11 shrink-0 rounded-field object-cover"
                        (error)="catalog.markBroken(v.image_path!)"
                      />
                    } @else {
                      <span
                        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-base-200"
                        ><app-icon name="heroCube" size="lg"
                      /></span>
                    }
                  } @else {
                    <span
                      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-base-200"
                      ><app-icon name="heroCube" size="lg"
                    /></span>
                  }
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-base-content/55">{{
                      v.manufacturer_name || 'Manufacturer not set'
                    }}</span>
                    <span class="line-clamp-2 text-sm font-semibold">{{ catalog.label(v) }}</span>
                  </span>
                  <span class="shrink-0 text-right">
                    @if (catalog.quantityInCart(v.variant_id) > 0) {
                      <span class="badge badge-primary badge-sm mb-1">{{
                        catalog.quantityInCart(v.variant_id)
                      }}</span>
                    } @else if (catalog.unavailable(v)) {
                      <span class="badge badge-error badge-sm mb-1">Out</span>
                    }
                    <span class="block text-sm font-bold"
                      ><app-money [amount]="v.price ?? 0"
                    /></span>
                    <span class="block text-xs text-base-content/50">{{
                      catalog.stockLabel(v)
                    }}</span>
                  </span>
                </button>
              }
            </div>
          } @else {
            <div
              class="mt-2 snap-x gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 xl:grid-cols-4"
              [class.flex]="catalog.quickAddMode()"
              [class.grid]="!catalog.quickAddMode()"
              [class.grid-cols-2]="!catalog.quickAddMode()"
            >
              @for (v of catalog.visibleCatalogItems(); track v.variant_id) {
                <button
                  type="button"
                  class="group relative flex h-32 min-h-32 shrink-0 snap-start flex-col items-start gap-1 overflow-hidden rounded-box border border-base-300/70 bg-base-100 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                  [class.w-36]="catalog.quickAddMode()"
                  [class.w-full]="!catalog.quickAddMode()"
                  [disabled]="catalog.unavailable(v)"
                  (click)="catalog.addVariant(v)"
                >
                  <div class="flex w-full min-w-0 items-start gap-2">
                    @if (catalog.imageUrl(v.image_path); as thumb) {
                      @if (!catalog.brokenImages().has(v.image_path!)) {
                        <img
                          [src]="thumb"
                          alt=""
                          class="h-10 w-10 shrink-0 rounded-field object-cover"
                          (error)="catalog.markBroken(v.image_path!)"
                        />
                      } @else {
                        <span
                          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-base-200"
                          ><app-icon name="heroCube" size="lg"
                        /></span>
                      }
                    } @else {
                      <span
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-base-200"
                        ><app-icon name="heroCube" size="lg"
                      /></span>
                    }
                    <span class="min-w-0 flex-1 truncate pt-0.5 text-xs text-base-content/55">{{
                      v.manufacturer_name || 'Manufacturer not set'
                    }}</span>
                    @if (catalog.quantityInCart(v.variant_id) > 0) {
                      <span class="badge badge-primary badge-sm shrink-0">{{
                        catalog.quantityInCart(v.variant_id)
                      }}</span>
                    } @else if (catalog.unavailable(v)) {
                      <span class="badge badge-error badge-sm shrink-0">Out</span>
                    }
                  </div>
                  <span class="line-clamp-2 text-sm leading-tight font-semibold">{{
                    catalog.label(v)
                  }}</span>
                  <span class="mt-auto flex w-full items-end justify-between gap-1">
                    <span class="text-sm font-bold whitespace-nowrap"
                      ><app-money [amount]="v.price ?? 0"
                    /></span>
                    <span
                      class="text-right text-xs whitespace-nowrap"
                      [class.text-error]="catalog.unavailable(v)"
                      [class.text-base-content/50]="!catalog.unavailable(v)"
                      >{{ catalog.stockLabel(v) }}</span
                    >
                  </span>
                </button>
              }
            </div>
          }

          @if (catalog.visibleCatalogItems().length === 0) {
            <div class="py-6 text-center">
              <p class="text-sm font-medium">No matching products</p>
              <p class="mt-1 text-sm text-base-content/60">
                {{
                  catalog.searchMode()
                    ? "Check the spelling or scan the item's barcode."
                    : 'This category has no sellable options.'
                }}
              </p>
            </div>
          }
          @if (catalog.canShowMoreCategoryItems()) {
            <div class="mt-3 flex justify-center">
              <button
                appButton
                type="button"
                variant="outline"
                size="sm"
                (click)="catalog.showMoreCategoryItems()"
              >
                Show more
              </button>
            </div>
          }
        }
      </div>
    </section>

    @if (catalog.scannerOpen()) {
      <app-barcode-scanner
        (scanned)="catalog.barcodeScanned($event)"
        (close)="catalog.closeScanner()"
      />
    }
  `,
})
export class SellCatalogPanelComponent implements OnInit {
  protected readonly catalog = inject(SellCatalogStore);
  protected readonly connectivity = inject(ConnectivityService);
  private readonly productSearch = viewChild<ElementRef<HTMLInputElement>>('productSearch');

  readonly itemCount = input.required<number>();
  readonly wedgeBlocked = input(false);

  constructor() {
    let lastFocusRequest = this.catalog.focusSearchRequest();
    effect(() => {
      const request = this.catalog.focusSearchRequest();
      if (request === lastFocusRequest) return;
      lastFocusRequest = request;
      queueMicrotask(() => this.productSearch()?.nativeElement.focus({ preventScroll: true }));
    });
  }

  ngOnInit(): void {
    this.catalog.restoreCatalogView();
    void this.catalog.loadTopVariants();
  }

  /** Keep scanner-gun input local to the catalog workflow while modals are closed. */
  @HostListener('window:keydown', ['$event'])
  protected captureWedgeInput(event: KeyboardEvent): void {
    if (this.wedgeBlocked()) return;
    this.catalog.captureWedgeInput(event);
  }
}
