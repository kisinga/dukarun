import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatKes, parseKesToCents } from '../core/money';
import { InventoryBatch, PosService, Product } from '../pos/pos.service';

type StockInfo = { stock: number; stock_value: number };

@Component({
  selector: 'app-products',
  imports: [RouterLink, ReactiveFormsModule],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-5xl">
        <header class="mb-4 flex flex-wrap items-center gap-3">
          <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</a>
          <h1 class="text-2xl font-bold">Products</h1>
          <span class="text-sm text-base-content/60">
            total stock value {{ fmt(totalStockValue()) }}
          </span>
          <button class="btn btn-primary btn-sm ml-auto" (click)="startCreate()">
            + New product
          </button>
        </header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Create / edit panel -->
        @if (formOpen()) {
          <div class="card mb-4 bg-base-100 shadow">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">
                {{ editing() ? 'Edit ' + editing()!.name : 'New product' }}
              </h2>
              <form
                (submit)="$event.preventDefault(); save()"
                class="mt-2 grid gap-3 sm:grid-cols-2"
              >
                <label class="form-control">
                  <span class="label-text">Name *</span>
                  <input type="text" class="input input-bordered input-sm" [formControl]="name" />
                </label>
                <label class="form-control">
                  <span class="label-text">Price (KES) *</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-bordered input-sm"
                    placeholder="0.00"
                    [formControl]="price"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">SKU</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="auto"
                    [disabled]="editing() !== null"
                    [formControl]="sku"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Barcode</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="barcode"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Wholesale price (KES, optional)</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-bordered input-sm"
                    placeholder="0.00"
                    [formControl]="wholesale"
                  />
                </label>
                <div class="flex flex-col justify-end gap-1">
                  <label class="label cursor-pointer justify-start gap-2 py-0">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [formControl]="trackInventory"
                    />
                    <span class="label-text">Track inventory</span>
                  </label>
                  <label class="label cursor-pointer justify-start gap-2 py-0">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [formControl]="allowFractional"
                    />
                    <span class="label-text">Allow fractional quantity</span>
                  </label>
                  @if (editing()) {
                    <label class="label cursor-pointer justify-start gap-2 py-0">
                      <input type="checkbox" class="checkbox checkbox-sm" [formControl]="active" />
                      <span class="label-text">Active</span>
                    </label>
                  }
                </div>
                <div class="flex gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    class="btn btn-primary btn-sm"
                    [disabled]="busy() || name.value.trim().length === 0"
                  >
                    {{ busy() ? 'Saving…' : editing() ? 'Save changes' : 'Create product' }}
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="closeForm()">
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
          placeholder="Search name, SKU, or barcode…"
          [formControl]="search"
        />

        <!-- List -->
        @if (products().length === 0) {
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <p class="text-center text-base-content/60">No products found.</p>
            </div>
          </div>
        } @else {
          <div class="card bg-base-100 shadow">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Barcode</th>
                  <th class="text-right">Price</th>
                  <th class="text-right">Stock</th>
                  <th class="text-right">Stock value</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (p of products(); track p.id) {
                  <tr>
                    <td>
                      <button class="link font-medium" (click)="toggleExpand(p.id)">
                        {{ p.name }}
                      </button>
                    </td>
                    <td class="font-mono text-xs">{{ p.sku }}</td>
                    <td class="font-mono text-xs">{{ p.barcode ?? '—' }}</td>
                    <td class="text-right">{{ fmt(p.price) }}</td>
                    <td class="text-right">
                      {{ p.track_inventory ? (stockOf(p.id)?.stock ?? 0) : '—' }}
                    </td>
                    <td class="text-right">
                      {{ p.track_inventory ? fmt(stockOf(p.id)?.stock_value ?? 0) : '—' }}
                    </td>
                    <td>
                      <span
                        class="badge"
                        [class.badge-success]="p.active"
                        [class.badge-outline]="!p.active"
                      >
                        {{ p.active ? 'active' : 'inactive' }}
                      </span>
                    </td>
                    <td class="whitespace-nowrap text-right">
                      <button class="btn btn-ghost btn-xs" (click)="startEdit(p)">Edit</button>
                      @if (p.active) {
                        <button
                          class="btn btn-error btn-outline btn-xs"
                          [disabled]="busy()"
                          (click)="setActive(p, false)"
                        >
                          Deactivate
                        </button>
                      } @else {
                        <button
                          class="btn btn-success btn-outline btn-xs"
                          [disabled]="busy()"
                          (click)="setActive(p, true)"
                        >
                          Reactivate
                        </button>
                      }
                    </td>
                  </tr>
                  @if (expandedFor() === p.id) {
                    <tr>
                      <td colspan="8" class="bg-base-200/50">
                        <div class="p-2">
                          <div class="mb-1 flex items-center justify-between">
                            <h3 class="text-sm font-semibold">Batch history</h3>
                            <a routerLink="/money/suppliers" class="link text-xs">
                              Restock via Suppliers → record purchase
                            </a>
                          </div>
                          @if (batches().length === 0) {
                            <p class="text-xs text-base-content/60">No stock batches yet.</p>
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
          </div>
        }
      </div>
    </main>
  `,
})
export class ProductsComponent implements OnInit {
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly products = signal<Product[]>([]);
  protected readonly stock = signal<Map<string, StockInfo>>(new Map());
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly batches = signal<InventoryBatch[]>([]);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Product | null>(null);

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly price = new FormControl('', { nonNullable: true });
  protected readonly sku = new FormControl('', { nonNullable: true });
  protected readonly barcode = new FormControl('', { nonNullable: true });
  protected readonly wholesale = new FormControl('', { nonNullable: true });
  protected readonly trackInventory = new FormControl(true, { nonNullable: true });
  protected readonly allowFractional = new FormControl(false, { nonNullable: true });
  protected readonly active = new FormControl(true, { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly totalStockValue = computed(() => {
    let sum = 0;
    for (const p of this.products()) {
      if (p.track_inventory) sum += this.stock().get(p.id)?.stock_value ?? 0;
    }
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
      const [products, stock] = await Promise.all([
        this.pos.listProducts(this.search.value),
        this.pos.productStock(),
      ]);
      this.products.set(products);
      this.stock.set(stock);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load products');
    }
  }

  protected stockOf(productId: string): StockInfo | undefined {
    return this.stock().get(productId);
  }

  protected async toggleExpand(productId: string): Promise<void> {
    if (this.expandedFor() === productId) {
      this.expandedFor.set(null);
      return;
    }
    this.expandedFor.set(productId);
    try {
      this.batches.set(await this.pos.productBatches(productId));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load batches');
    }
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.name.setValue('');
    this.price.setValue('');
    this.sku.setValue('');
    this.barcode.setValue('');
    this.wholesale.setValue('');
    this.trackInventory.setValue(true);
    this.allowFractional.setValue(false);
    this.formOpen.set(true);
  }

  protected startEdit(product: Product): void {
    this.editing.set(product);
    this.name.setValue(product.name);
    this.price.setValue((product.price / 100).toFixed(2));
    this.sku.setValue(product.sku);
    this.barcode.setValue(product.barcode ?? '');
    this.wholesale.setValue(
      product.wholesale_price !== null ? (product.wholesale_price / 100).toFixed(2) : ''
    );
    this.trackInventory.setValue(product.track_inventory);
    this.allowFractional.setValue(product.allow_fractional);
    this.active.setValue(product.active);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected async save(): Promise<void> {
    const priceCents = parseKesToCents(this.price.value);
    if (priceCents === null) {
      this.error.set('Enter a valid price');
      return;
    }
    const wholesaleCents = this.wholesale.value.trim()
      ? (parseKesToCents(this.wholesale.value) ?? undefined)
      : undefined;
    if (this.wholesale.value.trim() && wholesaleCents === null) {
      this.error.set('Enter a valid wholesale price');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const editing = this.editing();
      if (editing) {
        await this.pos.updateProduct(editing.id, {
          name: this.name.value.trim(),
          price: priceCents,
          barcode: this.barcode.value.trim() || undefined,
          wholesale_price: wholesaleCents,
          allow_fractional: this.allowFractional.value,
          track_inventory: this.trackInventory.value,
          active: this.active.value,
        });
        this.notice.set(`Updated ${this.name.value.trim()}`);
      } else {
        await this.pos.createProduct({
          name: this.name.value.trim(),
          price: priceCents,
          sku: this.sku.value.trim() || undefined,
          barcode: this.barcode.value.trim() || undefined,
          wholesale_price: wholesaleCents,
          allow_fractional: this.allowFractional.value,
          track_inventory: this.trackInventory.value,
        });
        this.notice.set(`Created ${this.name.value.trim()}`);
      }
      this.closeForm();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setActive(product: Product, active: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.updateProduct(product.id, { active });
      this.notice.set(`${product.name} ${active ? 'reactivated' : 'deactivated'}`);
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
