import { Component, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { SupabaseService } from '../core/supabase.service';
import {
  CatalogVariantInput,
  CategoryWithCount,
  InventoryBatch,
  PosService,
  Product,
  ProductVariant,
  Variant,
} from '../pos/pos.service';
import { matchesCatalogQuery } from '../pos/catalog-search';
import { imageExtension, resizeImage } from '../shared/ui/image.util';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { sortList } from '../shared/ui/list-sort';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { PermissionsService } from '../core/permissions.service';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { ProductImportDialogComponent } from './product-import-dialog.component';
import { ProductTransferService, type CatalogImportResult } from './product-transfer.service';
import { BarcodeScannerComponent } from '../shared/ui/barcode-scanner.component';
import { BarcodeLabelDialogComponent } from './barcode-label-dialog.component';
import { BatchProductCategoriesDialogComponent } from './batch-product-categories-dialog.component';
import { BARCODE_MAX_LENGTH, generateDukarunBarcode } from './barcode-labels';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import { PublicProductLinkService } from './public-product-link.service';

type StockInfo = { stock: number; stock_value: number };
type ProductStatusFilter = 'all' | 'active' | 'inactive';
type StockStatusFilter = 'all' | 'in_stock' | 'out_of_stock' | 'not_tracked';
type ManagementVariant = Variant & { stock_value?: number | null };
type ProductGroup = { family: Product; variants: ManagementVariant[] };
type ShareFeedback = { kind: 'success' | 'error'; message: string };
const DEFAULT_PRODUCT_STATUS_FILTER: ProductStatusFilter = 'active';

const PRODUCT_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'name', label: 'Product name' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'stock', label: 'Stock quantity' },
  { value: 'cost_value', label: 'Cost value' },
  { value: 'wholesale_value', label: 'Wholesale value' },
  { value: 'retail_value', label: 'Retail value' },
  { value: 'variants', label: 'Variant count' },
];

/** One variant in the coupled create/edit product editor. */
type DeactivateTarget = { kind: 'category'; category: CategoryWithCount };

interface ProductEditorRow {
  key: string;
  variantId: string | null;
  name: string;
  price: string; // KES text
  sku: string;
  barcode: string;
  pendingBarcode: string | null;
  wholesale: string; // KES text
  kind: string;
  trackInventory: boolean;
  allowFractional: boolean;
  openingQuantity: string;
  openingUnitCost: string;
  openingLocationId: string;
  batchNumber: string;
  expiryDate: string;
  active: boolean;
}

@Component({
  selector: 'app-products',
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    EmptyStateComponent,
    PageLayoutComponent,
    DeleteConfirmationModalComponent,
    StatusBadgeComponent,
    ListSearchBarComponent,
    PaginationComponent,
    DataTableShellComponent,
    StatCardComponent,
    DrawerComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    StatBarComponent,
    ProductImportDialogComponent,
    BarcodeScannerComponent,
    BarcodeLabelDialogComponent,
    SearchableFilterComponent,
    BatchProductCategoriesDialogComponent,
    MobileListComponent,
    PageActionsComponent,
  ],
  template: `
    <app-page
      title="Products"
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
          (click)="openCatalogueLabels()"
        >
          <app-icon name="heroPrinter" /> Print labels
        </button>
        @if (perms.has('ManageCatalog')) {
          <button
            overflowAction
            appButton
            variant="secondary"
            [loading]="transferBusy()"
            type="button"
            (click)="exportProducts()"
          >
            <app-icon name="heroArrowDownTray" /> Export
          </button>
        }
        @if (perms.has('ManageCatalog')) {
          <button
            overflowAction
            appButton
            variant="secondary"
            type="button"
            (click)="importOpen.set(true)"
          >
            <app-icon name="heroArrowUpTray" /> Import
          </button>
        }
        <button
          overflowAction
          appButton
          variant="secondary"
          (click)="categoriesOpen.set(!categoriesOpen())"
        >
          <app-icon name="heroQueueList" /> Categories
        </button>
        @if (perms.has('ManageStockAdjustments')) {
          <button primaryAction appButton variant="primary" (click)="startFamilyCreate()">
            <app-icon name="heroPlus" /> Add product
          </button>
        }
      </app-page-actions>

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
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <div class="flex items-center justify-between">
              <h2 class="card-title text-lg">Categories</h2>
              @if (perms.has('ManageCatalog')) {
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="!connectivity.online() || !categoryMembershipsComplete()"
                  (click)="startCategoryCreate()"
                >
                  <app-icon name="heroPlus" /> New category
                </button>
              }
            </div>

            @if (categoryForm(); as cf) {
              <form
                (submit)="$event.preventDefault(); saveCategory()"
                class="mt-2 flex flex-wrap items-end gap-3 rounded-field bg-base-200 p-2"
              >
                <label class="form-control">
                  <span class="label-text text-xs">Name *</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="categoryName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">Slug</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="auto"
                    [formControl]="categorySlug"
                  />
                </label>
                <label class="form-control flex-1">
                  <span class="label-text text-xs">Description</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="categoryDescription"
                  />
                </label>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  [disabled]="
                    busy() ||
                    !connectivity.online() ||
                    !categoryMembershipsComplete() ||
                    categoryName.value.trim().length === 0
                  "
                >
                  {{ busy() ? 'Saving…' : cf.editing ? 'Save' : 'Create' }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="categoryForm.set(null)">
                  Cancel
                </button>
              </form>
            }

            @if (!categoryMembershipsComplete()) {
              <div role="status" class="alert alert-warning mt-3 text-sm">
                <app-icon name="heroSignalSlash" />
                <span>{{ categoryDataStatusLabel() }}</span>
              </div>
            } @else if (categories().length === 0) {
              <p class="mt-2 text-sm text-base-content/60">
                No categories yet — group products for the storefront or reports.
              </p>
            } @else {
              <app-mobile-list class="mt-3">
                @for (c of categories(); track c.id) {
                  <div mobileListRow>
                    <div class="flex min-h-16 items-center gap-3 p-3">
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left"
                        [disabled]="!perms.has('ManageCatalog') || !connectivity.online()"
                        (click)="startCategoryEdit(c)"
                      >
                        <span class="block truncate font-semibold">{{ c.name }}</span>
                        <span class="type-caption mt-0.5 block truncate">
                          {{ c.slug }} · {{ c.product_count }} products
                        </span>
                      </button>
                      <app-status-badge
                        size="xs"
                        [type]="c.active ? 'neutral' : 'warning'"
                        [label]="c.active ? 'active' : 'inactive'"
                      />
                      @if (perms.has('ManageCatalog')) {
                        @if (c.active) {
                          <button
                            appButton
                            variant="ghost"
                            size="sm"
                            [disabled]="busy() || !connectivity.online()"
                            (click)="confirmDeactivate({ kind: 'category', category: c })"
                          >
                            Deactivate
                          </button>
                        } @else {
                          <button
                            appButton
                            variant="outline"
                            size="sm"
                            [disabled]="busy() || !connectivity.online()"
                            (click)="setCategoryActive(c, true)"
                          >
                            Reactivate
                          </button>
                        }
                      }
                    </div>
                  </div>
                }
              </app-mobile-list>
              <div class="mt-2 hidden lg:block">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Slug</th>
                      <th class="text-right">Products</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of categories(); track c.id) {
                      <tr>
                        <td class="text-sm font-medium">{{ c.name }}</td>
                        <td class="font-mono text-xs">{{ c.slug }}</td>
                        <td class="text-right">{{ c.product_count }}</td>
                        <td>
                          @if (!c.active) {
                            <app-status-badge size="xs" type="neutral" label="inactive" />
                          }
                        </td>
                        <td class="whitespace-nowrap text-right">
                          @if (perms.has('ManageCatalog')) {
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              [disabled]="!connectivity.online()"
                              (click)="startCategoryEdit(c)"
                            >
                              Edit
                            </button>
                            @if (c.active) {
                              <button
                                appButton
                                variant="error"
                                size="sm"
                                [disabled]="busy() || !connectivity.online()"
                                (click)="confirmDeactivate({ kind: 'category', category: c })"
                              >
                                Deactivate
                              </button>
                            } @else {
                              <button
                                appButton
                                variant="outline"
                                size="sm"
                                [disabled]="busy() || !connectivity.online()"
                                (click)="setCategoryActive(c, true)"
                              >
                                Reactivate
                              </button>
                            }
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      }

      <!-- Coupled product editor: details and every variant save together. -->
      @if (editorMode(); as mode) {
        <dialog class="modal modal-open" (cancel)="$event.preventDefault(); closeProductEditor()">
          <div class="modal-box product-editor p-0">
            <form
              class="flex h-full flex-col md:h-auto"
              (submit)="$event.preventDefault(); saveProductEditor()"
            >
              <header
                class="product-editor-header flex shrink-0 items-start justify-between gap-3 border-b border-base-300 px-4 py-3 sm:px-6 sm:py-4"
              >
                <div class="min-w-0">
                  <h2 class="type-title truncate">
                    {{ mode === 'create' ? 'New product' : 'Edit ' + editingFamily()!.name }}
                  </h2>
                  <p class="type-caption mt-0.5">Details and variants save together.</p>
                </div>
                <button
                  appButton
                  type="button"
                  variant="ghost"
                  [iconOnly]="true"
                  aria-label="Close product editor"
                  (click)="closeProductEditor()"
                >
                  <app-icon name="heroXMark" />
                </button>
              </header>

              <nav
                class="grid shrink-0 grid-cols-2 border-b border-base-300 px-4 sm:px-6"
                aria-label="Product editor steps"
              >
                <button
                  type="button"
                  class="flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors"
                  [class.border-primary]="editorStep() === 1"
                  [class.text-primary]="editorStep() === 1"
                  [class.border-transparent]="editorStep() !== 1"
                  [attr.aria-current]="editorStep() === 1 ? 'step' : null"
                  (click)="editorStep.set(1)"
                >
                  <span
                    class="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                    [class.bg-primary]="editorStep() === 1"
                    [class.text-primary-content]="editorStep() === 1"
                    [class.bg-base-200]="editorStep() !== 1"
                    >1</span
                  >
                  Details
                </button>
                <button
                  type="button"
                  class="flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  [class.border-primary]="editorStep() === 2"
                  [class.text-primary]="editorStep() === 2"
                  [class.border-transparent]="editorStep() !== 2"
                  [disabled]="familyName.value.trim().length === 0"
                  [attr.aria-current]="editorStep() === 2 ? 'step' : null"
                  (click)="editorStep.set(2)"
                >
                  <span
                    class="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                    [class.bg-primary]="editorStep() === 2"
                    [class.text-primary-content]="editorStep() === 2"
                    [class.bg-base-200]="editorStep() !== 2"
                    >2</span
                  >
                  Variants
                  <span class="type-caption">{{ editorRows.length }}</span>
                </button>
              </nav>

              <div class="product-editor-body min-h-0 flex-1 overflow-y-auto p-4 pb-6 sm:p-6">
                @if (error()) {
                  <div role="alert" class="alert alert-error mb-4 py-2 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>{{ error() }}</span>
                  </div>
                }

                @if (editorStep() === 1) {
                  <section class="grid gap-5 sm:grid-cols-2">
                    <app-form-field label="Product name" [required]="true">
                      <input
                        type="text"
                        class="input input-bordered w-full"
                        autocomplete="off"
                        [formControl]="familyName"
                      />
                    </app-form-field>
                    <app-form-field
                      label="Manufacturer"
                      hint="Optional. Select an existing manufacturer or type a new one."
                    >
                      <input
                        type="text"
                        class="input input-bordered w-full"
                        autocomplete="off"
                        list="manufacturer-options"
                        placeholder="Optional"
                        [formControl]="familyManufacturer"
                      />
                      <datalist id="manufacturer-options">
                        @for (manufacturer of manufacturers(); track manufacturer.id) {
                          <option [value]="manufacturer.name"></option>
                        }
                      </datalist>
                    </app-form-field>
                    <app-form-field
                      label="Shared barcode"
                      hint="Scan the package barcode or enter it manually. Only suitable for products with one variant."
                    >
                      <div class="flex gap-2">
                        <input
                          type="text"
                          class="input input-bordered min-w-0 flex-1 font-mono"
                          autocomplete="off"
                          placeholder="Scan or enter barcode"
                          [maxLength]="barcodeMaxLength"
                          [formControl]="familyBarcode"
                          (keydown.enter)="$event.preventDefault()"
                        />
                        <button
                          appButton
                          type="button"
                          variant="outline"
                          size="sm"
                          class="shrink-0"
                          title="Scan barcode with camera"
                          aria-label="Scan shared product barcode"
                          (click)="scanFamilyBarcode()"
                        >
                          <app-icon name="heroCamera" />
                          Scan
                        </button>
                      </div>
                    </app-form-field>
                  </section>

                  @if (pendingFamilyBarcode(); as replacement) {
                    <div class="mt-4 rounded-field border border-warning/50 bg-warning/5 p-3">
                      <p class="text-sm font-medium">Replace the shared barcode?</p>
                      <p class="mt-1 break-all text-xs">
                        <span class="font-mono">{{ familyBarcode.value.trim() }}</span>
                        <span class="mx-1.5">→</span>
                        <span class="font-mono">{{ replacement }}</span>
                      </p>
                      <div class="mt-2 flex gap-2">
                        <button
                          appButton
                          type="button"
                          variant="primary"
                          size="sm"
                          (click)="confirmFamilyBarcode()"
                        >
                          Replace
                        </button>
                        <button
                          appButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          (click)="cancelFamilyBarcode()"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  }

                  @if (familyBarcode.value.trim() && editorRows.length > 1) {
                    <div class="alert alert-warning mt-4 text-sm">
                      <app-icon name="heroExclamationTriangle" />
                      <span>
                        A shared barcode can be ambiguous across multiple variants. Assign a barcode
                        to each variant instead.
                      </span>
                    </div>
                  }

                  @if (mode === 'create') {
                    <div
                      class="mt-5 flex items-start gap-3 rounded-field border border-base-300/70 bg-base-200/60 p-3"
                    >
                      <span
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-100 text-primary"
                        aria-hidden="true"
                      >
                        <app-icon name="heroQueueList" />
                      </span>
                      <div>
                        <p class="text-sm font-semibold">Next: pricing and stock</p>
                        <p class="type-caption mt-0.5">
                          Add a selling price, SKU, and opening stock for the first variant.
                        </p>
                      </div>
                    </div>
                  }

                  @if (mode === 'edit') {
                    <section class="mt-5 border-t border-base-300 pt-4">
                      <label
                        class="flex min-h-11 cursor-pointer items-center justify-between gap-4"
                      >
                        <span>
                          <span class="type-heading block">Product available for sale</span>
                          <span class="type-caption block"
                            >Turn this off to hide every variant from Sell.</span
                          >
                        </span>
                        <input
                          type="checkbox"
                          class="toggle toggle-primary"
                          [formControl]="familyActive"
                        />
                      </label>
                    </section>

                    <section class="mt-5 border-t border-base-300 pt-4">
                      <h3 class="section-title">Product image</h3>
                      <div class="mt-3 flex flex-wrap items-center gap-3">
                        @if (imageUrl(editingFamily()!.image_path); as url) {
                          @if (!brokenImages().has(editingFamily()!.image_path!)) {
                            <img
                              [src]="url"
                              alt="Product"
                              class="h-16 w-16 rounded-field object-cover"
                              (error)="markBroken(editingFamily()!.image_path!)"
                            />
                          }
                        }
                        <input
                          type="file"
                          accept="image/*"
                          class="file-input file-input-bordered file-input-sm w-full max-w-sm"
                          [disabled]="imageBusy()"
                          (change)="uploadImage($event)"
                        />
                        @if (editingFamily()!.image_path) {
                          <button
                            appButton
                            type="button"
                            variant="error"
                            [disabled]="imageBusy() || busy()"
                            (click)="removeImage()"
                          >
                            Remove image
                          </button>
                        }
                      </div>
                      <p class="type-caption mt-2">
                        {{ imageBusy() ? 'Uploading…' : 'Images are resized to 800px.' }}
                      </p>
                    </section>

                    <section class="mt-5 border-t border-base-300 pt-4">
                      <h3 class="section-title">Categories</h3>
                      @if (
                        perms.has('ManageCatalog') &&
                        connectivity.online() &&
                        categoryMembershipsComplete()
                      ) {
                        <label class="input input-bordered input-sm mt-3 flex items-center gap-2">
                          <app-icon name="heroMagnifyingGlass" class="text-base-content/50" />
                          <input
                            type="search"
                            class="min-w-0 grow"
                            placeholder="Search categories…"
                            [value]="familyCategoryQuery()"
                            (input)="familyCategoryQuery.set($any($event.target).value)"
                          />
                        </label>
                        <div
                          class="mt-2 max-h-56 overflow-y-auto rounded-box border border-base-300"
                        >
                          @for (c of visibleFamilyCategories(); track c.id) {
                            <label
                              class="flex min-h-11 cursor-pointer items-center gap-3 border-b border-base-200 px-3 last:border-0 hover:bg-base-200"
                            >
                              <input
                                type="checkbox"
                                class="checkbox checkbox-sm"
                                [checked]="familyCategories().has(c.id)"
                                (change)="toggleFamilyCategory(c.id)"
                              />
                              <span class="min-w-0 flex-1 truncate text-sm">{{ c.name }}</span>
                            </label>
                          } @empty {
                            <p class="p-4 text-center text-sm text-base-content/60">
                              No categories match.
                            </p>
                          }
                        </div>
                        @if (matchingFamilyCategories().length > visibleFamilyCategories().length) {
                          <p class="type-caption mt-2">
                            Keep typing to narrow
                            {{ matchingFamilyCategories().length }} categories.
                          </p>
                        }
                      } @else if (categoryMembershipsComplete()) {
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          @for (name of productCategoryNames(editingFamily()!.id); track name) {
                            <span class="badge badge-ghost">{{ name }}</span>
                          } @empty {
                            <p class="type-caption">Uncategorized</p>
                          }
                        </div>
                        @if (perms.has('ManageCatalog') && !connectivity.online()) {
                          <p class="type-caption mt-2">Reconnect to change categories.</p>
                        }
                      } @else {
                        <p class="type-caption mt-2">{{ categoryDataStatusLabel() }}</p>
                      }
                    </section>
                  }
                } @else {
                  <section>
                    <div class="mb-4">
                      <h3 class="section-title">Sellable variants</h3>
                      <p class="type-caption mt-1">
                        Use one variant for a simple item, or add sizes and pack options.
                      </p>
                    </div>

                    @if (editorLoading()) {
                      <div
                        class="flex min-h-32 items-center justify-center gap-2 text-sm text-base-content/60"
                      >
                        <span class="loading loading-spinner loading-sm"></span>
                        Loading variants…
                      </div>
                    } @else {
                      <div class="space-y-2">
                        @for (row of editorRows; track row.key; let index = $index) {
                          <section class="rounded-box bg-base-200/60 p-3">
                            <div class="mb-3 flex min-h-11 items-center justify-between gap-3">
                              <h4 class="type-heading">
                                {{
                                  row.name.trim() ||
                                    (editorRows.length === 1
                                      ? 'Default variant'
                                      : 'Variant ' + (index + 1))
                                }}
                              </h4>
                              @if (row.variantId) {
                                <label class="flex cursor-pointer items-center gap-2">
                                  <span class="type-caption">
                                    {{ row.active ? 'Available' : 'Hidden' }}
                                  </span>
                                  <input
                                    type="checkbox"
                                    class="toggle toggle-primary toggle-sm"
                                    [(ngModel)]="row.active"
                                    [ngModelOptions]="{ standalone: true }"
                                  />
                                </label>
                              } @else {
                                <button
                                  appButton
                                  type="button"
                                  variant="ghost"
                                  [iconOnly]="true"
                                  [disabled]="editorRows.length === 1"
                                  aria-label="Remove variant"
                                  (click)="removeEditorRow(index)"
                                >
                                  <app-icon name="heroXMark" />
                                </button>
                              }
                            </div>

                            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <app-form-field label="Variant label">
                                <input
                                  type="text"
                                  class="input input-bordered w-full"
                                  placeholder="{{
                                    editorRows.length === 1 ? 'Default' : 'e.g. 1 kg'
                                  }}"
                                  [(ngModel)]="row.name"
                                  [ngModelOptions]="{ standalone: true }"
                                />
                              </app-form-field>
                              <app-form-field label="Retail price (KES)" [required]="true">
                                <input
                                  type="text"
                                  inputmode="numeric"
                                  class="input input-bordered w-full"
                                  placeholder="0"
                                  [(ngModel)]="row.price"
                                  [ngModelOptions]="{ standalone: true }"
                                />
                              </app-form-field>
                              <app-form-field label="Item type">
                                <select
                                  class="select select-bordered w-full"
                                  [(ngModel)]="row.kind"
                                  [ngModelOptions]="{ standalone: true }"
                                >
                                  <option value="good">Physical good</option>
                                  <option value="service">Service</option>
                                </select>
                              </app-form-field>
                            </div>

                            <details class="mt-3 border-t border-base-300/70">
                              <summary
                                class="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 py-2 text-sm font-medium"
                              >
                                More options
                                <span class="type-caption font-mono">
                                  SKU {{ row.sku || 'auto' }}
                                  @if (row.barcode) {
                                    · barcode set
                                  }
                                  @if (row.wholesale) {
                                    · wholesale set
                                  }
                                </span>
                              </summary>
                              <div class="grid gap-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
                                <app-form-field label="SKU" hint="Leave blank to generate one.">
                                  <input
                                    type="text"
                                    class="input input-bordered w-full font-mono"
                                    placeholder="Auto"
                                    [(ngModel)]="row.sku"
                                    [ngModelOptions]="{ standalone: true }"
                                  />
                                </app-form-field>
                                <app-form-field
                                  label="Variant barcode"
                                  hint="Overrides the shared barcode."
                                >
                                  <div class="flex gap-1.5">
                                    <input
                                      type="text"
                                      class="input input-bordered min-w-0 flex-1 font-mono"
                                      placeholder="Optional"
                                      [maxLength]="barcodeMaxLength"
                                      [(ngModel)]="row.barcode"
                                      [ngModelOptions]="{ standalone: true }"
                                      (keydown.enter)="$event.preventDefault()"
                                    />
                                    <button
                                      appButton
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      title="Scan barcode"
                                      aria-label="Scan variant barcode"
                                      (click)="scanEditorBarcode(index)"
                                    >
                                      <app-icon name="heroCamera" />
                                    </button>
                                    <button
                                      appButton
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      (click)="generateEditorBarcode(index)"
                                    >
                                      Generate
                                    </button>
                                  </div>
                                </app-form-field>
                                <app-form-field label="Wholesale price (KES)" hint="Optional">
                                  <input
                                    type="text"
                                    inputmode="numeric"
                                    class="input input-bordered w-full"
                                    placeholder="0"
                                    [(ngModel)]="row.wholesale"
                                    [ngModelOptions]="{ standalone: true }"
                                  />
                                </app-form-field>
                              </div>
                              @if (row.pendingBarcode; as replacement) {
                                <div
                                  class="mt-2 rounded-field border border-warning/50 bg-warning/5 p-3"
                                >
                                  <p class="text-sm font-medium">Replace this variant's barcode?</p>
                                  <p class="mt-1 break-all text-xs">
                                    <span class="font-mono">{{ effectiveEditorBarcode(row) }}</span>
                                    <span class="mx-1.5">→</span>
                                    <span class="font-mono">{{ replacement }}</span>
                                  </p>
                                  <div class="mt-2 flex gap-2">
                                    <button
                                      appButton
                                      type="button"
                                      variant="primary"
                                      size="sm"
                                      (click)="confirmEditorBarcode(index)"
                                    >
                                      Replace
                                    </button>
                                    <button
                                      appButton
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      (click)="cancelEditorBarcode(index)"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              }
                            </details>

                            @if (row.kind !== 'service') {
                              <div
                                class="flex flex-wrap gap-x-6 gap-y-1 border-t border-base-300/70 pt-2"
                              >
                                <label class="flex min-h-11 cursor-pointer items-center gap-2">
                                  <input
                                    type="checkbox"
                                    class="checkbox checkbox-sm"
                                    [(ngModel)]="row.trackInventory"
                                    [ngModelOptions]="{ standalone: true }"
                                  />
                                  <span class="text-sm">Track stock</span>
                                </label>
                                <label class="flex min-h-11 cursor-pointer items-center gap-2">
                                  <input
                                    type="checkbox"
                                    class="checkbox checkbox-sm"
                                    [(ngModel)]="row.allowFractional"
                                    [ngModelOptions]="{ standalone: true }"
                                  />
                                  <span class="text-sm">Allow fractional quantities</span>
                                </label>
                                @if (row.variantId && row.trackInventory) {
                                  <span class="ml-auto self-center text-sm text-base-content/60">
                                    Current stock {{ stockOf(row.variantId)?.stock ?? 0 }}
                                  </span>
                                }
                              </div>
                            }

                            @if (!row.variantId && row.kind !== 'service' && row.trackInventory) {
                              <details class="mt-3 border-t border-base-300 pt-3">
                                <summary class="min-h-11 cursor-pointer py-3 text-sm font-medium">
                                  Opening stock
                                  <span class="font-normal text-base-content/60">(optional)</span>
                                </summary>
                                <div class="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                                  <app-form-field label="Quantity">
                                    <input
                                      type="text"
                                      inputmode="decimal"
                                      class="input input-bordered w-full"
                                      placeholder="0"
                                      [(ngModel)]="row.openingQuantity"
                                      [ngModelOptions]="{ standalone: true }"
                                    />
                                  </app-form-field>
                                  <app-form-field label="Unit cost (KES)">
                                    <input
                                      type="text"
                                      inputmode="numeric"
                                      class="input input-bordered w-full"
                                      placeholder="0"
                                      [(ngModel)]="row.openingUnitCost"
                                      [ngModelOptions]="{ standalone: true }"
                                    />
                                  </app-form-field>
                                  <app-form-field label="Stock location">
                                    <select
                                      class="select select-bordered w-full"
                                      [(ngModel)]="row.openingLocationId"
                                      [ngModelOptions]="{ standalone: true }"
                                    >
                                      @for (location of stockLocations(); track location.id) {
                                        <option [value]="location.id">{{ location.name }}</option>
                                      }
                                    </select>
                                  </app-form-field>
                                  <app-form-field label="Batch number" hint="Optional">
                                    <input
                                      type="text"
                                      class="input input-bordered w-full"
                                      [(ngModel)]="row.batchNumber"
                                      [ngModelOptions]="{ standalone: true }"
                                    />
                                  </app-form-field>
                                  @if (preferences.batchExpiryEnabled()) {
                                    <app-form-field label="Expiry date" hint="Optional">
                                      <input
                                        type="date"
                                        class="input input-bordered w-full"
                                        [(ngModel)]="row.expiryDate"
                                        [ngModelOptions]="{ standalone: true }"
                                      />
                                    </app-form-field>
                                  }
                                  @if (row.openingQuantity && row.openingUnitCost) {
                                    <div class="self-end pb-3 text-sm text-base-content/60">
                                      Opening value
                                      <strong class="ml-1 text-base-content">
                                        <app-money
                                          [amount]="
                                            +row.openingQuantity *
                                            (parseAmount(row.openingUnitCost) ?? 0)
                                          "
                                        />
                                      </strong>
                                    </div>
                                  }
                                </div>
                              </details>
                            }
                          </section>
                        }
                      </div>
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        class="mt-3 w-full"
                        [disabled]="editorLoading()"
                        (click)="addEditorRow()"
                      >
                        <app-icon name="heroPlus" /> Add variant
                      </button>
                      @if (duplicateLabels()) {
                        <p class="mt-3 text-sm text-warning">Variant labels must be unique.</p>
                      }
                      @if (effectiveBarcodeConflict()) {
                        <p class="mt-3 text-sm text-warning">
                          Each variant needs a unique effective barcode. Clear the shared barcode or
                          assign individual variant barcodes before saving.
                        </p>
                      }
                    }
                  </section>
                }
              </div>

              <footer
                class="grid shrink-0 grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] gap-2 border-t border-base-300 bg-base-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:items-center sm:justify-between sm:px-6 sm:py-4"
              >
                @if (editorStep() === 1) {
                  <button
                    appButton
                    type="button"
                    variant="outline"
                    class="w-full sm:w-auto"
                    (click)="closeProductEditor()"
                  >
                    Cancel
                  </button>
                  <button
                    appButton
                    type="button"
                    variant="primary"
                    class="w-full sm:w-auto"
                    [disabled]="familyName.value.trim().length === 0"
                    (click)="editorStep.set(2)"
                  >
                    <span class="sm:hidden">Next: variants</span>
                    <span class="hidden sm:inline">Continue to variants</span>
                  </button>
                } @else {
                  <button
                    appButton
                    type="button"
                    variant="outline"
                    class="w-full sm:w-auto"
                    (click)="editorStep.set(1)"
                  >
                    <span class="sm:hidden">Details</span>
                    <span class="hidden sm:inline">Back to details</span>
                  </button>
                  <button
                    appButton
                    type="submit"
                    variant="primary"
                    class="w-full sm:w-auto"
                    [loading]="busy()"
                    [disabled]="
                      editorLoading() ||
                      duplicateLabels() ||
                      familyName.value.trim().length === 0 ||
                      effectiveBarcodeConflict()
                    "
                  >
                    {{ mode === 'create' ? 'Create product' : 'Save product' }}
                  </button>
                }
              </footer>
            </form>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button type="button" aria-label="Close" (click)="closeProductEditor()">close</button>
          </form>
        </dialog>
      }

      <!-- Search -->
      <app-list-search-bar
        placeholder="Search product, manufacturer, variant, SKU, or barcode…"
        [(searchQuery)]="query"
        [sortOptions]="productSortOptions"
        [(sortKey)]="productSort"
        [(sortDirection)]="productSortDirection"
        [filtersEnabled]="true"
        [activeFilterCount]="productActiveFilterCount()"
        (clearFilters)="clearProductFilters()"
      >
        <app-stat-bar summary [stats]="productStats()" />
        <div filters class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span class="type-caption mr-1 font-semibold uppercase tracking-wide">Filters</span>
          <select
            class="select select-bordered min-h-10 w-full select-sm sm:w-40"
            aria-label="Product status"
            title="Product status"
            [value]="productStatusFilter()"
            (change)="setProductStatusFilter($event)"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            class="select select-bordered min-h-10 w-full select-sm sm:w-44"
            aria-label="Stock status"
            title="Stock status"
            [value]="stockStatusFilter()"
            (change)="setStockStatusFilter($event)"
          >
            <option value="all">All stock states</option>
            <option value="in_stock">In stock</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="not_tracked">Not tracked</option>
          </select>
          <app-searchable-filter
            class="w-full sm:w-56"
            ariaLabel="Filter products by manufacturer"
            placeholder="All manufacturers"
            emptyValue="all"
            searchPlaceholder="Search manufacturers…"
            [options]="manufacturerFilterOptions()"
            [value]="manufacturerFilter()"
            (valueChange)="setManufacturerFilter($event)"
          />
          @if (categoryMembershipsComplete()) {
            <app-searchable-filter
              class="w-full sm:w-56"
              ariaLabel="Filter products by category"
              placeholder="All categories"
              emptyValue="all"
              searchPlaceholder="Search categories…"
              [options]="categoryFilterOptions()"
              [value]="categoryFilter()"
              (valueChange)="setCategoryFilter($event)"
            />
          }
          @if (hasProductFilters()) {
            <button
              appButton
              type="button"
              variant="ghost"
              size="sm"
              (click)="clearProductFilters()"
            >
              Clear filters
            </button>
          }
        </div>
      </app-list-search-bar>

      @if (selectedProductIds().size > 0 && categoryMembershipsComplete()) {
        <div class="card mb-3 flex-row items-center gap-3 bg-base-100 p-3">
          <p class="min-w-0 flex-1 text-sm font-semibold">
            {{ selectedProductIds().size }} products selected
          </p>
          <button appButton variant="ghost" size="sm" type="button" (click)="clearSelection()">
            Clear
          </button>
          <button
            appButton
            variant="soft"
            size="sm"
            type="button"
            (click)="batchCategoriesOpen.set(true)"
          >
            <app-icon name="heroQueueList" /> Categorize
          </button>
        </div>
      }

      <!-- Grouped list -->
      @if (!loading() && grouped().length === 0) {
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
                  @if (perms.has('ManageCatalog') && categoryMembershipsComplete()) {
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm mt-1 shrink-0"
                      [checked]="selectedProductIds().has(group.family.id)"
                      [attr.aria-label]="'Select ' + group.family.name"
                      (click)="$event.stopPropagation()"
                      (change)="toggleProductSelection(group.family.id)"
                    />
                  }
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
                    <span class="block truncate font-semibold">{{ group.family.name }}</span>
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
                  </div>
                </div>
              </div>
            </div>
          }
        </app-mobile-list>
        <div class="hidden lg:block">
          <app-data-table-shell
            title="Product catalog"
            [description]="grouped().length + ' matching products'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  @if (perms.has('ManageCatalog') && categoryMembershipsComplete()) {
                    <th class="w-10">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        aria-label="Select products on this page"
                        [checked]="allPageProductsSelected()"
                        [indeterminate]="somePageProductsSelected()"
                        (change)="togglePageSelection()"
                      />
                    </th>
                  }
                  <th>Product</th>
                  <th>Manufacturer</th>
                  <th>Categories</th>
                  <th class="text-right">Variants</th>
                  <th class="text-right">Inventory</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (group of pagedGroups(); track group.family.id) {
                  <tr
                    role="button"
                    tabindex="0"
                    class="cursor-pointer"
                    [class.table-row-active]="selectedProductId() === group.family.id"
                    (click)="openProduct(group.family.id)"
                    (keydown.enter)="openProduct(group.family.id)"
                  >
                    @if (perms.has('ManageCatalog') && categoryMembershipsComplete()) {
                      <td (click)="$event.stopPropagation()">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [checked]="selectedProductIds().has(group.family.id)"
                          [attr.aria-label]="'Select ' + group.family.name"
                          (change)="toggleProductSelection(group.family.id)"
                        />
                      </td>
                    }
                    <td>
                      <span class="font-semibold">{{ group.family.name }}</span>
                      <p class="type-caption mt-0.5 font-mono">
                        {{ group.family.barcode || 'No shared barcode' }}
                      </p>
                    </td>
                    <td>
                      @if (manufacturerName(group.family.manufacturer_id); as manufacturer) {
                        <span class="badge badge-ghost badge-sm">{{ manufacturer }}</span>
                      } @else {
                        <span class="type-caption">—</span>
                      }
                    </td>
                    <td>
                      @if (!categoryMembershipsComplete()) {
                        <span class="type-caption">{{ categoryDataStatusLabel() }}</span>
                      } @else if (productCategoryNames(group.family.id); as categoryNames) {
                        @if (categoryNames.length === 0) {
                          <span class="type-caption">Uncategorized</span>
                        } @else {
                          <div class="flex max-w-56 flex-wrap gap-1">
                            @for (name of categoryNames.slice(0, 2); track name) {
                              <span class="badge badge-ghost badge-sm">{{ name }}</span>
                            }
                            @if (categoryNames.length > 2) {
                              <span class="badge badge-ghost badge-sm"
                                >+{{ categoryNames.length - 2 }}</span
                              >
                            }
                          </div>
                        }
                      }
                    </td>
                    <td class="text-right font-medium">
                      {{ group.variants.length }}
                    </td>
                    <td class="text-right">
                      @if (familyTracksInventory(group.variants)) {
                        <p class="font-medium tabular-nums">{{ familyStock(group.variants) }}</p>
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
              </tbody>
            </table>
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
      <!-- Product detail drawer -->
      @if (selectedGroup(); as group) {
        <app-drawer
          [open]="true"
          (closed)="closeProductDrawer()"
          [title]="group.family.name"
          [subtitle]="
            group.variants.length + (group.variants.length === 1 ? ' variant' : ' variants')
          "
        >
          @if (canShareProduct(group)) {
            <button
              actions
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
              actions
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Edit product"
              aria-label="Edit product"
              (click)="editFromDrawer(group.family)"
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
                        (click)="openSingleLabel(v.variant_id!)"
                      >
                        <app-icon name="heroPrinter" /> Print label
                      </button>
                      @if (perms.has('ManageStockAdjustments')) {
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          (click)="editVariantFromDrawer(group.family.id)"
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
                            routerLink="/stock-adjustments"
                            [queryParams]="{ variant: v.variant_id }"
                          >
                            <app-icon name="heroArrowsRightLeft" /> Adjust stock
                          </a>
                        }
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          (click)="toggleBatches(v.variant_id!)"
                        >
                          <app-icon name="heroQueueList" />
                          {{ batchesFor() === v.variant_id ? 'Hide batches' : 'Batches' }}
                        </button>
                      }
                    </div>
                    @if (batchesFor() === v.variant_id) {
                      <div class="mt-3 rounded-field bg-base-200/70 p-3">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <h4 class="type-caption">Batch history</h4>
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
                                Cost <app-money [amount]="b.unit_cost" />
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
                  </li>
                }
              </ul>
            }
          </div>
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

      <app-delete-confirmation-modal
        [data]="deactivateData()"
        title="Deactivate?"
        verb="deactivate"
        confirmButtonText="Deactivate"
        (confirm)="executeDeactivate()"
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
      <app-product-import-dialog
        [(open)]="importOpen"
        (imported)="productImportCompleted($event)"
      />
      @if (editorScannerTarget() !== null) {
        <app-barcode-scanner
          (scanned)="editorBarcodeScanned($event)"
          (close)="editorScannerTarget.set(null)"
        />
      }
      @defer (when labelDialogMode() !== null) {
        @if (labelDialogMode(); as labelMode) {
          <app-barcode-label-dialog
            [mode]="labelMode"
            [variants]="catalog()"
            [variantId]="labelVariantId()"
            (closed)="closeLabelDialog()"
          />
        }
      }
    </app-page>
  `,
  styles: `
    .product-editor {
      width: 100dvw;
      max-width: 100%;
      height: 100dvh;
      max-height: 100dvh;
      border: 0;
      border-radius: 0;
      overflow: hidden;
    }

    .product-editor-body {
      scrollbar-width: thin;
      scrollbar-color: color-mix(in oklab, var(--color-base-content) 22%, transparent) transparent;
    }

    .product-editor-body::-webkit-scrollbar {
      width: 0.375rem;
    }

    .product-editor-body::-webkit-scrollbar-thumb {
      border-radius: var(--radius-selector);
      background: color-mix(in oklab, var(--color-base-content) 22%, transparent);
    }

    @media (max-width: 767px) {
      .product-editor-header {
        padding-top: max(0.75rem, env(safe-area-inset-top));
      }
    }

    @media (min-width: 768px) {
      .product-editor {
        width: min(48rem, calc(100vw - 3rem));
        max-width: 48rem;
        height: auto;
        max-height: 90dvh;
        border: 1px solid color-mix(in oklab, var(--color-base-300) 60%, transparent);
        border-radius: var(--radius-box);
      }
    }
  `,
})
export class ProductsComponent implements OnInit {
  private readonly pos = inject(PosService);
  private readonly supabase = inject(SupabaseService);
  private readonly catalogCache = inject(CatalogCacheService);
  private readonly locationContext = inject(LocationContextService);
  protected readonly connectivity = inject(ConnectivityService);
  private readonly productTransfer = inject(ProductTransferService);
  private readonly publicProductLinks = inject(PublicProductLinkService);
  protected readonly preferences = inject(CompanyPreferencesService);
  protected readonly perms = inject(PermissionsService);

  protected readonly fmt = formatKes;
  protected readonly barcodeMaxLength = BARCODE_MAX_LENGTH;
  protected readonly families = this.catalogCache.families;
  /** Live view of the shared realtime-backed catalog cache (works offline). */
  protected readonly catalog = this.catalogCache.catalog;
  protected readonly catalogTruncated = this.catalogCache.catalogTruncated;
  protected readonly stock = this.catalogCache.stock;
  protected readonly selectedProductId = signal<string | null>(null);
  protected readonly batchesFor = signal<string | null>(null);
  protected readonly batches = signal<InventoryBatch[]>([]);

  protected readonly query = signal('');
  protected readonly productStatusFilter = signal<ProductStatusFilter>(
    DEFAULT_PRODUCT_STATUS_FILTER
  );
  protected readonly stockStatusFilter = signal<StockStatusFilter>('all');
  protected readonly manufacturerFilter = signal<string>('all');
  protected readonly categoryFilter = signal<string>('all');
  protected readonly productSortOptions = PRODUCT_SORT_OPTIONS;
  protected readonly productSort = signal('name');
  protected readonly productSortDirection = signal<ListSortDirection>('asc');

  protected readonly editingFamily = signal<Product | null>(null);
  protected readonly familyName = new FormControl('', { nonNullable: true });
  protected readonly familyManufacturer = new FormControl('', { nonNullable: true });
  protected readonly familyBarcode = new FormControl('', { nonNullable: true });
  protected readonly familyActive = new FormControl(true, { nonNullable: true });

  /** Coupled create/edit flow: product details and every variant share one editor. */
  protected readonly editorMode = signal<'create' | 'edit' | null>(null);
  protected readonly editorStep = signal<1 | 2>(1);
  protected readonly editorLoading = signal(false);
  private editorRowSequence = 0;
  protected editorRows: ProductEditorRow[] = [];
  protected readonly editorScannerTarget = signal<'family' | number | null>(null);
  protected readonly pendingFamilyBarcode = signal<string | null>(null);
  protected readonly labelDialogMode = signal<'catalogue' | 'single' | null>(null);
  protected readonly labelVariantId = signal<string | null>(null);

  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly shareBusy = signal(false);
  protected readonly shareFeedback = signal<ShareFeedback | null>(null);
  protected readonly transferBusy = signal(false);
  protected readonly importOpen = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  private readonly serverGroups = signal<ProductGroup[]>([]);
  private readonly serverStock = signal<Map<string, StockInfo>>(new Map());
  protected readonly serverTotal = signal(0);
  private readonly serverLoaded = signal(false);
  private serverRequest = 0;
  private serverSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private shareFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly serverMode = computed(() => this.productStatusFilter() !== 'active');

  /** Image picker state (family edit panel). */
  protected readonly imageBusy = signal(false);
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
  protected readonly stockLocations = this.locationContext.locations;
  protected readonly categoryForm = signal<{ editing: CategoryWithCount | null } | null>(null);
  protected readonly categoryName = new FormControl('', { nonNullable: true });
  protected readonly categorySlug = new FormControl('', { nonNullable: true });
  protected readonly categoryDescription = new FormControl('', { nonNullable: true });
  protected readonly familyCategories = signal<Set<string>>(new Set());
  protected readonly familyCategoryQuery = signal('');
  protected readonly matchingFamilyCategories = computed(() => {
    const query = this.familyCategoryQuery().trim().toLocaleLowerCase();
    return this.categories().filter(
      category => category.active && (!query || category.name.toLocaleLowerCase().includes(query))
    );
  });
  protected readonly visibleFamilyCategories = computed(() =>
    this.matchingFamilyCategories().slice(0, 50)
  );
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

  /** Deactivate confirmation (family or variant). */
  protected readonly deactivateTarget = signal<DeactivateTarget | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);

  /** Families with their variants; search filters the cached catalog client-side. */
  protected readonly grouped = computed(() => {
    const q = this.query().trim();
    const productStatus = this.productStatusFilter();
    const stockStatus = this.stockStatusFilter();
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
        if (stockStatus === 'all') return true;
        const tracked = g.variants.filter(
          variant => variant.kind !== 'service' && variant.track_inventory
        );
        if (stockStatus === 'not_tracked') return tracked.length === 0;
        return tracked.some(variant => {
          const quantity = this.stockOf(variant.variant_id!)?.stock ?? 0;
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
      this.manufacturerFilter() !== 'all' ||
      (this.categoryMembershipsComplete() && this.categoryFilter() !== 'all')
  );
  protected readonly productActiveFilterCount = computed(
    () =>
      Number(this.productStatusFilter() !== DEFAULT_PRODUCT_STATUS_FILTER) +
      Number(this.stockStatusFilter() !== 'all') +
      Number(this.manufacturerFilter() !== 'all') +
      Number(this.categoryMembershipsComplete() && this.categoryFilter() !== 'all')
  );
  protected readonly productStats = computed(() => {
    const groups = this.grouped();
    const variants = groups.reduce((count, group) => count + group.variants.length, 0);
    const outOfStock = groups.reduce(
      (count, group) =>
        count +
        group.variants.filter(
          variant =>
            variant.kind !== 'service' &&
            variant.track_inventory &&
            (this.stockOf(variant.variant_id!)?.stock ?? 0) <= 0
        ).length,
      0
    );
    return [
      {
        label: 'Matching products',
        value: this.serverMode() && this.serverLoaded() ? this.serverTotal() : groups.length,
        mobilePriority: 'primary' as const,
      },
      { label: 'Variants shown', value: variants, mobilePriority: 'secondary' as const },
      {
        label: 'Out of stock',
        value: outOfStock,
        tone: outOfStock > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Cost value',
        value: this.fmt(this.totalStockValue()),
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Wholesale value',
        value: this.fmt(this.totalWholesaleStockValue()),
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Retail value',
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
  /** Product family shown in the detail drawer (live — derived from loaded signals). */
  protected readonly selectedGroup = computed(() => {
    const id = this.selectedProductId();
    return id ? (this.grouped().find(g => g.family.id === id) ?? null) : null;
  });

  constructor() {
    // Search is pure client-side filtering over the cached catalog (grouped());
    // typing only resets pagination. Skip the effect's initial run.
    let firstRun = true;
    effect(() => {
      this.query();
      this.productStatusFilter();
      this.stockStatusFilter();
      this.manufacturerFilter();
      this.categoryFilter();
      this.productSort();
      this.productSortDirection();
      if (firstRun) {
        firstRun = false;
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
      const complete = this.categoryMembershipsComplete();
      const selectedCategory = this.categoryFilter();
      if (!complete) {
        this.categoryFilter.set('all');
        this.categoryForm.set(null);
        this.clearSelection();
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
    this.productStatusFilter.set((event.target as HTMLSelectElement).value as ProductStatusFilter);
  }

  protected setStockStatusFilter(event: Event): void {
    this.stockStatusFilter.set((event.target as HTMLSelectElement).value as StockStatusFilter);
  }

  protected setManufacturerFilter(value: string): void {
    this.manufacturerFilter.set(value);
  }

  protected setCategoryFilter(value: string): void {
    if (!this.categoryMembershipsComplete()) return;
    this.categoryFilter.set(value);
  }

  protected toggleProductSelection(productId: string): void {
    if (!this.categoryMembershipsComplete()) return;
    this.selectedProductIds.update(selected => {
      const next = new Set(selected);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  protected togglePageSelection(): void {
    if (!this.categoryMembershipsComplete()) return;
    const pageIds = this.pagedGroups().map(group => group.family.id);
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
    this.query.set('');
    this.productStatusFilter.set(DEFAULT_PRODUCT_STATUS_FILTER);
    this.stockStatusFilter.set('all');
    this.manufacturerFilter.set('all');
    this.categoryFilter.set('all');
  }

  protected manufacturerName(id: string | null): string | null {
    if (!id) return null;
    return (
      this.manufacturers().find(manufacturer => manufacturer.id === id)?.name ??
      this.catalog().find(variant => variant.manufacturer_id === id)?.manufacturer_name ??
      null
    );
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    void this.publicProductLinks.load().catch(() => undefined);
    const hydrated = await this.catalogCache.ensureLoaded();
    if (hydrated) this.loading.set(false);
    void this.preferences.refresh();
    if (!hydrated) {
      const refreshed = await this.catalogCache.refresh();
      if (!refreshed) this.error.set('Could not load the catalog; check your connection.');
      this.loading.set(false);
    }
  }

  private scheduleManagementLoad(): void {
    if (this.serverSearchTimer) clearTimeout(this.serverSearchTimer);
    this.serverSearchTimer = setTimeout(() => void this.loadManagementPage(), 250);
  }

  private async loadManagementPage(): Promise<void> {
    if (!this.serverMode()) return;
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
      if (request !== this.serverRequest) return;
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
    } catch (error) {
      if (request === this.serverRequest) {
        this.error.set(error instanceof Error ? error.message : 'Could not load product history');
      }
    } finally {
      if (request === this.serverRequest) this.loading.set(false);
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

  protected async exportProducts(): Promise<void> {
    this.transferBusy.set(true);
    this.error.set(null);
    try {
      await this.productTransfer.exportCatalog();
      this.notice.set('Product export downloaded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Export failed');
    } finally {
      this.transferBusy.set(false);
    }
  }

  protected async productImportCompleted(result: CatalogImportResult): Promise<void> {
    this.notice.set(
      `Import complete: ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.deactivated_products ?? 0} deactivated`
    );
    await this.load();
  }

  // --- Images ---

  protected imageUrl(path: string | null | undefined): string | null {
    return this.pos.imageUrl(path);
  }

  protected markBroken(path: string): void {
    this.brokenImages.update(set => new Set(set).add(path));
  }

  protected async uploadImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const family = this.editingFamily();
    if (!file || !family) return;
    const companyId = this.supabase.claims()?.company_id;
    if (!companyId) {
      this.error.set('No company in session — re-login');
      return;
    }
    this.imageBusy.set(true);
    this.error.set(null);
    try {
      const resized = await resizeImage(file, 800);
      const path = await this.pos.uploadProductImage(companyId, resized, imageExtension(file));
      // Save the storage PATH (not the URL) on the family.
      await this.pos.updateProduct(family.id, { image_path: path });
      this.editingFamily.set({ ...family, image_path: path });
      this.notice.set('Image uploaded');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      this.imageBusy.set(false);
      input.value = '';
    }
  }

  protected async removeImage(): Promise<void> {
    const family = this.editingFamily();
    if (!family?.image_path) return;
    this.imageBusy.set(true);
    this.error.set(null);
    try {
      await this.pos.updateProduct(family.id, { image_path: '' });
      await this.pos.removeProductImage(family.image_path).catch(() => undefined);
      this.editingFamily.set({ ...family, image_path: null });
      this.notice.set('Image removed');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      this.imageBusy.set(false);
    }
  }

  // --- Categories ---

  protected startCategoryCreate(): void {
    if (
      !this.perms.has('ManageCatalog') ||
      !this.connectivity.online() ||
      !this.categoryMembershipsComplete()
    )
      return;
    this.categoryForm.set({ editing: null });
    this.categoryName.setValue('');
    this.categorySlug.setValue('');
    this.categoryDescription.setValue('');
  }

  protected startCategoryEdit(c: CategoryWithCount): void {
    if (
      !this.perms.has('ManageCatalog') ||
      !this.connectivity.online() ||
      !this.categoryMembershipsComplete()
    )
      return;
    this.categoryForm.set({ editing: c });
    this.categoryName.setValue(c.name);
    this.categorySlug.setValue(c.slug);
    this.categoryDescription.setValue(c.description ?? '');
  }

  protected async saveCategory(): Promise<void> {
    if (
      !this.perms.has('ManageCatalog') ||
      !this.connectivity.online() ||
      !this.categoryMembershipsComplete() ||
      this.categoryName.value.trim().length === 0
    )
      return;
    const cf = this.categoryForm();
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.upsertCategory({
        name: this.categoryName.value.trim(),
        slug: this.categorySlug.value.trim() || undefined,
        description: this.categoryDescription.value.trim() || undefined,
        ...(cf?.editing ? { category_id: cf.editing.id } : {}),
      });
      this.notice.set(cf?.editing ? 'Category updated' : 'Category created');
      this.categoryForm.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setCategoryActive(c: CategoryWithCount, active: boolean): Promise<void> {
    if (
      !this.perms.has('ManageCatalog') ||
      !this.connectivity.online() ||
      !this.categoryMembershipsComplete()
    )
      return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.pos.upsertCategory({
        name: c.name,
        slug: c.slug,
        category_id: c.id,
        active,
      });
      this.notice.set(`${c.name} ${active ? 'reactivated' : 'deactivated'}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected toggleFamilyCategory(categoryId: string): void {
    if (
      !this.perms.has('ManageCatalog') ||
      !this.connectivity.online() ||
      !this.categoryMembershipsComplete()
    )
      return;
    this.familyCategories.update(set => {
      const next = new Set(set);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  protected stockOf(variantId: string): StockInfo | undefined {
    return this.serverMode()
      ? (this.serverStock().get(variantId) ?? this.stock().get(variantId))
      : this.stock().get(variantId);
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
    void this.publicProductLinks.load().catch(() => undefined);
    this.selectedProductId.set(productId);
    this.batchesFor.set(null);
    this.batches.set([]);
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

  /** Called by the drawer after its close transition finishes. */
  protected closeProductDrawer(): void {
    this.selectedProductId.set(null);
    this.batchesFor.set(null);
    this.batches.set([]);
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

  /** The product editor is a two-step modal (surface 3) — close the drawer first. */
  protected editFromDrawer(family: Product): void {
    this.closeProductDrawer();
    this.startFamilyEdit(family);
  }

  protected editVariantFromDrawer(productId: string): void {
    this.closeProductDrawer();
    this.startVariantEdit(productId);
  }

  protected async toggleBatches(variantId: string): Promise<void> {
    if (this.batchesFor() === variantId) {
      this.batchesFor.set(null);
      return;
    }
    this.batchesFor.set(variantId);
    try {
      this.batches.set(await this.pos.variantBatches(variantId));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load batches');
    }
  }

  // --- Coupled product editor ---

  protected startFamilyCreate(): void {
    if (!this.perms.has('ManageStockAdjustments')) return;
    this.error.set(null);
    this.editorLoading.set(false);
    this.editingFamily.set(null);
    this.familyName.setValue('');
    this.familyManufacturer.setValue('');
    this.familyBarcode.setValue('');
    this.pendingFamilyBarcode.set(null);
    this.familyActive.setValue(true);
    this.familyCategories.set(new Set());
    this.familyCategoryQuery.set('');
    this.editorRows = [this.emptyEditorRow()];
    this.editorStep.set(1);
    this.editorMode.set('create');
  }

  protected startFamilyEdit(family: Product, step: 1 | 2 = 1): void {
    if (!this.perms.has('ManageStockAdjustments')) return;
    this.error.set(null);
    this.editingFamily.set(family);
    this.familyName.setValue(family.name);
    this.familyManufacturer.setValue(this.manufacturerName(family.manufacturer_id) ?? '');
    this.familyBarcode.setValue(family.barcode ?? '');
    this.pendingFamilyBarcode.set(null);
    this.familyActive.setValue(family.active);
    this.familyCategories.set(new Set());
    this.familyCategoryQuery.set('');
    this.editorRows = [];
    this.editorStep.set(step);
    this.editorLoading.set(true);
    this.editorMode.set('edit');

    void Promise.all([
      this.pos.variantsForProduct(family.id),
      this.pos.productCategoryIds(family.id),
    ])
      .then(([variants, categoryIds]) => {
        if (this.editingFamily()?.id !== family.id || this.editorMode() !== 'edit') return;
        this.editorRows = variants.map(variant =>
          this.editorRowFromVariant(variant, variants.length)
        );
        if (this.editorRows.length === 0) this.addEditorRow();
        this.familyCategories.set(new Set(categoryIds));
      })
      .catch(err => {
        if (this.editingFamily()?.id !== family.id || this.editorMode() !== 'edit') return;
        this.error.set(err instanceof Error ? err.message : 'Failed to load product variants');
      })
      .finally(() => {
        if (this.editingFamily()?.id === family.id) this.editorLoading.set(false);
      });
  }

  protected closeProductEditor(): void {
    if (this.busy()) return;
    this.editorLoading.set(false);
    this.editorMode.set(null);
    this.editingFamily.set(null);
    this.editorScannerTarget.set(null);
    this.pendingFamilyBarcode.set(null);
    this.error.set(null);
  }

  protected addEditorRow(): void {
    this.editorRows = [...this.editorRows, this.emptyEditorRow()];
  }

  protected removeEditorRow(index: number): void {
    if (this.editorRows.length === 1 || this.editorRows[index]?.variantId) return;
    this.editorRows = this.editorRows.filter((_, rowIndex) => rowIndex !== index);
  }

  protected duplicateLabels(): boolean {
    const labels = this.editorRows
      .map(row => row.name.trim().toLowerCase())
      .filter(label => label.length > 0);
    return new Set(labels).size !== labels.length;
  }

  protected effectiveBarcodeConflict(): boolean {
    return this.editorBarcodeConflictValue() !== null;
  }

  private editorBarcodeConflictValue(): string | null {
    if (!this.familyActive.value) return null;
    const seen = new Set<string>();
    const editingProductId = this.editingFamily()?.id ?? null;
    const existing = new Set(
      this.catalog()
        .filter(
          variant =>
            variant.product_id !== editingProductId &&
            variant.variant_active &&
            variant.product_active &&
            !!variant.barcode?.trim()
        )
        .map(variant => variant.barcode!.trim())
    );
    for (const row of this.editorRows) {
      if (!row.active) continue;
      const barcode = this.effectiveEditorBarcode(row);
      if (!barcode) continue;
      if (seen.has(barcode) || existing.has(barcode)) return barcode;
      seen.add(barcode);
    }
    return null;
  }

  protected effectiveEditorBarcode(row: ProductEditorRow): string {
    return row.barcode.trim() || this.familyBarcode.value.trim();
  }

  protected scanEditorBarcode(index: number): void {
    this.error.set(null);
    this.editorScannerTarget.set(index);
  }

  protected scanFamilyBarcode(): void {
    this.error.set(null);
    this.editorScannerTarget.set('family');
  }

  protected editorBarcodeScanned(value: string): void {
    const target = this.editorScannerTarget();
    this.editorScannerTarget.set(null);
    if (target === null) return;
    if (target === 'family') {
      this.proposeFamilyBarcode(value);
      return;
    }
    this.proposeEditorBarcode(target, value);
  }

  protected confirmFamilyBarcode(): void {
    const barcode = this.pendingFamilyBarcode();
    if (!barcode) return;
    this.familyBarcode.setValue(barcode);
    this.pendingFamilyBarcode.set(null);
  }

  protected cancelFamilyBarcode(): void {
    this.pendingFamilyBarcode.set(null);
  }

  private proposeFamilyBarcode(scannedValue: string): void {
    const barcode = scannedValue.trim();
    if (!barcode) return;
    if (barcode.length > BARCODE_MAX_LENGTH) {
      this.error.set(`Barcodes can be at most ${BARCODE_MAX_LENGTH} characters.`);
      return;
    }
    const current = this.familyBarcode.value.trim();
    if (barcode === current) {
      this.pendingFamilyBarcode.set(null);
      return;
    }
    if (current) {
      this.pendingFamilyBarcode.set(barcode);
      return;
    }
    this.familyBarcode.setValue(barcode);
    this.pendingFamilyBarcode.set(null);
  }

  protected generateEditorBarcode(index: number): void {
    this.proposeEditorBarcode(index, generateDukarunBarcode());
  }

  protected confirmEditorBarcode(index: number): void {
    const row = this.editorRows[index];
    if (!row?.pendingBarcode) return;
    row.barcode = row.pendingBarcode;
    row.pendingBarcode = null;
  }

  protected cancelEditorBarcode(index: number): void {
    const row = this.editorRows[index];
    if (row) row.pendingBarcode = null;
  }

  private proposeEditorBarcode(index: number, scannedValue: string): void {
    const row = this.editorRows[index];
    const barcode = scannedValue.trim();
    if (!row || !barcode) return;
    if (barcode.length > BARCODE_MAX_LENGTH) {
      this.error.set(`Barcodes can be at most ${BARCODE_MAX_LENGTH} characters.`);
      return;
    }
    const current = this.effectiveEditorBarcode(row);
    if (barcode === current) {
      row.pendingBarcode = null;
      return;
    }
    if (current) {
      row.pendingBarcode = barcode;
      return;
    }
    row.barcode = barcode;
    row.pendingBarcode = null;
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
  }

  protected familyBarcodeAmbiguous(group: ProductGroup): boolean {
    const shared = group.family.barcode?.trim();
    return !!shared && group.variants.filter(variant => variant.barcode === shared).length > 1;
  }

  protected async saveProductEditor(): Promise<void> {
    const mode = this.editorMode();
    const editing = this.editingFamily();
    const name = this.familyName.value.trim();
    if (!mode || !name || this.editorLoading() || this.duplicateLabels()) return;
    if (this.effectiveBarcodeConflict()) {
      const barcode = this.editorBarcodeConflictValue();
      this.error.set(
        barcode
          ? `Barcode “${barcode}” is already assigned to another active variant.`
          : 'Each active variant needs a unique barcode.'
      );
      return;
    }
    if (this.familyBarcode.value.trim().length > BARCODE_MAX_LENGTH) {
      this.error.set(`Barcodes can be at most ${BARCODE_MAX_LENGTH} characters.`);
      return;
    }

    const variants = this.buildVariantInputs();
    if (!variants) return;

    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const manufacturerName = this.familyManufacturer.value.trim();
      const existingManufacturer = this.manufacturers().find(
        item => item.name.toLocaleLowerCase() === manufacturerName.toLocaleLowerCase()
      );
      const manufacturerId = manufacturerName
        ? (existingManufacturer?.id ?? (await this.pos.upsertManufacturer(manufacturerName)))
        : null;
      if (mode === 'create') {
        await this.pos.createProductWithVariants({
          name,
          barcode: this.familyBarcode.value.trim() || undefined,
          manufacturer_id: manufacturerId,
          variants,
        });
        this.notice.set(`Created ${name}`);
      } else if (editing) {
        await this.pos.updateProductWithVariants({
          product_id: editing.id,
          name,
          barcode: this.familyBarcode.value.trim(),
          active: this.familyActive.value,
          manufacturer_id: manufacturerId,
          variants,
        });
        if (this.perms.has('ManageCatalog') && this.connectivity.online()) {
          await this.pos.setProductCategories(editing.id, [...this.familyCategories()]);
        }
        this.notice.set(
          `Updated ${name} and ${variants.length} variant${variants.length === 1 ? '' : 's'}`
        );
      }
      this.editorMode.set(null);
      this.editingFamily.set(null);
      await this.load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      this.error.set(
        (message.toLowerCase().includes('duplicate') &&
          message.toLowerCase().includes('barcode')) ||
          message.toLowerCase().includes('barcode_conflict')
          ? 'That barcode is already assigned to another variant.'
          : message
      );
    } finally {
      this.busy.set(false);
    }
  }

  private buildVariantInputs(): CatalogVariantInput[] | null {
    const variants: CatalogVariantInput[] = [];
    for (const row of this.editorRows) {
      if (row.barcode.trim().length > BARCODE_MAX_LENGTH) {
        this.error.set(`Barcodes can be at most ${BARCODE_MAX_LENGTH} characters.`);
        return null;
      }
      const price = parseKes(row.price);
      if (price === null) {
        this.error.set('Every variant needs a valid retail price.');
        return null;
      }

      const wholesalePrice = row.wholesale.trim() ? parseKes(row.wholesale) : null;
      if (row.wholesale.trim() && wholesalePrice === null) {
        this.error.set('Enter a valid wholesale price on every variant.');
        return null;
      }

      const isService = row.kind === 'service';
      const openingQuantity =
        !row.variantId && !isService && row.openingQuantity.trim()
          ? Number(row.openingQuantity)
          : 0;
      if (!Number.isFinite(openingQuantity) || openingQuantity < 0) {
        this.error.set('Opening quantity must be zero or greater.');
        return null;
      }
      if (openingQuantity > 0 && !row.trackInventory) {
        this.error.set('Opening stock requires stock tracking.');
        return null;
      }
      if (openingQuantity > 0 && !row.allowFractional && !Number.isInteger(openingQuantity)) {
        this.error.set('Enable fractional quantities or enter a whole opening quantity.');
        return null;
      }

      const openingUnitCost = row.openingUnitCost.trim() ? parseKes(row.openingUnitCost) : null;
      if (openingQuantity > 0 && openingUnitCost === null) {
        this.error.set('Enter a valid unit cost for opening stock.');
        return null;
      }

      variants.push({
        ...(row.variantId ? { variant_id: row.variantId } : {}),
        ...(row.name.trim() ? { name: row.name.trim() } : {}),
        price,
        ...(row.sku.trim() ? { sku: row.sku.trim() } : {}),
        barcode: row.barcode.trim() || null,
        wholesale_price: wholesalePrice,
        kind: row.kind,
        track_inventory: isService ? false : row.trackInventory,
        allow_fractional: isService ? false : row.allowFractional,
        active: row.active,
        ...(openingQuantity > 0
          ? {
              opening_quantity: openingQuantity,
              opening_unit_cost: openingUnitCost!,
              ...(row.openingLocationId ? { opening_location_id: row.openingLocationId } : {}),
              ...(row.batchNumber.trim() ? { batch_number: row.batchNumber.trim() } : {}),
              ...(this.preferences.batchExpiryEnabled() && row.expiryDate
                ? { expiry_date: row.expiryDate }
                : {}),
            }
          : {}),
      });
    }
    return variants;
  }

  private emptyEditorRow(): ProductEditorRow {
    return {
      key: `new-${++this.editorRowSequence}`,
      variantId: null,
      name: '',
      price: '',
      sku: '',
      barcode: '',
      pendingBarcode: null,
      wholesale: '',
      kind: 'good',
      trackInventory: true,
      allowFractional: false,
      openingQuantity: '',
      openingUnitCost: '',
      openingLocationId: this.locationContext.activeId() ?? this.stockLocations()[0]?.id ?? '',
      batchNumber: '',
      expiryDate: '',
      active: true,
    };
  }

  private editorRowFromVariant(variant: ProductVariant, variantCount: number): ProductEditorRow {
    return {
      ...this.emptyEditorRow(),
      key: `variant-${variant.id}`,
      variantId: variant.id,
      name: variant.name === 'Default' && variantCount === 1 ? '' : variant.name,
      price: formatKesInput(variant.price),
      sku: variant.sku,
      barcode: variant.barcode ?? '',
      wholesale: variant.wholesale_price === null ? '' : formatKesInput(variant.wholesale_price),
      kind: variant.kind,
      trackInventory: variant.track_inventory,
      allowFractional: variant.allow_fractional,
      active: variant.active,
    };
  }

  protected parseAmount(value: string): number | null {
    return parseKes(value);
  }

  protected confirmDeactivate(target: DeactivateTarget): void {
    this.deactivateTarget.set(target);
    this.deleteModal()?.show();
  }

  protected deactivateData() {
    const t = this.deactivateTarget();
    if (!t) return { entityName: '' };
    return {
      entityName: t.category.name,
      relatedCount: t.category.product_count,
      relatedLabel: 'product',
      warningDetails: ['Products stay; only the category grouping is deactivated.'],
    };
  }

  protected async executeDeactivate(): Promise<void> {
    const t = this.deactivateTarget();
    if (!t) return;
    this.deleteModal()?.hide();
    await this.setCategoryActive(t.category, false);
    this.deactivateTarget.set(null);
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
