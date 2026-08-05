import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { PosService, StockLocation, Variant, variantLabel } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatusBadgeComponent, type BadgeType } from '../shared/ui/status-badge.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import {
  AgingInfo,
  LedgerAccount,
  MoneyCustomer,
  MoneyService,
  PurchaseDraft,
  PurchaseLine,
  PurchasePayment,
  SupplierVariantPerformance,
} from '../money/money.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';

type SupplierWithAp = MoneyCustomer & { ap_balance: number } & AgingInfo;
type PurchasePaymentMode = 'paid' | 'partial' | 'later';
type PurchaseRow = {
  id: string;
  supplier_id: string;
  total_cost: number;
  is_credit: boolean;
  reference: string | null;
  created_at: string;
  paid: number;
};

interface PurchaseLineForm {
  variantId: string;
  quantity: number;
  unitCost: string; // KES text
  lineTotal: string; // KES text; linked bidirectionally with unitCost
  valueSource: 'unit' | 'total';
  expiryDate: string; // yyyy-mm-dd or ''
  batchNumber: string;
  wholesalePrice: string;
  retailPrice: string;
}

interface ParsedPurchaseLine {
  variant_id: string;
  quantity: number;
  unit_cost: number;
  expiry_date?: string;
  batch_number?: string;
  new_wholesale_price?: number;
  new_retail_price?: number;
}

@Component({
  selector: 'app-suppliers',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    FormFieldComponent,
    ButtonComponent,
    MoneyComponent,
    IconComponent,
    EmptyStateComponent,
    EntityAvatarComponent,
    StatusBadgeComponent,
    StatBarComponent,
    ListSearchBarComponent,
    DataTableShellComponent,
    DrawerComponent,
    StatCardComponent,
    PageLayoutComponent,
    SessionRequiredNoticeComponent,
    PaginationComponent,
  ],
  template: `
    <app-page
      [title]="isPurchasePage() ? 'Purchases' : 'Suppliers'"
      [wide]="true"
      [subtitle]="
        isPurchasePage()
          ? 'Receive stock with the pricing and supplier context needed to buy well.'
          : 'Manage supplier relationships, balances, and purchasing performance.'
      "
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        [title]="isPurchasePage() ? 'Refresh purchases' : 'Refresh suppliers'"
        [attr.aria-label]="isPurchasePage() ? 'Refresh purchases' : 'Refresh suppliers'"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
      @if (isPurchasePage()) {
        <a actions appButton variant="secondary" routerLink="/suppliers">
          <app-icon name="heroTruck" /> Suppliers
        </a>
      }
      @if (isPurchasePage()) {
        <button actions appButton type="button" (click)="startPurchase()">
          <app-icon name="heroPlus" /> Record purchase
        </button>
      }
      @if (!isPurchasePage()) {
        <a actions appButton variant="secondary" routerLink="/purchases">
          <app-icon name="heroShoppingCart" /> New purchase
        </a>
      }
      @if (!isPurchasePage()) {
        <button actions appButton type="button" (click)="startSupplierCreate()">
          <app-icon name="heroPlus" /> Add supplier
        </button>
      }

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

      @if (!isPurchasePage()) {
        <app-list-search-bar
          placeholder="Search supplier name, phone, or email…"
          [searchQuery]="supplierQuery()"
          (searchQueryChange)="supplierQuery.set($event)"
        >
          <app-stat-bar summary [stats]="supplierSummary()" />
        </app-list-search-bar>

        @if (!loading() && filteredSuppliers().length === 0) {
          <app-empty-state
            icon="heroTruck"
            title="No suppliers found"
            description="Create a supplier or clear the search to see supplier accounts."
          />
        } @else {
          <div class="mb-4 hidden lg:block">
            <app-data-table-shell
              title="Supplier accounts"
              [description]="filteredSuppliers().length + ' matching suppliers'"
            >
              <table class="table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Contact</th>
                    <th>Purchasing</th>
                    <th>Credit terms</th>
                    <th class="text-right">We owe</th>
                    <th>Status</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (supplier of filteredSuppliers(); track supplier.id) {
                    <tr
                      role="button"
                      tabindex="0"
                      class="cursor-pointer"
                      [class.opacity-60]="!supplier.supplier_active"
                      [class.table-row-active]="drawerSupplierId() === supplier.id"
                      (click)="openSupplierDrawer(supplier)"
                      (keydown.enter)="openSupplierDrawer(supplier)"
                    >
                      <td>
                        <div class="table-entity">
                          <app-entity-avatar size="sm" [firstName]="name(supplier)" />
                          <div class="min-w-0">
                            <p class="table-primary truncate">{{ name(supplier) }}</p>
                            <p class="table-secondary truncate">
                              {{ supplier.notes || 'No notes' }}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p class="table-primary">{{ supplier.phone || '—' }}</p>
                        <p class="table-secondary">{{ supplier.email || 'No email' }}</p>
                      </td>
                      <td>
                        @if (supplierStats(supplier.id); as stats) {
                          <p class="table-primary">{{ stats.purchases }} purchases</p>
                          <p class="table-secondary">{{ stats.products }} products supplied</p>
                        }
                      </td>
                      <td>
                        @if (supplier.supplier_credit_limit > 0) {
                          <p class="table-primary">
                            <app-money [amount]="supplier.supplier_credit_limit" /> limit
                          </p>
                        } @else {
                          <p class="table-primary">No credit cap</p>
                        }
                        <p class="table-secondary">
                          {{ supplier.supplier_credit_terms_days || 0 }} days
                        </p>
                      </td>
                      <td
                        class="table-number"
                        [class.text-warning]="supplier.ap_balance > 0"
                        [class.text-base-content/50]="supplier.ap_balance === 0"
                      >
                        <app-money
                          [amount]="supplier.ap_balance"
                          [masked]="!perms.has('ViewFinancials')"
                        />
                      </td>
                      <td>
                        <app-status-badge
                          size="xs"
                          [type]="supplier.supplier_active ? 'success' : 'neutral'"
                          [label]="supplier.supplier_active ? 'Active' : 'Archived'"
                        />
                        @if (supplier.days_outstanding !== null) {
                          <p class="table-secondary">
                            {{ supplier.days_outstanding }} days · {{ supplier.bucket }}
                          </p>
                        }
                      </td>
                      <td class="table-actions" (click)="$event.stopPropagation()">
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          type="button"
                          title="Edit supplier"
                          aria-label="Edit supplier"
                          (click)="startSupplierEdit(supplier)"
                        >
                          <app-icon name="heroPencilSquare" />
                        </button>
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          type="button"
                          [disabled]="busy()"
                          [title]="
                            supplier.supplier_active ? 'Archive supplier' : 'Reactivate supplier'
                          "
                          [attr.aria-label]="
                            supplier.supplier_active ? 'Archive supplier' : 'Reactivate supplier'
                          "
                          (click)="setSupplierActive(supplier)"
                        >
                          <app-icon
                            [name]="supplier.supplier_active ? 'heroArchiveBox' : 'heroArrowPath'"
                          />
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </app-data-table-shell>
          </div>
        }
      }

      <div
        class="grid gap-4"
        [class.mb-4]="isPurchasePage() && (purchaseFormOpen() || drafts().length > 0)"
      >
        @if (isPurchasePage() && purchaseFormOpen()) {
          <section id="purchase-form" class="card bg-base-100">
            <div class="card-body p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="section-title">Record a purchase</h2>
                  <p class="type-caption mt-1">Stock is added as soon as this purchase is saved.</p>
                </div>
                <a routerLink="/suppliers" class="link link-hover shrink-0 text-xs">
                  Manage suppliers
                </a>
              </div>

              <form
                (submit)="$event.preventDefault(); recordPurchase()"
                class="mt-2 flex flex-col gap-3"
              >
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                  <div class="relative sm:col-span-2 lg:col-span-6">
                    <span class="form-field-label mb-1.5 block">
                      Supplier <span class="text-error">*</span>
                    </span>
                    @if (activeSuppliers().length === 0) {
                      <div class="rounded-field border border-dashed border-base-300 p-3 text-sm">
                        <p class="font-medium">No active suppliers</p>
                        <a routerLink="/suppliers" class="link link-primary mt-1 inline-block">
                          Create a supplier first
                        </a>
                      </div>
                    } @else {
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        type="button"
                        class="w-full justify-between px-3 text-left"
                        [attr.aria-expanded]="supplierPickerOpen()"
                        aria-haspopup="listbox"
                        (click)="supplierPickerOpen.set(!supplierPickerOpen())"
                      >
                        @if (selectedSupplier(); as supplier) {
                          <span class="min-w-0 truncate font-semibold">{{ name(supplier) }}</span>
                        } @else {
                          <span>Choose supplier</span>
                        }
                        <app-icon name="heroChevronDown" />
                      </button>
                      @if (selectedSupplier(); as supplier) {
                        <p class="type-caption mt-1 truncate">
                          {{ supplier.phone || supplier.email || 'No contact details' }}
                          @if (perms.has('ViewFinancials')) {
                            · We owe <app-money [amount]="supplier.ap_balance" />
                            @if (supplier.supplier_credit_limit > 0) {
                              · <app-money [amount]="supplierCreditAvailable(supplier)" /> credit
                              left
                            } @else {
                              · No credit cap
                            }
                          }
                        </p>
                      }

                      @if (supplierPickerOpen()) {
                        <div
                          class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-overlay"
                        >
                          <div class="border-b border-base-300 p-2">
                            <div class="relative">
                              <span
                                class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50"
                              >
                                <app-icon name="heroMagnifyingGlass" />
                              </span>
                              <input
                                type="search"
                                class="input input-bordered input-sm w-full pl-9"
                                placeholder="Search name, phone, or email…"
                                [value]="supplierQuery()"
                                (input)="supplierQuery.set($any($event.target).value)"
                              />
                            </div>
                          </div>
                          <div class="max-h-64 overflow-y-auto p-1" role="listbox">
                            @for (supplier of filteredSuppliers(); track supplier.id) {
                              <button
                                type="button"
                                class="flex min-h-12 w-full items-center gap-3 rounded-field px-3 py-2 text-left hover:bg-base-200"
                                role="option"
                                [attr.aria-selected]="supplier.id === purchaseSupplier.value"
                                (click)="chooseSupplier(supplier)"
                              >
                                <span class="min-w-0 flex-1">
                                  <span class="block truncate text-sm font-semibold">
                                    {{ name(supplier) }}
                                  </span>
                                  <span class="type-caption block truncate">
                                    {{ supplier.phone || supplier.email || 'No contact details' }}
                                  </span>
                                </span>
                                @if (supplierStats(supplier.id); as stats) {
                                  <span class="shrink-0 text-right">
                                    <span class="block text-xs font-medium">
                                      {{ stats.purchases }} purchase(s)
                                    </span>
                                    <span class="type-caption">
                                      {{ stats.products }} product(s)
                                    </span>
                                  </span>
                                }
                              </button>
                            } @empty {
                              <p class="p-3 text-sm text-base-content/60">No matching suppliers.</p>
                            }
                          </div>
                        </div>
                      }
                    }
                  </div>
                  <app-form-field label="Invoice / reference" class="lg:col-span-3">
                    <input
                      type="text"
                      class="input input-bordered input-sm w-full"
                      placeholder="Optional"
                      [formControl]="purchaseReference"
                    />
                  </app-form-field>
                  <app-form-field label="Purchase date" class="lg:col-span-3">
                    <input
                      type="date"
                      class="input input-bordered input-sm w-full"
                      [formControl]="purchaseDate"
                    />
                  </app-form-field>
                  <app-form-field label="Receive into" class="lg:col-span-3">
                    <select
                      class="select select-bordered select-sm w-full"
                      [formControl]="purchaseLocation"
                    >
                      @for (location of locations(); track location.id) {
                        <option [value]="location.id">{{ location.name }}</option>
                      }
                    </select>
                  </app-form-field>
                  <app-form-field label="Notes" class="sm:col-span-2 lg:col-span-9">
                    <input
                      class="input input-bordered input-sm w-full"
                      placeholder="Delivery condition, invoice notes…"
                      [formControl]="purchaseNotes"
                    />
                  </app-form-field>
                </div>

                <section class="border-t border-base-300 pt-3">
                  <div class="grid items-start gap-3 lg:grid-cols-2">
                    <div>
                      <span class="form-field-label mb-1.5 block">Payment method</span>
                      <div class="grid gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          class="flex min-h-9 items-center justify-center gap-2 rounded-field border px-3 text-sm font-semibold transition-colors"
                          [class.border-primary]="purchasePaymentMode.value === 'paid'"
                          [class.bg-base-200]="purchasePaymentMode.value === 'paid'"
                          [class.border-base-300]="purchasePaymentMode.value !== 'paid'"
                          (click)="setPurchasePaymentMode('paid')"
                        >
                          <input
                            type="radio"
                            class="radio radio-primary radio-sm"
                            tabindex="-1"
                            [checked]="purchasePaymentMode.value === 'paid'"
                          />
                          Paid now
                        </button>
                        @if (perms.has('ManageSupplierCreditPurchases')) {
                          <button
                            type="button"
                            class="flex min-h-9 items-center justify-center gap-2 rounded-field border px-3 text-sm font-semibold transition-colors"
                            [class.border-primary]="purchasePaymentMode.value === 'partial'"
                            [class.bg-base-200]="purchasePaymentMode.value === 'partial'"
                            [class.border-base-300]="purchasePaymentMode.value !== 'partial'"
                            (click)="setPurchasePaymentMode('partial')"
                          >
                            <input
                              type="radio"
                              class="radio radio-primary radio-sm"
                              tabindex="-1"
                              [checked]="purchasePaymentMode.value === 'partial'"
                            />
                            Part-paid
                          </button>
                          <button
                            type="button"
                            class="flex min-h-9 items-center justify-center gap-2 rounded-field border px-3 text-sm font-semibold transition-colors"
                            [class.border-warning]="purchasePaymentMode.value === 'later'"
                            [class.bg-base-200]="purchasePaymentMode.value === 'later'"
                            [class.border-base-300]="purchasePaymentMode.value !== 'later'"
                            (click)="setPurchasePaymentMode('later')"
                          >
                            <input
                              type="radio"
                              class="radio radio-warning radio-sm"
                              tabindex="-1"
                              [checked]="purchasePaymentMode.value === 'later'"
                            />
                            Pay later
                          </button>
                        }
                      </div>
                      <p class="type-caption mt-1">
                        {{
                          purchasePaymentMode.value === 'paid'
                            ? 'Pay the full amount from an account now.'
                            : purchasePaymentMode.value === 'partial'
                              ? 'Pay part now and add only the remainder to what we owe this supplier.'
                              : 'Add the full amount to what we owe this supplier.'
                        }}
                      </p>
                    </div>

                    @if (purchasePaymentMode.value === 'partial') {
                      <div class="grid gap-3 sm:grid-cols-2">
                        <app-form-field
                          label="Amount paid"
                          [hint]="partialPaymentHint()"
                          [error]="partialPaymentError()"
                        >
                          <input
                            class="input input-bordered input-sm w-full"
                            inputmode="numeric"
                            placeholder="0"
                            [formControl]="purchaseAmountPaid"
                          />
                        </app-form-field>
                        <app-form-field label="Paid from">
                          <select
                            class="select select-bordered select-sm w-full"
                            [formControl]="purchaseAccount"
                          >
                            @for (a of accounts(); track a.code) {
                              <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                            }
                          </select>
                        </app-form-field>
                      </div>
                    } @else if (purchasePaymentMode.value === 'paid') {
                      <app-form-field label="Paid from">
                        <select
                          class="select select-bordered select-sm w-full"
                          [formControl]="purchaseAccount"
                        >
                          @for (a of accounts(); track a.code) {
                            <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                          }
                        </select>
                      </app-form-field>
                    } @else if (selectedSupplier(); as supplier) {
                      <div>
                        <span class="form-field-label mb-1.5 block">Supplier credit</span>
                        <div class="flex min-h-9 items-center text-sm">
                          @if (supplier.supplier_credit_limit > 0) {
                            <strong
                              ><app-money [amount]="supplierCreditAvailable(supplier)"
                            /></strong>
                            <span class="ml-1 text-base-content/60">available</span>
                          } @else {
                            <span class="text-base-content/60">No configured credit cap</span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                  @if (!cashierSession.canTakePayment()) {
                    @if (purchasePaymentMode.value !== 'later') {
                      <div class="mt-2">
                        <app-session-required-notice
                          action="recording a paid purchase"
                          [compact]="true"
                        />
                      </div>
                    }
                  }
                </section>

                <section class="flex flex-col gap-2 border-t border-base-300 pt-3">
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <span class="section-title">Items</span>
                      @if (selectedPurchaseLineCount() > 0) {
                        <span class="badge badge-ghost badge-xs ml-1">
                          {{ selectedPurchaseLineCount() }}
                        </span>
                      }
                      <p class="type-caption mt-0.5">
                        Enter unit cost or line total—the other stays in sync.
                      </p>
                    </div>
                    <button appButton variant="outline" size="sm" type="button" (click)="addLine()">
                      <app-icon name="heroPlus" />
                      Add line
                    </button>
                  </div>
                  @for (line of lines; track $index) {
                    <div
                      class="relative grid gap-2 rounded-box border border-base-300 bg-base-200/40 p-3 md:grid-cols-2 lg:grid-cols-12"
                    >
                      <div class="relative md:col-span-2 lg:col-span-4">
                        <span class="form-field-label mb-1 block">Product</span>
                        <button
                          type="button"
                          class="flex min-h-10 w-full items-center justify-between gap-2 rounded-field border border-base-300 bg-base-100 px-3 text-left text-sm hover:border-base-content/30"
                          [attr.aria-expanded]="variantPickerFor() === $index"
                          (click)="openVariantPicker($index)"
                        >
                          @if (variantFor(line); as selectedVariant) {
                            <span class="min-w-0 truncate font-medium">{{
                              label(selectedVariant)
                            }}</span>
                          } @else {
                            <span class="text-base-content/60">Choose a product</span>
                          }
                          <app-icon name="heroChevronDown" />
                        </button>
                        @if (variantPickerFor() === $index) {
                          <div
                            class="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-overlay"
                          >
                            <div class="border-b border-base-300 p-2">
                              <div class="relative">
                                <span
                                  class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50"
                                >
                                  <app-icon name="heroMagnifyingGlass" />
                                </span>
                                <input
                                  type="search"
                                  #variantSearch
                                  class="input input-bordered input-sm w-full pl-9"
                                  placeholder="Search product, SKU, or barcode…"
                                  [value]="variantQuery()"
                                  (input)="variantQuery.set($any($event.target).value)"
                                />
                              </div>
                            </div>
                            <div class="max-h-64 overflow-y-auto p-1" role="listbox">
                              @for (
                                variant of filteredPurchaseVariants();
                                track variant.variant_id
                              ) {
                                <button
                                  type="button"
                                  class="flex min-h-11 w-full items-center justify-between gap-3 rounded-field px-3 py-2 text-left hover:bg-base-200"
                                  [attr.aria-selected]="variant.variant_id === line.variantId"
                                  (click)="chooseVariantForLine(line, $index, variant.variant_id!)"
                                >
                                  <span class="min-w-0">
                                    <span class="block truncate text-sm font-medium">{{
                                      label(variant)
                                    }}</span>
                                    <span class="type-caption block truncate"
                                      >{{ variant.sku
                                      }}{{ variant.barcode ? ' · ' + variant.barcode : '' }}</span
                                    >
                                  </span>
                                  <span class="type-caption shrink-0 tabular-nums"
                                    >{{ variant.stock ?? 0 }} in stock</span
                                  >
                                </button>
                              } @empty {
                                <p class="p-3 text-sm text-base-content/60">
                                  No matching products.
                                </p>
                              }
                            </div>
                          </div>
                        }
                      </div>
                      <app-form-field label="Quantity" class="lg:col-span-2">
                        <div class="join flex w-full">
                          <button
                            appButton
                            variant="outline"
                            size="sm"
                            [iconOnly]="true"
                            type="button"
                            class="join-item"
                            aria-label="Decrease quantity"
                            (click)="stepPurchaseQuantity(line, -1)"
                          >
                            <app-icon name="heroMinus" />
                          </button>
                          <input
                            type="number"
                            class="input input-bordered input-sm join-item min-h-9 min-w-10 flex-1 px-1 text-center tabular-nums"
                            [min]="variantFor(line)?.allow_fractional ? 0.01 : 1"
                            [step]="variantFor(line)?.allow_fractional ? 0.5 : 1"
                            [ngModel]="line.quantity"
                            [ngModelOptions]="{ standalone: true }"
                            (ngModelChange)="updatePurchaseQuantity(line, $event)"
                          />
                          <button
                            appButton
                            variant="outline"
                            size="sm"
                            [iconOnly]="true"
                            type="button"
                            class="join-item"
                            aria-label="Increase quantity"
                            (click)="stepPurchaseQuantity(line, 1)"
                          >
                            <app-icon name="heroPlus" />
                          </button>
                        </div>
                      </app-form-field>
                      <app-form-field label="Unit cost (KES)" class="lg:col-span-2">
                        <input
                          type="text"
                          inputmode="numeric"
                          class="input input-bordered input-sm min-h-9 w-full text-right tabular-nums"
                          [ngModel]="line.unitCost"
                          [ngModelOptions]="{ standalone: true }"
                          (ngModelChange)="updateUnitCost(line, $event)"
                          (blur)="normalizePurchaseValue(line)"
                        />
                      </app-form-field>
                      <app-form-field
                        label="Line total (KES)"
                        [class.lg:col-span-3]="lines.length > 1"
                        [class.lg:col-span-4]="lines.length === 1"
                      >
                        <input
                          type="text"
                          inputmode="numeric"
                          class="input input-bordered input-sm min-h-9 w-full text-right font-semibold tabular-nums"
                          [ngModel]="line.lineTotal"
                          [ngModelOptions]="{ standalone: true }"
                          (ngModelChange)="updateLineTotal(line, $event)"
                          (blur)="normalizePurchaseValue(line)"
                        />
                      </app-form-field>
                      @if (lines.length > 1) {
                        <div class="flex items-end justify-end md:col-span-2 lg:col-span-1">
                          <button
                            appButton
                            variant="ghost"
                            type="button"
                            aria-label="Remove purchase line"
                            (click)="removeLine($index)"
                          >
                            <app-icon name="heroXMark" />
                          </button>
                        </div>
                      }
                      @if (variantFor(line); as variant) {
                        <div
                          class="grid gap-2 md:col-span-2 md:grid-cols-2 lg:col-span-12 lg:grid-cols-4"
                        >
                          @if (preferences.batchExpiryEnabled()) {
                            <app-form-field label="Expiry (optional)">
                              <input
                                type="date"
                                class="input input-bordered input-sm w-full"
                                [(ngModel)]="line.expiryDate"
                                [ngModelOptions]="{ standalone: true }"
                              />
                            </app-form-field>
                          }
                          <app-form-field label="Batch (optional)">
                            <input
                              class="input input-bordered input-sm w-full"
                              [(ngModel)]="line.batchNumber"
                              [ngModelOptions]="{ standalone: true }"
                            />
                          </app-form-field>
                          <app-form-field label="Wholesale price (KES)">
                            <div class="relative">
                              <input
                                type="text"
                                inputmode="numeric"
                                class="input input-bordered input-sm w-full tabular-nums"
                                [class.pr-8]="hasDuplicateVariant(line)"
                                [(ngModel)]="line.wholesalePrice"
                                (ngModelChange)="updateWholesalePrice(line, $event)"
                                [ngModelOptions]="{ standalone: true }"
                              />
                              @if (hasDuplicateVariant(line)) {
                                <span
                                  class="absolute inset-y-0 right-2 flex items-center text-warning"
                                  [title]="duplicatePriceTooltip"
                                >
                                  <app-icon name="heroExclamationTriangle" />
                                </span>
                              }
                            </div>
                          </app-form-field>
                          <app-form-field label="Retail price (KES)">
                            <div class="relative">
                              <input
                                type="text"
                                inputmode="numeric"
                                class="input input-bordered input-sm w-full tabular-nums"
                                [class.pr-8]="hasDuplicateVariant(line)"
                                [(ngModel)]="line.retailPrice"
                                (ngModelChange)="updateRetailPrice(line, $event)"
                                [ngModelOptions]="{ standalone: true }"
                              />
                              @if (hasDuplicateVariant(line)) {
                                <span
                                  class="absolute inset-y-0 right-2 flex items-center text-warning"
                                  [title]="duplicatePriceTooltip"
                                >
                                  <app-icon name="heroExclamationTriangle" />
                                </span>
                              }
                            </div>
                          </app-form-field>
                        </div>

                        <div
                          class="grid gap-3 border-t border-base-300 pt-3 sm:grid-cols-2 md:col-span-2 lg:col-span-12 lg:grid-cols-5"
                        >
                          <div>
                            <p class="type-caption">SKU · current stock</p>
                            <p class="font-semibold tabular-nums">
                              {{ variant.sku }} · {{ variant.stock ?? 0 }}
                              {{ variant.allow_fractional ? 'units' : 'in stock' }}
                            </p>
                          </div>
                          <div>
                            <p class="type-caption">This supplier</p>
                            @if (supplierInsight(line); as insight) {
                              <p class="font-semibold">
                                <app-money [amount]="insight.last_unit_cost ?? 0" />
                              </p>
                              <p class="type-caption">
                                Last cost · {{ insight.purchase_count }} purchase(s)
                              </p>
                            } @else {
                              <p class="text-sm text-base-content/60">No purchase history</p>
                            }
                          </div>
                          <div>
                            <p class="type-caption">Wholesale margin</p>
                            <app-status-badge
                              size="xs"
                              [type]="marginType(line, enteredCatalogPrice(line.wholesalePrice))"
                              [label]="marginLabel(line, enteredCatalogPrice(line.wholesalePrice))"
                            />
                          </div>
                          <div>
                            <p class="type-caption">Retail margin</p>
                            <app-status-badge
                              size="xs"
                              [type]="marginType(line, enteredCatalogPrice(line.retailPrice))"
                              [label]="marginLabel(line, enteredCatalogPrice(line.retailPrice))"
                            />
                          </div>
                          <div>
                            <p class="type-caption">Best recorded price</p>
                            @if (bestSupplierHint(line); as best) {
                              <p class="text-sm font-semibold">{{ fmt(best.cost) }}</p>
                              <p class="type-caption truncate">{{ best.supplier }}</p>
                            } @else {
                              <p class="text-sm text-base-content/60">No comparison yet</p>
                            }
                          </div>
                        </div>

                        @if (catalogPriceChanged(line)) {
                          <div
                            class="flex items-center gap-2 text-xs text-info md:col-span-2 lg:col-span-12"
                          >
                            <app-icon name="heroArrowPath" />
                            Catalog prices will update when this purchase is confirmed.
                          </div>
                        }

                        @if (priceWarning(line, variant); as warning) {
                          <div
                            class="alert alert-warning py-2 text-sm md:col-span-2 lg:col-span-12"
                            role="status"
                          >
                            <app-icon name="heroExclamationTriangle" />
                            <span>{{ warning }}</span>
                          </div>
                        }
                      }
                    </div>
                  }
                </section>

                <div
                  class="flex flex-wrap items-center gap-3 rounded-box border px-3 py-3"
                  [class.border-warning]="purchasePaymentMode.value !== 'paid'"
                  [class.border-base-300]="purchasePaymentMode.value === 'paid'"
                  [class.bg-base-200]="true"
                >
                  <div>
                    <p class="type-caption">Purchase total</p>
                    <p class="type-hero"><app-money [amount]="purchaseTotal()" /></p>
                  </div>
                  <p class="ml-auto max-w-sm text-right text-sm">
                    @if (purchasePaymentMode.value === 'partial') {
                      <strong><app-money [amount]="purchaseInitialPayment()" /></strong> paid now ·
                      <strong><app-money [amount]="purchaseBalanceDue()" /></strong> we still owe
                    } @else if (purchasePaymentMode.value === 'later') {
                      <strong><app-money [amount]="purchaseBalanceDue()" /></strong> will become
                      money we owe {{ selectedSupplierName() }}.
                    } @else {
                      This is recorded as <strong>paid now</strong>; what we owe the supplier will
                      not change.
                    }
                  </p>
                </div>

                @if (purchasePaymentMode.value !== 'paid' && supplierCreditExceeded()) {
                  <div role="alert" class="alert alert-error text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>
                      This purchase exceeds the supplier's available credit of
                      <app-money [amount]="supplierCreditAvailable(selectedSupplier()!)" />.
                    </span>
                  </div>
                }

                <div class="flex flex-wrap gap-2">
                  <button
                    appButton
                    type="submit"
                    [loading]="busy()"
                    [disabled]="
                      activeSuppliers().length === 0 ||
                      variants().length === 0 ||
                      (purchasePaymentMode.value !== 'later' && !cashierSession.canTakePayment()) ||
                      !partialPaymentValid() ||
                      (purchasePaymentMode.value !== 'paid' && supplierCreditExceeded())
                    "
                  >
                    {{
                      activeDraftId()
                        ? 'Confirm draft purchase'
                        : purchasePaymentMode.value === 'paid'
                          ? 'Record paid purchase'
                          : purchasePaymentMode.value === 'partial'
                            ? 'Record part-paid purchase'
                            : 'Record credit purchase'
                    }}
                  </button>
                  <button
                    appButton
                    variant="outline"
                    type="button"
                    [disabled]="busy()"
                    (click)="saveDraft()"
                  >
                    {{ activeDraftId() ? 'Update draft' : 'Save draft' }}
                  </button>
                  <button appButton variant="ghost" type="button" (click)="closePurchaseForm()">
                    {{ activeDraftId() ? 'Close draft' : 'Cancel' }}
                  </button>
                </div>
              </form>
            </div>
          </section>
        }

        <aside class="flex flex-col gap-4">
          @if (isPurchasePage() && drafts().length > 0) {
            <section class="card bg-base-100">
              <div class="card-body p-4">
                <h2 class="section-title">Purchase drafts</h2>
                <div class="mt-2 divide-y divide-base-200">
                  @for (draft of drafts(); track draft.id) {
                    <div class="flex items-center gap-2 py-2">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">
                          {{ supplierName(draft.supplier_id) }}
                        </p>
                        <p class="type-caption">
                          {{ draft.reference || 'No reference' }} · {{ fmt(draft.total_cost) }}
                        </p>
                      </div>
                      <button appButton variant="ghost" (click)="openDraft(draft)">Open</button
                      ><button appButton variant="ghost" (click)="cancelDraft(draft.id)">
                        Cancel
                      </button>
                    </div>
                  }
                </div>
              </div>
            </section>
          }
          @if (!isPurchasePage()) {
            <section class="card bg-base-100 lg:hidden">
              <div class="card-body p-4">
                <div class="flex items-center justify-between gap-2">
                  <h2 class="section-title">What we owe suppliers</h2>
                  <span class="type-caption">Money we owe suppliers</span>
                </div>
                @if (filteredSuppliers().length === 0) {
                  <app-empty-state
                    [embedded]="true"
                    [compact]="true"
                    icon="heroTruck"
                    title="No suppliers yet"
                    description="Create a supplier to start recording purchases."
                  />
                } @else {
                  <div class="mt-1 flex flex-col divide-y divide-base-200">
                    @for (s of filteredSuppliers(); track s.id) {
                      <div
                        class="cursor-pointer py-3"
                        role="button"
                        tabindex="0"
                        [class.opacity-60]="!s.supplier_active"
                        [class.bg-base-200/50]="drawerSupplierId() === s.id"
                        (click)="openSupplierDrawer(s)"
                        (keydown.enter)="openSupplierDrawer(s)"
                      >
                        <div class="flex items-center gap-3">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{{ name(s) }}</p>
                            <p class="type-caption">{{ s.phone || 'No phone' }}</p>
                            @if (!s.supplier_active) {
                              <app-status-badge size="xs" type="neutral" label="archived" />
                            }
                            @if (perms.has('ViewFinancials')) {
                              <p class="type-caption mt-1">
                                @if (s.supplier_credit_limit > 0) {
                                  Limit <app-money [amount]="s.supplier_credit_limit" /> ·
                                  <app-money [amount]="supplierCreditAvailable(s)" /> available
                                } @else {
                                  Credit has no configured cap
                                }
                                @if (s.supplier_credit_terms_days) {
                                  · {{ s.supplier_credit_terms_days }}d terms
                                }
                              </p>
                            }
                          </div>
                          <div class="text-right">
                            <p
                              class="text-sm font-semibold"
                              [class.text-warning]="s.ap_balance > 0"
                            >
                              <app-money
                                [amount]="s.ap_balance"
                                [masked]="!perms.has('ViewFinancials')"
                              />
                            </p>
                            @if (s.days_outstanding !== null) {
                              <div class="mt-1 flex items-center justify-end gap-1">
                                <span class="type-caption">{{ s.days_outstanding }}d</span>
                                <span class="badge badge-xs" [class]="bucketBadge(s.bucket)">
                                  {{ s.bucket }}
                                </span>
                              </div>
                            } @else {
                              <span class="type-caption">{{
                                s.ap_balance > 0 ? 'We owe this supplier' : 'Nothing owed'
                              }}</span>
                            }
                          </div>
                        </div>
                        @if (supplierStats(s.id); as stats) {
                          <div
                            class="mt-2 grid grid-cols-2 gap-2 rounded-field bg-base-200/50 p-2 sm:grid-cols-4"
                          >
                            <div>
                              <p class="type-caption">Purchases</p>
                              <p class="text-sm font-semibold">{{ stats.purchases }}</p>
                            </div>
                            <div>
                              <p class="type-caption">Products supplied</p>
                              <p class="text-sm font-semibold">{{ stats.products }}</p>
                            </div>
                            <div>
                              <p class="type-caption">Average order</p>
                              <p class="text-sm font-semibold">{{ fmt(stats.averageOrder) }}</p>
                            </div>
                            <div>
                              <p class="type-caption">Price leader</p>
                              <p class="text-sm font-semibold">{{ stats.bestPrices }} product(s)</p>
                            </div>
                          </div>
                        }
                        <div class="mt-2 flex justify-end">
                          <button
                            appButton
                            variant="ghost"
                            size="sm"
                            (click)="$event.stopPropagation(); startSupplierEdit(s)"
                          >
                            Edit
                          </button>
                          <button
                            appButton
                            variant="ghost"
                            size="sm"
                            [disabled]="busy()"
                            (click)="$event.stopPropagation(); setSupplierActive(s)"
                          >
                            {{ s.supplier_active ? 'Archive' : 'Reactivate' }}
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </section>
          }
        </aside>
      </div>

      <!-- Supplier detail/edit drawer (shared shell with the customer drawer) -->
      @if (!isPurchasePage()) {
        @if (drawerSupplierId() !== null || supplierCreating()) {
          <app-drawer
            [open]="true"
            (closed)="closeSupplierDrawer()"
            [title]="drawerTitle()"
            [subtitle]="drawerSubtitle()"
          >
            @if (detailSupplier(); as s) {
              <app-entity-avatar leading size="sm" [firstName]="name(s)" />
            }
            @if (detailSupplier(); as s) {
              <button
                actions
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                title="Edit supplier"
                aria-label="Edit supplier"
                (click)="editSupplierFromDrawer(s)"
              >
                <app-icon name="heroPencilSquare" />
              </button>
            }

            @if (supplierCreating() || drawerEditing()) {
              <!-- Create / edit mode: the supplier form, in place -->
              <form (submit)="$event.preventDefault(); saveSupplier()" class="flex flex-col gap-3">
                <p class="type-caption">
                  Contact details are kept separate from purchase and payment history.
                </p>
                <app-form-field label="Supplier name" [required]="true">
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    autocomplete="organization"
                    [formControl]="newName"
                  />
                </app-form-field>
                <app-form-field label="Phone">
                  <input
                    type="tel"
                    class="input input-bordered input-sm w-full"
                    autocomplete="tel"
                    [formControl]="newPhone"
                  />
                </app-form-field>
                <app-form-field label="Email">
                  <input
                    type="email"
                    class="input input-bordered input-sm w-full"
                    autocomplete="email"
                    [formControl]="newEmail"
                  />
                </app-form-field>
                <app-form-field label="Notes">
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Contact person, delivery notes…"
                    [formControl]="newNotes"
                  />
                </app-form-field>
                @if (perms.has('ManageSupplierCreditPurchases')) {
                  <app-form-field
                    label="Credit limit (KES)"
                    hint="Use 0 when this supplier has no configured cap."
                  >
                    <input
                      type="text"
                      inputmode="numeric"
                      class="input input-bordered input-sm w-full"
                      [formControl]="supplierCreditLimit"
                    />
                  </app-form-field>
                  <app-form-field label="Credit terms (days)">
                    <input
                      type="number"
                      min="0"
                      class="input input-bordered input-sm w-full"
                      [formControl]="supplierTermsDays"
                    />
                  </app-form-field>
                }
                <div class="flex gap-2">
                  <button
                    appButton
                    type="submit"
                    [loading]="busy()"
                    [disabled]="newName.value.trim().length === 0"
                  >
                    {{ editingSupplier() ? 'Save changes' : 'Create supplier' }}
                  </button>
                  <button appButton variant="ghost" type="button" (click)="closeSupplierForm()">
                    Cancel
                  </button>
                </div>
              </form>
            } @else if (drawerSupplier(); as s) {
              <div class="flex flex-wrap items-center gap-1">
                <app-status-badge
                  size="xs"
                  [type]="s.supplier_active ? 'success' : 'neutral'"
                  [label]="s.supplier_active ? 'Active' : 'Archived'"
                />
                @if (s.days_outstanding !== null) {
                  <span class="type-caption">{{ s.days_outstanding }}d</span>
                  <app-status-badge
                    size="xs"
                    [type]="bucketType(s.bucket)"
                    [label]="s.bucket ?? 'current'"
                  />
                }
              </div>

              <div class="mt-3 grid grid-cols-2 gap-2">
                <app-stat-card
                  label="We owe"
                  [value]="perms.has('ViewFinancials') ? fmt(s.ap_balance) : 'Hidden'"
                  [tone]="s.ap_balance > 0 ? 'warning' : 'neutral'"
                />
                <app-stat-card
                  label="Credit available"
                  [value]="
                    !perms.has('ViewFinancials')
                      ? 'Hidden'
                      : s.supplier_credit_limit > 0
                        ? fmt(supplierCreditAvailable(s))
                        : 'No cap'
                  "
                  [sub]="
                    s.supplier_credit_limit > 0
                      ? 'Limit ' + fmt(s.supplier_credit_limit)
                      : (s.supplier_credit_terms_days || 0) + 'd terms'
                  "
                />
              </div>

              @if (supplierStats(s.id); as stats) {
                <div class="mt-3 grid grid-cols-2 gap-2 rounded-field bg-base-200/50 p-2">
                  <div>
                    <p class="type-caption">Purchases</p>
                    <p class="text-sm font-semibold">{{ stats.purchases }}</p>
                  </div>
                  <div>
                    <p class="type-caption">Products supplied</p>
                    <p class="text-sm font-semibold">{{ stats.products }}</p>
                  </div>
                  <div>
                    <p class="type-caption">Average order</p>
                    <p class="text-sm font-semibold">{{ fmt(stats.averageOrder) }}</p>
                  </div>
                  <div>
                    <p class="type-caption">Price leader</p>
                    <p class="text-sm font-semibold">{{ stats.bestPrices }} product(s)</p>
                  </div>
                </div>
              }

              <div class="mt-4 flex flex-col gap-4">
                @if (perms.has('ViewFinancials')) {
                  <section>
                    <h3 class="section-title mb-2">Pay this supplier</h3>
                    @if (s.ap_balance <= 0) {
                      <p class="text-xs text-base-content/60">We do not owe this supplier.</p>
                    } @else {
                      @if (!cashierSession.canTakePayment()) {
                        <app-session-required-notice action="paying a supplier" />
                      }
                      <form
                        (submit)="$event.preventDefault(); paySupplier()"
                        class="mt-2 flex flex-col gap-3"
                      >
                        <app-form-field label="Amount (KES)">
                          <input
                            type="text"
                            inputmode="numeric"
                            class="input input-bordered input-sm w-full"
                            [formControl]="payAmount"
                          />
                        </app-form-field>
                        <app-form-field label="Pay from">
                          <select
                            class="select select-bordered select-sm w-full"
                            [formControl]="payAccount"
                          >
                            @for (a of accounts(); track a.code) {
                              <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                            }
                          </select>
                        </app-form-field>
                        <button
                          appButton
                          type="submit"
                          class="self-start"
                          [loading]="busy()"
                          [disabled]="!cashierSession.canTakePayment()"
                        >
                          Record supplier payment
                        </button>
                      </form>
                    }
                  </section>
                }

                @if (perms.has('ManageSupplierCreditPurchases')) {
                  <section class="border-t border-base-300/60 pt-3">
                    <h3 class="section-title mb-2">Credit terms</h3>
                    <form
                      (submit)="$event.preventDefault(); saveDrawerCredit(s)"
                      class="flex flex-col gap-2"
                    >
                      <app-form-field
                        label="Credit limit (KES)"
                        hint="Use 0 when this supplier has no configured cap."
                      >
                        <input
                          type="text"
                          inputmode="numeric"
                          class="input input-bordered input-sm w-full"
                          [formControl]="supplierCreditLimit"
                        />
                      </app-form-field>
                      <app-form-field label="Credit terms (days)">
                        <input
                          type="number"
                          min="0"
                          class="input input-bordered input-sm w-full"
                          [formControl]="supplierTermsDays"
                        />
                      </app-form-field>
                      <button
                        appButton
                        variant="outline"
                        type="submit"
                        class="self-start"
                        [disabled]="busy()"
                      >
                        Save credit terms
                      </button>
                    </form>
                  </section>
                }

                <section class="border-t border-base-300/60 pt-3">
                  <h3 class="section-title mb-2">Purchases</h3>
                  @if (drawerPurchases().length === 0) {
                    <app-empty-state
                      [compact]="true"
                      icon="heroTruck"
                      title="No purchases from this supplier"
                    />
                  } @else {
                    <p class="type-caption mb-2">
                      Paid
                      <app-money
                        [amount]="drawerPaymentSummary().paid"
                        [masked]="!perms.has('ViewFinancials')"
                      />
                      of
                      <app-money
                        [amount]="drawerPaymentSummary().total"
                        [masked]="!perms.has('ViewFinancials')"
                      />
                      across {{ drawerPurchases().length }} purchase(s) · still to pay
                      <app-money
                        [amount]="drawerPaymentSummary().outstanding"
                        [masked]="!perms.has('ViewFinancials')"
                      />
                    </p>
                    <ul class="max-h-80 divide-y divide-base-200 overflow-y-auto">
                      @for (p of drawerPurchases(); track p.id) {
                        <li class="py-2">
                          <div class="flex items-center gap-2">
                            <div class="min-w-0 flex-1">
                              <p class="truncate text-sm font-medium">
                                {{ p.reference || 'No reference' }}
                              </p>
                              <p class="type-caption">
                                {{ time(p.created_at) }} ·
                                {{ p.is_credit ? 'Pay later' : 'Paid now' }}
                              </p>
                            </div>
                            <app-status-badge
                              size="xs"
                              [type]="purchaseStatusType(p)"
                              [label]="purchaseStatusLabel(p)"
                            />
                            <span class="text-sm font-semibold tabular-nums">
                              <app-money
                                [amount]="p.total_cost"
                                [masked]="!perms.has('ViewFinancials')"
                              />
                            </span>
                            @if (
                              p.is_credit &&
                              p.paid < p.total_cost &&
                              perms.has('ManageSupplierCreditPurchases')
                            ) {
                              <button
                                appButton
                                variant="outline"
                                size="sm"
                                [disabled]="!cashierSession.canTakePayment()"
                                (click)="startPurchasePayment(p)"
                              >
                                Pay
                              </button>
                            }
                          </div>
                          @if (payPurchaseId() === p.id) {
                            <form
                              (submit)="$event.preventDefault(); paySelectedPurchase()"
                              class="mt-2 flex flex-wrap items-end gap-2 rounded-field border border-base-300 bg-base-200/50 p-2"
                            >
                              <app-form-field label="Amount (KES)"
                                ><input
                                  class="input input-bordered input-sm w-32"
                                  [formControl]="selectedPayAmount" /></app-form-field
                              ><app-form-field label="Pay from"
                                ><select
                                  class="select select-bordered select-sm"
                                  [formControl]="selectedPayAccount"
                                >
                                  @for (a of accounts(); track a.code) {
                                    <option [value]="a.code">{{ a.name }}</option>
                                  }
                                </select></app-form-field
                              ><button
                                appButton
                                size="sm"
                                type="submit"
                                [disabled]="busy() || !cashierSession.canTakePayment()"
                              >
                                Record payment</button
                              ><button
                                appButton
                                variant="ghost"
                                size="sm"
                                type="button"
                                (click)="payPurchaseId.set(null)"
                              >
                                Cancel
                              </button>
                            </form>
                          }
                        </li>
                      }
                    </ul>
                  }
                </section>
              </div>
            }
          </app-drawer>
        }
      }

      @if (isPurchasePage()) {
        <section>
          <app-list-search-bar
            placeholder="Search supplier or reference…"
            [searchQuery]="purchaseQuery()"
            (searchQueryChange)="purchaseQuery.set($event); purchasePage.set(1)"
          >
            <app-stat-bar summary [stats]="purchaseSummary()" />
          </app-list-search-bar>

          @if (filteredPurchases().length === 0) {
            <app-empty-state
              icon="heroBanknotes"
              [title]="purchaseQuery() ? 'No matching purchases' : 'No purchases recorded'"
              [description]="
                purchaseQuery()
                  ? 'Try a different supplier name or reference.'
                  : 'Record a purchase from the page header to add supplier stock.'
              "
            />
          } @else {
            <app-data-table-shell
              title="Purchase history"
              [description]="filteredPurchases().length + ' matching purchases'"
            >
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Payment</th>
                    <th>Reference</th>
                    <th class="text-right">Total</th>
                    <th class="text-right">Status</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of pagedPurchases(); track p.id) {
                    <tr
                      role="button"
                      tabindex="0"
                      class="cursor-pointer"
                      [class.table-row-active]="drawerPurchaseId() === p.id"
                      (click)="openPurchaseDrawer(p)"
                      (keydown.enter)="openPurchaseDrawer(p)"
                    >
                      <td class="whitespace-nowrap text-sm">{{ time(p.created_at) }}</td>
                      <td class="font-medium">{{ supplierName(p.supplier_id) }}</td>
                      <td class="text-sm">{{ p.is_credit ? 'Pay later' : 'Paid now' }}</td>
                      <td class="type-caption">{{ p.reference || '—' }}</td>
                      <td class="text-right font-semibold">
                        <app-money
                          [amount]="p.total_cost"
                          [masked]="!perms.has('ViewFinancials')"
                        />
                      </td>
                      <td class="text-right">
                        <app-status-badge
                          [type]="purchaseStatusType(p)"
                          [label]="purchaseStatusLabel(p)"
                        />
                      </td>
                      <td class="table-actions" (click)="$event.stopPropagation()">
                        @if (printerEnabled()) {
                          <button
                            appButton
                            variant="ghost"
                            [iconOnly]="true"
                            type="button"
                            title="Print PO"
                            aria-label="Print PO"
                            (click)="printPurchase(p.id)"
                          >
                            <app-icon name="heroPrinter" />
                          </button>
                        }
                        @if (
                          p.is_credit &&
                          p.paid < p.total_cost &&
                          perms.has('ManageSupplierCreditPurchases')
                        ) {
                          <button
                            appButton
                            variant="ghost"
                            [iconOnly]="true"
                            type="button"
                            title="Pay this purchase"
                            aria-label="Pay this purchase"
                            (click)="openPurchaseDrawer(p); startPurchasePayment(p)"
                          >
                            <app-icon name="heroBanknotes" />
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </app-data-table-shell>

            <!-- Purchase detail drawer -->
            @if (drawerPurchase(); as p) {
              <app-drawer
                [open]="true"
                (closed)="closePurchaseDrawer()"
                [title]="p.reference || 'Purchase'"
                [subtitle]="supplierName(p.supplier_id) + ' · ' + time(p.created_at)"
              >
                @if (printerEnabled()) {
                  <button
                    actions
                    appButton
                    variant="ghost"
                    [iconOnly]="true"
                    type="button"
                    title="Print PO"
                    aria-label="Print PO"
                    (click)="printPurchase(p.id)"
                  >
                    <app-icon name="heroPrinter" />
                  </button>
                }

                <div class="flex flex-wrap items-center gap-1">
                  <app-status-badge
                    size="xs"
                    [type]="purchaseStatusType(p)"
                    [label]="purchaseStatusLabel(p)"
                  />
                  <app-status-badge
                    size="xs"
                    type="neutral"
                    [label]="p.is_credit ? 'Pay later' : 'Paid now'"
                  />
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2">
                  <app-stat-card
                    label="Total"
                    [value]="perms.has('ViewFinancials') ? fmt(p.total_cost) : 'Hidden'"
                  />
                  <app-stat-card
                    label="Paid"
                    [value]="perms.has('ViewFinancials') ? fmt(p.paid) : 'Hidden'"
                    [tone]="p.paid >= p.total_cost ? 'success' : p.paid > 0 ? 'warning' : 'neutral'"
                    [sub]="
                      p.total_cost - p.paid > 0 && perms.has('ViewFinancials')
                        ? 'Still to pay ' + fmt(p.total_cost - p.paid)
                        : undefined
                    "
                  />
                </div>

                @if (purchaseDetailLoading()) {
                  <div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
                    <span class="loading loading-spinner loading-md"></span>
                    <span class="text-sm">Loading purchase details…</span>
                  </div>
                } @else {
                  <div class="mt-4 flex flex-col gap-4">
                    <section>
                      <h3 class="section-title mb-2">Items</h3>
                      @if (drawerPurchaseLines().length === 0) {
                        <app-empty-state
                          [compact]="true"
                          icon="heroShoppingCart"
                          title="No line items"
                        />
                      } @else {
                        <ul class="divide-y divide-base-200">
                          @for (line of drawerPurchaseLines(); track line.id) {
                            <li class="flex items-center gap-3 py-2">
                              <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-medium">
                                  {{ purchaseLineLabel(line.variant_id) }}
                                </p>
                                <p class="type-caption">
                                  {{ line.quantity }} ×
                                  <app-money
                                    [amount]="line.unit_cost"
                                    [masked]="!perms.has('ViewFinancials')"
                                  />
                                  @if (line.expiry_date) {
                                    · exp {{ line.expiry_date }}
                                  }
                                  @if (line.batch_number) {
                                    · batch {{ line.batch_number }}
                                  }
                                </p>
                              </div>
                              <span class="text-sm font-semibold tabular-nums">
                                <app-money
                                  [amount]="line.line_total"
                                  [masked]="!perms.has('ViewFinancials')"
                                />
                              </span>
                            </li>
                          }
                        </ul>
                      }
                    </section>

                    <section class="border-t border-base-300/60 pt-3">
                      <h3 class="section-title mb-2">Payments</h3>
                      @if (drawerPurchasePayments().length === 0) {
                        <app-empty-state
                          [compact]="true"
                          icon="heroBanknotes"
                          title="No payments recorded"
                        />
                      } @else {
                        <ul class="divide-y divide-base-200">
                          @for (payment of drawerPurchasePayments(); track payment.id) {
                            <li class="flex items-center gap-3 py-2">
                              <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium">{{ payment.account_code }}</p>
                                <p class="type-caption">{{ time(payment.created_at) }}</p>
                              </div>
                              <span class="text-sm font-semibold tabular-nums">
                                <app-money
                                  [amount]="payment.amount"
                                  direction="out"
                                  [masked]="!perms.has('ViewFinancials')"
                                />
                              </span>
                            </li>
                          }
                        </ul>
                      }
                    </section>

                    @if (
                      p.is_credit &&
                      p.paid < p.total_cost &&
                      perms.has('ManageSupplierCreditPurchases')
                    ) {
                      <section class="border-t border-base-300/60 pt-3">
                        <h3 class="section-title mb-2">Pay this purchase</h3>
                        @if (!cashierSession.canTakePayment()) {
                          <app-session-required-notice action="paying a supplier" />
                        }
                        @if (payPurchaseId() !== p.id) {
                          <button
                            appButton
                            variant="outline"
                            size="sm"
                            [disabled]="!cashierSession.canTakePayment()"
                            (click)="startPurchasePayment(p)"
                          >
                            Record payment
                          </button>
                        } @else {
                          <form
                            (submit)="$event.preventDefault(); paySelectedPurchase()"
                            class="flex flex-col gap-2 rounded-field border border-base-300 bg-base-200/50 p-2"
                          >
                            <app-form-field label="Amount (KES)">
                              <input
                                class="input input-bordered input-sm w-full"
                                [formControl]="selectedPayAmount"
                              />
                            </app-form-field>
                            <app-form-field label="Pay from">
                              <select
                                class="select select-bordered select-sm w-full"
                                [formControl]="selectedPayAccount"
                              >
                                @for (a of accounts(); track a.code) {
                                  <option [value]="a.code">{{ a.name }}</option>
                                }
                              </select>
                            </app-form-field>
                            <div class="flex gap-2">
                              <button
                                appButton
                                size="sm"
                                type="submit"
                                [disabled]="busy() || !cashierSession.canTakePayment()"
                              >
                                Record payment
                              </button>
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                type="button"
                                (click)="payPurchaseId.set(null)"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        }
                      </section>
                    }
                  </div>
                }
              </app-drawer>
            }
            <div class="mt-3">
              <app-pagination
                [currentPage]="purchasePage()"
                [totalPages]="purchaseTotalPages()"
                [totalItems]="filteredPurchases().length"
                [itemsPerPage]="purchasePageSize()"
                itemLabel="purchases"
                [showItemsPerPage]="true"
                (pageChange)="purchasePage.set($event)"
                (itemsPerPageChange)="purchasePageSize.set($event); purchasePage.set(1)"
              />
            </div>
          }
        </section>
      }
    </app-page>
  `,
})
export class SuppliersComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly supabase = inject(SupabaseService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  protected readonly perms = inject(PermissionsService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly preferences = inject(CompanyPreferencesService);
  protected readonly isPurchasePage = signal(this.route.snapshot.data['purchasePage'] === true);

  protected readonly fmt = formatKes;
  protected readonly duplicatePriceTooltip =
    'Same item on multiple lines — the selling price applies once to the product and stays in sync across those lines.';
  protected readonly suppliers = signal<SupplierWithAp[]>([]);
  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly variants = signal<Variant[]>([]);
  protected readonly label = variantLabel;
  protected readonly purchases = signal<PurchaseRow[]>([]);
  protected readonly purchaseQuery = signal('');
  protected readonly purchasePage = signal(1);
  protected readonly purchasePageSize = signal(10);
  protected readonly drafts = signal<PurchaseDraft[]>([]);
  protected readonly performance = signal<SupplierVariantPerformance[]>([]);
  protected readonly locations = signal<StockLocation[]>([]);
  protected readonly activeDraftId = signal<string | null>(null);
  protected readonly purchaseFormOpen = signal(false);
  /** Drawer edit mode: supplierCreating = empty form, drawerEditing = form for the open supplier. */
  protected readonly supplierCreating = signal(false);
  protected readonly drawerEditing = signal(false);
  protected readonly editingSupplier = signal<SupplierWithAp | null>(null);

  protected readonly newName = new FormControl('', { nonNullable: true });
  protected readonly newPhone = new FormControl('', { nonNullable: true });
  protected readonly newEmail = new FormControl('', { nonNullable: true });
  protected readonly newNotes = new FormControl('', { nonNullable: true });
  protected readonly supplierCreditLimit = new FormControl('0', { nonNullable: true });
  protected readonly supplierTermsDays = new FormControl(0, { nonNullable: true });

  protected readonly purchaseSupplier = new FormControl('', { nonNullable: true });
  protected readonly supplierPickerOpen = signal(false);
  protected readonly supplierQuery = signal('');
  protected readonly purchaseReference = new FormControl('', { nonNullable: true });
  protected readonly purchaseNotes = new FormControl('', { nonNullable: true });
  protected readonly purchaseDate = new FormControl(new Date().toISOString().slice(0, 10), {
    nonNullable: true,
  });
  protected readonly purchaseLocation = new FormControl('', { nonNullable: true });
  protected readonly purchasePaymentMode = new FormControl<PurchasePaymentMode>('paid', {
    nonNullable: true,
  });
  protected readonly purchaseAmountPaid = new FormControl('', { nonNullable: true });
  protected readonly purchaseAccount = new FormControl('', { nonNullable: true });
  protected readonly variantPickerFor = signal<number | null>(null);
  protected readonly variantQuery = signal('');
  private readonly variantSearchInput = viewChild<string, ElementRef<HTMLInputElement>>(
    'variantSearch',
    { read: ElementRef }
  );

  constructor() {
    // Focus the picker search without scrolling the page (replaces the `autofocus`
    // attribute, which scrolls the focused input into view and can hide page top).
    afterRenderEffect(() => {
      if (this.variantPickerFor() !== null) {
        this.variantSearchInput()?.nativeElement.focus({ preventScroll: true });
      }
    });
  }
  protected lines: PurchaseLineForm[] = [this.emptyLine()];

  protected readonly paySupplierId = new FormControl('', { nonNullable: true });
  protected readonly payAmount = new FormControl('', { nonNullable: true });
  protected readonly payAccount = new FormControl('', { nonNullable: true });
  protected readonly payPurchaseId = signal<string | null>(null);
  protected readonly selectedPayAmount = new FormControl('', { nonNullable: true });
  protected readonly selectedPayAccount = new FormControl('', { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);

  protected readonly totalOutstanding = computed(() =>
    this.suppliers().reduce((sum, supplier) => sum + Math.max(0, supplier.ap_balance), 0)
  );
  protected readonly activeSuppliers = computed(() =>
    this.suppliers().filter(supplier => supplier.supplier_active)
  );
  protected readonly filteredSuppliers = computed(() => {
    const query = this.supplierQuery().trim().toLowerCase();
    const source = this.isPurchasePage() ? this.activeSuppliers() : this.suppliers();
    if (!query) return source;
    return source.filter(supplier =>
      [this.name(supplier), supplier.phone, supplier.email]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(query))
    );
  });
  protected readonly suppliersOwed = computed(() =>
    this.suppliers().filter(supplier => supplier.ap_balance > 0)
  );
  protected readonly drawerSupplierId = signal<string | null>(null);
  protected readonly drawerSupplier = computed(() => {
    const id = this.drawerSupplierId();
    return id ? (this.suppliers().find(s => s.id === id) ?? null) : null;
  });
  /** Supplier shown in the drawer's detail chrome (null while editing/creating). */
  protected readonly detailSupplier = computed(() =>
    this.supplierCreating() || this.drawerEditing() ? null : this.drawerSupplier()
  );
  protected readonly drawerTitle = computed(() => {
    if (this.supplierCreating()) return 'New supplier';
    const s = this.drawerSupplier();
    if (!s) return 'Supplier';
    return this.drawerEditing() ? `Edit ${this.name(s)}` : this.name(s);
  });
  protected readonly drawerSubtitle = computed(() => {
    if (this.supplierCreating()) return undefined;
    const s = this.drawerSupplier();
    return s ? s.phone || s.email || undefined : undefined;
  });
  protected readonly drawerPurchases = computed(() => {
    const id = this.drawerSupplierId();
    return id ? this.purchases().filter(p => p.supplier_id === id) : [];
  });
  protected readonly drawerPaymentSummary = computed(() => {
    const rows = this.drawerPurchases();
    const total = rows.reduce((sum, p) => sum + p.total_cost, 0);
    const paid = rows.reduce((sum, p) => sum + Math.min(p.paid, p.total_cost), 0);
    return { total, paid, outstanding: Math.max(0, total - paid) };
  });
  // Purchase detail drawer (/purchases side)
  protected readonly drawerPurchaseId = signal<string | null>(null);
  protected readonly drawerPurchase = computed(() => {
    const id = this.drawerPurchaseId();
    return id ? (this.purchases().find(p => p.id === id) ?? null) : null;
  });
  protected readonly drawerPurchaseLines = signal<PurchaseLine[]>([]);
  protected readonly drawerPurchasePayments = signal<PurchasePayment[]>([]);
  protected readonly purchaseDetailLoading = signal(false);
  protected readonly openCreditPurchases = computed(
    () =>
      this.purchases().filter(purchase => purchase.is_credit && purchase.paid < purchase.total_cost)
        .length
  );
  protected readonly supplierSummary = computed(() => [
    { label: 'Active suppliers', value: this.activeSuppliers().length },
    {
      label: 'We owe',
      value: this.perms.has('ViewFinancials') ? this.fmt(this.totalOutstanding()) : 'Hidden',
      tone: this.totalOutstanding() > 0 ? ('warning' as const) : ('neutral' as const),
    },
    {
      label: 'Suppliers we owe',
      value: this.suppliersOwed().length,
      tone: this.suppliersOwed().length > 0 ? ('warning' as const) : ('neutral' as const),
    },
    {
      label: 'Purchases we owe',
      value: this.openCreditPurchases(),
      tone: this.openCreditPurchases() > 0 ? ('warning' as const) : ('neutral' as const),
    },
  ]);
  protected readonly filteredPurchases = computed(() => {
    const query = this.purchaseQuery().trim().toLowerCase();
    if (!query) return this.purchases();
    return this.purchases().filter(purchase =>
      [this.supplierName(purchase.supplier_id), purchase.reference]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(query))
    );
  });
  protected readonly purchaseSummary = computed(() => {
    const purchases = this.purchases();
    const value = purchases.reduce((sum, purchase) => sum + purchase.total_cost, 0);
    const outstanding = purchases.reduce(
      (sum, purchase) => sum + Math.max(0, purchase.total_cost - purchase.paid),
      0
    );
    return [
      { label: 'Purchases', value: purchases.length },
      {
        label: 'Purchase value',
        value: this.perms.has('ViewFinancials') ? this.fmt(value) : 'Hidden',
      },
      {
        label: 'Still to pay',
        value: this.perms.has('ViewFinancials') ? this.fmt(outstanding) : 'Hidden',
        tone: outstanding > 0 ? ('warning' as const) : ('neutral' as const),
      },
      {
        label: 'Drafts',
        value: this.drafts().length,
        tone: this.drafts().length > 0 ? ('warning' as const) : ('neutral' as const),
      },
    ];
  });
  protected readonly purchaseTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPurchases().length / this.purchasePageSize()))
  );
  protected readonly pagedPurchases = computed(() => {
    const page = Math.min(this.purchasePage(), this.purchaseTotalPages());
    const start = (page - 1) * this.purchasePageSize();
    return this.filteredPurchases().slice(start, start + this.purchasePageSize());
  });

  private liveChannel: RealtimeChannel | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private loadQueued = false;

  async ngOnInit(): Promise<void> {
    const [, printerEnabled] = await Promise.all([
      this.preferences.refresh(),
      this.receiptData.printerEnabled(),
    ]);
    this.printerEnabled.set(printerEnabled);
    await this.load();
    const companyId = this.supabase.claims()?.company_id;
    if (companyId) this.connectLiveUpdates(companyId);
  }

  ngOnDestroy(): void {
    if (this.liveChannel) void this.supabase.client.removeChannel(this.liveChannel);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  /** Silent reloads (realtime events) refresh data without flashing the header spinner. */
  protected async load(silent = false): Promise<void> {
    if (this.loading()) {
      this.loadQueued = true;
      return;
    }
    if (!silent) this.loading.set(true);
    try {
      const [suppliers, accounts, variants, purchases, drafts, locations, performance] =
        await Promise.all([
          this.money.suppliersWithAp(),
          this.money.transactableAccounts(),
          this.pos.fetchActiveVariants(),
          this.money.purchasesWithPayments(),
          this.money.purchaseDrafts(),
          this.pos.listStockLocations(),
          this.money.supplierVariantPerformance(),
        ]);
      this.suppliers.set(suppliers);
      this.accounts.set(accounts);
      // Purchases stock goods only (services are rejected server-side).
      this.variants.set(variants.filter(v => v.kind !== 'service'));
      this.purchases.set(purchases as PurchaseRow[]);
      this.drafts.set(drafts);
      this.locations.set(locations);
      this.performance.set(performance);
      const activeSuppliers = suppliers.filter(supplier => supplier.supplier_active);
      if (
        activeSuppliers.length > 0 &&
        !activeSuppliers.some(supplier => supplier.id === this.purchaseSupplier.value)
      ) {
        this.purchaseSupplier.setValue(activeSuppliers[0].id);
      }
      const suppliersWithBalance = suppliers.filter(s => s.ap_balance > 0);
      if (
        suppliersWithBalance.length > 0 &&
        !suppliersWithBalance.some(s => s.id === this.paySupplierId.value)
      ) {
        this.paySupplierId.setValue(suppliersWithBalance[0].id);
      }
      if (!this.purchaseAccount.value && accounts.length > 0)
        this.purchaseAccount.setValue(accounts[0].code);
      if (!this.payAccount.value && accounts.length > 0) this.payAccount.setValue(accounts[0].code);
      if (!this.selectedPayAccount.value && accounts.length > 0)
        this.selectedPayAccount.setValue(accounts[0].code);
      if (!this.purchaseLocation.value && locations.length > 0)
        this.purchaseLocation.setValue(locations[0].id);
      // Realtime: keep an open purchase drawer's payment history in sync.
      const openPurchaseId = this.drawerPurchaseId();
      if (openPurchaseId && purchases.some(p => p.id === openPurchaseId)) {
        void this.money.purchasePayments(openPurchaseId).then(pp => {
          if (this.drawerPurchaseId() === openPurchaseId) this.drawerPurchasePayments.set(pp);
        });
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
      if (this.loadQueued) {
        this.loadQueued = false;
        void this.load();
      }
    }
  }

  protected setPurchasePaymentMode(mode: PurchasePaymentMode): void {
    if (mode !== 'paid' && !this.perms.has('ManageSupplierCreditPurchases')) return;
    this.purchasePaymentMode.setValue(mode);
    if (mode !== 'partial') this.purchaseAmountPaid.setValue('');
  }

  protected selectedSupplierName(): string {
    const supplier = this.selectedSupplier();
    return supplier ? this.name(supplier) : 'the supplier';
  }

  protected selectedSupplier(): SupplierWithAp | undefined {
    return this.activeSuppliers().find(supplier => supplier.id === this.purchaseSupplier.value);
  }

  protected chooseSupplier(supplier: SupplierWithAp): void {
    this.purchaseSupplier.setValue(supplier.id);
    this.supplierQuery.set('');
    this.supplierPickerOpen.set(false);
    for (const line of this.lines) {
      if (!line.unitCost.trim()) this.selectVariantForLine(line, line.variantId);
    }
  }

  protected purchaseTotal(): number {
    return this.lines.reduce((sum, line) => sum + this.purchaseLineTotal(line), 0);
  }

  protected supplierCreditAvailable(supplier: SupplierWithAp): number {
    return Math.max(0, supplier.supplier_credit_limit - supplier.ap_balance);
  }

  protected supplierCreditExceeded(): boolean {
    const supplier = this.selectedSupplier();
    return (
      !!supplier &&
      supplier.supplier_credit_limit > 0 &&
      supplier.ap_balance + this.purchaseBalanceDue() > supplier.supplier_credit_limit
    );
  }

  protected purchaseInitialPayment(): number {
    if (this.purchasePaymentMode.value === 'paid') return this.purchaseTotal();
    if (this.purchasePaymentMode.value === 'later') return 0;
    return Math.max(0, parseKes(this.purchaseAmountPaid.value) ?? 0);
  }

  protected purchaseBalanceDue(): number {
    return Math.max(0, this.purchaseTotal() - this.purchaseInitialPayment());
  }

  protected partialPaymentError(): string | null {
    if (this.purchasePaymentMode.value !== 'partial') return null;
    if (!this.purchaseAmountPaid.value.trim()) return null;
    const paid = parseKes(this.purchaseAmountPaid.value);
    if (paid === null || paid <= 0) return 'Enter an amount greater than zero';
    if (paid >= this.purchaseTotal()) return 'Use Paid now for the full amount';
    return null;
  }

  protected partialPaymentValid(): boolean {
    if (this.purchasePaymentMode.value !== 'partial') return true;
    const paid = parseKes(this.purchaseAmountPaid.value);
    return paid !== null && paid > 0 && paid < this.purchaseTotal();
  }

  protected partialPaymentHint(): string {
    if (!this.purchaseAmountPaid.value.trim()) return 'Enter less than the purchase total';
    return this.partialPaymentError() ?? `We will owe: ${this.fmt(this.purchaseBalanceDue())}`;
  }

  protected addLine(): void {
    this.lines = [...this.lines, this.emptyLine()];
  }

  protected selectedPurchaseLineCount(): number {
    return this.lines.filter(line => !!line.variantId).length;
  }

  protected removeLine(index: number): void {
    this.lines = this.lines.filter((_, i) => i !== index);
    this.variantPickerFor.set(null);
  }

  protected variantFor(line: PurchaseLineForm): Variant | undefined {
    return this.variants().find(variant => variant.variant_id === line.variantId);
  }

  protected supplierInsight(line: PurchaseLineForm): SupplierVariantPerformance | undefined {
    return this.performance().find(
      insight =>
        insight.variant_id === line.variantId && insight.supplier_id === this.purchaseSupplier.value
    );
  }

  protected selectVariantForLine(line: PurchaseLineForm, variantId: string): void {
    const quantity = line.quantity || 1;
    const replacement = this.newLine(variantId);
    Object.assign(line, replacement, { quantity });
    // Selling price is one value per variant: adopt it from an existing line.
    const existing = this.lines.find(other => other !== line && other.variantId === variantId);
    if (existing) {
      line.wholesalePrice = existing.wholesalePrice;
      line.retailPrice = existing.retailPrice;
    }
    this.syncLineTotalFromUnit(line);
  }

  protected hasDuplicateVariant(line: PurchaseLineForm): boolean {
    return (
      !!line.variantId &&
      this.lines.some(other => other !== line && other.variantId === line.variantId)
    );
  }

  protected updateWholesalePrice(line: PurchaseLineForm, value: string): void {
    line.wholesalePrice = value;
    this.syncDuplicateLinePrices(line);
  }

  protected updateRetailPrice(line: PurchaseLineForm, value: string): void {
    line.retailPrice = value;
    this.syncDuplicateLinePrices(line);
  }

  private syncDuplicateLinePrices(line: PurchaseLineForm): void {
    if (!line.variantId) return;
    for (const other of this.lines) {
      if (other !== line && other.variantId === line.variantId) {
        other.wholesalePrice = line.wholesalePrice;
        other.retailPrice = line.retailPrice;
      }
    }
  }

  protected updateUnitCost(line: PurchaseLineForm, value: string): void {
    line.unitCost = value;
    line.valueSource = 'unit';
    this.syncLineTotalFromUnit(line);
  }

  protected updateLineTotal(line: PurchaseLineForm, value: string): void {
    line.lineTotal = value;
    line.valueSource = 'total';
    this.syncUnitFromLineTotal(line);
  }

  protected updatePurchaseQuantity(line: PurchaseLineForm, value: number | string): void {
    const variant = this.variantFor(line);
    const minimum = variant?.allow_fractional ? 0.01 : 1;
    const parsed = Number(value);
    line.quantity = Number.isFinite(parsed) ? Math.max(minimum, parsed) : minimum;
    if (line.valueSource === 'total') {
      this.syncUnitFromLineTotal(line);
      line.lineTotal = this.inputMoney(this.purchaseLineTotal(line));
    } else {
      this.syncLineTotalFromUnit(line);
    }
  }

  protected stepPurchaseQuantity(line: PurchaseLineForm, direction: -1 | 1): void {
    const fractional = this.variantFor(line)?.allow_fractional ?? false;
    const step = fractional ? 0.5 : 1;
    const minimum = fractional ? 0.01 : 1;
    this.updatePurchaseQuantity(line, Math.max(minimum, line.quantity + direction * step));
  }

  protected normalizePurchaseValue(line: PurchaseLineForm): void {
    const unitCost = this.unitCostValue(line);
    if (unitCost === null) return;
    line.unitCost = this.inputMoney(unitCost);
    line.lineTotal = this.inputMoney(this.purchaseLineTotal(line));
  }

  protected filteredPurchaseVariants(): Variant[] {
    const query = this.variantQuery().trim().toLowerCase();
    if (!query) return this.variants();
    return this.variants().filter(variant =>
      [this.label(variant), variant.sku, variant.barcode]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(query))
    );
  }

  protected openVariantPicker(index: number): void {
    this.variantQuery.set('');
    this.variantPickerFor.set(this.variantPickerFor() === index ? null : index);
  }

  protected chooseVariantForLine(line: PurchaseLineForm, index: number, variantId: string): void {
    this.selectVariantForLine(line, variantId);
    this.variantPickerFor.set(null);
    this.variantQuery.set('');
  }

  protected catalogPriceChanged(line: PurchaseLineForm): boolean {
    const variant = this.variantFor(line);
    if (!variant) return false;
    return (
      parseKes(line.wholesalePrice) !== (variant.wholesale_price ?? 0) ||
      parseKes(line.retailPrice) !== (variant.price ?? 0)
    );
  }

  protected enteredCatalogPrice(value: string): number | null {
    return parseKes(value);
  }

  protected marginLabel(line: PurchaseLineForm, sellingPrice: number | null): string {
    const margin = this.marginPercent(line, sellingPrice);
    if (margin === null) return 'No price';
    return `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}% margin`;
  }

  protected marginType(line: PurchaseLineForm, sellingPrice: number | null): BadgeType {
    const margin = this.marginPercent(line, sellingPrice);
    if (margin === null) return 'neutral';
    if (margin < 0) return 'error';
    if (margin < 15) return 'warning';
    return 'success';
  }

  protected priceWarning(line: PurchaseLineForm, variant: Variant): string | null {
    const cost = this.unitCostValue(line);
    if (cost === null || cost <= 0) return null;
    const retail = parseKes(line.retailPrice) ?? variant.price ?? 0;
    const wholesale = parseKes(line.wholesalePrice) ?? variant.wholesale_price ?? 0;
    if (retail > 0 && cost > retail) {
      return `This unit costs ${this.fmt(cost - retail)} more than the current retail price.`;
    }
    if (wholesale > 0 && cost > wholesale) {
      return `This unit costs ${this.fmt(cost - wholesale)} more than the current wholesale price.`;
    }
    const previous = this.supplierInsight(line)?.last_unit_cost ?? 0;
    if (previous > 0 && cost > previous) {
      return `This supplier's cost is ${this.fmt(cost - previous)} higher than their last recorded price.`;
    }
    return null;
  }

  protected bestSupplierHint(line: PurchaseLineForm): { supplier: string; cost: number } | null {
    const options = this.performance().filter(
      insight => insight.variant_id === line.variantId && (insight.average_unit_cost ?? 0) > 0
    );
    if (options.length === 0) return null;
    const best = options.reduce((lowest, current) =>
      (current.average_unit_cost ?? Infinity) < (lowest.average_unit_cost ?? Infinity)
        ? current
        : lowest
    );
    return {
      supplier: this.supplierName(best.supplier_id ?? ''),
      cost: best.average_unit_cost ?? 0,
    };
  }

  protected supplierStats(supplierId: string): {
    purchases: number;
    products: number;
    averageOrder: number;
    bestPrices: number;
  } {
    const purchases = this.purchases().filter(purchase => purchase.supplier_id === supplierId);
    const rows = this.performance().filter(row => row.supplier_id === supplierId);
    const comparable = rows.filter(row => {
      const peers = this.performance().filter(peer => peer.variant_id === row.variant_id);
      if (peers.length < 2) return false;
      const best = Math.min(...peers.map(peer => peer.average_unit_cost ?? Infinity));
      return (row.average_unit_cost ?? Infinity) === best;
    });
    return {
      purchases: purchases.length,
      products: rows.length,
      averageOrder:
        purchases.length > 0
          ? Math.round(
              purchases.reduce((total, purchase) => total + purchase.total_cost, 0) /
                purchases.length
            )
          : 0,
      bestPrices: comparable.length,
    };
  }

  protected async recordPurchase(): Promise<void> {
    if (!this.partialPaymentValid()) {
      this.error.set(this.partialPaymentError() ?? 'Enter the amount paid');
      return;
    }
    if (this.purchasePaymentMode.value !== 'paid' && this.supplierCreditExceeded()) {
      this.error.set('This purchase exceeds the supplier credit limit');
      return;
    }
    if (this.purchasePaymentMode.value !== 'later') {
      try {
        await this.cashierSession.assertOpen('recording a paid purchase');
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
        return;
      }
    }
    const parsed = this.parsedLines();
    if (!parsed) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const mode = this.purchasePaymentMode.value;
      const paymentAmount = this.purchaseInitialPayment();
      const total = this.purchaseTotal();
      const supplierName = this.selectedSupplierName();
      if (this.activeDraftId()) {
        await this.money.savePurchaseDraft({
          draftId: this.activeDraftId()!,
          supplierId: this.purchaseSupplier.value,
          lines: parsed,
          reference: this.purchaseReference.value.trim() || undefined,
          notes: this.purchaseNotes.value.trim() || undefined,
          purchaseDate: this.purchaseDate.value,
        });
        await this.money.confirmPurchaseDraftWithPayment(
          this.activeDraftId()!,
          paymentAmount,
          mode === 'later' ? undefined : this.purchaseAccount.value,
          this.purchaseLocation.value || undefined
        );
      } else {
        await this.money.recordPurchaseWithPayment(
          this.purchaseSupplier.value,
          parsed,
          paymentAmount,
          this.purchaseReference.value.trim() || undefined,
          mode === 'later' ? undefined : this.purchaseAccount.value,
          this.purchaseNotes.value.trim() || undefined,
          this.purchaseDate.value,
          this.purchaseLocation.value || undefined
        );
      }
      this.clearPurchaseForm();
      this.purchaseFormOpen.set(false);
      await this.load();
      this.notice.set(
        mode === 'paid'
          ? 'Paid purchase recorded. The supplier balance was not changed.'
          : mode === 'partial'
            ? `Part-paid purchase recorded. ${this.fmt(paymentAmount)} paid and ${this.fmt(total - paymentAmount)} added to ${supplierName}'s balance.`
            : `Credit purchase recorded. ${this.fmt(total)} was added to ${supplierName}'s balance.`
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to record purchase');
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveDraft(): Promise<void> {
    const parsed = this.parsedLines();
    if (!parsed) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const id = await this.money.savePurchaseDraft({
        draftId: this.activeDraftId() || undefined,
        supplierId: this.purchaseSupplier.value,
        lines: parsed,
        reference: this.purchaseReference.value.trim() || undefined,
        notes: this.purchaseNotes.value.trim() || undefined,
        purchaseDate: this.purchaseDate.value,
      });
      this.activeDraftId.set(id);
      this.notice.set('Purchase draft saved');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Draft save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected openDraft(draft: PurchaseDraft): void {
    this.purchaseFormOpen.set(true);
    this.activeDraftId.set(draft.id);
    this.purchaseSupplier.setValue(draft.supplier_id);
    this.purchaseReference.setValue(draft.reference ?? '');
    this.purchaseNotes.setValue(draft.notes ?? '');
    this.purchaseDate.setValue(draft.purchase_date);
    const lines = Array.isArray(draft.lines)
      ? (draft.lines as unknown as Array<Record<string, unknown>>)
      : [];
    this.lines = lines.map(line => ({
      variantId: String(line['variant_id'] ?? ''),
      quantity: Number(line['quantity'] ?? 1),
      unitCost: formatKesInput(Number(line['unit_cost'] ?? 0)),
      lineTotal: this.inputMoney(
        Math.round(Number(line['quantity'] ?? 1) * Number(line['unit_cost'] ?? 0))
      ),
      valueSource: 'unit',
      expiryDate: String(line['expiry_date'] ?? ''),
      batchNumber: String(line['batch_number'] ?? ''),
      wholesalePrice:
        line['new_wholesale_price'] !== undefined
          ? formatKesInput(Number(line['new_wholesale_price']))
          : this.catalogPriceText(
              this.variants().find(v => v.variant_id === line['variant_id'])?.wholesale_price
            ),
      retailPrice:
        line['new_retail_price'] !== undefined
          ? formatKesInput(Number(line['new_retail_price']))
          : this.catalogPriceText(
              this.variants().find(v => v.variant_id === line['variant_id'])?.price
            ),
    }));
    this.scrollToPurchaseForm();
  }

  protected async cancelDraft(id: string): Promise<void> {
    if (!window.confirm('Cancel this purchase draft?')) return;
    try {
      await this.money.cancelPurchaseDraft(id);
      if (this.activeDraftId() === id) this.closePurchaseForm();
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Cancel failed');
    }
  }

  protected clearPurchaseForm(): void {
    this.activeDraftId.set(null);
    this.purchaseReference.setValue('');
    this.purchaseNotes.setValue('');
    this.purchaseDate.setValue(new Date().toISOString().slice(0, 10));
    this.purchasePaymentMode.setValue('paid');
    this.purchaseAmountPaid.setValue('');
    this.lines = [this.emptyLine()];
  }

  protected startPurchase(): void {
    if (!this.purchaseFormOpen()) this.clearPurchaseForm();
    this.purchaseFormOpen.set(true);
    this.scrollToPurchaseForm();
  }

  protected closePurchaseForm(): void {
    this.clearPurchaseForm();
    this.purchaseFormOpen.set(false);
  }

  private scrollToPurchaseForm(): void {
    setTimeout(
      () => document.getElementById('purchase-form')?.scrollIntoView({ behavior: 'smooth' }),
      0
    );
  }

  protected startPurchasePayment(purchase: PurchaseRow): void {
    this.payPurchaseId.set(purchase.id);
    this.selectedPayAmount.setValue(formatKesInput(purchase.total_cost - purchase.paid));
  }

  protected async openPurchaseDrawer(purchase: PurchaseRow): Promise<void> {
    this.drawerPurchaseId.set(purchase.id);
    this.payPurchaseId.set(null);
    this.drawerPurchaseLines.set([]);
    this.drawerPurchasePayments.set([]);
    this.purchaseDetailLoading.set(true);
    try {
      const [lines, payments] = await Promise.all([
        this.money.purchaseLines(purchase.id),
        this.money.purchasePayments(purchase.id),
      ]);
      // Ignore stale results when the drawer was closed (or reopened) meanwhile.
      if (this.drawerPurchaseId() !== purchase.id) return;
      this.drawerPurchaseLines.set(lines);
      this.drawerPurchasePayments.set(payments);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load purchase details');
    } finally {
      if (this.drawerPurchaseId() === purchase.id) this.purchaseDetailLoading.set(false);
    }
  }

  /** Called by the drawer after its close transition finishes. */
  protected closePurchaseDrawer(): void {
    this.drawerPurchaseId.set(null);
    this.payPurchaseId.set(null);
    this.purchaseDetailLoading.set(false);
    this.drawerPurchaseLines.set([]);
    this.drawerPurchasePayments.set([]);
  }

  protected purchaseLineLabel(variantId: string): string {
    const variant = this.variants().find(v => v.variant_id === variantId);
    return variant ? this.label(variant) : 'Item';
  }

  protected async paySelectedPurchase(): Promise<void> {
    const id = this.payPurchaseId();
    const amount = parseKes(this.selectedPayAmount.value);
    if (!id || amount === null || amount <= 0) {
      this.error.set('Enter a valid payment amount');
      return;
    }
    try {
      await this.cashierSession.assertOpen('paying a supplier');
      this.busy.set(true);
      await this.money.payPurchase(id, amount, this.selectedPayAccount.value);
      this.payPurchaseId.set(null);
      this.notice.set('Purchase payment recorded');
      await this.load();
      // Keep an open purchase drawer's payment history in sync.
      const openId = this.drawerPurchaseId();
      if (openId) {
        this.drawerPurchasePayments.set(await this.money.purchasePayments(openId));
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }

  private parsedLines(): ParsedPurchaseLine[] | null {
    const parsed: ParsedPurchaseLine[] = [];
    for (const line of this.lines) {
      const unitCost = this.unitCostValue(line);
      if (!line.variantId || !(line.quantity > 0) || unitCost === null || unitCost <= 0) {
        this.error.set('Every line needs a variant, quantity and valid unit cost');
        return null;
      }
      const wholesalePrice = parseKes(line.wholesalePrice);
      const retailPrice = parseKes(line.retailPrice);
      if (wholesalePrice === null || retailPrice === null || retailPrice < wholesalePrice) {
        this.error.set('Retail price must be valid and not lower than wholesale');
        return null;
      }
      const variant = this.variantFor(line);
      const wholesaleChanged = wholesalePrice !== (variant?.wholesale_price ?? 0);
      const retailChanged = retailPrice !== (variant?.price ?? 0);
      parsed.push({
        variant_id: line.variantId,
        quantity: line.quantity,
        unit_cost: unitCost,
        ...(this.preferences.batchExpiryEnabled() && line.expiryDate
          ? { expiry_date: line.expiryDate }
          : {}),
        ...(line.batchNumber.trim() ? { batch_number: line.batchNumber.trim() } : {}),
        ...(wholesaleChanged ? { new_wholesale_price: wholesalePrice } : {}),
        ...(retailChanged ? { new_retail_price: retailPrice } : {}),
      });
    }
    return parsed;
  }

  protected async paySupplier(): Promise<void> {
    try {
      await this.cashierSession.assertOpen('paying a supplier');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const amount = parseKes(this.payAmount.value);
    if (amount === null || amount <= 0) {
      this.error.set('Enter a valid amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const supplierName = this.supplierName(this.paySupplierId.value);
      await this.money.paySupplier(this.paySupplierId.value, amount, this.payAccount.value);
      this.payAmount.setValue('');
      await this.load();
      this.notice.set(`${this.fmt(amount)} payment recorded for ${supplierName}.`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected openSupplierDrawer(supplier: SupplierWithAp): void {
    this.drawerSupplierId.set(supplier.id);
    this.payPurchaseId.set(null);
    this.paySupplierId.setValue(supplier.id);
    this.payAmount.setValue('');
    this.supplierCreditLimit.setValue(formatKesInput(supplier.supplier_credit_limit));
    this.supplierTermsDays.setValue(supplier.supplier_credit_terms_days ?? 0);
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeSupplierDrawer(): void {
    this.drawerSupplierId.set(null);
    this.payPurchaseId.set(null);
    this.supplierCreating.set(false);
    this.drawerEditing.set(false);
    this.editingSupplier.set(null);
  }

  /** Edit in place: flip the open drawer to its form without closing it. */
  protected editSupplierFromDrawer(supplier: SupplierWithAp): void {
    this.editingSupplier.set(supplier);
    this.newName.setValue(this.name(supplier));
    this.newPhone.setValue(supplier.phone ?? '');
    this.newEmail.setValue(supplier.email ?? '');
    this.newNotes.setValue(supplier.notes ?? '');
    this.supplierCreditLimit.setValue(formatKesInput(supplier.supplier_credit_limit));
    this.supplierTermsDays.setValue(supplier.supplier_credit_terms_days ?? 0);
    this.drawerEditing.set(true);
  }

  protected async saveDrawerCredit(supplier: SupplierWithAp): Promise<void> {
    const creditLimit = parseKes(this.supplierCreditLimit.value);
    if (creditLimit === null) {
      this.error.set('Enter a valid supplier credit limit');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.updateSupplierCredit(supplier.id, creditLimit, this.supplierTermsDays.value);
      this.notice.set(`Credit terms saved for ${this.name(supplier)}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected startSupplierCreate(): void {
    this.editingSupplier.set(null);
    this.newName.setValue('');
    this.newPhone.setValue('');
    this.newEmail.setValue('');
    this.newNotes.setValue('');
    this.supplierCreditLimit.setValue('0');
    this.supplierTermsDays.setValue(0);
    this.drawerEditing.set(false);
    this.supplierCreating.set(true);
  }

  protected startSupplierEdit(supplier: SupplierWithAp): void {
    this.openSupplierDrawer(supplier);
    this.editSupplierFromDrawer(supplier);
  }

  protected closeSupplierForm(): void {
    this.editingSupplier.set(null);
    if (this.supplierCreating()) {
      this.supplierCreating.set(false);
    } else {
      this.drawerEditing.set(false);
    }
  }

  protected async saveSupplier(): Promise<void> {
    if (this.newName.value.trim().length === 0) return;
    const creditLimit = parseKes(this.supplierCreditLimit.value);
    if (this.perms.has('ManageSupplierCreditPurchases') && creditLimit === null) {
      this.error.set('Enter a valid supplier credit limit');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const editing = this.editingSupplier();
      if (editing) {
        await this.money.updateCustomer(editing.id, {
          first_name: this.newName.value.trim(),
          last_name: '',
          phone: this.newPhone.value.trim(),
          email: this.newEmail.value.trim(),
          notes: this.newNotes.value.trim(),
        });
        if (this.perms.has('ManageSupplierCreditPurchases')) {
          await this.money.updateSupplierCredit(
            editing.id,
            creditLimit!,
            this.supplierTermsDays.value
          );
        }
        this.notice.set('Supplier details updated');
      } else {
        const supplierId = await this.money.createCustomer(
          this.newName.value.trim(),
          undefined,
          this.newPhone.value.trim() || undefined,
          this.newEmail.value.trim() || undefined,
          true
        );
        if (this.newNotes.value.trim()) {
          await this.money.updateCustomer(supplierId, { notes: this.newNotes.value.trim() });
        }
        if (this.perms.has('ManageSupplierCreditPurchases')) {
          await this.money.updateSupplierCredit(
            supplierId,
            creditLimit!,
            this.supplierTermsDays.value
          );
        }
        this.notice.set('Supplier created');
      }
      this.newName.setValue('');
      this.newPhone.setValue('');
      this.newEmail.setValue('');
      this.newNotes.setValue('');
      this.supplierCreditLimit.setValue('0');
      this.supplierTermsDays.setValue(0);
      if (editing) {
        // Return to the drawer's detail view with fresh data.
        this.drawerEditing.set(false);
        this.editingSupplier.set(null);
        await this.load();
        const refreshed = this.suppliers().find(s => s.id === editing.id);
        if (refreshed) this.openSupplierDrawer(refreshed);
      } else {
        this.closeSupplierForm();
        await this.load();
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Create failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setSupplierActive(supplier: SupplierWithAp): Promise<void> {
    const active = !supplier.supplier_active;
    if (
      !active &&
      !window.confirm(
        `Archive ${this.name(supplier)}? Existing purchases remain available, but the supplier cannot be used for new purchases.`
      )
    ) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.setSupplierActive(supplier.id, active);
      await this.load();
      this.notice.set(active ? 'Supplier reactivated' : 'Supplier archived');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Supplier update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async printPurchase(purchaseId: string): Promise<void> {
    try {
      const [purchase, company] = await Promise.all([
        this.receiptData.buildPurchaseData(purchaseId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printPurchase(
        purchase,
        company.name,
        company.logoUrl,
        undefined,
        company.address
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    }
  }

  protected bucketBadge(bucket: string | null): string {
    switch (bucket) {
      case '8-30':
        return 'badge-info';
      case '31-60':
        return 'badge-warning';
      case '60+':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  }

  protected bucketType(bucket: string | null): BadgeType {
    switch (bucket) {
      case '8-30':
        return 'info';
      case '31-60':
        return 'warning';
      case '60+':
        return 'error';
      default:
        return 'neutral';
    }
  }

  protected purchaseStatusType(purchase: PurchaseRow): BadgeType {
    if (!purchase.is_credit || purchase.paid >= purchase.total_cost) return 'success';
    return 'warning';
  }

  protected purchaseStatusLabel(purchase: PurchaseRow): string {
    if (!purchase.is_credit) return 'Paid now';
    if (purchase.paid >= purchase.total_cost) return 'Paid';
    if (!this.perms.has('ViewFinancials')) return purchase.paid > 0 ? 'Part-paid' : 'We owe';
    const due = this.fmt(purchase.total_cost - purchase.paid);
    return purchase.paid > 0 ? `Part-paid · we owe ${due}` : `We owe ${due}`;
  }

  protected supplierName(id: string): string {
    const s = this.suppliers().find(x => x.id === id);
    return s ? this.name(s) : id.slice(0, 8);
  }

  protected name(c: MoneyCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      month: 'short',
      day: 'numeric',
    });
  }

  private connectLiveUpdates(companyId: string): void {
    this.liveChannel = this.supabase.client
      .channel(`suppliers-live-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchases',
          filter: `company_id=eq.${companyId}`,
        },
        () => this.queueLiveRefresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_payments',
          filter: `company_id=eq.${companyId}`,
        },
        () => this.queueLiveRefresh()
      )
      .subscribe();
  }

  private queueLiveRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      // Silent when data is already on screen — background events shouldn't
      // flash the header spinner.
      void this.load(this.suppliers().length > 0);
    }, 250);
  }

  private unitCostValue(line: PurchaseLineForm): number | null {
    return line.unitCost.trim() ? parseKes(line.unitCost) : null;
  }

  private purchaseLineTotal(line: PurchaseLineForm): number {
    const unitCost = this.unitCostValue(line);
    return unitCost === null ? 0 : Math.round(Math.max(0, line.quantity) * unitCost);
  }

  private syncLineTotalFromUnit(line: PurchaseLineForm): void {
    const unitCost = this.unitCostValue(line);
    line.lineTotal = unitCost === null ? '' : this.inputMoney(this.purchaseLineTotal(line));
  }

  private syncUnitFromLineTotal(line: PurchaseLineForm): void {
    const total = line.lineTotal.trim() ? parseKes(line.lineTotal) : null;
    if (total === null || line.quantity <= 0) {
      line.unitCost = '';
      return;
    }
    line.unitCost = this.inputMoney(Math.round(total / line.quantity));
  }

  private inputMoney(amount: number): string {
    return formatKesInput(amount);
  }

  private marginPercent(line: PurchaseLineForm, sellingPrice: number | null): number | null {
    const cost = this.unitCostValue(line);
    if (cost === null || cost <= 0 || !sellingPrice || sellingPrice <= 0) return null;
    return ((sellingPrice - cost) / sellingPrice) * 100;
  }

  private priceText(amount: number | null | undefined): string {
    return amount && amount > 0 ? formatKesInput(amount) : '';
  }

  private catalogPriceText(amount: number | null | undefined): string {
    return formatKesInput(amount ?? 0);
  }

  private newLine(variantId: string): PurchaseLineForm {
    const variant = this.variants().find(item => item.variant_id === variantId);
    const supplierCost = this.performance().find(
      insight =>
        insight.variant_id === variantId && insight.supplier_id === this.purchaseSupplier.value
    )?.last_unit_cost;
    const initialCost = supplierCost ?? variant?.wholesale_price ?? null;
    return {
      variantId,
      quantity: 1,
      unitCost: this.priceText(initialCost),
      lineTotal: this.priceText(initialCost),
      valueSource: 'unit',
      expiryDate: '',
      batchNumber: '',
      wholesalePrice: this.catalogPriceText(variant?.wholesale_price),
      retailPrice: this.catalogPriceText(variant?.price),
    };
  }

  private emptyLine(): PurchaseLineForm {
    return this.newLine('');
  }
}
