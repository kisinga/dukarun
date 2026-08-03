import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { parseKesToCents } from '../../core/money';
import { PermissionsService } from '../../core/permissions.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { CartService, type CartLine } from '../cart.service';
import { CheckoutPanelComponent } from '../checkout/checkout-panel.component';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
import { PrintService, type PrintFormat } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { SellCartLineComponent } from './sell-cart-line.component';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
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
    ReactiveFormsModule,
    CheckoutPanelComponent,
    ButtonComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    PageLayoutComponent,
    SellCartLineComponent,
    SessionRequiredNoticeComponent,
  ],
  template: `
    <app-page
      title="Sell"
      subtitle="Find an item, adjust it, and take payment without leaving the counter."
      [wide]="true"
    >
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

      @if (!cashierSession.isOpen()) {
        <app-session-required-notice action="taking payment or completing a sale" />
      }

      <div class="pb-24 lg:pb-0">
        @if (success(); as s) {
          <section class="card mb-4 bg-base-100" aria-live="polite">
            <div class="card-body flex-row flex-wrap items-center gap-4 p-4">
              <app-icon
                name="heroCheckCircle"
                size="xl"
                [class.text-success]="s.tone === 'success'"
                [class.text-warning]="s.tone === 'warning'"
              />
              <div class="min-w-48 flex-1">
                <p class="type-heading">{{ s.text }}</p>
                @if (s.tone === 'warning') {
                  <p class="text-sm text-base-content/60">
                    It is safely queued and will appear in Today's Sales after syncing.
                  </p>
                }
              </div>
              @if (s.orderId && printerEnabled()) {
                <select
                  class="select select-bordered select-sm min-h-11"
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
                  appButton
                  variant="outline"
                  size="md"
                  [disabled]="busy()"
                  (click)="printReceipt(s.orderId)"
                >
                  <app-icon name="heroPrinter" />
                  Print receipt
                </button>
              }
              <button appButton size="md" (click)="newSale()">
                <app-icon name="heroPlus" />
                New sale
              </button>
            </div>
          </section>
        }

        @if (error()) {
          <div class="alert alert-error mb-4 py-3" role="alert">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ error() }}</span>
            <button
              appButton
              variant="ghost"
              size="sm"
              [iconOnly]="true"
              aria-label="Dismiss error"
              (click)="error.set(null)"
            >
              <app-icon name="heroXMark" />
            </button>
          </div>
        }
        @if (notice()) {
          <div class="alert alert-success mb-4 py-3" aria-live="polite">
            <app-icon name="heroCheckCircle" />
            <span>{{ notice() }}</span>
          </div>
        }

        <div class="grid items-start gap-4 lg:grid-cols-3">
          <section class="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h2 class="type-heading">Add products</h2>
                    <p class="mt-0.5 text-sm text-base-content/60">
                      Search by name or SKU, or scan a barcode.
                    </p>
                  </div>
                  @if (!cart.isEmpty()) {
                    <span class="badge badge-primary shrink-0">
                      {{ cartItemCount() }} in cart
                    </span>
                  }
                </div>

                <div class="relative mt-3">
                  <span
                    class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50"
                  >
                    <app-icon name="heroMagnifyingGlass" size="lg" />
                  </span>
                  <input
                    type="search"
                    class="input input-bordered min-h-11 w-full pr-12 pl-11"
                    placeholder="Search or scan barcode…"
                    autocomplete="off"
                    [formControl]="search"
                  />
                  @if (search.value) {
                    <button
                      appButton
                      variant="ghost"
                      size="md"
                      [iconOnly]="true"
                      type="button"
                      class="absolute inset-y-0 right-0 my-auto mr-1"
                      aria-label="Clear product search"
                      (click)="clearSearch()"
                    >
                      <app-icon name="heroXMark" />
                    </button>
                  }
                </div>

                <div class="mt-4 flex items-center justify-between gap-2">
                  <p class="type-caption">
                    {{ searchMode() ? 'Search results' : 'Quick add' }}
                  </p>
                  @if (!searchMode()) {
                    <p class="text-xs text-base-content/50 sm:hidden">Swipe for more</p>
                  }
                </div>

                <div
                  class="mt-2 snap-x gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 xl:grid-cols-4"
                  [class.flex]="!searchMode()"
                  [class.grid]="searchMode()"
                  [class.grid-cols-2]="searchMode()"
                >
                  @for (v of gridItems(); track v.variant_id) {
                    <button
                      type="button"
                      class="group relative flex min-h-28 shrink-0 snap-start flex-col items-start gap-1 rounded-box border border-base-300/70 bg-base-100 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                      [class.w-36]="!searchMode()"
                      [class.w-full]="searchMode()"
                      [disabled]="unavailable(v)"
                      (click)="addVariant(v)"
                    >
                      <div class="flex w-full items-start justify-between gap-2">
                        @if (imageUrl(v.image_path); as thumb) {
                          @if (!brokenImages().has(v.image_path!)) {
                            <img
                              [src]="thumb"
                              alt=""
                              class="h-10 w-10 rounded-field object-cover"
                              (error)="markBroken(v.image_path!)"
                            />
                          } @else {
                            <span
                              class="flex h-10 w-10 items-center justify-center rounded-field bg-base-200"
                            >
                              <app-icon name="heroCube" size="lg" />
                            </span>
                          }
                        } @else {
                          <span
                            class="flex h-10 w-10 items-center justify-center rounded-field bg-base-200"
                          >
                            <app-icon name="heroCube" size="lg" />
                          </span>
                        }
                        @if (quantityInCart(v.variant_id) > 0) {
                          <span class="badge badge-primary badge-sm">
                            {{ quantityInCart(v.variant_id) }}
                          </span>
                        } @else if (unavailable(v)) {
                          <span class="badge badge-error badge-sm whitespace-nowrap">Out</span>
                        } @else {
                          <span class="badge badge-ghost gap-1 text-primary">
                            <app-icon name="heroPlus" />
                            Add
                          </span>
                        }
                      </div>
                      <span class="line-clamp-2 text-sm leading-tight font-semibold">
                        {{ label(v) }}
                      </span>
                      <span class="mt-auto flex w-full items-end justify-between gap-1">
                        <span class="text-sm font-bold whitespace-nowrap">
                          <app-money [cents]="v.price ?? 0" />
                        </span>
                        <span
                          class="text-right text-xs whitespace-nowrap"
                          [class.text-error]="unavailable(v)"
                          [class.text-base-content/50]="!unavailable(v)"
                        >
                          {{ stockLabel(v) }}
                        </span>
                      </span>
                    </button>
                  }
                </div>

                @if (gridItems().length === 0) {
                  <div class="py-6 text-center">
                    <p class="text-sm font-medium">No matching products</p>
                    <p class="mt-1 text-sm text-base-content/60">
                      Check the spelling or scan the item's barcode.
                    </p>
                  </div>
                }
              </div>
            </div>

            <div id="current-sale" class="card scroll-mt-4 overflow-hidden bg-base-100">
              <div
                class="flex items-center justify-between gap-3 border-b border-base-content/15 px-3 py-2.5 sm:px-4 sm:py-3"
              >
                <div>
                  <h2 class="type-heading">Current sale</h2>
                  @if (!cart.isEmpty()) {
                    <p class="type-caption">
                      {{ cart.lines().length }} {{ cart.lines().length === 1 ? 'line' : 'lines' }}
                    </p>
                  }
                </div>
                @if (!cart.isEmpty()) {
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    class="text-base-content/60 hover:text-error"
                    [disabled]="busy()"
                    (click)="clearCart()"
                  >
                    Clear cart
                  </button>
                }
              </div>

              @if (cart.isEmpty()) {
                <div class="p-4">
                  <app-empty-state
                    [embedded]="true"
                    [compact]="true"
                    icon="heroShoppingCart"
                    title="Cart is empty"
                    description="Tap a quick product or search above to start the sale."
                  />
                </div>
              } @else {
                <div>
                  @for (line of cart.lines(); track line.variant.variant_id) {
                    <div
                      class="border-b-2 border-base-content/15 bg-base-100 last:border-b-0 even:bg-base-200/20"
                    >
                      <app-sell-cart-line
                        [line]="line"
                        [label]="cart.lineLabel(line)"
                        [canOverridePrice]="canOverridePrices()"
                        (quantityStep)="stepQty(line.variant.variant_id!, $event)"
                        (quantityChanged)="onQtyInput(line.variant.variant_id!, $event)"
                        (priceStep)="adjustPrice(line, $event)"
                        (priceEdit)="startOverride(line)"
                        (priceReset)="resetPrice(line)"
                        (removed)="cart.removeLine(line.variant.variant_id!)"
                      />

                      @if (overrideFor() === line.variant.variant_id) {
                        <div class="border-t border-base-content/15 bg-base-200/70 p-3 sm:p-4">
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="text-sm font-semibold">Set exact unit price</p>
                              <p class="mt-0.5 text-xs text-base-content/60">
                                Whole KES only. Quick arrows remain the fastest option.
                              </p>
                            </div>
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              [iconOnly]="true"
                              aria-label="Close price editor"
                              (click)="overrideFor.set(null)"
                            >
                              <app-icon name="heroXMark" />
                            </button>
                          </div>
                          <div class="mt-3 grid gap-3 sm:grid-cols-2">
                            <app-form-field label="Unit price (KES)" [required]="true">
                              <input
                                type="text"
                                inputmode="numeric"
                                class="input input-bordered min-h-11 w-full"
                                [formControl]="overridePrice"
                              />
                            </app-form-field>
                            <app-form-field label="Reason" hint="Optional; saved on the sale line.">
                              <input
                                type="text"
                                class="input input-bordered min-h-11 w-full"
                                placeholder="e.g. Damaged packaging"
                                [formControl]="overrideReason"
                              />
                            </app-form-field>
                          </div>
                          <div class="mt-3 flex flex-wrap justify-end gap-2">
                            @if (line.customPrice !== null) {
                              <button
                                appButton
                                variant="ghost"
                                size="md"
                                (click)="resetPrice(line)"
                              >
                                Use base price
                              </button>
                            }
                            <button
                              appButton
                              variant="outline"
                              size="md"
                              (click)="overrideFor.set(null)"
                            >
                              Cancel
                            </button>
                            <button appButton size="md" (click)="applyOverride()">
                              Apply price
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </section>

          <aside class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="type-caption">Customer</p>
                    <p class="truncate font-semibold">{{ cart.customerName() }}</p>
                  </div>
                  <button appButton variant="ghost" size="md" (click)="toggleCustomerPicker()">
                    {{ customerPickerOpen() ? 'Close' : 'Change' }}
                  </button>
                </div>

                @if (customerPickerOpen()) {
                  <div class="mt-3 border-t border-base-300/60 pt-3">
                    <app-form-field label="Find customer" hint="Required only for credit sales.">
                      <input
                        type="search"
                        class="input input-bordered min-h-11 w-full"
                        placeholder="Name or phone…"
                        [formControl]="customerSearch"
                      />
                    </app-form-field>
                    @if (cart.customerId()) {
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        class="mt-1"
                        (click)="selectCustomer(null, 'Walk-in')"
                      >
                        Use Walk-in customer
                      </button>
                    }
                    @if (customerResults().length > 0) {
                      <ul class="menu mt-2 rounded-box bg-base-200 p-1">
                        @for (c of customerResults(); track c.id) {
                          <li>
                            <button
                              type="button"
                              class="min-h-11"
                              (click)="selectCustomer(c.id, customerName(c))"
                            >
                              <span class="min-w-0 flex-1 truncate text-left">
                                {{ customerName(c) }}
                              </span>
                              <span class="text-xs text-base-content/60">{{ c.phone }}</span>
                            </button>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }
              </div>
            </div>

            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="hidden items-end justify-between gap-3 lg:flex">
                  <div>
                    <p class="type-caption">Amount due</p>
                    <p class="mt-1 type-hero"><app-money [cents]="cart.total()" /></p>
                  </div>
                  <span class="badge badge-ghost whitespace-nowrap">
                    {{ cartItemCount() }} {{ cartItemCount() === 1 ? 'item' : 'items' }}
                  </span>
                </div>

                <button
                  appButton
                  size="md"
                  class="mt-4 hidden w-full lg:flex"
                  [disabled]="cart.isEmpty() || busy() || !cashierSession.isOpen()"
                  (click)="openCheckout()"
                >
                  <app-icon name="heroBanknotes" />
                  Take payment
                </button>

                <div class="flex flex-wrap gap-2 lg:mt-2 lg:flex-col">
                  <button
                    appButton
                    variant="secondary"
                    size="md"
                    class="flex-1"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="park()"
                  >
                    Park sale
                  </button>
                  <button
                    appButton
                    variant="secondary"
                    size="md"
                    class="flex-1"
                    [disabled]="cart.isEmpty() || busy()"
                    (click)="saveProforma()"
                  >
                    Save proforma
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div
        class="shadow-overlay fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-base-300/60 bg-base-100 p-3 lg:hidden"
      >
        <div class="mx-auto flex max-w-6xl items-center gap-3">
          <a href="#current-sale" class="min-w-0 flex-1 rounded-field focus:outline-primary">
            <p class="type-caption">
              {{ cartItemCount() }} {{ cartItemCount() === 1 ? 'item' : 'items' }}
            </p>
            <p class="truncate text-lg font-bold"><app-money [cents]="cart.total()" /></p>
          </a>
          <button
            appButton
            size="md"
            class="min-w-40 flex-1"
            [disabled]="cart.isEmpty() || busy() || !cashierSession.isOpen()"
            (click)="openCheckout()"
          >
            Take payment
            <app-icon name="heroChevronRight" />
          </button>
        </div>
      </div>

      @if (checkoutOpen() && cashierSession.isOpen()) {
        <app-checkout-panel
          [total]="cart.total()"
          [creditAllowed]="creditAllowed()"
          [methods]="methods()"
          [busy]="busy()"
          title="Take payment"
          (confirmed)="completeSale($event)"
          (cancelled)="checkoutOpen.set(false)"
        />
      }
    </app-page>
  `,
})
export class SellComponent implements OnInit {
  protected readonly cart = inject(CartService);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly sync = inject(SyncService);
  protected readonly print = inject(PrintService);
  protected readonly perms = inject(PermissionsService);
  protected readonly cashierSession = inject(CashierSessionService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly pos = inject(PosService);
  private readonly route = inject(ActivatedRoute);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly searchQuery = signal('');
  protected readonly results = signal<Variant[]>([]);
  protected readonly topVariants = signal<Variant[]>([]);
  protected readonly searchMode = computed(() => this.searchQuery().trim().length >= 2);
  protected readonly gridItems = computed(() =>
    this.searchMode() ? this.results() : this.topVariants()
  );
  protected readonly cartItemCount = computed(() =>
    this.cart.lines().reduce((total, line) => total + line.quantity, 0)
  );
  protected readonly canOverridePrices = computed(() => this.perms.has('OverridePrice'));

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
  protected readonly success = signal<{
    text: string;
    tone: 'success' | 'warning';
    orderId?: string;
  } | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly brokenImages = signal<Set<string>>(new Set());
  protected readonly creditAllowed = computed(() => this.cart.customerId() !== null);

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(q => {
        this.searchQuery.set(q);
        void this.onSearch(q);
      });
    this.customerSearch.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(q => void this.onCustomerSearch(q));
  }

  async ngOnInit(): Promise<void> {
    try {
      this.methods.set(await this.pos.enabledPaymentMethods());
    } catch {
      // Keep safe payment defaults when configuration cannot be loaded.
    }
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    void this.sync.refreshProductSnapshot();
    try {
      this.topVariants.set(
        this.connectivity.online()
          ? await this.pos.topVariants(8)
          : await this.sync.offlineTopVariants(8)
      );
    } catch {
      // The quick list can stay empty; product search still works.
    }
    const draftId = this.route.snapshot.queryParamMap.get('draft');
    if (draftId) await this.loadDraft(draftId);
  }

  protected imageUrl(path: string | null | undefined): string | null {
    return this.pos.imageUrl(path);
  }

  protected markBroken(path: string): void {
    this.brokenImages.update(set => new Set(set).add(path));
  }

  protected async onSearch(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      this.results.set([]);
      return;
    }
    try {
      const variants = this.connectivity.online()
        ? await this.pos.searchVariants(q)
        : await this.sync.searchProductsOffline(q);
      const exact = variants.find(v => v.barcode === q);
      if (exact) {
        this.cart.addVariant(exact);
        this.clearSearch();
        return;
      }
      this.results.set(variants);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Product search failed');
    }
  }

  protected clearSearch(): void {
    this.search.setValue('', { emitEvent: false });
    this.searchQuery.set('');
    this.results.set([]);
  }

  protected addVariant(variant: Variant): void {
    if (this.unavailable(variant)) return;
    this.cart.addVariant(variant);
  }

  protected label(variant: Variant): string {
    return variantLabel(variant);
  }

  protected quantityInCart(variantId: string | null): number {
    if (!variantId) return 0;
    return this.cart.lines().find(line => line.variant.variant_id === variantId)?.quantity ?? 0;
  }

  protected unavailable(variant: Variant): boolean {
    return variant.kind !== 'service' && !!variant.track_inventory && (variant.stock ?? 0) <= 0;
  }

  protected stockLabel(variant: Variant): string {
    if (variant.kind === 'service') return 'Service';
    if (!variant.track_inventory) return 'In stock';
    const stock = variant.stock ?? 0;
    return stock > 0 ? `${stock} left` : 'Out of stock';
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
    const quantity = Number(value);
    if (Number.isFinite(quantity)) this.cart.setQuantity(variantId, quantity);
  }

  /**
   * Adjust by a stable ~3% of the base unit price, rounded to whole KES.
   * A fixed step makes up/down reversible and avoids the decimal drift in the old POS.
   */
  protected adjustPrice(line: CartLine, direction: 1 | -1): void {
    if (!this.canOverridePrices()) return;
    const baseWhole = Math.round(line.unitPrice / 100) * 100;
    const currentWhole = Math.round((line.customPrice ?? line.unitPrice) / 100) * 100;
    const step = Math.max(100, Math.round((line.unitPrice * 0.03) / 100) * 100);
    const wholesaleFloor = Math.ceil((line.variant.wholesale_price ?? 0) / 100) * 100;
    const next = Math.max(wholesaleFloor, currentWhole + direction * step);

    if (next === currentWhole) return;
    const customPrice = next === line.unitPrice ? null : next;
    const verb = direction > 0 ? 'increased' : 'reduced';
    this.cart.setCustomPrice(
      line.variant.variant_id!,
      customPrice,
      customPrice === null ? '' : `Quick price ${verb} by KES ${step / 100}`
    );

    // When a whole-KES base is reached, remove the override entirely.
    if (next === baseWhole && baseWhole === line.unitPrice) {
      this.cart.setCustomPrice(line.variant.variant_id!, null, '');
    }
  }

  protected startOverride(line: CartLine): void {
    if (!this.canOverridePrices()) return;
    const effectivePrice = line.customPrice ?? line.unitPrice;
    const kes = effectivePrice / 100;
    this.overrideFor.set(line.variant.variant_id!);
    this.overridePrice.setValue(Number.isInteger(kes) ? String(kes) : kes.toFixed(2));
    this.overrideReason.setValue(line.overrideReason);
  }

  protected applyOverride(): void {
    if (!this.canOverridePrices()) return;
    const variantId = this.overrideFor();
    if (!variantId) return;
    const enteredCents = parseKesToCents(this.overridePrice.value);
    if (enteredCents === null || enteredCents <= 0) {
      this.error.set('Enter a valid price greater than zero');
      return;
    }

    const line = this.cart.lines().find(item => item.variant.variant_id === variantId);
    if (!line) return;
    const wholeCents = Math.round(enteredCents / 100) * 100;
    const wholesaleFloor = Math.ceil((line.variant.wholesale_price ?? 0) / 100) * 100;
    if (wholeCents < wholesaleFloor) {
      this.error.set(`Price cannot be lower than wholesale (KES ${wholesaleFloor / 100})`);
      return;
    }

    const customPrice = wholeCents === line.unitPrice ? null : wholeCents;
    this.cart.setCustomPrice(
      variantId,
      customPrice,
      customPrice === null ? '' : this.overrideReason.value.trim() || 'Manual price adjustment'
    );
    this.overrideFor.set(null);
    this.error.set(null);
    if (wholeCents !== enteredCents) this.notice.set('Price rounded to the nearest whole KES');
  }

  protected resetPrice(line: CartLine): void {
    this.cart.setCustomPrice(line.variant.variant_id!, null, '');
    if (this.overrideFor() === line.variant.variant_id) this.overrideFor.set(null);
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

  protected customerName(customer: Customer): string {
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  }

  protected async openCheckout(): Promise<void> {
    this.error.set(null);
    try {
      await this.cashierSession.assertOpen('taking payment');
      this.checkoutOpen.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
    }
  }

  protected async completeSale(payments: PaymentInput[]): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    this.success.set(null);
    try {
      await this.cashierSession.assertOpen('completing a sale');
    } catch (err) {
      this.checkoutOpen.set(false);
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    this.busy.set(true);
    const customerId = this.cart.customerId();
    const lines = this.cart.toSaleLines();
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
        await this.queueSale(customerId, lines, payments);
      } else {
        this.error.set(err.message);
        this.checkoutOpen.set(false);
      }
    } finally {
      this.busy.set(false);
    }
  }

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
    this.overrideFor.set(null);
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
      const variants = await this.pos.variantsByIds(lines.map(line => line.variant_id));
      const byId = new Map(variants.map(variant => [variant.variant_id, variant]));
      this.cart.clear();
      for (const savedLine of lines) {
        const variant = byId.get(savedLine.variant_id);
        if (!variant) continue;
        this.cart.addVariant(variant);
        this.cart.setQuantity(variant.variant_id!, Number(savedLine.quantity));
        if (savedLine.custom_price !== null) {
          this.cart.setCustomPrice(
            variant.variant_id!,
            savedLine.custom_price,
            savedLine.price_override_reason ?? ''
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
