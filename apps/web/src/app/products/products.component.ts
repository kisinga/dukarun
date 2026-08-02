import { Component, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { formatKes, parseKesToCents } from '../core/money';
import { SupabaseService } from '../core/supabase.service';
import {
  CollectionWithCount,
  InventoryBatch,
  PosService,
  Product,
  Variant,
  variantLabel,
} from '../pos/pos.service';
import { imageExtension, resizeImage } from '../shared/ui/image.util';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { MobileFabComponent } from '../shared/ui/mobile-fab.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';

type StockInfo = { stock: number; stock_value: number };

/** One row of the create form's inline variants editor. */
type DeactivateTarget =
  | { kind: 'family'; family: Product; variants: number }
  | { kind: 'variant'; variant: Variant }
  | { kind: 'collection'; collection: CollectionWithCount };

interface CreateRow {
  name: string;
  price: string; // KES text
  sku: string;
  barcode: string;
  wholesale: string; // KES text
  kind: string;
  trackInventory: boolean;
  allowFractional: boolean;
}

@Component({
  selector: 'app-products',
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    PageHeaderComponent,
    EmptyStateComponent,
    NgIcon,
    DeleteConfirmationModalComponent,
    MobileFabComponent,
    StatusBadgeComponent,
    ListSearchBarComponent,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page">
        <app-page-header title="Products" backLink="/dashboard" backLabel="Dashboard">
          <span actions class="text-sm text-base-content/60">
            total stock value {{ fmt(totalStockValue()) }}
          </span>
          <button
            actions
            class="btn btn-outline btn-sm"
            (click)="collectionsOpen.set(!collectionsOpen())"
          >
            Collections
          </button>
          <button actions class="btn btn-primary btn-sm" (click)="startFamilyCreate()">
            + New product
          </button>
        </app-page-header>

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

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Family create / edit panel -->
        <!-- Create panel: family + inline variants editor (one coupled RPC) -->
        @if (createOpen()) {
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">New product</h2>
              <form
                (submit)="$event.preventDefault(); saveCreate()"
                class="mt-2 flex flex-col gap-3"
              >
                <div class="flex flex-wrap items-end gap-3">
                  <label class="form-control">
                    <span class="label-text">Family name *</span>
                    <input
                      type="text"
                      class="input input-bordered input-sm"
                      [formControl]="familyName"
                    />
                  </label>
                  <label class="form-control">
                    <span class="label-text">Barcode (family default)</span>
                    <input
                      type="text"
                      class="input input-bordered input-sm"
                      [formControl]="familyBarcode"
                    />
                  </label>
                </div>

                <!-- Variant rows (min 1) -->
                <div class="flex flex-col gap-2">
                  @for (row of createRows; track $index) {
                    <div class="flex flex-wrap items-end gap-2 rounded-field bg-base-200 p-2">
                      <label class="form-control w-28">
                        <span class="label-text text-xs">Label</span>
                        <input
                          type="text"
                          class="input input-bordered input-xs"
                          placeholder="e.g. 1kg, S — leave blank for single-variant"
                          [(ngModel)]="row.name"
                          [ngModelOptions]="{ standalone: true }"
                        />
                      </label>
                      <label class="form-control w-24">
                        <span class="label-text text-xs">Price (KES) *</span>
                        <input
                          type="text"
                          inputmode="decimal"
                          class="input input-bordered input-xs"
                          placeholder="0.00"
                          [(ngModel)]="row.price"
                          [ngModelOptions]="{ standalone: true }"
                        />
                      </label>
                      <label class="form-control w-24">
                        <span class="label-text text-xs">SKU</span>
                        <input
                          type="text"
                          class="input input-bordered input-xs"
                          placeholder="auto"
                          [(ngModel)]="row.sku"
                          [ngModelOptions]="{ standalone: true }"
                        />
                      </label>
                      <label class="form-control w-28">
                        <span class="label-text text-xs">Barcode override</span>
                        <input
                          type="text"
                          class="input input-bordered input-xs"
                          [(ngModel)]="row.barcode"
                          [ngModelOptions]="{ standalone: true }"
                        />
                      </label>
                      <label class="form-control w-24">
                        <span class="label-text text-xs">Wholesale (KES)</span>
                        <input
                          type="text"
                          inputmode="decimal"
                          class="input input-bordered input-xs"
                          placeholder="0.00"
                          [(ngModel)]="row.wholesale"
                          [ngModelOptions]="{ standalone: true }"
                        />
                      </label>
                      <label class="form-control w-24">
                        <span class="label-text text-xs">Kind</span>
                        <select
                          class="select select-bordered select-xs"
                          [(ngModel)]="row.kind"
                          [ngModelOptions]="{ standalone: true }"
                        >
                          <option value="good">Good</option>
                          <option value="service">Service</option>
                        </select>
                      </label>
                      @if (row.kind !== 'service') {
                        <label class="label cursor-pointer justify-start gap-1 py-0">
                          <input
                            type="checkbox"
                            class="checkbox checkbox-xs"
                            [(ngModel)]="row.trackInventory"
                            [ngModelOptions]="{ standalone: true }"
                          />
                          <span class="label-text text-xs">Track stock</span>
                        </label>
                        <label class="label cursor-pointer justify-start gap-1 py-0">
                          <input
                            type="checkbox"
                            class="checkbox checkbox-xs"
                            [(ngModel)]="row.allowFractional"
                            [ngModelOptions]="{ standalone: true }"
                          />
                          <span class="label-text text-xs">Fractional</span>
                        </label>
                      }
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        [disabled]="createRows.length === 1"
                        (click)="removeCreateRow($index)"
                      >
                        <ng-icon name="heroXMark" />
                      </button>
                    </div>
                  }
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm self-start"
                    (click)="addCreateRow()"
                  >
                    <ng-icon name="heroPlus" /> Add variant
                  </button>
                  @if (duplicateLabels()) {
                    <p class="text-xs text-warning">Two variants share the same label.</p>
                  }
                </div>

                <div class="flex gap-2">
                  <button
                    type="submit"
                    class="btn btn-primary btn-sm min-h-11"
                    [disabled]="busy() || familyName.value.trim().length === 0"
                  >
                    {{ busy() ? 'Creating…' : 'Create product' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    (click)="createOpen.set(false)"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        }

        <!-- Family edit panel -->
        @if (familyFormOpen()) {
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">Edit {{ editingFamily()!.name }}</h2>
              <form
                (submit)="$event.preventDefault(); saveFamily()"
                class="mt-2 flex flex-wrap items-end gap-3"
              >
                <label class="form-control">
                  <span class="label-text">Name *</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="familyName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Barcode (family default)</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="familyBarcode"
                  />
                </label>
                <label class="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [formControl]="familyActive"
                  />
                  <span class="label-text">Active</span>
                </label>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  [disabled]="busy() || familyName.value.trim().length === 0"
                >
                  {{ busy() ? 'Saving…' : 'Save changes' }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="closeFamilyForm()">
                  Cancel
                </button>
              </form>

              <!-- Image -->
              <div class="mt-3 flex items-center gap-3 border-t border-base-300/60 pt-3">
                @if (imageUrl(editingFamily()!.image_path); as url) {
                  @if (!brokenImages().has(editingFamily()!.image_path!)) {
                    <img
                      [src]="url"
                      alt="Product image"
                      class="h-16 w-16 rounded-field object-cover"
                      (error)="markBroken(editingFamily()!.image_path!)"
                    />
                  }
                }
                <div class="flex flex-col gap-1">
                  <span class="type-caption">
                    {{ editingFamily()!.image_path ? 'Replace image' : 'Add image' }} (resized to
                    800px)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    class="file-input file-input-bordered file-input-sm w-full max-w-xs"
                    [disabled]="imageBusy()"
                    (change)="uploadImage($event)"
                  />
                  @if (imageBusy()) {
                    <span class="type-caption">Uploading…</span>
                  }
                </div>
                @if (editingFamily()!.image_path) {
                  <button
                    class="btn btn-error btn-outline btn-xs"
                    [disabled]="imageBusy() || busy()"
                    (click)="removeImage()"
                  >
                    Remove
                  </button>
                }
              </div>

              <!-- Collections -->
              <div class="mt-3 border-t border-base-300/60 pt-3">
                <span class="type-caption">Collections</span>
                <div class="mt-1 flex flex-wrap gap-2">
                  @for (c of collections(); track c.id) {
                    @if (c.active) {
                      <label class="label cursor-pointer justify-start gap-2 py-0">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [checked]="familyCollections().has(c.id)"
                          (change)="toggleFamilyCollection(c.id)"
                        />
                        <span class="label-text text-sm">{{ c.name }}</span>
                      </label>
                    }
                  }
                  @if (collections().length === 0) {
                    <span class="text-xs text-base-content/60">
                      No collections yet — create some from the Collections panel.
                    </span>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Variant create / edit panel -->
        @if (variantForm(); as vf) {
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">
                {{ vf.editing ? 'Edit ' + label(vf.editing) : 'New variant' }}
              </h2>
              <form
                (submit)="$event.preventDefault(); saveVariant()"
                class="mt-2 grid gap-3 sm:grid-cols-3"
              >
                <label class="form-control">
                  <span class="label-text">Label * (e.g. 1kg, S)</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="variantName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Price (KES) *</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-bordered input-sm"
                    placeholder="0.00"
                    [formControl]="variantPrice"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Kind</span>
                  <select class="select select-bordered select-sm" [formControl]="variantKind">
                    <option value="good">Good</option>
                    <option value="service">Service</option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text">SKU</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="auto"
                    [disabled]="vf.editing !== null"
                    [formControl]="variantSku"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Barcode override</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="variantBarcode"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Wholesale (KES, optional)</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-bordered input-sm"
                    placeholder="0.00"
                    [formControl]="variantWholesale"
                  />
                </label>
                @if (variantKind.value !== 'service') {
                  <div class="flex items-center gap-4">
                    <label class="label cursor-pointer justify-start gap-2 py-0">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        [formControl]="variantTrackInventory"
                      />
                      <span class="label-text">Track inventory</span>
                    </label>
                    <label class="label cursor-pointer justify-start gap-2 py-0">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        [formControl]="variantAllowFractional"
                      />
                      <span class="label-text">Allow fractional</span>
                    </label>
                  </div>
                }
                @if (vf.editing) {
                  <label class="label cursor-pointer justify-start gap-2 py-0">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [formControl]="variantActive"
                    />
                    <span class="label-text">Active</span>
                  </label>
                }
                <div class="flex gap-2 sm:col-span-3">
                  <button
                    type="submit"
                    class="btn btn-primary btn-sm"
                    [disabled]="busy() || variantName.value.trim().length === 0"
                  >
                    {{ busy() ? 'Saving…' : vf.editing ? 'Save variant' : 'Create variant' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    (click)="variantForm.set(null)"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        }

        <!-- Search -->
        <div class="mb-3">
          <app-list-search-bar
            placeholder="Search product, variant, SKU, or barcode…"
            [(searchQuery)]="query"
          />
        </div>

        <!-- Grouped list -->
        @if (grouped().length === 0) {
          <app-empty-state
            icon="heroCube"
            title="No products found"
            description="Create your first product with + New product, or clear the search."
          />
        } @else {
          <div class="flex flex-col gap-2">
            @for (group of grouped(); track group.family.id) {
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <!-- Family row -->
                  <div class="flex flex-wrap items-center gap-3">
                    @if (imageUrl(group.family.image_path); as thumb) {
                      @if (!brokenImages().has(group.family.image_path!)) {
                        <img
                          [src]="thumb"
                          alt=""
                          class="h-10 w-10 rounded-field object-cover"
                          (error)="markBroken(group.family.image_path!)"
                        />
                      }
                    }
                    <button class="link font-semibold" (click)="toggleFamily(group.family.id)">
                      {{ group.family.name }}
                    </button>
                    @if (group.family.barcode) {
                      <span class="font-mono text-xs text-base-content/60">{{
                        group.family.barcode
                      }}</span>
                    }
                    @if (!group.family.active) {
                      <app-status-badge type="neutral" label="inactive" />
                    }
                    <span class="text-xs text-base-content/60">
                      {{ group.variants.length }} variant(s)
                    </span>
                    <span class="ml-auto"></span>
                    <button class="btn btn-ghost btn-xs" (click)="startFamilyEdit(group.family)">
                      Edit
                    </button>
                    <button
                      class="btn btn-primary btn-outline btn-xs"
                      (click)="startVariantCreate(group.family.id)"
                    >
                      + Variant
                    </button>
                    @if (group.family.active) {
                      <button
                        class="btn btn-error btn-outline btn-xs"
                        [disabled]="busy()"
                        (click)="
                          confirmDeactivate({
                            kind: 'family',
                            family: group.family,
                            variants: group.variants.length,
                          })
                        "
                      >
                        Deactivate
                      </button>
                    } @else {
                      <button
                        class="btn btn-success btn-outline btn-xs"
                        [disabled]="busy()"
                        (click)="setFamilyActive(group.family, true)"
                      >
                        Reactivate
                      </button>
                    }
                  </div>

                  <!-- Variants -->
                  @if (expandedFamily() === group.family.id) {
                    @if (group.variants.length === 0) {
                      <p class="mt-2 text-xs text-base-content/60">
                        No variants (legacy data — new products always create with variants). Add
                        one via + Variant to sell this product.
                      </p>
                    } @else {
                      <table class="table table-sm mt-2">
                        <thead>
                          <tr>
                            <th class="pl-6">Variant</th>
                            <th>SKU</th>
                            <th>Barcode</th>
                            <th class="text-right">Price</th>
                            <th class="text-right">Stock</th>
                            <th class="text-right">Stock value</th>
                            <th>Kind</th>
                            <th>Status</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (v of group.variants; track v.variant_id) {
                            <tr>
                              <td class="pl-6">
                                <button class="link" (click)="toggleBatches(v.variant_id!)">
                                  {{ v.variant_name }}
                                </button>
                              </td>
                              <td class="font-mono text-xs">{{ v.sku }}</td>
                              <td class="font-mono text-xs">{{ v.barcode ?? '—' }}</td>
                              <td class="text-right">{{ fmt(v.price ?? 0) }}</td>
                              <td class="text-right">
                                {{
                                  v.kind === 'service' || !v.track_inventory
                                    ? '—'
                                    : (stockOf(v.variant_id!)?.stock ?? 0)
                                }}
                              </td>
                              <td class="text-right">
                                {{
                                  v.kind === 'service' || !v.track_inventory
                                    ? '—'
                                    : fmt(stockOf(v.variant_id!)?.stock_value ?? 0)
                                }}
                              </td>
                              <td>
                                <span
                                  class="badge badge-xs"
                                  [class.badge-info]="v.kind === 'service'"
                                  [class.badge-ghost]="v.kind !== 'service'"
                                >
                                  {{ v.kind }}
                                </span>
                              </td>
                              <td>
                                @if (!v.variant_active) {
                                  <app-status-badge size="xs" type="neutral" label="inactive" />
                                }
                              </td>
                              <td class="whitespace-nowrap text-right">
                                <button
                                  class="btn btn-ghost btn-xs"
                                  (click)="startVariantEdit(group.family.id, v)"
                                >
                                  Edit
                                </button>
                                @if (v.variant_active) {
                                  <button
                                    class="btn btn-error btn-outline btn-xs"
                                    [disabled]="busy()"
                                    (click)="confirmDeactivate({ kind: 'variant', variant: v })"
                                  >
                                    Deactivate
                                  </button>
                                } @else {
                                  <button
                                    class="btn btn-success btn-outline btn-xs"
                                    [disabled]="busy()"
                                    (click)="setVariantActive(v, true)"
                                  >
                                    Reactivate
                                  </button>
                                }
                              </td>
                            </tr>
                            @if (batchesFor() === v.variant_id) {
                              <tr>
                                <td colspan="9" class="bg-base-200/50">
                                  <div class="p-2">
                                    <div class="mb-1 flex items-center justify-between">
                                      <h3 class="text-sm font-semibold">Batch history</h3>
                                      <a routerLink="/money/suppliers" class="link text-xs">
                                        Restock via Suppliers → record purchase
                                      </a>
                                    </div>
                                    @if (batches().length === 0) {
                                      <p class="text-xs text-base-content/60">
                                        No stock batches yet.
                                      </p>
                                    } @else {
                                      <table class="table table-xs">
                                        <thead>
                                          <tr>
                                            <th>Purchased</th>
                                            <th class="text-right">Qty</th>
                                            <th class="text-right">Remaining</th>
                                            <th class="text-right">Unit cost</th>
                                            <th>Expiry</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          @for (b of batches(); track b.id) {
                                            <tr>
                                              <td>{{ date(b.purchased_at) }}</td>
                                              <td class="text-right">{{ b.quantity }}</td>
                                              <td class="text-right">{{ b.remaining }}</td>
                                              <td class="text-right">{{ fmt(b.unit_cost) }}</td>
                                              <td>{{ b.expiry_date ?? '—' }}</td>
                                            </tr>
                                          }
                                        </tbody>
                                      </table>
                                    }
                                  </div>
                                </td>
                              </tr>
                            }
                          }
                        </tbody>
                      </table>
                    }
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

      <app-mobile-fab ariaLabel="New product" (fabClick)="startFamilyCreate()" />
      <app-delete-confirmation-modal
        [data]="deactivateData()"
        title="Deactivate?"
        verb="deactivate"
        confirmButtonText="Deactivate"
        (confirm)="executeDeactivate()"
      />
    </main>
  `,
})
export class ProductsComponent implements OnInit {
  private readonly pos = inject(PosService);
  private readonly supabase = inject(SupabaseService);

  protected readonly fmt = formatKes;
  protected readonly label = variantLabel;
  protected readonly families = signal<Product[]>([]);
  protected readonly catalog = signal<Variant[]>([]);
  protected readonly stock = signal<Map<string, StockInfo>>(new Map());
  protected readonly expandedFamily = signal<string | null>(null);
  protected readonly batchesFor = signal<string | null>(null);
  protected readonly batches = signal<InventoryBatch[]>([]);

  protected readonly query = signal('');

  protected readonly familyFormOpen = signal(false);
  protected readonly editingFamily = signal<Product | null>(null);
  protected readonly familyName = new FormControl('', { nonNullable: true });
  protected readonly familyBarcode = new FormControl('', { nonNullable: true });
  protected readonly familyActive = new FormControl(true, { nonNullable: true });

  /** Create flow: family + inline variant rows (one coupled RPC). */
  protected readonly createOpen = signal(false);
  protected createRows: CreateRow[] = [this.emptyCreateRow()];

  protected readonly variantForm = signal<{ productId: string; editing: Variant | null } | null>(
    null
  );
  protected readonly variantName = new FormControl('', { nonNullable: true });
  protected readonly variantPrice = new FormControl('', { nonNullable: true });
  protected readonly variantKind = new FormControl('good', { nonNullable: true });
  protected readonly variantSku = new FormControl('', { nonNullable: true });
  protected readonly variantBarcode = new FormControl('', { nonNullable: true });
  protected readonly variantWholesale = new FormControl('', { nonNullable: true });
  protected readonly variantTrackInventory = new FormControl(true, { nonNullable: true });
  protected readonly variantAllowFractional = new FormControl(false, { nonNullable: true });
  protected readonly variantActive = new FormControl(true, { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** Image picker state (family edit panel). */
  protected readonly imageBusy = signal(false);
  protected readonly brokenImages = signal<Set<string>>(new Set());

  /** Collections panel + per-family checkbox editor. */
  protected readonly collectionsOpen = signal(false);
  protected readonly collections = signal<CollectionWithCount[]>([]);
  protected readonly collectionForm = signal<{ editing: CollectionWithCount | null } | null>(null);
  protected readonly collectionName = new FormControl('', { nonNullable: true });
  protected readonly collectionSlug = new FormControl('', { nonNullable: true });
  protected readonly collectionDescription = new FormControl('', { nonNullable: true });
  protected readonly familyCollections = signal<Set<string>>(new Set());

  /** Deactivate confirmation (family or variant). */
  protected readonly deactivateTarget = signal<DeactivateTarget | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);

  /** Families with their variants; families with no variants only show when not searching. */
  protected readonly grouped = computed(() => {
    const q = this.query().trim().toLowerCase();
    const byProduct = new Map<string, Variant[]>();
    for (const v of this.catalog()) {
      if (!v.product_id) continue;
      const list = byProduct.get(v.product_id) ?? [];
      list.push(v);
      byProduct.set(v.product_id, list);
    }
    return this.families()
      .map(family => ({ family, variants: byProduct.get(family.id) ?? [] }))
      .filter(g => {
        if (g.variants.length > 0) return true;
        if (!q) return true; // empty families visible when not searching
        return g.family.name.toLowerCase().includes(q);
      });
  });

  protected readonly totalStockValue = computed(() => {
    let sum = 0;
    for (const info of this.stock().values()) sum += info.stock_value;
    return sum;
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Debounced search (list-search-bar model → reload).
    effect(() => {
      this.query();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => void this.load(), 200);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [families, catalog, stock, collections] = await Promise.all([
        this.pos.listFamilies(),
        this.pos.listCatalog(this.query()),
        this.pos.productStock(),
        this.pos.listCollections(),
      ]);
      this.families.set(families);
      this.catalog.set(catalog);
      this.stock.set(stock);
      this.collections.set(collections);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load products');
    }
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

  protected toggleFamily(productId: string): void {
    this.expandedFamily.update(cur => (cur === productId ? null : productId));
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

  // --- Create flow: family + inline variants editor (coupled RPC) ---

  protected startFamilyCreate(): void {
    this.familyName.setValue('');
    this.familyBarcode.setValue('');
    this.createRows = [this.emptyCreateRow()];
    this.createOpen.set(true);
  }

  protected addCreateRow(): void {
    this.createRows = [...this.createRows, this.emptyCreateRow()];
  }

  protected removeCreateRow(index: number): void {
    if (this.createRows.length === 1) return;
    this.createRows = this.createRows.filter((_, i) => i !== index);
  }

  /** Pre-warn on duplicate labels (the server would create them anyway). */
  protected duplicateLabels(): boolean {
    const labels = this.createRows.map(r => r.name.trim().toLowerCase()).filter(l => l.length > 0);
    return new Set(labels).size !== labels.length;
  }

  protected async saveCreate(): Promise<void> {
    if (this.familyName.value.trim().length === 0) return;
    const variants: {
      name?: string;
      price: number;
      sku?: string;
      barcode?: string;
      wholesale_price?: number;
      kind?: string;
      allow_fractional?: boolean;
      track_inventory?: boolean;
    }[] = [];
    for (const row of this.createRows) {
      const priceCents = parseKesToCents(row.price);
      if (priceCents === null) {
        this.error.set('Every variant needs a valid price');
        return;
      }
      const wholesaleCents = row.wholesale.trim()
        ? (parseKesToCents(row.wholesale) ?? undefined)
        : undefined;
      if (row.wholesale.trim() && wholesaleCents === undefined) {
        this.error.set('Enter a valid wholesale price on every variant');
        return;
      }
      const isService = row.kind === 'service';
      variants.push({
        // Unlabeled single variant becomes 'Default' server-side.
        ...(row.name.trim() ? { name: row.name.trim() } : {}),
        price: priceCents,
        ...(row.sku.trim() ? { sku: row.sku.trim() } : {}),
        ...(row.barcode.trim() ? { barcode: row.barcode.trim() } : {}),
        ...(wholesaleCents !== undefined ? { wholesale_price: wholesaleCents } : {}),
        kind: row.kind,
        // Services carry no inventory flags.
        ...(isService
          ? {}
          : {
              track_inventory: row.trackInventory,
              allow_fractional: row.allowFractional,
            }),
      });
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.createProductWithVariants({
        name: this.familyName.value.trim(),
        barcode: this.familyBarcode.value.trim() || undefined,
        variants,
      });
      this.notice.set(`Created ${this.familyName.value.trim()}`);
      this.createOpen.set(false);
      await this.load();
    } catch (err) {
      // variants_required / invalid_price / invalid_kind — shown verbatim.
      this.error.set(err instanceof Error ? err.message : 'Create failed');
    } finally {
      this.busy.set(false);
    }
  }

  private emptyCreateRow(): CreateRow {
    return {
      name: '',
      price: '',
      sku: '',
      barcode: '',
      wholesale: '',
      kind: 'good',
      trackInventory: true,
      allowFractional: false,
    };
  }

  // --- Family edit form ---

  protected startFamilyEdit(family: Product): void {
    this.editingFamily.set(family);
    this.familyName.setValue(family.name);
    this.familyBarcode.setValue(family.barcode ?? '');
    this.familyActive.setValue(family.active);
    this.familyFormOpen.set(true);
    // Load the family's current collection set for the checkbox editor.
    this.familyCollections.set(new Set());
    void this.pos
      .productCollectionIds(family.id)
      .then(ids => this.familyCollections.set(new Set(ids)))
      .catch(() => undefined);
  }

  protected closeFamilyForm(): void {
    this.familyFormOpen.set(false);
    this.editingFamily.set(null);
  }

  protected async saveFamily(): Promise<void> {
    const editing = this.editingFamily();
    if (!editing || this.familyName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.updateProduct(editing.id, {
        name: this.familyName.value.trim(),
        barcode: this.familyBarcode.value.trim() || undefined,
        active: this.familyActive.value,
      });
      // Replace the collection set with exactly what the checkboxes say.
      await this.pos.setProductCollections(editing.id, [...this.familyCollections()]);
      this.notice.set(`Updated ${this.familyName.value.trim()}`);
      this.closeFamilyForm();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected confirmDeactivate(target: DeactivateTarget): void {
    this.deactivateTarget.set(target);
    this.deleteModal()?.show();
  }

  protected deactivateData() {
    const t = this.deactivateTarget();
    if (!t) return { entityName: '' };
    if (t.kind === 'family') {
      return {
        entityName: t.family.name,
        relatedCount: t.variants,
        relatedLabel: 'variant',
        warningDetails: ['Deactivated products disappear from the Sell screen search.'],
      };
    }
    if (t.kind === 'collection') {
      return {
        entityName: t.collection.name,
        relatedCount: t.collection.product_count,
        relatedLabel: 'product',
        warningDetails: ['Products stay; only the collection grouping is deactivated.'],
      };
    }
    return {
      entityName: this.label(t.variant),
      warningDetails: ['Deactivated variants disappear from the Sell screen search.'],
    };
  }

  protected async executeDeactivate(): Promise<void> {
    const t = this.deactivateTarget();
    if (!t) return;
    this.deleteModal()?.hide();
    if (t.kind === 'family') {
      await this.setFamilyActive(t.family, false);
    } else if (t.kind === 'collection') {
      await this.setCollectionActive(t.collection, false);
    } else {
      await this.setVariantActive(t.variant, false);
    }
    this.deactivateTarget.set(null);
  }

  protected async setFamilyActive(family: Product, active: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.updateProduct(family.id, { active });
      this.notice.set(`${family.name} ${active ? 'reactivated' : 'deactivated'}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  // --- Variant form ---

  protected startVariantCreate(productId: string): void {
    this.variantForm.set({ productId, editing: null });
    this.variantName.setValue('');
    this.variantPrice.setValue('');
    this.variantKind.setValue('good');
    this.variantSku.setValue('');
    this.variantBarcode.setValue('');
    this.variantWholesale.setValue('');
    this.variantTrackInventory.setValue(true);
    this.variantAllowFractional.setValue(false);
  }

  protected startVariantEdit(productId: string, v: Variant): void {
    this.variantForm.set({ productId, editing: v });
    this.variantName.setValue(v.variant_name ?? '');
    this.variantPrice.setValue(((v.price ?? 0) / 100).toFixed(2));
    this.variantKind.setValue(v.kind ?? 'good');
    this.variantSku.setValue(v.sku ?? '');
    this.variantBarcode.setValue(v.barcode ?? '');
    this.variantWholesale.setValue(
      v.wholesale_price !== null ? ((v.wholesale_price ?? 0) / 100).toFixed(2) : ''
    );
    this.variantTrackInventory.setValue(v.track_inventory ?? true);
    this.variantAllowFractional.setValue(v.allow_fractional ?? false);
    this.variantActive.setValue(v.variant_active ?? true);
  }

  protected async saveVariant(): Promise<void> {
    const vf = this.variantForm();
    if (!vf || this.variantName.value.trim().length === 0) return;
    const priceCents = parseKesToCents(this.variantPrice.value);
    if (priceCents === null) {
      this.error.set('Enter a valid price');
      return;
    }
    const wholesaleCents = this.variantWholesale.value.trim()
      ? (parseKesToCents(this.variantWholesale.value) ?? undefined)
      : undefined;
    if (this.variantWholesale.value.trim() && wholesaleCents === undefined) {
      this.error.set('Enter a valid wholesale price');
      return;
    }
    const isService = this.variantKind.value === 'service';
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.upsertVariant({
        product_id: vf.productId,
        name: this.variantName.value.trim(),
        price: priceCents,
        kind: this.variantKind.value,
        ...(vf.editing?.variant_id ? { variant_id: vf.editing.variant_id } : {}),
        ...(vf.editing ? {} : { sku: this.variantSku.value.trim() || undefined }),
        barcode: this.variantBarcode.value.trim() || undefined,
        wholesale_price: wholesaleCents,
        // Services carry no inventory flags.
        ...(isService
          ? {}
          : {
              track_inventory: this.variantTrackInventory.value,
              allow_fractional: this.variantAllowFractional.value,
            }),
        ...(vf.editing ? { active: this.variantActive.value } : {}),
      });
      this.notice.set(vf.editing ? 'Variant updated' : 'Variant created');
      this.variantForm.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setVariantActive(v: Variant, active: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.upsertVariant({
        product_id: v.product_id!,
        variant_id: v.variant_id!,
        name: v.variant_name ?? '',
        price: v.price ?? 0,
        active,
      });
      this.notice.set(`${this.label(v)} ${active ? 'reactivated' : 'deactivated'}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
