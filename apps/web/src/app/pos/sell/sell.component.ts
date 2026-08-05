import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { parseKes } from '../../core/money';
import { PermissionsService } from '../../core/permissions.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { CartService, type CartLine } from '../cart.service';
import {
  CheckoutPanelComponent,
  type PaymentMethodOption,
} from '../checkout/checkout-panel.component';
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
import { BarcodeScannerComponent } from '../../shared/ui/barcode-scanner.component';
import {
  Customer,
  CustomerWithCredit,
  PaymentInput,
  PosRpcError,
  PosService,
  Variant,
  variantLabel,
} from '../pos.service';

/** One load-time proforma warning (see loadDraft). All numeric fields are
 *  kind-specific; unused ones stay 0. */
interface DraftFlag {
  kind: 'price' | 'override' | 'override-blocked' | 'stock' | 'unavailable';
  label: string;
  was: number;
  now: number;
  overridePrice: number;
  available: number;
  needed: number;
  count: number;
}

@Component({
  selector: 'app-sell',
  imports: [
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
    BarcodeScannerComponent,
  ],
  template: `
    <app-page
      title="Sell"
      subtitle="Find an item, adjust it, and take payment without leaving the counter."
      [workspace]="true"
    >
      @if (cart.draftId()) {
        <span actions class="badge badge-info">Editing proforma</span>
      }
      @if (!connectivity.online()) {
        <span actions class="badge badge-warning">Offline — sales will queue</span>
      }
      @if (sync.usingCachedCatalog()) {
        <span actions class="badge badge-warning">{{ sync.catalogStatusLabel() }}</span>
      }
      @if (sync.usingCachedCatalog() && connectivity.online()) {
        <button
          actions
          appButton
          variant="ghost"
          size="sm"
          [loading]="catalogRefreshing()"
          (click)="refreshCatalog()"
        >
          Refresh catalog
        </button>
      }
      @if (cashierSession.usingCachedState()) {
        <span actions class="badge badge-warning">{{ cashierSession.cachedStatusLabel() }}</span>
      }
      @if (cashierSession.configurationLoaded() && !cashierSession.cashierFlowEnabled()) {
        <span
          actions
          class="badge badge-info cursor-help"
          title="Take payment here to complete the sale; the cashier queue is not used."
        >
          Direct checkout
        </span>
      }

      @if (cashierSession.cashControlEnabled() && !cashierSession.isOpen()) {
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
              @if (s.tone === 'success' && s.orderId && printerEnabled()) {
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
            <button
              appButton
              variant="ghost"
              size="sm"
              [iconOnly]="true"
              aria-label="Dismiss notice"
              (click)="notice.set(null)"
            >
              <app-icon name="heroXMark" />
            </button>
          </div>
        }
        @if (cart.draftId() && draftFlags().length > 0 && !draftFlagsDismissed()) {
          <div class="alert alert-warning mb-4 py-3" role="status">
            <app-icon name="heroExclamationTriangle" />
            <div class="flex flex-col gap-1">
              <span class="font-semibold">This proforma changed since it was saved</span>
              @for (flag of draftFlags(); track $index) {
                <span class="text-sm">
                  @switch (flag.kind) {
                    @case ('price') {
                      {{ flag.label }} — quoted <app-money [amount]="flag.was" />, now
                      <app-money [amount]="flag.now" />
                    }
                    @case ('override') {
                      {{ flag.label }} — list was <app-money [amount]="flag.was" />, now
                      <app-money [amount]="flag.now" /> (override
                      <app-money [amount]="flag.overridePrice" /> kept)
                    }
                    @case ('override-blocked') {
                      {{ flag.label }} — override <app-money [amount]="flag.overridePrice" /> needs
                      a manager (list now <app-money [amount]="flag.now" />) — checkout will be
                      rejected
                    }
                    @case ('stock') {
                      {{ flag.label }} — only {{ flag.available }} in stock, proforma needs
                      {{ flag.needed }}
                    }
                    @case ('unavailable') {
                      {{ flag.count }} {{ flag.count === 1 ? 'line is' : 'lines are' }} no longer
                      available and were skipped
                    }
                  }
                </span>
              }
            </div>
            <button
              appButton
              variant="ghost"
              size="sm"
              [iconOnly]="true"
              aria-label="Dismiss proforma warnings"
              (click)="draftFlagsDismissed.set(true)"
            >
              <app-icon name="heroXMark" />
            </button>
          </div>
        }

        <div class="grid items-start gap-4 lg:grid-cols-4 lg:items-stretch">
          <section class="card min-w-0 bg-base-100 lg:col-span-3 lg:h-full">
            <div class="card-body p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="type-heading">Add products</h2>
                  <p class="mt-0.5 text-sm text-base-content/60">
                    Search by name or SKU, or scan a barcode.
                  </p>
                </div>
                @if (!cart.isEmpty()) {
                  <span class="badge badge-primary shrink-0"> {{ cartItemCount() }} in cart </span>
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
                    type="search"
                    class="input input-bordered min-h-11 w-full pr-12 pl-11"
                    placeholder="Search or scan barcode…"
                    autocomplete="off"
                    aria-label="Search products or scan barcode"
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
                <button
                  appButton
                  variant="outline"
                  size="md"
                  type="button"
                  class="min-h-11"
                  (click)="scannerOpen.set(true)"
                >
                  <app-icon name="heroCamera" /> <span class="hidden sm:inline">Scan</span>
                </button>
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
                    class="group relative flex h-32 min-h-32 shrink-0 snap-start flex-col items-start gap-1 overflow-hidden rounded-box border border-base-300/70 bg-base-100 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
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
                        <app-money [amount]="v.price ?? 0" />
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
          </section>

          <section
            id="current-sale"
            class="card min-w-0 scroll-mt-4 overflow-hidden bg-base-100 lg:col-span-3"
          >
            <div
              class="flex items-center justify-between gap-3 border-b border-base-content/15 px-3 py-2.5 sm:px-4 sm:py-3"
            >
              <div>
                <h2 class="type-heading">Current sale</h2>
                @if (!cart.isEmpty()) {
                  <p class="type-caption">
                    {{ cart.lines().length }}
                    {{ cart.lines().length === 1 ? 'product' : 'products' }}
                  </p>
                }
              </div>
              @if (!cart.isEmpty()) {
                @if (clearCartArmed()) {
                  <div
                    class="flex items-center gap-1"
                    role="group"
                    aria-label="Confirm clearing the current sale"
                  >
                    <button
                      appButton
                      variant="ghost"
                      size="sm"
                      [disabled]="busy()"
                      (click)="clearCartArmed.set(false)"
                    >
                      Keep sale
                    </button>
                    <button
                      appButton
                      variant="error"
                      size="sm"
                      [disabled]="busy()"
                      (click)="clearCart()"
                    >
                      Clear all
                    </button>
                  </div>
                } @else {
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    class="text-base-content/60 hover:text-error"
                    [disabled]="busy()"
                    (click)="clearCartArmed.set(true)"
                  >
                    Clear cart
                  </button>
                }
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
                    class="border-b border-base-content/15 bg-base-100 last:border-b-0 even:bg-base-200/20"
                  >
                    <app-sell-cart-line
                      [line]="line"
                      [label]="cart.lineLabel(line)"
                      [canOverridePrice]="canOverridePrices()"
                      [floorRejected]="priceFloorFeedback()?.variantId === line.variant.variant_id"
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
                            <button appButton variant="ghost" size="md" (click)="resetPrice(line)">
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
                          <button appButton size="md" (click)="applyOverride()">Apply price</button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </section>

          <aside class="min-w-0 lg:sticky lg:top-4 lg:col-start-4 lg:row-start-1 lg:h-full">
            <div class="card h-full overflow-hidden bg-base-100" aria-label="Sale summary">
              <section class="p-4">
                <p class="type-caption">Customer</p>
                @if (selectedCustomer(); as customer) {
                  <div class="mt-1 flex items-center gap-1">
                    <p class="min-w-0 flex-1 truncate font-semibold">
                      {{ customerName(customer) }}
                    </p>
                    <button
                      appButton
                      variant="ghost"
                      size="sm"
                      [iconOnly]="true"
                      type="button"
                      aria-label="Clear customer (back to Walk-in)"
                      (click)="clearCustomer()"
                    >
                      <app-icon name="heroXMark" />
                    </button>
                  </div>
                  <p class="mt-0.5 text-xs text-base-content/60 sm:text-sm">
                    @if (!customer.is_credit_approved) {
                      Credit not approved
                    } @else if (customer.credit_limit > 0) {
                      Limit <app-money [amount]="customer.credit_limit" /> · Owed
                      <app-money [amount]="customer.ar_balance" /> · Available
                      <app-money [amount]="customerCreditAvailable(customer)" />
                    } @else {
                      Credit approved · no cap
                    }
                  </p>
                } @else {
                  <div class="relative mt-1">
                    <input
                      type="search"
                      class="input input-bordered min-h-11 w-full"
                      placeholder="Walk-in"
                      autocomplete="off"
                      aria-label="Search customers"
                      [formControl]="customerSearch"
                      (focus)="onCustomerFocus()"
                      (blur)="onCustomerBlur()"
                    />
                    @if (customerDropdownOpen() && customerResults().length > 0) {
                      <ul
                        class="menu absolute inset-x-0 z-20 mt-1 max-h-64 flex-nowrap overflow-y-auto rounded-box border border-base-300/60 bg-base-100 p-1 shadow-overlay"
                      >
                        @for (c of customerResults(); track c.id) {
                          <li>
                            <button
                              type="button"
                              class="min-h-11"
                              (mousedown)="$event.preventDefault(); selectCustomer(c)"
                            >
                              <span class="min-w-0 flex-1 truncate text-left">
                                {{ customerName(c) }}
                              </span>
                              <span class="text-xs text-base-content/60">{{ c.phone }}</span>
                              <span class="text-xs" [class.text-error]="!c.is_credit_approved">
                                @if (!c.is_credit_approved) {
                                  No credit
                                } @else if (c.credit_limit > 0) {
                                  <app-money [amount]="customerCreditAvailable(c)" /> left
                                } @else {
                                  No cap
                                }
                              </span>
                            </button>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }
              </section>

              <section class="mt-auto border-t border-base-300/60 p-4">
                <div class="hidden items-end justify-between gap-3 lg:flex">
                  <div>
                    <p class="type-caption">Amount due</p>
                    <p class="mt-1 type-hero"><app-money [amount]="cart.total()" /></p>
                  </div>
                  <span class="badge badge-ghost whitespace-nowrap">
                    {{ cartItemCount() }} {{ cartItemCount() === 1 ? 'item' : 'items' }}
                  </span>
                </div>

                <button
                  appButton
                  size="md"
                  class="mt-4 hidden w-full lg:flex"
                  [disabled]="cart.isEmpty() || busy() || !cashierSession.canTakePayment()"
                  (click)="openCheckout()"
                >
                  <app-icon name="heroBanknotes" />
                  Take payment
                </button>
                @if (creditAllowed()) {
                  <button
                    appButton
                    variant="secondary"
                    size="md"
                    class="mt-2 hidden min-h-11 w-full lg:flex"
                    [disabled]="cart.isEmpty() || busy() || !cashierSession.canTakePayment()"
                    (click)="creditConfirmOpen.set(true)"
                  >
                    Sell on credit
                  </button>
                }

                <div class="flex flex-wrap gap-2 lg:mt-2 lg:flex-col">
                  @if (cashierSession.cashierFlowEnabled()) {
                    <button
                      appButton
                      variant="secondary"
                      size="md"
                      class="flex-1"
                      [disabled]="cart.isEmpty() || busy()"
                      (click)="sendToCashier()"
                    >
                      Send to cashier
                    </button>
                  }
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
              </section>
            </div>
          </aside>
        </div>
      </div>

      <div
        class="shadow-overlay fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-base-300/60 bg-base-100 p-3 lg:hidden"
      >
        <div class="flex w-full flex-wrap items-center gap-3">
          <a href="#current-sale" class="min-w-0 flex-1 rounded-field focus:outline-primary">
            <p class="type-caption">
              {{ cartItemCount() }} {{ cartItemCount() === 1 ? 'item' : 'items' }}
            </p>
            <p class="type-hero truncate"><app-money [amount]="cart.total()" /></p>
          </a>
          @if (creditAllowed()) {
            <button
              appButton
              variant="secondary"
              size="md"
              class="min-h-11 flex-1"
              [disabled]="cart.isEmpty() || busy() || !cashierSession.canTakePayment()"
              (click)="creditConfirmOpen.set(true)"
            >
              Sell on credit
            </button>
          }
          <button
            appButton
            size="md"
            class="min-w-40 flex-1"
            [disabled]="cart.isEmpty() || busy() || !cashierSession.canTakePayment()"
            (click)="openCheckout()"
          >
            Take payment
            <app-icon name="heroChevronRight" />
          </button>
        </div>
      </div>

      @if (checkoutOpen() && cashierSession.canTakePayment()) {
        <app-checkout-panel
          [total]="cart.total()"
          [methods]="panelMethods()"
          [canUseDirectAccounts]="canUseDirectAccounts()"
          [busy]="busy()"
          heading="Take payment"
          (confirmed)="completeSale($event)"
          (approvalRequested)="completeSale($event)"
          (cancelled)="checkoutOpen.set(false)"
        />
      }
      @if (creditConfirmOpen()) {
        <dialog
          class="modal modal-open"
          aria-labelledby="credit-confirm-heading"
          (cancel)="$event.preventDefault(); creditConfirmOpen.set(false)"
        >
          <div class="modal-box border border-base-300/60 bg-base-100">
            <h2 id="credit-confirm-heading" class="type-title">Sell on credit?</h2>
            @if (selectedCustomer(); as customer) {
              <dl class="mt-3 flex flex-col gap-2 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-base-content/60">Customer</dt>
                  <dd class="font-semibold">{{ customerName(customer) }}</dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-base-content/60">Amount due</dt>
                  <dd class="font-semibold tabular-nums">
                    <app-money [amount]="cart.total()" />
                  </dd>
                </div>
                @if (customer.credit_limit > 0) {
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-base-content/60">Credit available after this sale</dt>
                    <dd class="font-semibold tabular-nums">
                      <app-money [amount]="customerCreditAvailable(customer) - cart.total()" />
                    </dd>
                  </div>
                }
              </dl>
            }
            <div class="mt-4 flex justify-end gap-2">
              <button
                appButton
                variant="ghost"
                size="md"
                type="button"
                [disabled]="busy()"
                (click)="creditConfirmOpen.set(false)"
              >
                Cancel
              </button>
              <button
                appButton
                size="md"
                type="button"
                [loading]="busy()"
                (click)="confirmCreditSale()"
              >
                Confirm credit sale
              </button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button type="button" aria-label="Cancel" (click)="creditConfirmOpen.set(false)">
              close
            </button>
          </form>
        </dialog>
      }
      @if (approvalSent()) {
        <div class="toast toast-bottom toast-end z-50" aria-live="polite">
          <div class="alert alert-warning max-w-sm shadow-overlay">
            <app-icon name="heroExclamationTriangle" />
            <div>
              <p class="font-semibold">Sent for approval</p>
              <p class="text-sm">Order held pending settlement.</p>
            </div>
          </div>
        </div>
      }
      @if (scannerOpen()) {
        <app-barcode-scanner (scanned)="barcodeScanned($event)" (close)="scannerOpen.set(false)" />
      }
      @if (priceFloorFeedback(); as feedback) {
        <div class="toast toast-bottom toast-end z-50" aria-live="assertive">
          <div class="alert alert-error max-w-sm shadow-overlay">
            <app-icon name="heroExclamationTriangle" />
            <div>
              <p class="font-semibold">Price not changed</p>
              <p class="text-sm">
                Minimum allowed for {{ feedback.label }} is <app-money [amount]="feedback.floor" />.
                @if (feedback.wholesale) {
                  This is the wholesale floor.
                }
              </p>
            </div>
          </div>
        </div>
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
  protected readonly scannerOpen = signal(false);
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
  protected readonly customerResults = signal<CustomerWithCredit[]>([]);
  protected readonly selectedCustomer = signal<CustomerWithCredit | null>(null);
  protected readonly customerDropdownOpen = signal(false);

  protected readonly overrideFor = signal<string | null>(null);
  protected readonly overridePrice = new FormControl('', { nonNullable: true });
  protected readonly overrideReason = new FormControl('', { nonNullable: true });
  protected readonly priceFloorFeedback = signal<{
    variantId: string;
    label: string;
    floor: number;
    wholesale: boolean;
  } | null>(null);

  protected readonly checkoutOpen = signal(false);
  protected readonly clearCartArmed = signal(false);
  protected readonly creditConfirmOpen = signal(false);
  protected readonly methods = signal<PaymentMethodOption[]>([]);
  protected readonly catalogRefreshing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  /**
   * Load-time warnings for a proforma being edited: price drift since it was
   * saved, overrides this user cannot keep, stock shortfalls, dropped lines.
   * Shown only while a proforma is loaded (cart.draftId set).
   */
  protected readonly draftFlags = signal<DraftFlag[]>([]);
  protected readonly draftFlagsDismissed = signal(false);
  protected readonly success = signal<{
    text: string;
    tone: 'success' | 'warning';
    orderId?: string;
  } | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly brokenImages = signal<Set<string>>(new Set());
  protected readonly creditAllowed = computed(() => {
    const customer = this.selectedCustomer();
    if (!customer?.is_credit_approved) return false;
    return (
      customer.credit_limit === 0 ||
      customer.ar_balance + this.cart.total() <= customer.credit_limit
    );
  });
  /** Backend-derived tender methods; walk-ins may only use till-controlled accounts. */
  protected readonly panelMethods = computed<PaymentMethodOption[]>(() => {
    const methods = this.methods();
    return this.cart.customerId() ? methods : methods.filter(m => m.isCashierControlled);
  });
  protected readonly canUseDirectAccounts = computed(() => this.perms.has('ViewFinancials'));
  protected readonly approvalSent = signal(false);
  private approvalSentTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;
  private priceFloorTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.methods.set(await this.sync.paymentMethods());
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    void this.sync.refreshProductSnapshot();
    try {
      this.topVariants.set(await this.sync.topVariants(8));
    } catch {
      // The quick list can stay empty; product search still works.
    }
    const draftId = this.route.snapshot.queryParamMap.get('draft');
    if (draftId) await this.loadDraft(draftId);
    const customerId = this.cart.customerId();
    if (customerId) {
      try {
        this.selectedCustomer.set(await this.pos.customerWithCredit(customerId));
      } catch {
        this.selectedCustomer.set(null);
      }
    }
  }

  protected async refreshCatalog(): Promise<void> {
    if (this.catalogRefreshing()) return;
    this.catalogRefreshing.set(true);
    this.error.set(null);
    try {
      const refreshed = await this.sync.refreshProductSnapshot();
      this.topVariants.set(await this.sync.topVariants(8));
      if (!refreshed) this.error.set('Could not refresh the catalog; using the last saved copy.');
    } finally {
      this.catalogRefreshing.set(false);
    }
  }

  protected imageUrl(path: string | null | undefined): string | null {
    return this.pos.imageUrl(path);
  }

  protected markBroken(path: string): void {
    this.brokenImages.update(set => new Set(set).add(path));
  }

  protected async onSearch(query: string): Promise<void> {
    const q = query.trim();
    // Sequence guard: a slower earlier response must not overwrite newer results.
    const seq = ++this.searchSeq;
    if (q.length < 2) {
      this.results.set([]);
      return;
    }
    try {
      const variants = await this.sync.searchProducts(q);
      if (seq !== this.searchSeq) return;
      const exact = variants.find(v => v.barcode === q);
      if (exact) {
        this.addVariant(exact);
        this.clearSearch();
        return;
      }
      this.results.set(variants);
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.error.set(err instanceof Error ? err.message : 'Product search failed');
    }
  }

  protected clearSearch(): void {
    this.search.setValue('', { emitEvent: false });
    this.searchQuery.set('');
    this.results.set([]);
  }

  protected barcodeScanned(value: string): void {
    this.scannerOpen.set(false);
    this.search.setValue(value);
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
    const baseWhole = line.unitPrice;
    const currentWhole = line.customPrice ?? line.unitPrice;
    const step = Math.max(1, Math.round(line.unitPrice * 0.03));
    const wholesaleFloor = this.wholesaleFloor(line);
    if (direction < 0 && currentWhole <= wholesaleFloor) {
      this.rejectBelowWholesale(line, wholesaleFloor);
      return;
    }
    const next = Math.max(wholesaleFloor, currentWhole + direction * step);

    if (next === currentWhole) return;
    this.clearPriceFloorFeedback();
    const customPrice = next === line.unitPrice ? null : next;
    const verb = direction > 0 ? 'increased' : 'reduced';
    this.cart.setCustomPrice(
      line.variant.variant_id!,
      customPrice,
      customPrice === null ? '' : `Quick price ${verb} by KES ${step}`
    );

    // When a whole-KES base is reached, remove the override entirely.
    if (next === baseWhole && baseWhole === line.unitPrice) {
      this.cart.setCustomPrice(line.variant.variant_id!, null, '');
    }
  }

  protected startOverride(line: CartLine): void {
    if (!this.canOverridePrices()) return;
    const effectivePrice = line.customPrice ?? line.unitPrice;
    this.overrideFor.set(line.variant.variant_id!);
    this.overridePrice.setValue(String(effectivePrice));
    this.overrideReason.setValue(line.overrideReason);
  }

  protected applyOverride(): void {
    if (!this.canOverridePrices()) return;
    const variantId = this.overrideFor();
    if (!variantId) return;
    const enteredAmount = parseKes(this.overridePrice.value);
    if (enteredAmount === null || enteredAmount <= 0) {
      this.error.set('Enter a valid price greater than zero');
      return;
    }

    const line = this.cart.lines().find(item => item.variant.variant_id === variantId);
    if (!line) return;
    const wholesaleFloor = this.wholesaleFloor(line);
    if (enteredAmount < wholesaleFloor) {
      this.rejectBelowWholesale(line, wholesaleFloor);
      return;
    }

    const customPrice = enteredAmount === line.unitPrice ? null : enteredAmount;
    this.clearPriceFloorFeedback();
    this.cart.setCustomPrice(
      variantId,
      customPrice,
      customPrice === null ? '' : this.overrideReason.value.trim() || 'Manual price adjustment'
    );
    this.overrideFor.set(null);
    this.error.set(null);
  }

  protected resetPrice(line: CartLine): void {
    this.clearPriceFloorFeedback();
    this.cart.setCustomPrice(line.variant.variant_id!, null, '');
    if (this.overrideFor() === line.variant.variant_id) this.overrideFor.set(null);
  }

  private wholesaleFloor(line: CartLine): number {
    return Math.max(1, line.variant.wholesale_price ?? 0);
  }

  private rejectBelowWholesale(line: CartLine, floor: number): void {
    this.clearPriceFloorFeedback();
    requestAnimationFrame(() => {
      this.priceFloorFeedback.set({
        variantId: line.variant.variant_id!,
        label: this.cart.lineLabel(line),
        floor,
        wholesale: (line.variant.wholesale_price ?? 0) > 0,
      });
      this.priceFloorTimer = setTimeout(() => this.priceFloorFeedback.set(null), 3000);
    });
  }

  private clearPriceFloorFeedback(): void {
    if (this.priceFloorTimer) {
      clearTimeout(this.priceFloorTimer);
      this.priceFloorTimer = null;
    }
    this.priceFloorFeedback.set(null);
  }

  protected onCustomerFocus(): void {
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerResults.set([]);
    this.customerDropdownOpen.set(true);
  }

  protected onCustomerBlur(): void {
    this.customerDropdownOpen.set(false);
    // No selection made: the field reverts to the Walk-in placeholder.
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerResults.set([]);
  }

  protected clearCustomer(): void {
    this.selectCustomer(null);
  }

  protected async onCustomerSearch(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      this.customerResults.set([]);
      return;
    }
    try {
      this.customerResults.set(await this.pos.searchCustomers(q));
      this.customerDropdownOpen.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Customer search failed');
    }
  }

  protected selectCustomer(customer: CustomerWithCredit | null): void {
    this.selectedCustomer.set(customer);
    this.cart.setCustomer(customer?.id ?? null, customer ? this.customerName(customer) : 'Walk-in');
    this.customerDropdownOpen.set(false);
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerResults.set([]);
  }

  protected customerCreditAvailable(customer: CustomerWithCredit): number {
    return Math.max(0, customer.credit_limit - customer.ar_balance);
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
    // Use the same reference for the first request and every possible replay.
    // This closes the ambiguous "server committed, response was lost" window.
    const clientRef = crypto.randomUUID();
    if (!this.connectivity.online()) {
      try {
        await this.queueSale(customerId, lines, payments, clientRef);
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Could not safely queue the sale');
      } finally {
        this.busy.set(false);
      }
      return;
    }
    try {
      // Completing from a loaded proforma: pass the draft id so the backend
      // retires it in the same transaction as the sale — no separate delete
      // call that could be lost. Offline-queued sales carry the draft id in
      // the outbox entry and use the same mechanism on replay.
      const completedDraftId = this.cart.draftId() ?? undefined;
      let result;
      try {
        result = await this.pos.postSale(
          customerId,
          lines,
          payments,
          false,
          clientRef,
          undefined,
          completedDraftId
        );
      } catch (err) {
        // The loaded proforma expired or was retired on another device: drop
        // the link and retry once as a plain sale. The same client_ref keeps
        // the retry idempotent if the first attempt somehow committed.
        if (
          !completedDraftId ||
          !(err instanceof PosRpcError) ||
          !err.message.startsWith('draft_not_found')
        ) {
          throw err;
        }
        this.cart.draftId.set(null);
        result = await this.pos.postSale(customerId, lines, payments, false, clientRef);
      }
      this.checkoutOpen.set(false);
      this.cart.clear();
      this.selectedCustomer.set(null);
      if (result.status === 'approval_required') {
        this.showApprovalSent();
      } else {
        this.success.set({ text: 'Sale completed', tone: 'success', orderId: result.orderId });
      }
    } catch (err) {
      if (!(err instanceof PosRpcError)) {
        try {
          await this.queueSale(customerId, lines, payments, clientRef);
        } catch (queueError) {
          this.error.set(
            queueError instanceof Error ? queueError.message : 'Could not safely queue the sale'
          );
        }
      } else {
        this.error.set(err.message);
        this.checkoutOpen.set(false);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected confirmCreditSale(): void {
    this.creditConfirmOpen.set(false);
    // Credit sale: no tenders — the backend books it against the customer's
    // credit (the same payload the old credit tab emitted).
    void this.completeSale([]);
  }

  /** Timed toast for approval-held orders (mirrors the price-floor toast). */
  private showApprovalSent(): void {
    if (this.approvalSentTimer) clearTimeout(this.approvalSentTimer);
    this.approvalSent.set(true);
    this.approvalSentTimer = setTimeout(() => this.approvalSent.set(false), 5000);
  }

  private async queueSale(
    customerId: string | null,
    lines: ReturnType<CartService['toSaleLines']>,
    payments: PaymentInput[],
    clientRef: string
  ): Promise<void> {
    await this.sync.enqueue(
      { customer_id: customerId, lines, payments, draft_id: this.cart.draftId() },
      clientRef
    );
    this.checkoutOpen.set(false);
    this.cart.clear();
    this.selectedCustomer.set(null);
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
        this.receiptData.buildReceiptData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async sendToCashier(): Promise<void> {
    if (!this.cashierSession.cashierFlowEnabled()) {
      this.error.set('Cashier workflow is off. Take payment here to complete the sale.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    // Same idempotency reference as completeSale: a lost response followed by a
    // retry must not park the sale twice.
    const clientRef = crypto.randomUUID();
    try {
      await this.pos.postSale(this.cart.customerId(), this.cart.toSaleLines(), [], true, clientRef);
      this.cart.clear();
      this.selectedCustomer.set(null);
      this.notice.set('Sent to the cashier queue');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to send sale to cashier');
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
    this.clearCartArmed.set(false);
    this.selectedCustomer.set(null);
    this.overrideFor.set(null);
    this.error.set(null);
    this.notice.set(null);
  }

  private async loadDraft(orderId: string): Promise<void> {
    this.draftFlags.set([]);
    this.draftFlagsDismissed.set(false);
    try {
      const order = await this.pos.getOrder(orderId);
      if (order.status !== 'draft') {
        this.error.set(`Order ${order.code} is not a proforma (status: ${order.status})`);
        return;
      }
      const lines = await this.pos.orderLines(orderId);
      // Location-resolved stock so the shortfall flags match what the server
      // will enforce at completion.
      const variants = await this.pos.variantsByIdsWithStock(lines.map(line => line.variant_id));
      const byId = new Map(variants.map(variant => [variant.variant_id, variant]));
      const flags: DraftFlag[] = [];
      let unavailable = 0;
      this.cart.clear();
      for (const savedLine of lines) {
        const variant = byId.get(savedLine.variant_id);
        if (!variant) {
          unavailable++;
          continue;
        }
        const label = variantLabel(variant);
        const was = Number(savedLine.unit_price);
        const now = variant.price ?? 0;
        const override = savedLine.custom_price;
        // The server rejects a custom_price that differs from the CURRENT list
        // price when the user lacks OverridePrice — flag it now, not at checkout.
        const blocked = override !== null && override !== now && !this.canOverridePrices();
        if (blocked) {
          flags.push({
            kind: 'override-blocked',
            label,
            was,
            now,
            overridePrice: override ?? 0,
            available: 0,
            needed: 0,
            count: 0,
          });
        } else if (was !== now && override !== null) {
          flags.push({
            kind: 'override',
            label,
            was,
            now,
            overridePrice: override,
            available: 0,
            needed: 0,
            count: 0,
          });
        } else if (was !== now) {
          flags.push({
            kind: 'price',
            label,
            was,
            now,
            overridePrice: 0,
            available: 0,
            needed: 0,
            count: 0,
          });
        }
        const needed = Number(savedLine.quantity);
        const available = Number(variant.stock ?? 0);
        if (variant.track_inventory && available < needed) {
          flags.push({
            kind: 'stock',
            label,
            was: 0,
            now: 0,
            overridePrice: 0,
            available,
            needed,
            count: 0,
          });
        }
        this.cart.addVariant(variant);
        this.cart.setQuantity(variant.variant_id!, needed);
        if (override !== null) {
          this.cart.setCustomPrice(
            variant.variant_id!,
            override,
            savedLine.price_override_reason ?? ''
          );
        }
      }
      if (unavailable > 0) {
        flags.push({
          kind: 'unavailable',
          label: '',
          was: 0,
          now: 0,
          overridePrice: 0,
          available: 0,
          needed: 0,
          count: unavailable,
        });
      }
      this.draftFlags.set(flags);
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
