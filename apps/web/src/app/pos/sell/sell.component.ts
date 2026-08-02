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
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PrintService, type PrintFormat } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { NgIcon } from '@ng-icons/core';
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
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    CheckoutPanelComponent,
    NgIcon,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4 pb-24 lg:pb-4">
      <div class="page page-wide">
        <app-page-header title="Sell" backLink="/dashboard" backLabel="Dashboard">
          @if (cart.draftId()) {
            <span actions class="badge badge-info">Editing proforma</span>
          }
          @if (!connectivity.online()) {
            <span actions class="badge badge-warning">Offline — sales will queue</span>
          }
          @if (sync.queuedCount() > 0 || sync.failedCount() > 0) {
            <a
              actions
              routerLink="/pos/sync"
              class="badge"
              [class.badge-error]="sync.failedCount() > 0"
              [class.badge-warning]="sync.failedCount() === 0"
            >
              {{ sync.queuedCount() + sync.failedCount() }} pending sync
            </a>
          }
        </app-page-header>

        <!-- Success / queued celebration (colour + icon, not oversized type) -->
        @if (success(); as s) {
          <div class="card mb-4 bg-base-100">
            <div class="card-body flex-row flex-wrap items-center gap-4 p-4">
              <ng-icon
                name="heroCheckCircle"
                size="2.5rem"
                [class.text-success]="s.tone === 'success'"
                [class.text-warning]="s.tone === 'warning'"
              />
              <div class="flex-1">
                <p class="type-heading">{{ s.text }}</p>
                @if (s.tone === 'warning') {
                  <p class="text-sm text-base-content/60">
                    It's in the pending sync list, not in Today's Sales yet.
                  </p>
                }
              </div>
              @if (s.orderId && printerEnabled()) {
                <select
                  class="select select-bordered select-sm"
                  [value]="print.format()"
                  (change)="onFormatChange($event)"
                  title="Receipt format"
                >
                  @for (t of print.getAvailableTemplates(); track t.id) {
                    <option [value]="t.id" [selected]="t.id === print.format()">
                      {{ t.name }}
                    </option>
                  }
                </select>
                <button
                  class="btn btn-outline min-h-11"
                  [disabled]="busy()"
                  (click)="printReceipt(s.orderId)"
                >
                  Print receipt
                </button>
              }
              <button class="btn btn-primary min-h-11" (click)="newSale()">New sale</button>
            </div>
          </div>
        }

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <!-- Product search / barcode + quick-pick grid -->
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <input
                  type="text"
                  class="input input-bordered w-full"
                  placeholder="Search by name, SKU, or scan barcode…"
                  [formControl]="search"
                />

                <!-- Quick-pick grid: top variants; typing filters via search -->
                <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  @for (v of gridItems(); track v.variant_id) {
                    <button
                      type="button"
                      class="flex min-h-11 flex-col items-start gap-1 rounded-box border border-base-300/60 bg-base-100 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                      (click)="addVariant(v)"
                    >
                      @if (imageUrl(v.image_path); as thumb) {
                        @if (!brokenImages().has(v.image_path!)) {
                          <img
                            [src]="thumb"
                            alt=""
                            class="h-10 w-10 rounded-field object-cover"
                            (error)="markBroken(v.image_path!)"
                          />
                        }
                      }
                      <span class="line-clamp-2 text-sm leading-tight font-medium">{{
                        label(v)
                      }}</span>
                      <span class="mt-auto flex w-full items-center justify-between gap-1">
                        <span class="text-sm font-bold whitespace-nowrap tabular-nums">{{
                          fmt(v.price ?? 0)
                        }}</span>
                        <span class="badge shrink-0 badge-ghost badge-xs">
                          {{
                            v.kind === 'service'
                              ? 'service'
                              : !v.track_inventory
                                ? '—'
                                : (v.stock ?? 0) + ' left'
                          }}
                        </span>
                      </span>
                    </button>
                  }
                </div>
                @if (gridItems().length === 0) {
                  <p class="py-4 text-center text-sm text-base-content/60">
                    No products match — check the spelling or scan the barcode.
                  </p>
                }
              </div>
            </div>

            <!-- Cart -->
            <div class="card bg-base-100">
              <div class="card-body p-4">
                @if (cart.isEmpty()) {
                  <app-empty-state
                    [embedded]="true"
                    [compact]="true"
                    icon="heroShoppingCart"
                    title="Cart is empty"
                    description="— tap a product above to start a sale."
                  />
                } @else {
                  <div class="w-full min-w-0 overflow-x-auto">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th class="text-right">Price</th>
                          <th class="text-right">Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (line of cart.lines(); track line.variant.variant_id) {
                          <tr>
                            <td>
                              <div class="text-sm font-medium">{{ cart.lineLabel(line) }}</div>
                              <div class="text-xs text-base-content/60">{{ line.variant.sku }}</div>
                            </td>
                            <td>
                              <div class="join">
                                <button
                                  class="btn btn-sm join-item min-h-11 min-w-11"
                                  (click)="stepQty(line.variant.variant_id!, -1)"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  class="input input-bordered input-sm join-item min-h-11 w-16 text-center tabular-nums"
                                  [min]="line.variant.allow_fractional ? 0.5 : 1"
                                  [step]="line.variant.allow_fractional ? 0.5 : 1"
                                  [ngModel]="line.quantity"
                                  (ngModelChange)="onQtyInput(line.variant.variant_id!, $event)"
                                />
                                <button
                                  class="btn btn-sm join-item min-h-11 min-w-11"
                                  (click)="stepQty(line.variant.variant_id!, 1)"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td class="text-right tabular-nums">
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
                              <button
                                class="btn btn-ghost btn-xs text-base-content/40"
                                (click)="startOverride(line)"
                              >
                                override
                              </button>
                            </td>
                            <td class="text-right type-heading tabular-nums">
                              {{ fmt(lineTotal(line)) }}
                            </td>
                            <td>
                              <button
                                class="btn btn-ghost btn-sm min-h-11 min-w-11"
                                (click)="cart.removeLine(line.variant.variant_id!)"
                              >
                                <ng-icon name="heroXMark" />
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
                  </div>
                }
              </div>
            </div>
          </section>

          <aside class="flex min-w-0 flex-col gap-4">
            <!-- Customer -->
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="type-caption">Customer</div>
                    <div class="type-heading">{{ cart.customerName() }}</div>
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
                            <a class="min-h-11" (click)="selectCustomer(c.id, customerName(c))">
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

            <!-- Totals + secondary actions (desktop; mobile uses the bottom bar) -->
            <div class="card hidden bg-base-100 lg:block">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <span class="type-caption">Total</span>
                  <span class="type-hero">{{ fmt(cart.total()) }}</span>
                </div>

                @if (error()) {
                  <p class="mt-2 text-sm text-error">{{ error() }}</p>
                }
                @if (notice()) {
                  <p class="mt-2 text-sm text-success">{{ notice() }}</p>
                }

                <div class="mt-3 flex flex-col gap-2">
                  <button
                    class="btn btn-primary min-h-11"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="checkoutOpen.set(true)"
                  >
                    Complete Sale
                  </button>
                  <button
                    class="btn btn-outline min-h-11"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="park()"
                  >
                    Park (cashier queue)
                  </button>
                  <button
                    class="btn btn-outline min-h-11"
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

            <!-- Secondary actions, mobile (primary lives in the bottom bar) -->
            <div class="card bg-base-100 lg:hidden">
              <div class="card-body p-4">
                @if (error()) {
                  <p class="text-sm text-error">{{ error() }}</p>
                }
                @if (notice()) {
                  <p class="text-sm text-success">{{ notice() }}</p>
                }
                <div class="flex flex-wrap gap-2">
                  <button
                    class="btn btn-outline btn-sm min-h-11"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="park()"
                  >
                    Park
                  </button>
                  <button
                    class="btn btn-outline btn-sm min-h-11"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="saveProforma()"
                  >
                    Proforma
                  </button>
                  <button
                    class="btn btn-ghost btn-sm min-h-11"
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

      <!-- One primary action, bottom-anchored on mobile; total is the hero -->
      <div
        class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-base-300/60 bg-base-100 p-3 lg:hidden"
      >
        <div class="mx-auto flex max-w-6xl items-center gap-3">
          <div class="flex-1">
            <div class="type-caption">Total</div>
            <div class="type-hero">{{ fmt(cart.total()) }}</div>
          </div>
          <button
            class="btn btn-primary min-h-11 flex-1"
            [disabled]="cart.isEmpty() || busy()"
            (click)="checkoutOpen.set(true)"
          >
            Complete Sale
          </button>
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
  protected readonly print = inject(PrintService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly pos = inject(PosService);
  private readonly route = inject(ActivatedRoute);

  protected readonly fmt = formatKes;
  protected readonly lineTotal = (line: Parameters<CartService['lineTotal']>[0]) =>
    this.cart.lineTotal(line);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly results = signal<Variant[]>([]);
  /** Top variants for the quick-pick grid (before any search text). */
  protected readonly topVariants = signal<Variant[]>([]);
  /** What the quick-pick grid shows: search results while typing, else top variants. */
  protected readonly gridItems = computed(() =>
    this.search.value.trim().length >= 2 ? this.results() : this.topVariants()
  );
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
  /** Post-sale celebration: success = completed, warning = queued offline. */
  protected readonly success = signal<{
    text: string;
    tone: 'success' | 'warning';
    orderId?: string;
  } | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly brokenImages = signal<Set<string>>(new Set());

  protected imageUrl(path: string | null | undefined): string | null {
    return this.pos.imageUrl(path);
  }

  protected markBroken(path: string): void {
    this.brokenImages.update(set => new Set(set).add(path));
  }
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
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    // Keep the offline product snapshot fresh (fire-and-forget).
    void this.sync.refreshProductSnapshot();
    // Quick-pick grid source (offline: first rows of the snapshot).
    try {
      this.topVariants.set(
        this.connectivity.online()
          ? await this.pos.topVariants(24)
          : await this.sync.offlineTopVariants(24)
      );
    } catch {
      // grid just stays empty; search still works
    }
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
    this.success.set(null);
    const customerId = this.cart.customerId();
    const lines = this.cart.toSaleLines();
    // Offline: complete locally into the outbox — never claim "completed".
    if (!this.connectivity.online()) {
      await this.queueSale(customerId, lines, payments);
      this.busy.set(false);
      return;
    }
    try {
      const orderId = await this.pos.postSale(customerId, lines, payments, false);
      this.checkoutOpen.set(false);
      this.cart.clear();
      this.success.set({ text: 'Sale completed', tone: 'success', orderId });
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
    this.success.set({ text: 'Sale queued — will sync when online', tone: 'warning' });
  }

  /** One-tap reset after the success/queued celebration. */
  protected newSale(): void {
    this.success.set(null);
    this.error.set(null);
    this.notice.set(null);
  }

  protected onFormatChange(event: Event): void {
    this.print.setFormat((event.target as HTMLSelectElement).value as PrintFormat);
  }

  protected async printReceipt(orderId: string): Promise<void> {
    this.busy.set(true);
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildOrderData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    } finally {
      this.busy.set(false);
    }
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
