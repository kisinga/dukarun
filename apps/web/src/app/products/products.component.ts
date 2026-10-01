import { bindListQuery, listQueryField } from '../shared/list/list-query';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { formatKes } from '../core/money';
import { SupabaseService } from '../core/supabase.service';
import { PosService, Product, SupplierStockRow, Variant } from '../pos/pos.service';
import { matchesCatalogQuery } from '../pos/catalog-search';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { sortList } from '../shared/ui/list-sort';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import {
  DataTableShellComponent,
  TableRowsDirective,
  TableHeaderDirective,
  type TableColumn,
} from '../shared/ui/data-table-shell.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { TaskDialogComponent } from '../shared/ui/task-dialog.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { WorkspaceNavigationComponent } from '../shared/ui/workspace-navigation.component';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { PermissionsService } from '../core/permissions.service';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { BarcodeLabelDialogComponent } from './barcode-label-dialog.component';
import { BatchProductCategoriesDialogComponent } from './batch-product-categories-dialog.component';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import { TaxService } from '../core/tax.service';
import type { TaxCategory } from '@dukarun/tax-types';
import { variantNeedsRestock } from './product-stock-status';
import { PartyCacheService } from '../core/party-cache.service';
import {
  ProductCategoriesPanelComponent,
  type ProductCategoryChangedResult,
} from './product-categories-panel.component';
import { ProductDetailDrawerComponent } from './product-detail-drawer.component';
import { ProductEditorComponent } from './product-editor.component';
import type { ProductEditorRequest, ProductEditorResult } from './product-editor.types';

type StockInfo = { stock: number; stock_value: number };
type ProductStatusFilter = 'all' | 'active' | 'inactive';
type StockStatusFilter = 'all' | 'needs_restock' | 'in_stock' | 'out_of_stock' | 'not_tracked';
type ManagementVariant = Variant & { stock_value?: number | null };
type ProductBulkAction = 'publish' | 'unpublish' | 'activate' | 'deactivate';
type ProductGroup = { family: Product; variants: ManagementVariant[] };
const DEFAULT_PRODUCT_STATUS_FILTER: ProductStatusFilter = 'active';

const PRODUCT_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'name', label: 'Product name' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'stock', label: 'Stock quantity' },
  { value: 'cost_value', label: 'Cost value' },
  { value: 'wholesale_value', label: 'Wholesale' },
  { value: 'retail_value', label: 'Retail' },
  { value: 'variants', label: 'Variant count' },
];

@Component({
  selector: 'app-products',
  imports: [
    TaskDialogComponent,
    EmptyStateComponent,
    PageLayoutComponent,
    StatusBadgeComponent,
    ListSearchBarComponent,
    PaginationComponent,
    DataTableShellComponent,
    TableRowsDirective,
    TableHeaderDirective,
    ButtonComponent,
    IconComponent,
    MoneyComponent,
    StatBarComponent,
    FormFieldComponent,
    BarcodeLabelDialogComponent,
    SearchableFilterComponent,
    BatchProductCategoriesDialogComponent,
    MobileListComponent,
    PageActionsComponent,
    WorkspaceNavigationComponent,
    ProductCategoriesPanelComponent,
    ProductDetailDrawerComponent,
    ProductEditorComponent,
    RouterLink,
  ],
  template: `
    <app-page
      title="Inventory"
      subtitle="Manage the catalog, pricing, variants, and the stock available to sell."
      [wide]="true"
    >
      <app-page-actions actions>
        <button
          utilityAction
          appButton
          variant="ghost"
          [iconOnly]="true"
          [loading]="loading()"
          type="button"
          title="Refresh products"
          aria-label="Refresh products"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
        <button
          overflowAction
          appButton
          variant="secondary"
          type="button"
          data-learning-anchor="product-print-labels"
          (click)="openCatalogueLabels()"
        >
          <app-icon name="heroPrinter" /> Print labels
        </button>
        <button
          overflowAction
          appButton
          variant="secondary"
          (click)="categoriesOpen.set(!categoriesOpen())"
        >
          <app-icon name="heroQueueList" /> Categories
        </button>
        <a overflowAction appButton variant="secondary" routerLink="/insights/inventory">
          <app-icon name="heroChartBar" /> Inventory intelligence
        </a>
        @if (perms.has('ManageStockAdjustments')) {
          <button
            primaryAction
            appButton
            variant="primary"
            data-learning-anchor="product-add"
            (click)="startFamilyCreate()"
          >
            <app-icon name="heroPlus" /> Add product
          </button>
        }
      </app-page-actions>

      <app-workspace-navigation workspace="inventory" label="Inventory" />

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }
      @if (catalogTruncated()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span
            >This catalogue exceeds the supported 10,000 active-variant cache. Enterprise is
            required.</span
          >
        </div>
      }

      <!-- Categories panel -->
      @if (categoriesOpen()) {
        <app-product-categories-panel
          [categories]="categories()"
          [canManageCatalog]="perms.has('ManageCatalog')"
          [online]="connectivity.online()"
          [membershipComplete]="categoryMembershipsComplete()"
          [dataStatusLabel]="categoryDataStatusLabel()"
          (changed)="categoryChanged($event)"
          (failed)="error.set($event)"
        />
      }

      @if (editorRequest(); as request) {
        <app-product-editor
          [request]="request"
          (saved)="productEditorSaved($event)"
          (closed)="productEditorClosed()"
        />
      }

      <!-- Search -->
      <app-list-search-bar
        searchLabel="Search products"
        [activeFilters]="activeListFilters()"
        (removeFilter)="removeListFilter($event)"
        placeholder="Search product, manufacturer, variant, SKU, or barcode…"
        [(searchQuery)]="query"
        [sortOptions]="productSortOptions"
        [(sortKey)]="productSort"
        [(sortDirection)]="productSortDirection"
        [activeFilterCount]="productActiveFilterCount()"
        (clearFilters)="clearProductFilters()"
      >
        <div summary class="grid gap-4 lg:grid-cols-2">
          <section class="min-w-0" aria-label="Product counts">
            <p class="type-caption mb-2">
              {{
                serverMode()
                  ? 'Matching products · variant counts on this page'
                  : 'Matching catalogue'
              }}
            </p>
            <app-stat-bar [stats]="productStats().slice(0, 3)" />
          </section>
          <section class="min-w-0" aria-label="Stock valuation">
            <p class="type-caption mb-2">
              Stock value · {{ serverMode() ? 'current page' : 'matching results' }}
            </p>
            <app-stat-bar [stats]="productStats().slice(3)" />
          </section>
        </div>
        <div quickFilters class="catalogue-filters">
          <app-form-field label="Status">
            <select
              class="select select-bordered w-full select-sm"
              aria-label="Product status"
              title="Product status"
              [value]="productStatusFilter()"
              (change)="setProductStatusFilter($event)"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </app-form-field>
          <app-form-field label="Stock status">
            <select
              class="select select-bordered w-full select-sm"
              aria-label="Stock status"
              [value]="stockStatusFilter()"
              (change)="setStockStatusFilter($event)"
            >
              <option value="all">All stock states</option>
              <option value="needs_restock">Needs restock</option>
              <option value="in_stock">In stock</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="not_tracked">Not tracked</option>
            </select>
          </app-form-field>
          <app-form-field label="Supplier">
            <app-searchable-filter
              class="block min-w-0"
              ariaLabel="Filter products by supplier"
              placeholder="All suppliers"
              emptyValue="all"
              searchPlaceholder="Search suppliers…"
              [options]="supplierOptions()"
              [value]="supplierFilter()"
              (valueChange)="setSupplierFilter($event)"
            />
          </app-form-field>
          <app-form-field label="Manufacturer">
            <app-searchable-filter
              class="block min-w-0"
              ariaLabel="Filter products by manufacturer"
              placeholder="All manufacturers"
              emptyValue="all"
              searchPlaceholder="Search manufacturers…"
              [options]="manufacturerFilterOptions()"
              [value]="manufacturerFilter()"
              (valueChange)="setManufacturerFilter($event)"
            />
          </app-form-field>
          @if (categoryMembershipsComplete()) {
            <app-form-field label="Category" class="catalogue-category-filter">
              <app-searchable-filter
                class="block min-w-0"
                ariaLabel="Filter products by category"
                placeholder="All categories"
                emptyValue="all"
                searchPlaceholder="Search categories…"
                [options]="categoryFilterOptions()"
                [value]="categoryFilter()"
                (valueChange)="setCategoryFilter($event)"
              />
            </app-form-field>
          }
        </div>
      </app-list-search-bar>

      @if (stockStatusFilter() === 'needs_restock') {
        <div class="alert mb-3 border-warning/30 bg-warning/5 text-sm" role="status">
          <app-icon name="heroExclamationTriangle" />
          <span>
            {{ needsRestockSummary().variants }} variants need restocking across
            {{ needsRestockSummary().products }} products · {{ activeLocationName() }}
          </span>
        </div>
      }
      @if (supplierFilter() !== 'all') {
        @if (supplierStockError()) {
          <div class="alert alert-error mb-3 text-sm" role="alert">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ supplierStockError() }}</span>
          </div>
        } @else {
          <div class="alert mb-3 border-info/30 bg-info/5 text-sm" role="status">
            @if (supplierStockLoading()) {
              <span class="loading loading-spinner loading-sm"></span>
              <span>Loading stock sourced from {{ selectedSupplierName() }}…</span>
            } @else {
              <app-icon name="heroTruck" />
              <span>
                {{ supplierStockSummary().variants }} stocked variants sourced from
                {{ selectedSupplierName() }} · {{ activeLocationName() }}
                @if (perms.has('ViewFinancials')) {
                  · <app-money [amount]="supplierStockValue()" /> cost value
                }
              </span>
            }
          </div>
        }
      }

      <div class="mb-3 flex flex-wrap items-center gap-3">
        <label class="flex min-h-11 items-center gap-2 lg:hidden">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            aria-label="Select page"
            [checked]="allPageProductsSelected()"
            [indeterminate]="somePageProductsSelected()"
            [disabled]="selectionLocked()"
            (change)="togglePageSelection()"
          />
          Select page
        </label>
        @if (selectedProductIds().size > 0) {
          <p class="min-w-0 flex-1 text-sm font-semibold">
            {{ selectedProductIds().size }} products selected
          </p>
          <button
            appButton
            variant="ghost"
            size="sm"
            type="button"
            [disabled]="selectionLocked()"
            (click)="clearSelection()"
          >
            Clear
          </button>
          <details #actions class="dropdown dropdown-end">
            <summary class="btn btn-soft btn-sm min-h-11">Actions</summary>
            <ul
              class="menu dropdown-content z-30 w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay"
            >
              @if (perms.has('ManageCatalog')) {
                <li>
                  <button
                    type="button"
                    [disabled]="writeDisabled() || !categoryMembershipsComplete()"
                    (click)="actions.open = false; batchCategoriesOpen.set(true)"
                  >
                    Categorize
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    [disabled]="writeDisabled()"
                    (click)="actions.open = false; confirmBulkAction('publish')"
                  >
                    Publish on storefront
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    [disabled]="writeDisabled()"
                    (click)="actions.open = false; confirmBulkAction('unpublish')"
                  >
                    Unpublish from storefront
                  </button>
                </li>
              }
              @if (perms.has('ManageStockAdjustments')) {
                <li>
                  <button
                    type="button"
                    [disabled]="writeDisabled()"
                    (click)="actions.open = false; confirmBulkAction('activate')"
                  >
                    Activate
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    [disabled]="writeDisabled()"
                    (click)="actions.open = false; confirmBulkAction('deactivate')"
                  >
                    Deactivate
                  </button>
                </li>
              }
              <li>
                <button
                  type="button"
                  [disabled]="writeDisabled()"
                  (click)="actions.open = false; prepareSelectedLabels()"
                >
                  Print selected labels
                </button>
              </li>
            </ul>
          </details>
        }
      </div>
      @if (labelsPreparing()) {
        <p role="status" class="mb-3 text-sm">Preparing selected labels…</p>
      }
      @if (bulkError()) {
        <div role="alert" class="alert alert-error mb-3">
          <span>{{ bulkError() }}</span>
          @if (bulkRefreshPending()) {
            <button
              appButton
              type="button"
              variant="outline"
              [disabled]="bulkBusy() || !connectivity.online()"
              (click)="retryBulkRefresh()"
            >
              Retry refresh
            </button>
          }
        </div>
      }
      @if (bulkConfirmation(); as confirmation) {
        <app-task-dialog
          [open]="true"
          [title]="bulkActionLabel(confirmation.action)"
          (closed)="closeBulkConfirmation()"
        >
          <p>
            {{ bulkActionLabel(confirmation.action) }} {{ confirmation.ids.length }} selected
            products?
          </p>
          @if (confirmation.action === 'deactivate') {
            <p class="mt-3 text-sm">
              Deactivation prevents internal selling and removes products from the storefront.
              Variant and publication settings are preserved.
            </p>
          } @else if (confirmation.action === 'activate') {
            <p class="mt-3 text-sm">
              Reactivation enables internal selling for active variants and can restore public
              visibility for published products.
            </p>
          } @else {
            <p class="mt-3 text-sm">
              This changes storefront and public API visibility. Internal selling is unaffected.
            </p>
          }
          <div taskFooter class="flex justify-end gap-2">
            <button
              appButton
              type="button"
              variant="ghost"
              [disabled]="bulkBusy()"
              (click)="closeBulkConfirmation()"
            >
              Cancel
            </button>
            <button
              appButton
              type="button"
              variant="primary"
              [disabled]="writeDisabled()"
              [loading]="bulkBusy()"
              (click)="saveBulkAction()"
            >
              {{ bulkActionLabel(confirmation.action) }}
            </button>
          </div>
        </app-task-dialog>
      }

      <!-- Grouped list -->
      @if (!loading() && !error() && grouped().length === 0) {
        <app-empty-state
          icon="heroCube"
          title="No products found"
          [description]="
            hasProductFilters()
              ? 'No products match the selected filters. Clear a filter or try another search.'
              : 'Add a product from the page header, or clear the search.'
          "
        />
      } @else {
        <app-mobile-list>
          @for (group of pagedGroups(); track group.family.id) {
            <div
              [attr.data-list-record]="group.family.id"
              mobileListRow
              class="cursor-pointer"
              role="button"
              tabindex="0"
              [class.border-primary]="selectedProductId() === group.family.id"
              (click)="openProduct(group.family.id)"
              (keydown.enter)="openProduct(group.family.id)"
            >
              <div class="p-3">
                <div class="flex items-start gap-3">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm mt-1 shrink-0"
                    [checked]="selectedProductIds().has(group.family.id)"
                    [disabled]="selectionLocked()"
                    [attr.aria-label]="'Select ' + group.family.name"
                    (click)="$event.stopPropagation()"
                    (change)="toggleProductSelection(group.family.id)"
                  />
                  @if (imageUrl(group.family.image_path); as thumb) {
                    @if (!brokenImages().has(group.family.image_path!)) {
                      <img
                        [src]="thumb"
                        alt=""
                        class="h-11 w-11 shrink-0 rounded-field object-cover"
                        (error)="markBroken(group.family.image_path!)"
                      />
                    }
                  }
                  <div class="min-w-0 flex-1">
                    <span class="block whitespace-normal break-words font-semibold">{{
                      group.family.name
                    }}</span>

                    @if (!categoryMembershipsComplete()) {
                      <p class="type-caption">{{ categoryDataStatusLabel() }}</p>
                    } @else {
                      @let categories = productCategoryNames(group.family.id);
                      <div class="flex flex-wrap items-center gap-1 text-xs text-muted">
                        <span class="whitespace-normal">{{
                          categories[0] || 'Uncategorized'
                        }}</span>
                        @if (categories.length > 1) {
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs min-h-11"
                            [attr.aria-label]="'View all categories for ' + group.family.name"
                            (click)="$event.stopPropagation(); openProduct(group.family.id)"
                            (keydown.enter)="$event.stopPropagation()"
                          >
                            +{{ categories.length - 1 }} categories
                          </button>
                        }
                      </div>
                    }
                    @if (taxCategoryName(group.family.tax_category_id); as taxName) {
                      <span class="badge badge-outline badge-xs mt-1">{{ taxName }}</span>
                    }
                    <span class="type-caption mt-0.5 block">
                      {{ manufacturerName(group.family.manufacturer_id) || 'No manufacturer' }} ·
                      {{ group.variants.length }}
                      {{ group.variants.length === 1 ? 'variant' : 'variants' }}
                    </span>
                  </div>
                  <div class="shrink-0 text-right">
                    @if (familyTracksInventory(group.variants)) {
                      <p class="font-semibold tabular-nums">
                        {{ familyStock(group.variants) }} units
                      </p>
                      @if (supplierFilter() !== 'all') {
                        <p class="type-caption tabular-nums">
                          {{ familySupplierStock(group.variants) }} from supplier
                        </p>
                      }
                    } @else {
                      <p class="type-caption">Not tracked</p>
                    }
                    @if (!group.family.active) {
                      <app-status-badge size="xs" type="warning" label="inactive" />
                    } @else if (
                      familyTracksInventory(group.variants) && familyStock(group.variants) <= 0
                    ) {
                      <app-status-badge size="xs" type="warning" label="out of stock" />
                    } @else {
                      <app-status-badge size="xs" type="neutral" label="active" />
                    }
                    @if (singleInsightVariantId(group.variants); as variantId) {
                      <a
                        class="btn btn-ghost btn-xs mt-1 min-h-11"
                        [routerLink]="['/insights/inventory', variantId]"
                        [queryParams]="{ returnTo: reviewReturnUrl() }"
                        (click)="$event.stopPropagation()"
                        >Insights</a
                      >
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        </app-mobile-list>
        <div class="hidden lg:block">
          <app-data-table-shell
            [columns]="tableColumns1()"
            tableClass="table-sm list-catalog-table"
            heading="Product catalog"
            [description]="grouped().length + ' matching products'"
          >
            <ng-template tableHeader="selection"
              ><input
                type="checkbox"
                class="checkbox checkbox-sm"
                aria-label="Select products on this page"
                [checked]="allPageProductsSelected()"
                [disabled]="selectionLocked()"
                [indeterminate]="somePageProductsSelected()"
                (change)="togglePageSelection()" /></ng-template
            ><ng-template tableRows>
              @for (group of pagedGroups(); track group.family.id) {
                <tr
                  [attr.data-list-record]="group.family.id"
                  tabindex="0"
                  class="cursor-pointer"
                  [class.table-row-active]="selectedProductId() === group.family.id"
                  (click)="openProduct(group.family.id)"
                  (keydown.enter)="openProduct(group.family.id)"
                >
                  <td (click)="$event.stopPropagation()">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [checked]="selectedProductIds().has(group.family.id)"
                      [disabled]="selectionLocked()"
                      [attr.aria-label]="'Select ' + group.family.name"
                      (change)="toggleProductSelection(group.family.id)"
                    />
                  </td>
                  <td>
                    <div class="flex min-w-0 items-center gap-3">
                      <div
                        class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-field border border-base-300 bg-base-200 text-base-content/35"
                        aria-hidden="true"
                      >
                        @if (imageUrl(group.family.image_path); as thumb) {
                          @if (!brokenImages().has(group.family.image_path!)) {
                            <img
                              [src]="thumb"
                              alt=""
                              loading="lazy"
                              decoding="async"
                              class="h-full w-full object-cover"
                              (error)="markBroken(group.family.image_path!)"
                            />
                          } @else {
                            <app-icon name="heroCube" size="lg" />
                          }
                        } @else {
                          <app-icon name="heroCube" size="lg" />
                        }
                      </div>
                      <div class="min-w-0">
                        <span
                          class="block max-w-64 whitespace-normal break-words font-semibold"
                          [title]="group.family.name"
                        >
                          {{ group.family.name }}
                        </span>
                        <p class="table-secondary">
                          {{
                            manufacturerName(group.family.manufacturer_id) || 'Manufacturer not set'
                          }}
                        </p>

                        @if (!categoryMembershipsComplete()) {
                          <p class="type-caption">{{ categoryDataStatusLabel() }}</p>
                        } @else {
                          @let categories = productCategoryNames(group.family.id);
                          <div class="flex flex-wrap items-center gap-1 text-xs text-muted">
                            <span class="whitespace-normal">{{
                              categories[0] || 'Uncategorized'
                            }}</span>
                            @if (categories.length > 1) {
                              <button
                                type="button"
                                class="btn btn-ghost btn-xs min-h-11"
                                [attr.aria-label]="'View all categories for ' + group.family.name"
                                (click)="$event.stopPropagation(); openProduct(group.family.id)"
                                (keydown.enter)="$event.stopPropagation()"
                              >
                                +{{ categories.length - 1 }} categories
                              </button>
                            }
                          </div>
                        }
                        @if (taxCategoryName(group.family.tax_category_id); as taxName) {
                          <span class="badge badge-outline badge-xs mt-1">{{ taxName }}</span>
                        }
                        @if (group.family.barcode) {
                          <p class="type-caption mt-0.5 break-all font-mono">
                            {{ group.family.barcode }}
                          </p>
                        }
                      </div>
                    </div>
                  </td>
                  <td class="text-right font-medium">
                    {{ group.variants.length }}
                  </td>
                  <td class="text-right">
                    @if (familyTracksInventory(group.variants)) {
                      <p class="font-medium tabular-nums">{{ familyStock(group.variants) }}</p>
                      @if (supplierFilter() !== 'all') {
                        <p class="type-caption tabular-nums">
                          {{ familySupplierStock(group.variants) }} from supplier
                        </p>
                      }
                      <p class="type-caption tabular-nums">
                        Retail <app-money [amount]="familyRetailStockValue(group.variants)" />
                      </p>
                    } @else {
                      <span class="text-sm text-base-content/50">Not tracked</span>
                    }
                  </td>
                  <td>
                    @if (group.family.active) {
                      <app-status-badge size="xs" type="neutral" label="active" />
                    } @else {
                      <app-status-badge size="xs" type="warning" label="inactive" />
                    }
                  </td>
                  <td class="table-actions" (click)="$event.stopPropagation()">
                    @if (singleInsightVariantId(group.variants); as variantId) {
                      <a
                        appButton
                        variant="ghost"
                        [iconOnly]="true"
                        title="View product insights"
                        aria-label="View product insights"
                        [routerLink]="['/insights/inventory', variantId]"
                        [queryParams]="{ returnTo: reviewReturnUrl() }"
                      >
                        <app-icon name="heroChartBar" />
                      </a>
                    }
                    @if (perms.has('ManageStockAdjustments')) {
                      <button
                        appButton
                        variant="ghost"
                        [iconOnly]="true"
                        type="button"
                        title="Edit product"
                        aria-label="Edit product"
                        (click)="startFamilyEdit(group.family)"
                      >
                        <app-icon name="heroPencilSquare" />
                      </button>
                    }
                  </td>
                </tr>
              }
            </ng-template>
          </app-data-table-shell>
        </div>
        <div class="mt-3">
          <app-pagination
            [currentPage]="page()"
            [totalPages]="totalPages()"
            [totalItems]="serverMode() ? serverTotal() : grouped().length"
            [itemsPerPage]="pageSize()"
            [showItemsPerPage]="true"
            itemLabel="products"
            (pageChange)="changePage($event)"
            (itemsPerPageChange)="changePageSize($event)"
          />
        </div>
      }
      <app-product-detail-drawer
        [productId]="selectedProductId()"
        [selectedVariantId]="selectedVariantId()"
        [supplierFilter]="supplierFilter()"
        [supplierStock]="supplierStock()"
        [selectedSupplierName]="selectedSupplierName()"
        (closed)="closeProductDrawer()"
        (editProduct)="editFromDrawer($event)"
        (editVariant)="editVariantFromDrawer($event)"
        (printLabel)="openSingleLabel($event)"
      />

      @if (batchCategoriesOpen() && categoryMembershipsComplete()) {
        <app-batch-product-categories-dialog
          [productIds]="selectedProductIdList()"
          [categories]="categories()"
          [links]="productCategories()"
          (closed)="batchCategoriesOpen.set(false)"
          (applied)="batchCategoriesApplied($event)"
        />
      }
      @defer (when labelDialogMode() !== null) {
        @if (labelDialogMode(); as labelMode) {
          <app-barcode-label-dialog
            [mode]="labelMode"
            [variants]="labelMode === 'selection' ? selectedLabelVariants() : catalog()"
            [variantId]="labelVariantId()"
            (closed)="closeLabelDialog()"
          />
        }
      }
    </app-page>
  `,
  styles: `
    .catalogue-filters {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: end;
      gap: 0.75rem;
    }

    .catalogue-filters > app-form-field {
      min-width: 0;
    }

    .catalogue-category-filter {
      grid-column: 1 / -1;
    }

    @container (min-width: 44rem) {
      .catalogue-filters {
        grid-template-columns: 0.8fr 1fr repeat(3, minmax(0, 1.2fr));
      }

      .catalogue-category-filter {
        grid-column: auto;
      }
    }
  `,
})
export class ProductsComponent implements OnInit {
  protected readonly activeListFilters = computed(() => [
    ...(this.productStatusFilter() !== 'active'
      ? [{ key: 'status', label: 'Status: ' + this.productStatusFilter().replaceAll('_', ' ') }]
      : []),
    ...(this.stockStatusFilter() !== 'all'
      ? [{ key: 'stock', label: 'Stock: ' + this.stockStatusFilter().replaceAll('_', ' ') }]
      : []),
    ...(this.supplierFilter() !== 'all'
      ? [
          {
            key: 'supplier',
            label:
              'Supplier: ' +
              (this.supplierOptions().find(option => option.value === this.supplierFilter())
                ?.label ?? 'Selected supplier'),
          },
        ]
      : []),
    ...(this.manufacturerFilter() !== 'all'
      ? [
          {
            key: 'manufacturer',
            label:
              'Manufacturer: ' +
              (this.manufacturerFilterOptions().find(
                option => option.value === this.manufacturerFilter()
              )?.label ?? 'Selected manufacturer'),
          },
        ]
      : []),
    ...(this.categoryFilter() !== 'all'
      ? [
          {
            key: 'category',
            label:
              'Category: ' +
              (this.categoryFilterOptions().find(option => option.value === this.categoryFilter())
                ?.label ?? 'Selected category'),
          },
        ]
      : []),
  ]);
  protected removeListFilter(key: string): void {
    if (key === 'status') this.productStatusFilter.set('active');
    if (key === 'stock') this.stockStatusFilter.set('all');
    if (key === 'supplier') this.supplierFilter.set('all');
    if (key === 'manufacturer') this.manufacturerFilter.set('all');
    if (key === 'category') this.categoryFilter.set('all');
    this.page.set(1);
  }

  protected readonly tableColumns1 = computed<TableColumn[]>(() => [
    { key: 'selection', label: 'Select', width: '3rem', pinned: true },
    { key: 'product', label: 'Product', pinned: true, minWidth: '16rem' },
    { key: 'variants', label: 'Variants', align: 'right' },
    { key: 'stock', label: 'Available stock', align: 'right' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Actions', align: 'right' },
  ]);
  private readonly destroyRef = inject(DestroyRef);
  private workspaceVersion = 0;
  private destroyed = false;
  private labelPreparation: AbortController | null = null;
  protected readonly bulkBusy = signal(false);
  protected readonly bulkRefreshPending = signal(false);
  protected readonly bulkError = signal<string | null>(null);
  protected readonly bulkConfirmation = signal<{ action: ProductBulkAction; ids: string[] } | null>(
    null
  );
  protected readonly labelsPreparing = signal(false);
  protected readonly selectedLabelVariants = signal<Variant[]>([]);
  protected readonly selectionLocked = computed(
    () => this.bulkBusy() || this.bulkRefreshPending() || this.labelsPreparing()
  );
  protected readonly writeDisabled = computed(
    () => this.selectionLocked() || !this.connectivity.online()
  );
  private readonly pos = inject(PosService);
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected reviewReturnUrl(): string {
    return this.router.url;
  }
  private readonly catalogCache = inject(CatalogCacheService);
  private readonly parties = inject(PartyCacheService);
  private readonly locationContext = inject(LocationContextService);
  protected readonly connectivity = inject(ConnectivityService);
  private readonly tax = inject(TaxService);
  protected readonly preferences = inject(CompanyPreferencesService);
  protected readonly perms = inject(PermissionsService);

  protected readonly fmt = formatKes;
  protected readonly families = this.catalogCache.families;
  /** Live view of the shared realtime-backed catalog cache (works offline). */
  protected readonly catalog = this.catalogCache.catalog;
  protected readonly catalogTruncated = this.catalogCache.catalogTruncated;
  protected readonly stock = this.catalogCache.stock;
  protected readonly selectedProductId = signal<string | null>(null);
  protected readonly selectedVariantId = signal<string | null>(null);

  protected readonly query = signal('');
  protected readonly productStatusFilter = signal<ProductStatusFilter>(
    DEFAULT_PRODUCT_STATUS_FILTER
  );
  protected readonly stockStatusFilter = signal<StockStatusFilter>('all');
  protected readonly supplierFilter = signal('all');
  protected readonly supplierStock = signal<Map<string, SupplierStockRow>>(new Map());
  protected readonly supplierStockLoading = signal(false);
  protected readonly supplierStockError = signal<string | null>(null);
  protected readonly manufacturerFilter = signal<string>('all');
  protected readonly categoryFilter = signal<string>('all');
  protected readonly productSortOptions = PRODUCT_SORT_OPTIONS;
  protected readonly productSort = signal('name');
  protected readonly productSortDirection = signal<ListSortDirection>('asc');

  protected readonly taxCategories = signal<TaxCategory[]>([]);

  protected readonly editorRequest = signal<ProductEditorRequest | null>(null);
  protected readonly labelDialogMode = signal<'catalogue' | 'single' | 'selection' | null>(null);
  protected readonly labelVariantId = signal<string | null>(null);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  private readonly serverGroups = signal<ProductGroup[]>([]);
  private readonly serverStock = signal<Map<string, StockInfo>>(new Map());
  protected readonly serverTotal = signal(0);
  private readonly serverLoaded = signal(false);
  private serverRequest = 0;
  private serverSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private supplierStockRequest = 0;
  protected readonly serverMode = computed(() => this.productStatusFilter() !== 'active');
  protected readonly supplierOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.parties
      .suppliers()
      .filter(supplier => supplier.supplier_active)
      .map(supplier => ({
        value: supplier.id,
        label: [supplier.first_name, supplier.last_name].filter(Boolean).join(' '),
        description: supplier.phone || undefined,
        searchText: supplier.email ?? undefined,
      }))
  );
  protected readonly selectedSupplierName = computed(
    () =>
      this.supplierOptions().find(option => option.value === this.supplierFilter())?.label ??
      'supplier'
  );
  protected readonly activeLocationName = computed(
    () =>
      this.locationContext.locations().find(item => item.id === this.locationContext.activeId())
        ?.name ?? 'Active location'
  );

  protected readonly brokenImages = signal<Set<string>>(new Set());

  /** Categories panel + per-family checkbox editor. */
  protected readonly categoriesOpen = signal(false);
  protected readonly categories = this.catalogCache.categories;
  protected readonly productCategories = this.catalogCache.productCategories;
  protected readonly categoryMembershipsComplete = this.catalogCache.categoryMembershipsComplete;
  protected readonly manufacturers = this.catalogCache.manufacturers;
  protected readonly manufacturerFilterOptions = computed<readonly SearchableFilterOption[]>(() => [
    { value: 'unassigned', label: 'Not specified' },
    ...this.manufacturers().map(manufacturer => ({
      value: manufacturer.id,
      label: manufacturer.name,
    })),
  ]);
  protected readonly categoryFilterOptions = computed<readonly SearchableFilterOption[]>(() => {
    if (!this.categoryMembershipsComplete()) return [];
    return [
      { value: 'uncategorized', label: 'Uncategorized' },
      ...this.categories()
        .filter(category => category.active)
        .map(category => ({
          value: category.id,
          label: category.name,
          description: `${category.product_count} products`,
        })),
    ];
  });
  private readonly categoryIdsByProduct = computed(() => {
    const result = new Map<string, Set<string>>();
    for (const link of this.productCategories()) {
      const categoryIds = result.get(link.product_id) ?? new Set<string>();
      categoryIds.add(link.category_id);
      result.set(link.product_id, categoryIds);
    }
    return result;
  });
  protected readonly selectedProductIds = signal<Set<string>>(new Set());
  protected readonly batchCategoriesOpen = signal(false);
  protected readonly selectedProductIdList = computed(() => [...this.selectedProductIds()]);
  protected readonly allPageProductsSelected = computed(() => {
    const pageIds = this.pagedGroups().map(group => group.family.id);
    return pageIds.length > 0 && pageIds.every(id => this.selectedProductIds().has(id));
  });
  protected readonly somePageProductsSelected = computed(() => {
    const selected = this.pagedGroups().filter(group =>
      this.selectedProductIds().has(group.family.id)
    ).length;
    return selected > 0 && selected < this.pagedGroups().length;
  });

  /** Families with their variants; search filters the cached catalog client-side. */
  protected readonly grouped = computed(() => {
    const q = this.query().trim();
    const productStatus = this.productStatusFilter();
    const stockStatus = this.stockStatusFilter();
    const supplier = this.supplierFilter();
    const supplierStock = this.supplierStock();
    const lowStockThreshold = this.preferences.lowStockThreshold();
    const manufacturer = this.manufacturerFilter();
    const category = this.categoryMembershipsComplete() ? this.categoryFilter() : 'all';
    const categoryIdsByProduct = this.categoryIdsByProduct();
    const sortKey = this.productSort();
    const sortDirection = this.productSortDirection();
    if (productStatus !== 'active') return this.serverGroups();
    const byProduct = new Map<string, Variant[]>();
    for (const v of this.catalog()) {
      if (!v.product_id) continue;
      if (q && !matchesCatalogQuery(v, q)) {
        continue;
      }
      const list = byProduct.get(v.product_id) ?? [];
      list.push(v);
      byProduct.set(v.product_id, list);
    }
    const groups = this.families()
      .map(family => ({ family, variants: byProduct.get(family.id) ?? [] }))
      .filter(g => {
        const matchesSearch =
          g.variants.length > 0 || !q || g.family.name.toLowerCase().includes(q);
        if (!matchesSearch) return false;
        if (!g.family.active) return false;
        if (manufacturer === 'unassigned' && g.family.manufacturer_id !== null) return false;
        if (manufacturer !== 'all' && manufacturer !== 'unassigned') {
          if (g.family.manufacturer_id !== manufacturer) return false;
        }
        const categoryIds = categoryIdsByProduct.get(g.family.id) ?? new Set<string>();
        if (category === 'uncategorized' && categoryIds.size > 0) return false;
        if (category !== 'all' && category !== 'uncategorized' && !categoryIds.has(category)) {
          return false;
        }
        if (
          supplier !== 'all' &&
          !g.variants.some(variant => (supplierStock.get(variant.variant_id ?? '')?.stock ?? 0) > 0)
        ) {
          return false;
        }
        if (stockStatus === 'all') return true;
        const tracked = g.variants.filter(
          variant => variant.kind !== 'service' && variant.track_inventory
        );
        if (stockStatus === 'not_tracked') return tracked.length === 0;
        return tracked.some(variant => {
          const quantity = this.stockOf(variant.variant_id!)?.stock ?? 0;
          if (stockStatus === 'needs_restock') {
            return variantNeedsRestock(variant, quantity, lowStockThreshold);
          }
          return stockStatus === 'in_stock' ? quantity > 0 : quantity <= 0;
        });
      });
    return sortList(
      groups,
      sortDirection,
      group => {
        switch (sortKey) {
          case 'manufacturer':
            return this.manufacturerName(group.family.manufacturer_id);
          case 'stock':
            return this.familyStock(group.variants);
          case 'cost_value':
            return this.familyStockValue(group.variants);
          case 'wholesale_value':
            return this.familyWholesaleStockValue(group.variants);
          case 'retail_value':
            return this.familyRetailStockValue(group.variants);
          case 'variants':
            return group.variants.length;
          default:
            return group.family.name;
        }
      },
      group => group.family.name
    );
  });

  protected readonly totalStockValue = computed(() => {
    return this.grouped().reduce((sum, group) => sum + this.familyStockValue(group.variants), 0);
  });
  protected readonly totalRetailStockValue = computed(() => {
    return this.grouped().reduce(
      (sum, group) => sum + this.familyRetailStockValue(group.variants),
      0
    );
  });
  protected readonly totalWholesaleStockValue = computed(() => {
    return this.grouped().reduce(
      (sum, group) => sum + this.familyWholesaleStockValue(group.variants),
      0
    );
  });
  protected readonly hasProductFilters = computed(
    () =>
      this.query().trim().length > 0 ||
      this.productStatusFilter() !== DEFAULT_PRODUCT_STATUS_FILTER ||
      this.stockStatusFilter() !== 'all' ||
      this.supplierFilter() !== 'all' ||
      this.manufacturerFilter() !== 'all' ||
      (this.categoryMembershipsComplete() && this.categoryFilter() !== 'all')
  );
  protected readonly productActiveFilterCount = computed(
    () =>
      Number(this.productStatusFilter() !== DEFAULT_PRODUCT_STATUS_FILTER) +
      Number(this.stockStatusFilter() !== 'all') +
      Number(this.supplierFilter() !== 'all') +
      Number(this.manufacturerFilter() !== 'all') +
      Number(this.categoryMembershipsComplete() && this.categoryFilter() !== 'all')
  );
  protected readonly productStats = computed(() => {
    const groups = this.grouped();
    const variants = groups.reduce((count, group) => count + group.variants.length, 0);
    const needsRestock = groups.reduce(
      (count, group) =>
        count +
        group.variants.filter(variant =>
          variantNeedsRestock(
            variant,
            this.stockOf(variant.variant_id!)?.stock ?? 0,
            this.preferences.lowStockThreshold()
          )
        ).length,
      0
    );
    return [
      {
        label: 'Products',
        value: this.serverMode() && this.serverLoaded() ? this.serverTotal() : groups.length,
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Variants',
        value: variants,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Needs restock',
        value: needsRestock,
        tone: needsRestock > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'At cost',
        value: this.fmt(this.totalStockValue()),
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'At wholesale',
        value: this.fmt(this.totalWholesaleStockValue()),
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'At retail',
        value: this.fmt(this.totalRetailStockValue()),
        mobilePriority: 'secondary' as const,
      },
    ];
  });
  protected readonly totalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(
        (this.serverMode() && this.serverLoaded() ? this.serverTotal() : this.grouped().length) /
          this.pageSize()
      )
    )
  );
  protected readonly pagedGroups = computed(() => {
    if (this.serverMode()) return this.serverGroups();
    const page = Math.min(this.page(), this.totalPages());
    const start = (page - 1) * this.pageSize();
    return this.grouped().slice(start, start + this.pageSize());
  });
  protected readonly needsRestockSummary = computed(() => {
    const groups = this.grouped();
    const variants = groups.reduce(
      (count, group) =>
        count +
        group.variants.filter(variant =>
          variantNeedsRestock(
            variant,
            this.stockOf(variant.variant_id!)?.stock ?? 0,
            this.preferences.lowStockThreshold()
          )
        ).length,
      0
    );
    return { variants, products: groups.length };
  });
  protected readonly supplierStockSummary = computed(() => {
    const activeVariantIds = new Set(
      this.catalog().flatMap(variant => (variant.variant_id ? [variant.variant_id] : []))
    );
    return [...this.supplierStock().entries()].reduce(
      (summary, [variantId, row]) => {
        if (!activeVariantIds.has(variantId) || row.stock <= 0) return summary;
        summary.variants += 1;
        summary.value += row.stock_value ?? 0;
        return summary;
      },
      { variants: 0, value: 0 }
    );
  });
  protected readonly supplierStockValue = computed(() => this.supplierStockSummary().value);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.labelPreparation?.abort();
      ++this.serverRequest;
      if (this.serverSearchTimer) clearTimeout(this.serverSearchTimer);
    });
    let previousWorkspace: string | undefined;
    effect(() => {
      const workspace = this.workspaceKey();
      if (workspace === previousWorkspace) return;
      previousWorkspace = workspace;
      untracked(() => {
        ++this.workspaceVersion;
        ++this.serverRequest;
        this.labelPreparation?.abort();
        this.labelsPreparing.set(false);
        this.bulkBusy.set(false);
        this.bulkRefreshPending.set(false);
        this.bulkError.set(null);
        this.clearSelection();
        this.closeLabelDialog();
        this.serverGroups.set([]);
        this.serverStock.set(new Map());
        this.serverTotal.set(0);
        this.serverLoaded.set(false);
        if (this.serverMode()) this.scheduleManagementLoad();
      });
    });
    effect(() => {
      this.page();
      this.pageSize();
      untracked(() => this.clearSelection());
    });
    bindListQuery({
      search: listQueryField(this.query),
      status: listQueryField(this.productStatusFilter),
      stock: listQueryField(this.stockStatusFilter),
      supplier: listQueryField(this.supplierFilter),
      manufacturer: listQueryField(this.manufacturerFilter),
      category: listQueryField(this.categoryFilter),
      sort: listQueryField(this.productSort),
      direction: listQueryField(this.productSortDirection),
      page: listQueryField(this.page),
      pageSize: listQueryField(this.pageSize, { max: 100 }),
    });

    // Search is pure client-side filtering over the cached catalog (grouped());
    // typing resets pagination. Preserve the restored page on the initial run,
    // while still fetching views that need the management endpoint.
    let firstRun = true;
    effect(() => {
      this.query();
      this.productStatusFilter();
      this.stockStatusFilter();
      this.supplierFilter();
      this.manufacturerFilter();
      this.categoryFilter();
      this.productSort();
      this.productSortDirection();
      if (firstRun) {
        firstRun = false;
        if (this.serverMode()) this.scheduleManagementLoad();
        return;
      }
      this.page.set(1);
      if (this.serverMode()) this.scheduleManagementLoad();
      else {
        this.serverGroups.set([]);
        this.serverStock.set(new Map());
        this.serverTotal.set(0);
        this.serverLoaded.set(false);
      }
      this.clearSelection();
    });
    effect(() => {
      const supplierId = this.supplierFilter();
      const locationId = this.locationContext.activeId();
      untracked(() => {
        if (supplierId === 'all' || !locationId) {
          ++this.supplierStockRequest;
          this.supplierStock.set(new Map());
          this.supplierStockLoading.set(false);
          this.supplierStockError.set(null);
          return;
        }
        void this.loadSupplierStock(supplierId, locationId);
      });
    });
    effect(() => {
      const complete = this.categoryMembershipsComplete();
      const selectedCategory = this.categoryFilter();
      if (!complete) {
        this.categoryFilter.set('all');
        this.batchCategoriesOpen.set(false);
        return;
      }
      if (
        selectedCategory !== 'all' &&
        selectedCategory !== 'uncategorized' &&
        !this.categories().some(category => category.id === selectedCategory && category.active)
      ) {
        this.categoryFilter.set('all');
      }
    });
  }

  protected changePageSize(size: number): void {
    this.clearSelection();
    this.pageSize.set(size);
    this.page.set(1);
    if (this.serverMode()) void this.loadManagementPage();
  }

  protected changePage(page: number): void {
    this.clearSelection();
    this.page.set(page);
    if (this.serverMode()) void this.loadManagementPage();
  }

  protected setProductStatusFilter(event: Event): void {
    const status = (event.target as HTMLSelectElement).value as ProductStatusFilter;
    this.productStatusFilter.set(status);
    if (status !== 'active') {
      this.supplierFilter.set('all');
      if (this.stockStatusFilter() === 'needs_restock') this.stockStatusFilter.set('all');
    }
    this.syncFilterUrl();
  }

  protected setStockStatusFilter(event: Event): void {
    const status = (event.target as HTMLSelectElement).value as StockStatusFilter;
    if (status === 'needs_restock') this.productStatusFilter.set('active');
    this.stockStatusFilter.set(status);
    this.syncFilterUrl();
  }

  protected setSupplierFilter(supplierId: string): void {
    if (supplierId !== 'all') this.productStatusFilter.set('active');
    this.supplierFilter.set(supplierId);
    this.syncFilterUrl();
  }

  private syncFilterUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        stock: this.stockStatusFilter() === 'all' ? null : this.stockStatusFilter(),
        supplier: this.supplierFilter() === 'all' ? null : this.supplierFilter(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setManufacturerFilter(value: string): void {
    this.manufacturerFilter.set(value);
  }

  protected setCategoryFilter(value: string): void {
    if (!this.categoryMembershipsComplete()) return;
    this.categoryFilter.set(value);
  }

  protected toggleProductSelection(productId: string): void {
    if (this.selectionLocked() || !this.pagedGroups().some(group => group.family.id === productId))
      return;
    this.selectedProductIds.update(selected => {
      const next = new Set(selected);
      if (next.has(productId)) next.delete(productId);
      else if (next.size < 100) next.add(productId);
      return next;
    });
  }

  protected togglePageSelection(): void {
    if (this.selectionLocked()) return;
    const pageIds = this.pagedGroups()
      .slice(0, 100)
      .map(group => group.family.id);
    this.selectedProductIds.update(selected => {
      const next = new Set(selected);
      const remove = pageIds.length > 0 && pageIds.every(id => next.has(id));
      for (const id of pageIds) remove ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected clearSelection(): void {
    this.selectedProductIds.set(new Set());
    this.batchCategoriesOpen.set(false);
    this.bulkConfirmation.set(null);
  }

  protected productCategoryNames(productId: string): string[] {
    const ids = this.categoryIdsByProduct().get(productId) ?? new Set<string>();
    return this.categories()
      .filter(category => ids.has(category.id))
      .map(category => category.name);
  }

  protected categoryDataStatusLabel(): string {
    return this.connectivity.online()
      ? 'Refreshing category data…'
      : 'Reconnect to load category data.';
  }

  protected batchCategoriesApplied(message: string): void {
    this.notice.set(message);
    this.clearSelection();
  }

  protected clearProductFilters(): void {
    this.productStatusFilter.set(DEFAULT_PRODUCT_STATUS_FILTER);
    this.stockStatusFilter.set('all');
    this.supplierFilter.set('all');
    this.supplierStock.set(new Map());
    this.manufacturerFilter.set('all');
    this.categoryFilter.set('all');
    this.syncFilterUrl();
  }

  protected manufacturerName(id: string | null): string | null {
    if (!id) return null;
    return (
      this.manufacturers().find(manufacturer => manufacturer.id === id)?.name ??
      this.catalog().find(variant => variant.manufacturer_id === id)?.manufacturer_name ??
      null
    );
  }

  protected taxCategoryName(id: string | null): string | null {
    if (!id) return null;
    return this.taxCategories().find(category => category.id === id)?.name ?? 'VAT exception';
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const requestedStock = params.get('stock');
    const allowedStock: StockStatusFilter[] = [
      'all',
      'needs_restock',
      'in_stock',
      'out_of_stock',
      'not_tracked',
    ];
    if (requestedStock && allowedStock.includes(requestedStock as StockStatusFilter)) {
      this.stockStatusFilter.set(requestedStock as StockStatusFilter);
    }
    this.loading.set(true);
    void this.loadTaxCategories();
    const [hydrated] = await Promise.all([
      this.catalogCache.ensureLoaded(),
      this.parties.ensureLoaded(),
      this.preferences.refresh(),
    ]);
    const requestedSupplier = params.get('supplier');
    if (requestedSupplier) {
      const supplier = this.parties
        .suppliers()
        .find(item => item.id === requestedSupplier && item.supplier_active);
      if (supplier) this.supplierFilter.set(requestedSupplier);
      else this.error.set('The linked supplier is unavailable');
    }
    if (hydrated) this.loading.set(false);
    if (!hydrated) {
      const refreshed = await this.catalogCache.refresh();
      if (!refreshed) this.error.set('Could not load the catalog; check your connection.');
      this.loading.set(false);
    }
    const requestedProduct = params.get('product');
    if (requestedProduct) {
      this.showProduct(requestedProduct, params.get('variant'), false);
    }
  }

  private async loadTaxCategories(): Promise<void> {
    try {
      const settings = await this.tax.settings();
      this.taxCategories.set(settings.categories);
    } catch {
      // VAT is optional. A catalog load must still work for shops without tax access/configuration.
      this.taxCategories.set([]);
    }
  }

  private scheduleManagementLoad(): void {
    if (this.serverSearchTimer) clearTimeout(this.serverSearchTimer);
    this.serverSearchTimer = setTimeout(() => void this.loadManagementPage(), 0);
  }

  private async loadManagementPage(): Promise<boolean> {
    if (!this.serverMode()) return true;
    const workspace = this.workspaceKey();
    const request = ++this.serverRequest;
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.rpc('catalog_management_page', {
        p_status: this.productStatusFilter(),
        p_stock_status: this.stockStatusFilter(),
        p_manufacturer: this.manufacturerFilter(),
        p_category: this.categoryMembershipsComplete() ? this.categoryFilter() : 'all',
        p_search: this.query().trim() || undefined,
        p_sort: this.productSort(),
        p_direction: this.productSortDirection(),
        p_page: this.page(),
        p_page_size: this.pageSize(),
        p_location_id: this.locationContext.activeId() ?? undefined,
      });
      if (error) throw error;
      if (request !== this.serverRequest || workspace !== this.workspaceKey() || this.destroyed)
        return false;
      const result = data as unknown as { total: number; groups: ProductGroup[] };
      this.serverGroups.set(result.groups);
      this.serverStock.set(
        new Map(
          result.groups.flatMap(group =>
            group.variants.flatMap(variant =>
              variant.variant_id
                ? [
                    [
                      variant.variant_id,
                      {
                        stock: Number(variant.stock ?? 0),
                        stock_value: Number(variant.stock_value ?? 0),
                      },
                    ] as const,
                  ]
                : []
            )
          )
        )
      );
      this.serverTotal.set(result.total);
      this.serverLoaded.set(true);
      this.error.set(null);
      if (this.page() > this.totalPages()) {
        this.page.set(this.totalPages());
        return this.loadManagementPage();
      }
      return true;
    } catch (error) {
      if (request === this.serverRequest && workspace === this.workspaceKey() && !this.destroyed) {
        this.error.set(error instanceof Error ? error.message : 'Could not load product history');
      }
      return false;
    } finally {
      if (request === this.serverRequest) this.loading.set(false);
    }
  }

  private async loadSupplierStock(supplierId: string, locationId: string): Promise<void> {
    const request = ++this.supplierStockRequest;
    this.supplierStockLoading.set(true);
    this.supplierStockError.set(null);
    try {
      const rows = await this.pos.supplierStockByVariant(supplierId, locationId);
      if (
        request !== this.supplierStockRequest ||
        this.supplierFilter() !== supplierId ||
        this.locationContext.activeId() !== locationId
      ) {
        return;
      }
      this.supplierStock.set(new Map(rows.map(row => [row.variant_id, row])));
      this.supplierStockError.set(null);
    } catch (error) {
      if (request === this.supplierStockRequest) {
        this.supplierStock.set(new Map());
        this.supplierStockError.set(
          this.connectivity.online()
            ? error instanceof Error
              ? error.message
              : 'Could not load supplier-sourced stock'
            : 'Reconnect to filter stock by supplier.'
        );
      }
    } finally {
      if (request === this.supplierStockRequest) this.supplierStockLoading.set(false);
    }
  }

  protected async load(): Promise<void> {
    if (this.serverMode()) {
      await this.loadManagementPage();
      return;
    }
    this.loading.set(true);
    try {
      await Promise.all([this.catalogCache.refresh(), this.preferences.refresh()]);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      this.loading.set(false);
    }
  }

  // --- Images ---

  protected imageUrl(path: string | null | undefined): string | null {
    return this.pos.imageUrl(path);
  }

  protected markBroken(path: string): void {
    this.brokenImages.update(set => new Set(set).add(path));
  }

  // --- Categories ---

  protected async categoryChanged(result: ProductCategoryChangedResult): Promise<void> {
    this.notice.set(result.message);
    await this.load();
  }

  protected stockOf(variantId: string): StockInfo | undefined {
    return this.serverMode()
      ? (this.serverStock().get(variantId) ?? this.stock().get(variantId))
      : this.stock().get(variantId);
  }

  protected supplierStockOf(variantId: string): SupplierStockRow | undefined {
    return this.supplierStock().get(variantId);
  }

  protected familySupplierStock(variants: Variant[]): number {
    return variants.reduce(
      (sum, variant) => sum + (this.supplierStockOf(variant.variant_id ?? '')?.stock ?? 0),
      0
    );
  }

  protected familyStock(variants: Variant[]): number {
    return variants.reduce(
      (sum, variant) =>
        sum +
        (variant.kind === 'service' || !variant.track_inventory
          ? 0
          : (this.stockOf(variant.variant_id!)?.stock ?? 0)),
      0
    );
  }

  protected familyTracksInventory(variants: Variant[]): boolean {
    return variants.some(variant => variant.kind !== 'service' && variant.track_inventory);
  }

  protected singleInsightVariantId(variants: Variant[]): string | null {
    const eligible = variants.filter(
      variant => variant.kind !== 'service' && variant.track_inventory && variant.variant_id
    );
    return eligible.length === 1 ? eligible[0].variant_id! : null;
  }

  protected familyStockValue(variants: Variant[]): number {
    return variants.reduce(
      (sum, variant) => sum + (this.stockOf(variant.variant_id!)?.stock_value ?? 0),
      0
    );
  }

  protected familyRetailStockValue(variants: Variant[]): number {
    return variants.reduce((sum, variant) => {
      if (variant.kind === 'service' || !variant.track_inventory || !variant.variant_id) return sum;
      const quantity = this.stockOf(variant.variant_id)?.stock ?? 0;
      return sum + quantity * (variant.price ?? 0);
    }, 0);
  }

  protected variantRetailStockValue(variant: Variant): number {
    if (variant.kind === 'service' || !variant.track_inventory || !variant.variant_id) return 0;
    return (this.stockOf(variant.variant_id)?.stock ?? 0) * (variant.price ?? 0);
  }

  protected familyWholesaleStockValue(variants: Variant[]): number {
    return variants.reduce((sum, variant) => {
      if (variant.kind === 'service' || !variant.track_inventory || !variant.variant_id) return sum;
      const quantity = this.stockOf(variant.variant_id)?.stock ?? 0;
      return sum + quantity * (variant.wholesale_price ?? 0);
    }, 0);
  }

  protected openProduct(productId: string): void {
    this.showProduct(productId, null, true);
  }

  private showProduct(productId: string, variantId: string | null, updateUrl: boolean): void {
    this.selectedProductId.set(productId);
    this.selectedVariantId.set(variantId);
    if (updateUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { product: productId, variant: variantId },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeProductDrawer(): void {
    this.selectedProductId.set(null);
    this.selectedVariantId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { product: null, variant: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected editFromDrawer(family: Product): void {
    this.closeProductDrawer();
    this.startFamilyEdit(family);
  }

  protected editVariantFromDrawer(productId: string): void {
    this.closeProductDrawer();
    this.startVariantEdit(productId);
  }

  // The page composes the editor through request/result values; editor state never leaks here.
  protected startFamilyCreate(): void {
    if (!this.perms.has('ManageStockAdjustments')) return;
    this.error.set(null);
    this.editorRequest.set({ mode: 'create' });
  }

  protected startFamilyEdit(family: Product, initialStep: 1 | 2 = 1): void {
    if (!this.perms.has('ManageStockAdjustments')) return;
    const stock = new Map<string, StockInfo>(this.stock());
    for (const [variantId, value] of this.serverStock()) stock.set(variantId, value);
    this.error.set(null);
    this.editorRequest.set({ mode: 'edit', product: family, initialStep, stock });
  }

  protected async productEditorSaved(result: ProductEditorResult): Promise<void> {
    this.editorRequest.set(null);
    this.notice.set(
      result.mode === 'created'
        ? `Created ${result.name}`
        : `Updated ${result.name} and ${result.variantCount} variant${result.variantCount === 1 ? '' : 's'}`
    );
    await this.load();
  }

  protected productEditorClosed(): void {
    this.editorRequest.set(null);
  }
  private workspaceKey(): string {
    const identity = this.supabase.offlineIdentity();
    return JSON.stringify([identity?.userId, identity?.companyId, this.locationContext.activeId()]);
  }

  private currentWorkspace(key: string, version: number): boolean {
    return !this.destroyed && key === this.workspaceKey() && version === this.workspaceVersion;
  }

  protected bulkActionLabel(action: ProductBulkAction): string {
    return {
      publish: 'Publish on storefront',
      unpublish: 'Unpublish from storefront',
      activate: 'Activate',
      deactivate: 'Deactivate',
    }[action];
  }

  private canBulkAction(action: ProductBulkAction): boolean {
    return this.perms.has(
      action === 'publish' || action === 'unpublish' ? 'ManageCatalog' : 'ManageStockAdjustments'
    );
  }

  protected confirmBulkAction(action: ProductBulkAction): void {
    if (this.writeDisabled() || !this.canBulkAction(action) || !this.selectedProductIds().size)
      return;
    this.bulkError.set(null);
    this.bulkConfirmation.set({ action, ids: [...this.selectedProductIds()] });
  }

  protected closeBulkConfirmation(): void {
    if (!this.bulkBusy()) this.bulkConfirmation.set(null);
  }

  protected async saveBulkAction(): Promise<void> {
    const confirmation = this.bulkConfirmation();
    if (!confirmation || this.writeDisabled() || !this.canBulkAction(confirmation.action)) return;
    const key = this.workspaceKey(),
      version = this.workspaceVersion;
    this.bulkBusy.set(true);
    this.bulkError.set(null);
    try {
      const { action, ids } = confirmation;
      if (action === 'publish' || action === 'unpublish') {
        await this.pos.setProductsStorefrontPublished(ids, action === 'publish');
      } else {
        await this.pos.setProductsActive(ids, action === 'activate');
      }
      if (!this.currentWorkspace(key, version)) return;
      this.bulkConfirmation.set(null);
      this.bulkRefreshPending.set(true);
      await this.reconcileBulkSave(key, version);
    } catch (error) {
      if (this.currentWorkspace(key, version)) {
        this.bulkConfirmation.set(null);
        this.bulkError.set(
          error instanceof Error ? error.message : 'Could not save selected products.'
        );
      }
    } finally {
      if (this.currentWorkspace(key, version)) this.bulkBusy.set(false);
    }
  }

  private async reconcileBulkSave(key: string, version: number): Promise<void> {
    try {
      if (!(await this.catalogCache.refreshAfterMutation())) throw new Error('refresh_failed');
      if (!this.currentWorkspace(key, version)) return;
      if (this.serverMode() && !(await this.loadManagementPage()))
        throw new Error('refresh_failed');
      if (!this.currentWorkspace(key, version)) return;
      this.bulkRefreshPending.set(false);
      this.bulkError.set(null);
      this.notice.set('Selected products saved.');
      this.clearSelection();
    } catch {
      if (this.currentWorkspace(key, version)) this.bulkError.set('Saved; refresh failed');
    }
  }

  protected async retryBulkRefresh(): Promise<void> {
    if (!this.bulkRefreshPending() || this.bulkBusy() || !this.connectivity.online()) return;
    const key = this.workspaceKey(),
      version = this.workspaceVersion;
    this.bulkBusy.set(true);
    try {
      await this.reconcileBulkSave(key, version);
    } finally {
      if (this.currentWorkspace(key, version)) this.bulkBusy.set(false);
    }
  }

  protected async prepareSelectedLabels(): Promise<void> {
    if (this.writeDisabled() || !this.selectedProductIds().size) return;
    const key = this.workspaceKey(),
      version = this.workspaceVersion;
    const controller = new AbortController();
    this.labelPreparation?.abort();
    this.labelPreparation = controller;
    this.labelsPreparing.set(true);
    this.bulkError.set(null);
    try {
      const variants = await this.pos.variantsForSelectedProducts(
        [...this.selectedProductIds()],
        controller.signal
      );
      if (!this.currentWorkspace(key, version) || controller.signal.aborted) return;
      this.selectedLabelVariants.set(variants);
      this.labelVariantId.set(null);
      this.labelDialogMode.set('selection');
    } catch (error) {
      if (this.currentWorkspace(key, version) && !controller.signal.aborted)
        this.bulkError.set(
          error instanceof Error ? error.message : 'Could not prepare selected labels.'
        );
    } finally {
      if (this.currentWorkspace(key, version)) this.labelsPreparing.set(false);
    }
  }

  protected openCatalogueLabels(): void {
    this.labelVariantId.set(null);
    this.labelDialogMode.set('catalogue');
  }

  protected openSingleLabel(variantId: string): void {
    this.labelVariantId.set(variantId);
    this.labelDialogMode.set('single');
  }

  protected closeLabelDialog(): void {
    this.labelDialogMode.set(null);
    this.labelVariantId.set(null);
    this.selectedLabelVariants.set([]);
  }

  protected startVariantEdit(productId: string): void {
    const family = this.families().find(product => product.id === productId);
    if (!family) return;
    this.startFamilyEdit(family, 2);
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
