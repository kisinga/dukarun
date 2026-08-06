import { Component, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { SupabaseService } from '../core/supabase.service';
import {
  CatalogVariantInput,
  CollectionWithCount,
  InventoryBatch,
  Manufacturer,
  PosService,
  Product,
  ProductVariant,
  StockLocation,
  Variant,
} from '../pos/pos.service';
import { imageExtension, resizeImage } from '../shared/ui/image.util';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
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
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { PermissionsService } from '../core/permissions.service';
import { CatalogCacheService } from '../core/catalog-cache.service';

type StockInfo = { stock: number; stock_value: number };
type ProductStatusFilter = 'all' | 'active' | 'inactive';
type StockStatusFilter = 'all' | 'in_stock' | 'out_of_stock' | 'not_tracked';

/** One variant in the coupled create/edit product editor. */
type DeactivateTarget = { kind: 'collection'; collection: CollectionWithCount };

interface ProductEditorRow {
  key: string;
  variantId: string | null;
  name: string;
  price: string; // KES text
  sku: string;
  barcode: string;
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
  ],
  template: `
    <app-page
      title="Products"
      subtitle="Manage the catalog, pricing, variants, and the stock available to sell."
      [wide]="true"
    >
      <button
        actions
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
        actions
        appButton
        variant="secondary"
        (click)="collectionsOpen.set(!collectionsOpen())"
      >
        <app-icon name="heroQueueList" /> Collections
      </button>
      <button actions appButton variant="primary" (click)="startFamilyCreate()">
        <app-icon name="heroPlus" /> Add product
      </button>

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
            >Catalog too large for offline cache — showing first 2,000 products; use search.</span
          >
        </div>
      }

      <!-- Collections panel -->
      @if (collectionsOpen()) {
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <div class="flex items-center justify-between">
              <h2 class="card-title text-lg">Collections</h2>
              <button class="btn btn-ghost btn-sm" (click)="startCollectionCreate()">
                + New collection
              </button>
            </div>

            @if (collectionForm(); as cf) {
              <form
                (submit)="$event.preventDefault(); saveCollection()"
                class="mt-2 flex flex-wrap items-end gap-3 rounded-field bg-base-200 p-2"
              >
                <label class="form-control">
                  <span class="label-text text-xs">Name *</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="collectionName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">Slug</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="auto"
                    [formControl]="collectionSlug"
                  />
                </label>
                <label class="form-control flex-1">
                  <span class="label-text text-xs">Description</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="collectionDescription"
                  />
                </label>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  [disabled]="busy() || collectionName.value.trim().length === 0"
                >
                  {{ busy() ? 'Saving…' : cf.editing ? 'Save' : 'Create' }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  (click)="collectionForm.set(null)"
                >
                  Cancel
                </button>
              </form>
            }

            @if (collections().length === 0) {
              <p class="mt-2 text-sm text-base-content/60">
                No collections yet — group products for the storefront or reports.
              </p>
            } @else {
              <table class="table table-sm mt-2">
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
                  @for (c of collections(); track c.id) {
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
                        <button class="btn btn-ghost btn-xs" (click)="startCollectionEdit(c)">
                          Edit
                        </button>
                        @if (c.active) {
                          <button
                            class="btn btn-error btn-outline btn-xs"
                            [disabled]="busy()"
                            (click)="confirmDeactivate({ kind: 'collection', collection: c })"
                          >
                            Deactivate
                          </button>
                        } @else {
                          <button
                            class="btn btn-success btn-outline btn-xs"
                            [disabled]="busy()"
                            (click)="setCollectionActive(c, true)"
                          >
                            Reactivate
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
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
              <header class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
                <div>
                  <h2 class="type-title">
                    {{ mode === 'create' ? 'New product' : 'Edit ' + editingFamily()!.name }}
                  </h2>
                  <p class="type-caption mt-1">Product details and variants are saved together.</p>
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
                class="grid grid-cols-2 gap-2 border-b border-base-300 px-4 py-3"
                aria-label="Product editor steps"
              >
                <button
                  appButton
                  type="button"
                  [variant]="editorStep() === 1 ? 'soft' : 'ghost'"
                  (click)="editorStep.set(1)"
                >
                  1. Details
                </button>
                <button
                  appButton
                  type="button"
                  [variant]="editorStep() === 2 ? 'soft' : 'ghost'"
                  [disabled]="familyName.value.trim().length === 0"
                  (click)="editorStep.set(2)"
                >
                  2. Variants ({{ editorRows.length }})
                </button>
              </nav>

              <div class="min-h-0 flex-1 overflow-y-auto p-4">
                @if (error()) {
                  <div role="alert" class="alert alert-error mb-4 py-2 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>{{ error() }}</span>
                  </div>
                }

                @if (editorStep() === 1) {
                  <section class="grid gap-4 sm:grid-cols-2">
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
                      hint="Used when a variant does not have its own barcode."
                    >
                      <input
                        type="text"
                        class="input input-bordered w-full"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="Optional"
                        [formControl]="familyBarcode"
                      />
                    </app-form-field>
                  </section>

                  @if (mode === 'edit') {
                    <section class="mt-6 border-t border-base-300 pt-4">
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

                    <section class="mt-6 border-t border-base-300 pt-4">
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
                          class="file-input file-input-bordered file-input-sm max-w-xs"
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

                    <section class="mt-6 border-t border-base-300 pt-4">
                      <h3 class="section-title">Collections</h3>
                      <div class="mt-3 flex flex-wrap gap-4">
                        @for (c of collections(); track c.id) {
                          @if (c.active) {
                            <label class="flex min-h-11 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                class="checkbox checkbox-sm"
                                [checked]="familyCollections().has(c.id)"
                                (change)="toggleFamilyCollection(c.id)"
                              />
                              <span class="text-sm">{{ c.name }}</span>
                            </label>
                          }
                        } @empty {
                          <p class="type-caption">No collections yet.</p>
                        }
                      </div>
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
                                  <input
                                    type="text"
                                    inputmode="numeric"
                                    class="input input-bordered w-full"
                                    placeholder="Optional"
                                    [(ngModel)]="row.barcode"
                                    [ngModelOptions]="{ standalone: true }"
                                  />
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
                    }
                  </section>
                }
              </div>

              <footer
                class="flex items-center justify-between gap-3 border-t border-base-300 bg-base-100 p-4"
              >
                @if (editorStep() === 1) {
                  <button appButton type="button" variant="ghost" (click)="closeProductEditor()">
                    Cancel
                  </button>
                  <button
                    appButton
                    type="button"
                    variant="primary"
                    [disabled]="familyName.value.trim().length === 0"
                    (click)="editorStep.set(2)"
                  >
                    Continue to variants
                  </button>
                } @else {
                  <button appButton type="button" variant="ghost" (click)="editorStep.set(1)">
                    Back to details
                  </button>
                  <button
                    appButton
                    type="submit"
                    variant="primary"
                    [loading]="busy()"
                    [disabled]="
                      editorLoading() || duplicateLabels() || familyName.value.trim().length === 0
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
        placeholder="Search product, variant, SKU, or barcode…"
        [(searchQuery)]="query"
      >
        <app-stat-bar summary [stats]="productStats()" />
        <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:items-end">
          <app-form-field label="Product status" class="lg:w-44">
            <select
              class="select select-bordered select-sm w-full"
              [value]="productStatusFilter()"
              (change)="setProductStatusFilter($event)"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </app-form-field>
          <app-form-field label="Stock" class="lg:w-44">
            <select
              class="select select-bordered select-sm w-full"
              [value]="stockStatusFilter()"
              (change)="setStockStatusFilter($event)"
            >
              <option value="all">All stock states</option>
              <option value="in_stock">In stock</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="not_tracked">Not tracked</option>
            </select>
          </app-form-field>
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
        <div class="flex flex-col gap-2 lg:hidden">
          @for (group of pagedGroups(); track group.family.id) {
            <div
              class="card cursor-pointer bg-base-100"
              role="button"
              tabindex="0"
              [class.border-primary]="selectedProductId() === group.family.id"
              (click)="openProduct(group.family.id)"
              (keydown.enter)="openProduct(group.family.id)"
            >
              <div class="card-body p-4">
                <div class="flex items-start gap-3">
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
                    @if (manufacturerName(group.family.manufacturer_id); as manufacturer) {
                      <span class="badge badge-ghost badge-sm mt-1">{{ manufacturer }}</span>
                    }
                    <span class="type-caption mt-0.5 block">
                      {{ group.variants.length }}
                      {{ group.variants.length === 1 ? 'variant' : 'variants' }}
                      @if (group.family.barcode) {
                        · <span class="font-mono">{{ group.family.barcode }}</span>
                      }
                    </span>
                  </div>
                  @if (!group.family.active) {
                    <app-status-badge type="warning" label="inactive" />
                  }
                </div>

                <div class="mt-3 flex flex-wrap gap-1.5 border-t border-base-200 pt-3">
                  <button
                    appButton
                    variant="outline"
                    size="sm"
                    (click)="$event.stopPropagation(); startFamilyEdit(group.family)"
                  >
                    Edit product
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
        <div class="hidden lg:block">
          <app-data-table-shell
            title="Product catalog"
            [description]="grouped().length + ' matching products'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Manufacturer</th>
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
                    <td class="text-right font-medium">
                      {{ group.variants.length }}
                    </td>
                    <td class="text-right">
                      @if (familyTracksInventory(group.variants)) {
                        <p class="font-medium tabular-nums">{{ familyStock(group.variants) }}</p>
                        <p class="type-caption tabular-nums">
                          <app-money [amount]="familyStockValue(group.variants)" /> value
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
            [totalItems]="grouped().length"
            [itemsPerPage]="pageSize()"
            [showItemsPerPage]="true"
            itemLabel="products"
            (pageChange)="page.set($event)"
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

          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="type-caption">Product status</p>
            <app-status-badge
              size="xs"
              [type]="group.family.active ? 'neutral' : 'warning'"
              [label]="group.family.active ? 'active' : 'inactive'"
            />
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <app-stat-card label="Variants" [value]="group.variants.length + ''" />
            <app-stat-card
              label="Stock"
              [value]="
                familyTracksInventory(group.variants)
                  ? familyStock(group.variants) + ' units'
                  : 'Not tracked'
              "
              [sub]="
                familyTracksInventory(group.variants)
                  ? fmt(familyStockValue(group.variants)) + ' value'
                  : undefined
              "
            />
          </div>

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
                      }
                      @if (v.kind === 'service') {
                        <p class="type-caption">Service · Inventory not tracked</p>
                      } @else if (v.track_inventory) {
                        <p class="type-caption tabular-nums">
                          <span class="font-semibold text-base-content/80">
                            {{ stockOf(v.variant_id!)?.stock ?? 0 }} in stock
                          </span>
                          · <app-money [amount]="stockOf(v.variant_id!)?.stock_value ?? 0" /> value
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
                        (click)="editVariantFromDrawer(group.family.id)"
                      >
                        <app-icon name="heroPencilSquare" /> Edit
                      </button>
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

      <app-delete-confirmation-modal
        [data]="deactivateData()"
        title="Deactivate?"
        verb="deactivate"
        confirmButtonText="Deactivate"
        (confirm)="executeDeactivate()"
      />
    </app-page>
  `,
  styles: `
    .product-editor {
      width: 100%;
      max-width: 100%;
    }

    @media (min-width: 768px) {
      .product-editor {
        width: min(48rem, calc(100vw - 3rem));
        max-width: 48rem;
      }
    }
  `,
})
export class ProductsComponent implements OnInit {
  private readonly pos = inject(PosService);
  private readonly supabase = inject(SupabaseService);
  private readonly catalogCache = inject(CatalogCacheService);
  protected readonly preferences = inject(CompanyPreferencesService);
  protected readonly perms = inject(PermissionsService);

  protected readonly fmt = formatKes;
  protected readonly families = this.catalogCache.families;
  /** Live view of the shared realtime-backed catalog cache (works offline). */
  protected readonly catalog = this.catalogCache.catalog;
  protected readonly catalogTruncated = this.catalogCache.catalogTruncated;
  protected readonly stock = this.catalogCache.stock;
  protected readonly selectedProductId = signal<string | null>(null);
  protected readonly batchesFor = signal<string | null>(null);
  protected readonly batches = signal<InventoryBatch[]>([]);

  protected readonly query = signal('');
  protected readonly productStatusFilter = signal<ProductStatusFilter>('all');
  protected readonly stockStatusFilter = signal<StockStatusFilter>('all');

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

  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  /** Image picker state (family edit panel). */
  protected readonly imageBusy = signal(false);
  protected readonly brokenImages = signal<Set<string>>(new Set());

  /** Collections panel + per-family checkbox editor. */
  protected readonly collectionsOpen = signal(false);
  protected readonly collections = signal<CollectionWithCount[]>([]);
  protected readonly manufacturers = signal<Manufacturer[]>([]);
  protected readonly stockLocations = signal<StockLocation[]>([]);
  protected readonly collectionForm = signal<{ editing: CollectionWithCount | null } | null>(null);
  protected readonly collectionName = new FormControl('', { nonNullable: true });
  protected readonly collectionSlug = new FormControl('', { nonNullable: true });
  protected readonly collectionDescription = new FormControl('', { nonNullable: true });
  protected readonly familyCollections = signal<Set<string>>(new Set());

  /** Deactivate confirmation (family or variant). */
  protected readonly deactivateTarget = signal<DeactivateTarget | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);

  /** Families with their variants; search filters the cached catalog client-side. */
  protected readonly grouped = computed(() => {
    const q = this.query().trim().toLowerCase();
    const productStatus = this.productStatusFilter();
    const stockStatus = this.stockStatusFilter();
    const byProduct = new Map<string, Variant[]>();
    for (const v of this.catalog()) {
      if (!v.product_id) continue;
      if (
        q &&
        !(
          (v.product_name ?? '').toLowerCase().includes(q) ||
          (v.variant_name ?? '').toLowerCase().includes(q) ||
          (v.sku ?? '').toLowerCase().includes(q) ||
          (v.barcode ?? '').toLowerCase().includes(q) ||
          (v.manufacturer_name ?? '').toLowerCase().includes(q)
        )
      ) {
        continue;
      }
      const list = byProduct.get(v.product_id) ?? [];
      list.push(v);
      byProduct.set(v.product_id, list);
    }
    return this.families()
      .map(family => ({ family, variants: byProduct.get(family.id) ?? [] }))
      .filter(g => {
        const matchesSearch =
          g.variants.length > 0 || !q || g.family.name.toLowerCase().includes(q);
        if (!matchesSearch) return false;
        if (productStatus !== 'all') {
          const isActive = g.family.active;
          if (productStatus === 'active' ? !isActive : isActive) return false;
        }
        if (stockStatus === 'all') return true;
        const tracksInventory = this.familyTracksInventory(g.variants);
        if (stockStatus === 'not_tracked') return !tracksInventory;
        if (!tracksInventory) return false;
        const quantity = this.familyStock(g.variants);
        return stockStatus === 'in_stock' ? quantity > 0 : quantity <= 0;
      });
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
  protected readonly hasProductFilters = computed(
    () =>
      this.query().trim().length > 0 ||
      this.productStatusFilter() !== 'all' ||
      this.stockStatusFilter() !== 'all'
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
      { label: 'Matching products', value: groups.length },
      { label: 'Variants shown', value: variants },
      { label: 'Cost value', value: this.fmt(this.totalStockValue()) },
      { label: 'Retail value', value: this.fmt(this.totalRetailStockValue()) },
      {
        label: 'Out of stock',
        value: outOfStock,
        tone: outOfStock > 0 ? ('warning' as const) : ('neutral' as const),
      },
    ];
  });
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.grouped().length / this.pageSize()))
  );
  protected readonly pagedGroups = computed(() => {
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
      if (firstRun) {
        firstRun = false;
        return;
      }
      this.page.set(1);
    });
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  protected setProductStatusFilter(event: Event): void {
    this.productStatusFilter.set((event.target as HTMLSelectElement).value as ProductStatusFilter);
  }

  protected setStockStatusFilter(event: Event): void {
    this.stockStatusFilter.set((event.target as HTMLSelectElement).value as StockStatusFilter);
  }

  protected clearProductFilters(): void {
    this.query.set('');
    this.productStatusFilter.set('all');
    this.stockStatusFilter.set('all');
  }

  protected manufacturerName(id: string | null): string | null {
    if (!id) return null;
    return this.manufacturers().find(manufacturer => manufacturer.id === id)?.name ?? null;
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    const hydrated = await this.catalogCache.ensureLoaded();
    if (hydrated) this.loading.set(false);
    void this.preferences.refresh();
    void this.loadAuxiliary().catch(err => {
      this.error.set(err instanceof Error ? err.message : 'Failed to load product settings');
    });
    if (!hydrated) {
      const refreshed = await this.catalogCache.refresh();
      if (!refreshed) this.error.set('Could not load the catalog; check your connection.');
      this.loading.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.catalogCache.refresh(),
        this.preferences.refresh(),
        this.loadAuxiliary(),
      ]);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadAuxiliary(): Promise<void> {
    const [collections, locations, manufacturers] = await Promise.all([
      this.pos.listCollections(),
      this.pos.listStockLocations(),
      this.pos.listManufacturers(),
    ]);
    this.collections.set(collections);
    this.stockLocations.set(locations);
    this.manufacturers.set(manufacturers);
    const defaultLocationId = locations[0]?.id ?? '';
    this.editorRows = this.editorRows.map(row => ({
      ...row,
      openingLocationId: row.openingLocationId || defaultLocationId,
    }));
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

  // --- Collections ---

  protected startCollectionCreate(): void {
    this.collectionForm.set({ editing: null });
    this.collectionName.setValue('');
    this.collectionSlug.setValue('');
    this.collectionDescription.setValue('');
  }

  protected startCollectionEdit(c: CollectionWithCount): void {
    this.collectionForm.set({ editing: c });
    this.collectionName.setValue(c.name);
    this.collectionSlug.setValue(c.slug);
    this.collectionDescription.setValue(c.description ?? '');
  }

  protected async saveCollection(): Promise<void> {
    if (this.collectionName.value.trim().length === 0) return;
    const cf = this.collectionForm();
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.upsertCollection({
        name: this.collectionName.value.trim(),
        slug: this.collectionSlug.value.trim() || undefined,
        description: this.collectionDescription.value.trim() || undefined,
        ...(cf?.editing ? { collection_id: cf.editing.id } : {}),
      });
      this.notice.set(cf?.editing ? 'Collection updated' : 'Collection created');
      this.collectionForm.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setCollectionActive(c: CollectionWithCount, active: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.pos.upsertCollection({
        name: c.name,
        slug: c.slug,
        collection_id: c.id,
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

  protected toggleFamilyCollection(collectionId: string): void {
    this.familyCollections.update(set => {
      const next = new Set(set);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }

  protected stockOf(variantId: string): StockInfo | undefined {
    return this.stock().get(variantId);
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

  protected openProduct(productId: string): void {
    this.selectedProductId.set(productId);
    this.batchesFor.set(null);
    this.batches.set([]);
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeProductDrawer(): void {
    this.selectedProductId.set(null);
    this.batchesFor.set(null);
    this.batches.set([]);
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
    this.error.set(null);
    this.editorLoading.set(false);
    this.editingFamily.set(null);
    this.familyName.setValue('');
    this.familyManufacturer.setValue('');
    this.familyBarcode.setValue('');
    this.familyActive.setValue(true);
    this.familyCollections.set(new Set());
    this.editorRows = [this.emptyEditorRow()];
    this.editorStep.set(1);
    this.editorMode.set('create');
  }

  protected startFamilyEdit(family: Product, step: 1 | 2 = 1): void {
    this.error.set(null);
    this.editingFamily.set(family);
    this.familyName.setValue(family.name);
    this.familyManufacturer.setValue(this.manufacturerName(family.manufacturer_id) ?? '');
    this.familyBarcode.setValue(family.barcode ?? '');
    this.familyActive.setValue(family.active);
    this.familyCollections.set(new Set());
    this.editorRows = [];
    this.editorStep.set(step);
    this.editorLoading.set(true);
    this.editorMode.set('edit');

    void Promise.all([
      this.pos.variantsForProduct(family.id),
      this.pos.productCollectionIds(family.id),
    ])
      .then(([variants, collectionIds]) => {
        if (this.editingFamily()?.id !== family.id || this.editorMode() !== 'edit') return;
        this.editorRows = variants.map(variant =>
          this.editorRowFromVariant(variant, variants.length)
        );
        if (this.editorRows.length === 0) this.addEditorRow();
        this.familyCollections.set(new Set(collectionIds));
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

  protected async saveProductEditor(): Promise<void> {
    const mode = this.editorMode();
    const editing = this.editingFamily();
    const name = this.familyName.value.trim();
    if (!mode || !name || this.editorLoading() || this.duplicateLabels()) return;

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
        await this.pos.setProductCollections(editing.id, [...this.familyCollections()]);
        this.notice.set(
          `Updated ${name} and ${variants.length} variant${variants.length === 1 ? '' : 's'}`
        );
      }
      this.editorMode.set(null);
      this.editingFamily.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  private buildVariantInputs(): CatalogVariantInput[] | null {
    const variants: CatalogVariantInput[] = [];
    for (const row of this.editorRows) {
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
      wholesale: '',
      kind: 'good',
      trackInventory: true,
      allowFractional: false,
      openingQuantity: '',
      openingUnitCost: '',
      openingLocationId: this.stockLocations()[0]?.id ?? '',
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
      entityName: t.collection.name,
      relatedCount: t.collection.product_count,
      relatedLabel: 'product',
      warningDetails: ['Products stay; only the collection grouping is deactivated.'],
    };
  }

  protected async executeDeactivate(): Promise<void> {
    const t = this.deactivateTarget();
    if (!t) return;
    this.deleteModal()?.hide();
    await this.setCollectionActive(t.collection, false);
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
