import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatKes, parseKesToCents } from '../../core/money';
import { CartService } from '../cart.service';
import { CheckoutPanelComponent } from '../checkout/checkout-panel.component';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import {
  Customer,
  PaymentInput,
  PosRpcError,
  PosService,
  Variant,
  variantLabel,
} from '../pos.service';

@Component({
  selector: 'app-sell',
  imports: [RouterLink, FormsModule, ReactiveFormsModule, CheckoutPanelComponent],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-6xl">
        <header class="mb-4 flex items-center gap-3">
          <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</a>
          <h1 class="text-2xl font-bold">Sell</h1>
          @if (cart.draftId()) {
            <span class="badge badge-info">Editing proforma</span>
          }
          @if (!connectivity.online()) {
            <span class="badge badge-warning">Offline — sales will queue</span>
          }
          @if (sync.queuedCount() > 0 || sync.failedCount() > 0) {
            <a
              routerLink="/pos/sync"
              class="badge"
              [class.badge-error]="sync.failedCount() > 0"
              [class.badge-outline]="sync.failedCount() === 0"
            >
              {{ sync.queuedCount() + sync.failedCount() }} pending sync
            </a>
          }
        </header>

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="flex flex-col gap-4 lg:col-span-2">
            <!-- Product search / barcode -->
            <div class="card bg-base-100 shadow">
              <div class="card-body p-4">
                <div class="relative">
                  <input
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="Search by name, SKU, or scan barcode…"
                    [formControl]="search"
                  />
                  @if (results().length > 0) {
                    <ul
                      class="menu absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-box bg-base-100 shadow-lg"
                    >
                      @for (v of results(); track v.variant_id) {
                        <li>
                          <a (click)="addVariant(v)">
                            <span class="flex-1">{{ label(v) }}</span>
                            <span class="text-xs text-base-content/60">{{ v.sku }}</span>
                            <span class="badge badge-xs badge-outline">
                              {{
                                v.kind === 'service' || !v.track_inventory
                                  ? '—'
                                  : (v.stock ?? 0) + ' in stock'
                              }}
                            </span>
                            <span class="font-semibold">{{ fmt(v.price ?? 0) }}</span>
                          </a>
                        </li>
                      }
                    </ul>
                  }
                </div>
              </div>
            </div>

            <!-- Cart -->
            <div class="card bg-base-100 shadow">
              <div class="card-body p-4">
                @if (cart.isEmpty()) {
                  <p class="py-8 text-center text-base-content/60">
                    Cart is empty — search or scan a product to begin.
                  </p>
                } @else {
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th class="w-36">Qty</th>
                        <th>Price</th>
                        <th class="text-right">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (line of cart.lines(); track line.variant.variant_id) {
                        <tr>
                          <td>
                            <div class="font-medium">{{ cart.lineLabel(line) }}</div>
                            <div class="text-xs text-base-content/60">{{ line.variant.sku }}</div>
                          </td>
                          <td>
                            <div class="join">
                              <button
                                class="btn btn-sm join-item"
                                (click)="stepQty(line.variant.variant_id!, -1)"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                class="input input-bordered input-sm join-item w-16 text-center"
                                [min]="line.variant.allow_fractional ? 0.5 : 1"
                                [step]="line.variant.allow_fractional ? 0.5 : 1"
                                [ngModel]="line.quantity"
                                (ngModelChange)="onQtyInput(line.variant.variant_id!, $event)"
                              />
                              <button
                                class="btn btn-sm join-item"
                                (click)="stepQty(line.variant.variant_id!, 1)"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>
                            @if (line.customPrice !== null) {
                              <span class="font-semibold text-accent">{{
                                fmt(line.customPrice)
                              }}</span>
                              <div class="text-xs text-base-content/60">
                                was {{ fmt(line.unitPrice) }}
                              </div>
                            } @else {
                              {{ fmt(line.unitPrice) }}
                            }
                            <button class="btn btn-ghost btn-xs" (click)="startOverride(line)">
                              override
                            </button>
                          </td>
                          <td class="text-right font-semibold">{{ fmt(lineTotal(line)) }}</td>
                          <td>
                            <button
                              class="btn btn-ghost btn-sm"
                              (click)="cart.removeLine(line.variant.variant_id!)"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                        @if (overrideFor() === line.variant.variant_id) {
                          <tr>
                            <td colspan="5">
                              <div class="flex flex-wrap items-end gap-2 rounded bg-base-200 p-2">
                                <label class="form-control">
                                  <span class="label-text">New price (KES)</span>
                                  <input
                                    type="text"
                                    inputmode="decimal"
                                    class="input input-bordered input-sm w-28"
                                    [formControl]="overridePrice"
                                  />
                                </label>
                                <label class="form-control flex-1">
                                  <span class="label-text">Reason</span>
                                  <input
                                    type="text"
                                    class="input input-bordered input-sm"
                                    placeholder="e.g. Damaged packaging"
                                    [formControl]="overrideReason"
                                  />
                                </label>
                                <button class="btn btn-primary btn-sm" (click)="applyOverride()">
                                  Apply
                                </button>
                                <button
                                  class="btn btn-ghost btn-sm"
                                  (click)="overrideFor.set(null)"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                }
              </div>
            </div>
          </section>

          <aside class="flex flex-col gap-4">
            <!-- Customer -->
            <div class="card bg-base-100 shadow">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-xs text-base-content/60">Customer</div>
                    <div class="font-semibold">{{ cart.customerName() }}</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" (click)="toggleCustomerPicker()">
                    Change
                  </button>
                </div>
                @if (customerPickerOpen()) {
                  <div class="mt-2">
                    <input
                      type="text"
                      class="input input-bordered input-sm w-full"
                      placeholder="Search name or phone…"
                      [formControl]="customerSearch"
                    />
                    <button
                      class="btn btn-ghost btn-xs mt-1"
                      (click)="selectCustomer(null, 'Walk-in')"
                    >
                      Reset to Walk-in
                    </button>
                    @if (customerResults().length > 0) {
                      <ul class="menu mt-1 rounded-box bg-base-200">
                        @for (c of customerResults(); track c.id) {
                          <li>
                            <a (click)="selectCustomer(c.id, customerName(c))">
                              <span class="flex-1">{{ customerName(c) }}</span>
                              <span class="text-xs text-base-content/60">{{ c.phone }}</span>
                            </a>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- Totals + actions -->
            <div class="card bg-base-100 shadow">
              <div class="card-body p-4">
                <div class="flex items-center justify-between text-xl font-bold">
                  <span>Total</span>
                  <span>{{ fmt(cart.total()) }}</span>
                </div>

                @if (error()) {
                  <p class="mt-2 text-sm text-error">{{ error() }}</p>
                }
                @if (notice()) {
                  <p class="mt-2 text-sm text-success">{{ notice() }}</p>
                }

                <div class="mt-3 flex flex-col gap-2">
                  <button
                    class="btn btn-primary"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="checkoutOpen.set(true)"
                  >
                    Complete Sale
                  </button>
                  <button
                    class="btn btn-outline"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="park()"
                  >
                    Park (cashier queue)
                  </button>
                  <button
                    class="btn btn-outline"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="saveProforma()"
                  >
                    Save as Proforma
                  </button>
                  <button
                    class="btn btn-ghost btn-sm"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="clearCart()"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      @if (checkoutOpen()) {
        <app-checkout-panel
          [total]="cart.total()"
          [creditAllowed]="creditAllowed()"
          [methods]="methods()"
          [busy]="busy()"
          title="Complete sale"
          (confirmed)="completeSale($event)"
          (cancelled)="checkoutOpen.set(false)"
        />
      }
    </main>
  `,
})
export class SellComponent implements OnInit {
  protected readonly cart = inject(CartService);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly sync = inject(SyncService);
  private readonly pos = inject(PosService);
  private readonly route = inject(ActivatedRoute);

  protected readonly fmt = formatKes;
  protected readonly lineTotal = (line: Parameters<CartService['lineTotal']>[0]) =>
    this.cart.lineTotal(line);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly results = signal<Variant[]>([]);
  protected readonly customerSearch = new FormControl('', { nonNullable: true });
  protected readonly customerResults = signal<Customer[]>([]);
  protected readonly customerPickerOpen = signal(false);

  protected readonly overrideFor = signal<string | null>(null);
  protected readonly overridePrice = new FormControl('', { nonNullable: true });
  protected readonly overrideReason = new FormControl('', { nonNullable: true });

  protected readonly checkoutOpen = signal(false);
  protected readonly methods = signal<string[]>(['cash', 'mpesa', 'bank']);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  /** Set when a real (non-walk-in) customer is picked; gates the credit tab. */
  protected readonly creditAllowed = computed(() => this.cart.customerId() !== null);

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(q => void this.onSearch(q));
    this.customerSearch.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(q => void this.onCustomerSearch(q));
  }

  async ngOnInit(): Promise<void> {
    try {
      this.methods.set(await this.pos.enabledPaymentMethods());
    } catch {
      // keep defaults
    }
    // Keep the offline product snapshot fresh (fire-and-forget).
    void this.sync.refreshProductSnapshot();
    const draftId = this.route.snapshot.queryParamMap.get('draft');
    if (draftId) await this.loadDraft(draftId);
  }

  protected async onSearch(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      this.results.set([]);
      return;
    }
    try {
      // Offline: search the IndexedDB snapshot of the active catalog instead.
      const variants = this.connectivity.online()
        ? await this.pos.searchVariants(q)
        : await this.sync.searchProductsOffline(q);
      // Scanner-style entry: an exact barcode match goes straight to the cart.
      const exact = variants.find(v => v.barcode === q);
      if (exact) {
        this.cart.addVariant(exact);
        this.search.setValue('', { emitEvent: false });
        this.results.set([]);
        return;
      }
      this.results.set(variants);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Product search failed');
    }
  }

  protected addVariant(variant: Variant): void {
    this.cart.addVariant(variant);
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
  }

  protected label(variant: Variant): string {
    return variantLabel(variant);
  }

  protected stepQty(variantId: string, direction: 1 | -1): void {
    const line = this.cart.lines().find(l => l.variant.variant_id === variantId);
    if (!line) return;
    this.cart.setQuantity(
      variantId,
      line.quantity + direction * this.cart.quantityStep(line.variant)
    );
  }

  protected onQtyInput(variantId: string, value: number | string): void {
    const qty = Number(value);
    if (Number.isFinite(qty)) this.cart.setQuantity(variantId, qty);
  }

  protected startOverride(line: { variant: Variant; unitPrice: number }): void {
    this.overrideFor.set(line.variant.variant_id!);
    this.overridePrice.setValue((line.unitPrice / 100).toFixed(2));
    this.overrideReason.setValue('');
  }

  protected applyOverride(): void {
    const productId = this.overrideFor();
    if (!productId) return;
    const cents = parseKesToCents(this.overridePrice.value);
    if (cents === null) {
      this.error.set('Enter a valid override price');
      return;
    }
    this.cart.setCustomPrice(productId, cents, this.overrideReason.value.trim());
    this.overrideFor.set(null);
  }

  protected toggleCustomerPicker(): void {
    this.customerPickerOpen.update(open => !open);
    if (!this.customerPickerOpen()) {
      this.customerSearch.setValue('', { emitEvent: false });
      this.customerResults.set([]);
    }
  }

  protected async onCustomerSearch(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      this.customerResults.set([]);
      return;
    }
    try {
      this.customerResults.set(await this.pos.searchCustomers(q));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Customer search failed');
    }
  }

  protected selectCustomer(id: string | null, name: string): void {
    this.cart.setCustomer(id, name);
    this.toggleCustomerPicker();
  }

  protected customerName(c: Customer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected async completeSale(payments: PaymentInput[]): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    const customerId = this.cart.customerId();
    const lines = this.cart.toSaleLines();
    // Offline: complete locally into the outbox — never claim "completed".
    if (!this.connectivity.online()) {
      await this.queueSale(customerId, lines, payments);
      this.busy.set(false);
      return;
    }
    try {
      await this.pos.postSale(customerId, lines, payments, false);
      this.checkoutOpen.set(false);
      this.cart.clear();
      this.notice.set('Sale completed');
    } catch (err) {
      if (!(err instanceof PosRpcError)) {
        // Network failure mid-request: the outcome is unknown but safe —
        // queue with a client_ref so the replay is exactly-once.
        await this.queueSale(customerId, lines, payments);
      } else {
        this.error.set(err.message);
        this.checkoutOpen.set(false);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Complete the sale locally into the offline outbox (FIFO, exactly-once replay). */
  private async queueSale(
    customerId: string | null,
    lines: ReturnType<CartService['toSaleLines']>,
    payments: PaymentInput[]
  ): Promise<void> {
    await this.sync.enqueue({ customer_id: customerId, lines, payments });
    this.checkoutOpen.set(false);
    this.cart.clear();
    this.notice.set('Sale queued — will sync when online');
  }

  protected async park(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      // Parked orders carry no payments; the cashier collects at settle time.
      await this.pos.postSale(this.cart.customerId(), this.cart.toSaleLines(), [], true);
      this.cart.clear();
      this.notice.set('Parked to the cashier queue');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Park failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveProforma(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const id = await this.pos.saveDraft(
        this.cart.customerId(),
        this.cart.toSaleLines(),
        this.cart.draftId()
      );
      this.cart.draftId.set(id);
      this.notice.set('Proforma saved');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected clearCart(): void {
    this.cart.clear();
    this.error.set(null);
    this.notice.set(null);
  }

  private async loadDraft(orderId: string): Promise<void> {
    try {
      const order = await this.pos.getOrder(orderId);
      if (order.status !== 'draft') {
        this.error.set(`Order ${order.code} is not a proforma (status: ${order.status})`);
        return;
      }
      const lines = await this.pos.orderLines(orderId);
      const variants = await this.pos.variantsByIds(lines.map(l => l.variant_id));
      const byId = new Map(variants.map(v => [v.variant_id, v]));
      this.cart.clear();
      for (const l of lines) {
        const variant = byId.get(l.variant_id);
        if (!variant) continue;
        this.cart.addVariant(variant);
        this.cart.setQuantity(variant.variant_id!, Number(l.quantity));
        if (l.custom_price !== null) {
          this.cart.setCustomPrice(
            variant.variant_id!,
            l.custom_price,
            l.price_override_reason ?? ''
          );
        }
      }
      if (order.customer_id && order.customers) {
        this.cart.setCustomer(
          order.customer_id,
          [order.customers.first_name, order.customers.last_name].filter(Boolean).join(' ')
        );
      }
      this.cart.draftId.set(orderId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load proforma');
    }
  }
}
