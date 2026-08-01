import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatKes, parseKesToCents } from '../core/money';
import { InventoryBatch, PosService, Product, Variant, variantLabel } from '../pos/pos.service';

type StockInfo = { stock: number; stock_value: number };

@Component({
  selector: 'app-products',
  imports: [RouterLink, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-5xl">
        <app-page-header title="Products" backLink="/dashboard" backLabel="Dashboard">
          <span actions class="text-sm text-base-content/60">
            total stock value {{ fmt(totalStockValue()) }}
          </span>
          <button actions class="btn btn-primary btn-sm ml-auto" (click)="startFamilyCreate()">
            + New product
          </button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Family create / edit panel -->
        @if (familyFormOpen()) {
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">
                {{ editingFamily() ? 'Edit ' + editingFamily()!.name : 'New product family' }}
              </h2>
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
                @if (editingFamily()) {
                  <label class="label cursor-pointer justify-start gap-2">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [formControl]="familyActive"
                    />
                    <span class="label-text">Active</span>
                  </label>
                }
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  [disabled]="busy() || familyName.value.trim().length === 0"
                >
                  {{ busy() ? 'Saving…' : editingFamily() ? 'Save changes' : 'Create' }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="closeFamilyForm()">
                  Cancel
                </button>
              </form>
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
        <input
          type="text"
          class="input input-bordered input-sm mb-3 w-full max-w-sm"
          placeholder="Search product, variant, SKU, or barcode…"
          [formControl]="search"
        />

        <!-- Grouped list -->
        @if (grouped().length === 0) {
          <app-empty-state icon="heroCube" title="No products found." />
        } @else {
          <div class="flex flex-col gap-2">
            @for (group of grouped(); track group.family.id) {
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <!-- Family row -->
                  <div class="flex flex-wrap items-center gap-3">
                    <button class="link font-semibold" (click)="toggleFamily(group.family.id)">
                      {{ group.family.name }}
                    </button>
                    @if (group.family.barcode) {
                      <span class="font-mono text-xs text-base-content/60">{{
                        group.family.barcode
                      }}</span>
                    }
                    <span
                      class="badge"
                      [class.badge-success]="group.family.active"
                      [class.badge-outline]="!group.family.active"
                    >
                      {{ group.family.active ? 'active' : 'inactive' }}
                    </span>
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
                        (click)="setFamilyActive(group.family, false)"
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
                        No variants yet — add one to sell this product.
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
                                <span
                                  class="badge badge-xs"
                                  [class.badge-success]="v.variant_active"
                                  [class.badge-outline]="!v.variant_active"
                                >
                                  {{ v.variant_active ? 'active' : 'inactive' }}
                                </span>
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
                                    (click)="setVariantActive(v, false)"
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
    </main>
  `,
})
export class ProductsComponent implements OnInit {
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly label = variantLabel;
  protected readonly families = signal<Product[]>([]);
  protected readonly catalog = signal<Variant[]>([]);
  protected readonly stock = signal<Map<string, StockInfo>>(new Map());
  protected readonly expandedFamily = signal<string | null>(null);
  protected readonly batchesFor = signal<string | null>(null);
  protected readonly batches = signal<InventoryBatch[]>([]);

  protected readonly search = new FormControl('', { nonNullable: true });

  protected readonly familyFormOpen = signal(false);
  protected readonly editingFamily = signal<Product | null>(null);
  protected readonly familyName = new FormControl('', { nonNullable: true });
  protected readonly familyBarcode = new FormControl('', { nonNullable: true });
  protected readonly familyActive = new FormControl(true, { nonNullable: true });

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

  /** Families with their variants; families with no variants only show when not searching. */
  protected readonly grouped = computed(() => {
    const q = this.search.value.trim().toLowerCase();
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

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => void this.load());
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [families, catalog, stock] = await Promise.all([
        this.pos.listFamilies(),
        this.pos.listCatalog(this.search.value),
        this.pos.productStock(),
      ]);
      this.families.set(families);
      this.catalog.set(catalog);
      this.stock.set(stock);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load products');
    }
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

  // --- Family form ---

  protected startFamilyCreate(): void {
    this.editingFamily.set(null);
    this.familyName.setValue('');
    this.familyBarcode.setValue('');
    this.familyFormOpen.set(true);
  }

  protected startFamilyEdit(family: Product): void {
    this.editingFamily.set(family);
    this.familyName.setValue(family.name);
    this.familyBarcode.setValue(family.barcode ?? '');
    this.familyActive.setValue(family.active);
    this.familyFormOpen.set(true);
  }

  protected closeFamilyForm(): void {
    this.familyFormOpen.set(false);
    this.editingFamily.set(null);
  }

  protected async saveFamily(): Promise<void> {
    if (this.familyName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const editing = this.editingFamily();
      if (editing) {
        await this.pos.updateProduct(editing.id, {
          name: this.familyName.value.trim(),
          barcode: this.familyBarcode.value.trim() || undefined,
          active: this.familyActive.value,
        });
        this.notice.set(`Updated ${this.familyName.value.trim()}`);
      } else {
        await this.pos.createProduct({
          name: this.familyName.value.trim(),
          barcode: this.familyBarcode.value.trim() || undefined,
        });
        this.notice.set(`Created ${this.familyName.value.trim()} — now add a variant`);
      }
      this.closeFamilyForm();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
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
