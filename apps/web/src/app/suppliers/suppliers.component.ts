import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { PermissionsService } from '../core/permissions.service';
import { CatalogSearchService } from '../core/catalog-search.service';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { LocationContextService } from '../core/location-context.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { sortList } from '../shared/ui/list-sort';
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
  PrepaymentActivityRow,
  PurchaseDraft,
  PurchaseExpense,
  PurchaseHistoryRow,
  PurchaseLine,
  PurchasePayment,
  SupplierPurchaseMetric,
  SupplierVariantPerformance,
} from '../money/money.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';
import { PartyCacheService } from '../core/party-cache.service';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import { DocumentSendComponent } from '../communications/document-send.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';

type SupplierWithAp = MoneyCustomer & { ap_balance: number } & AgingInfo;
type PurchasePaymentMode = 'paid' | 'partial' | 'later';
// Avoid oversized PostgREST URLs when a broad query matches many cached suppliers.
const SUPPLIER_SEARCH_ID_LIMIT = 50;
type PurchaseRow = PurchaseHistoryRow;

interface PurchaseLineForm {
  variantId: string;
  quantity: number;
  // Purchase-entry invariant: keep both values editable. Supplier invoices may quote either a
  // unit price or a flat line amount; for odd/fractional quantities the exact unit price may be
  // impossible to represent in whole KES. `valueSource` identifies the authoritative input. When
  // it is `total`, posting must preserve that exact line total and treat unit cost as derived.
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
    DocumentSendComponent,
    SearchableFilterComponent,
    MobileListComponent,
    PageActionsComponent,
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
      <app-page-actions actions>
        <button
          utilityAction
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
          <a overflowAction appButton variant="secondary" routerLink="/suppliers">
            <app-icon name="heroTruck" /> Suppliers
          </a>
        }
        @if (isPurchasePage()) {
          <a primaryAction appButton routerLink="/purchases/new">
            <app-icon name="heroPlus" /> Record purchase
          </a>
        }
        @if (!isPurchasePage()) {
          <a overflowAction appButton variant="secondary" routerLink="/purchases/new">
            <app-icon name="heroShoppingCart" /> New purchase
          </a>
        }
        @if (!isPurchasePage()) {
          <button primaryAction appButton type="button" (click)="startSupplierCreate()">
            <app-icon name="heroPlus" /> Add supplier
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
      @if (partyCache.loaded() && !partyCache.complete()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          Supplier limit reached. List, totals, and local filters cover cached suppliers only.
        </div>
      }

      @if (!isPurchasePage()) {
        <app-list-search-bar
          placeholder="Search supplier name, phone, or email…"
          [searchQuery]="supplierQuery()"
          (searchQueryChange)="supplierQuery.set($event); supplierPage.set(1)"
          [sortOptions]="supplierSortOptions()"
          [sortKey]="supplierSort()"
          (sortKeyChange)="supplierSort.set($event); supplierPage.set(1)"
          [sortDirection]="supplierSortDirection()"
          (sortDirectionChange)="supplierSortDirection.set($event); supplierPage.set(1)"
          [filtersEnabled]="true"
          [activeFilterCount]="supplierActiveFilterCount()"
          (clearFilters)="clearSupplierFilters()"
        >
          <app-stat-bar summary [stats]="supplierSummary()" />
          <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:items-end">
            <app-form-field label="Account status" class="lg:w-44">
              <select
                class="select select-bordered select-sm w-full"
                [value]="supplierStatusFilter()"
                (change)="setSupplierFilter('status', $event)"
              >
                <option value="all">All suppliers</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </app-form-field>
            <app-form-field label="Balance" class="lg:w-44">
              <select
                class="select select-bordered select-sm w-full"
                [value]="supplierBalanceFilter()"
                (change)="setSupplierFilter('balance', $event)"
              >
                <option value="all">Any balance</option>
                <option value="owed">We owe</option>
                <option value="clear">Nothing owed</option>
              </select>
            </app-form-field>
            <app-form-field label="Age" class="lg:w-44">
              <select
                class="select select-bordered select-sm w-full"
                [value]="supplierAgeFilter()"
                (change)="setSupplierFilter('age', $event)"
              >
                <option value="all">Any age</option>
                <option value="overdue">Over 30 days</option>
                <option value="current">Current or clear</option>
              </select>
            </app-form-field>
          </div>
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
              heading="Supplier accounts"
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
                  @for (supplier of pagedSuppliers(); track supplier.id) {
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
                        @if (perms.has('ManageSupplierCreditPurchases')) {
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
                        }
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
          <section id="purchase-form" class="card overflow-visible bg-base-100">
            <div class="card-body p-0">
              <div
                class="flex items-start justify-between gap-3 rounded-t-box border-b border-base-300 bg-base-200/30 px-5 py-4"
              >
                <div>
                  <h2 class="section-title">Record a purchase</h2>
                  <p class="type-caption mt-1">Stock is added as soon as this purchase is saved.</p>
                </div>
                <a routerLink="/suppliers" class="link link-hover shrink-0 text-sm">
                  Manage suppliers
                </a>
              </div>

              <form
                (submit)="$event.preventDefault(); recordPurchase()"
                class="flex flex-col gap-5 p-5"
              >
                <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-12">
                  <div class="relative sm:col-span-2 lg:col-span-6 xl:col-span-4">
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
                        class="h-auto min-h-14 w-full justify-between gap-3 px-3 py-2 text-left"
                        [attr.aria-expanded]="supplierPickerOpen()"
                        aria-haspopup="listbox"
                        (click)="supplierPickerOpen.set(!supplierPickerOpen())"
                      >
                        @if (selectedSupplier(); as supplier) {
                          <span class="min-w-0 flex-1">
                            <span class="block truncate font-semibold">{{ name(supplier) }}</span>
                            <span class="type-caption block truncate font-normal">
                              {{ supplier.phone || supplier.email || 'No contact details' }}
                              @if (supplier.supplier_credit_terms_days) {
                                · {{ supplier.supplier_credit_terms_days }}d terms
                              }
                            </span>
                          </span>
                          @if (perms.has('ViewFinancials')) {
                            <span class="shrink-0 text-right font-normal">
                              <span
                                class="block text-xs font-semibold"
                                [class.text-warning]="supplier.ap_balance > 0"
                              >
                                We owe <app-money [amount]="supplier.ap_balance" />
                              </span>
                              <span class="type-caption block">
                                @if (supplier.supplier_credit_limit > 0) {
                                  <app-money [amount]="supplierCreditAvailable(supplier)" />
                                  available
                                } @else {
                                  No credit cap
                                }
                              </span>
                            </span>
                          }
                        } @else {
                          <span>Choose supplier</span>
                        }
                        <app-icon class="shrink-0" name="heroChevronDown" />
                      </button>

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
                                class="flex min-h-14 w-full items-center gap-3 rounded-field px-3 py-2 text-left hover:bg-base-200"
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
                                    @if (supplier.supplier_credit_terms_days) {
                                      · {{ supplier.supplier_credit_terms_days }}d terms
                                    }
                                  </span>
                                </span>
                                <span class="shrink-0 text-right">
                                  @if (perms.has('ViewFinancials')) {
                                    <span
                                      class="block text-xs font-semibold"
                                      [class.text-warning]="supplier.ap_balance > 0"
                                    >
                                      We owe <app-money [amount]="supplier.ap_balance" />
                                    </span>
                                    <span class="type-caption">
                                      @if (supplier.supplier_credit_limit > 0) {
                                        <app-money [amount]="supplierCreditAvailable(supplier)" />
                                        available
                                      } @else {
                                        No credit cap
                                      }
                                    </span>
                                  } @else if (supplierStats(supplier.id); as stats) {
                                    <span class="block text-xs font-medium">
                                      {{ stats.purchases }} purchase(s)
                                    </span>
                                    <span class="type-caption"
                                      >{{ stats.products }} product(s)</span
                                    >
                                  }
                                </span>
                              </button>
                            } @empty {
                              <p class="p-3 text-sm text-base-content/60">No matching suppliers.</p>
                            }
                          </div>
                        </div>
                      }
                    }
                  </div>
                  <app-form-field label="Invoice / reference" class="lg:col-span-3 xl:col-span-2">
                    <input
                      type="text"
                      class="input input-bordered h-14 w-full"
                      placeholder="Optional"
                      [formControl]="purchaseReference"
                    />
                  </app-form-field>
                  <app-form-field label="Purchase date" class="lg:col-span-3 xl:col-span-2">
                    <input
                      type="date"
                      class="input input-bordered h-14 w-full"
                      [formControl]="purchaseDate"
                    />
                  </app-form-field>
                  <app-form-field label="Receive into" class="lg:col-span-3 xl:col-span-2">
                    <select
                      class="select select-bordered h-14 w-full"
                      [formControl]="purchaseLocation"
                    >
                      @for (location of locations(); track location.id) {
                        <option [value]="location.id">{{ location.name }}</option>
                      }
                    </select>
                  </app-form-field>
                  <app-form-field label="Notes" class="sm:col-span-2 lg:col-span-9 xl:col-span-2">
                    <input
                      class="input input-bordered h-14 w-full"
                      placeholder="Delivery notes…"
                      [formControl]="purchaseNotes"
                    />
                  </app-form-field>
                </div>

                <section class="rounded-box border border-base-300 bg-base-200/30 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <h3 class="text-sm font-semibold">Payment</h3>
                      <p class="type-caption">Choose when and where the supplier is paid.</p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="type-caption">Current total</p>
                      <p class="font-semibold tabular-nums">
                        <app-money [amount]="purchaseTotal()" />
                      </p>
                    </div>
                  </div>
                  <div class="mt-3 grid items-start gap-4 lg:grid-cols-2">
                    <div>
                      <span class="form-field-label mb-1.5 block">Payment option</span>
                      <div class="grid gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          class="flex h-14 items-center justify-start gap-2 rounded-field border bg-base-100 px-3 text-left transition-colors"
                          [class.border-primary]="purchasePaymentMode.value === 'paid'"
                          [class.shadow-sm]="purchasePaymentMode.value === 'paid'"
                          [class.border-base-300]="purchasePaymentMode.value !== 'paid'"
                          (click)="setPurchasePaymentMode('paid')"
                        >
                          <input
                            type="radio"
                            class="radio radio-primary radio-sm"
                            tabindex="-1"
                            [checked]="purchasePaymentMode.value === 'paid'"
                          />
                          <span>
                            <span class="block text-sm font-semibold">Paid now</span>
                            <span class="type-caption block font-normal">Full payment</span>
                          </span>
                        </button>
                        @if (perms.has('ManageSupplierCreditPurchases')) {
                          <button
                            type="button"
                            class="flex h-14 items-center justify-start gap-2 rounded-field border bg-base-100 px-3 text-left transition-colors"
                            [class.border-primary]="purchasePaymentMode.value === 'partial'"
                            [class.shadow-sm]="purchasePaymentMode.value === 'partial'"
                            [class.border-base-300]="purchasePaymentMode.value !== 'partial'"
                            (click)="setPurchasePaymentMode('partial')"
                          >
                            <input
                              type="radio"
                              class="radio radio-primary radio-sm"
                              tabindex="-1"
                              [checked]="purchasePaymentMode.value === 'partial'"
                            />
                            <span>
                              <span class="block text-sm font-semibold">Part-paid</span>
                              <span class="type-caption block font-normal">Split payment</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            class="flex h-14 items-center justify-start gap-2 rounded-field border bg-base-100 px-3 text-left transition-colors"
                            [class.border-warning]="purchasePaymentMode.value === 'later'"
                            [class.shadow-sm]="purchasePaymentMode.value === 'later'"
                            [class.border-base-300]="purchasePaymentMode.value !== 'later'"
                            (click)="setPurchasePaymentMode('later')"
                          >
                            <input
                              type="radio"
                              class="radio radio-warning radio-sm"
                              tabindex="-1"
                              [checked]="purchasePaymentMode.value === 'later'"
                            />
                            <span>
                              <span class="block text-sm font-semibold">Pay later</span>
                              <span class="type-caption block font-normal">Supplier credit</span>
                            </span>
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
                            class="input input-bordered h-14 w-full"
                            inputmode="numeric"
                            placeholder="0"
                            [formControl]="purchaseAmountPaid"
                          />
                        </app-form-field>
                        <app-form-field label="Paid from">
                          <select
                            class="select select-bordered h-14 w-full"
                            [formControl]="purchaseAccount"
                          >
                            @for (a of accounts(); track a.code) {
                              <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                            }
                          </select>
                        </app-form-field>
                        <p class="type-caption sm:col-span-2">
                          The payment is recorded against the selected account when this purchase is
                          saved.
                        </p>
                      </div>
                    } @else if (purchasePaymentMode.value === 'paid') {
                      <div>
                        <app-form-field label="Paid from">
                          <select
                            class="select select-bordered h-14 w-full"
                            [formControl]="purchaseAccount"
                          >
                            @for (a of accounts(); track a.code) {
                              <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                            }
                          </select>
                        </app-form-field>
                        <p class="type-caption mt-1">
                          The full purchase total is recorded against this account when saved.
                        </p>
                      </div>
                    } @else if (selectedSupplier(); as supplier) {
                      <div>
                        <span class="form-field-label mb-1.5 block">Supplier credit</span>
                        <div
                          class="flex h-14 items-center justify-between rounded-field border border-base-300 bg-base-100 px-3 text-sm"
                        >
                          <span class="text-base-content/60">Available</span>
                          <strong>
                            @if (supplier.supplier_credit_limit > 0) {
                              <app-money [amount]="supplierCreditAvailable(supplier)" />
                            } @else {
                              No configured cap
                            }
                          </strong>
                        </div>
                        <p class="type-caption mt-1">
                          <app-money [amount]="purchaseBalanceDue()" /> will be added to what we owe
                          {{ name(supplier) }}.
                        </p>
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

                <section class="flex flex-col gap-3 border-t border-base-300 pt-4">
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
                      class="relative grid gap-x-3 gap-y-4 rounded-box border border-base-300 bg-base-200/40 p-4 md:grid-cols-2 lg:grid-cols-12"
                    >
                      <div class="relative md:col-span-2 lg:col-span-4">
                        <span class="form-field-label mb-1 block">Product</span>
                        <button
                          type="button"
                          class="flex h-12 w-full items-center justify-between gap-2 rounded-field border border-base-300 bg-base-100 px-3 text-left text-sm hover:border-base-content/30"
                          [attr.aria-expanded]="variantPickerFor() === $index"
                          (click)="openVariantPicker($index)"
                        >
                          @if (variantFor(line); as selectedVariant) {
                            <span class="min-w-0">
                              <span class="block truncate font-medium">{{
                                label(selectedVariant)
                              }}</span>
                              <span class="type-caption block truncate">
                                {{ selectedVariant.manufacturer_name || 'Manufacturer not set' }}
                                · {{ selectedVariant.sku }}
                              </span>
                            </span>
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
                                  placeholder="Search product, manufacturer, SKU, or barcode…"
                                  [value]="variantQuery()"
                                  (input)="updateVariantQuery($any($event.target).value)"
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
                                    <span class="type-caption block truncate">
                                      {{ variant.manufacturer_name || 'Manufacturer not set' }} ·
                                      {{ variant.sku
                                      }}{{ variant.barcode ? ' · ' + variant.barcode : '' }}
                                    </span>
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
                            class="join-item h-12"
                            aria-label="Decrease quantity"
                            (click)="stepPurchaseQuantity(line, -1)"
                          >
                            <app-icon name="heroMinus" />
                          </button>
                          <input
                            type="number"
                            class="input input-bordered join-item h-12 min-w-10 flex-1 px-1 text-center tabular-nums"
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
                            class="join-item h-12"
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
                          class="input input-bordered h-12 w-full text-right tabular-nums"
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
                          class="input input-bordered h-12 w-full text-right font-semibold tabular-nums"
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
                          class="grid gap-3 md:col-span-2 md:grid-cols-2 lg:col-span-12"
                          [class.lg:grid-cols-4]="preferences.batchExpiryEnabled()"
                          [class.lg:grid-cols-3]="!preferences.batchExpiryEnabled()"
                        >
                          @if (preferences.batchExpiryEnabled()) {
                            <app-form-field label="Expiry (optional)">
                              <input
                                type="date"
                                class="input input-bordered h-11 w-full"
                                [(ngModel)]="line.expiryDate"
                                [ngModelOptions]="{ standalone: true }"
                              />
                            </app-form-field>
                          }
                          <app-form-field label="Batch (optional)">
                            <input
                              class="input input-bordered h-11 w-full"
                              [(ngModel)]="line.batchNumber"
                              [ngModelOptions]="{ standalone: true }"
                            />
                          </app-form-field>
                          <app-form-field label="Wholesale price (KES)">
                            <div class="relative">
                              <input
                                type="text"
                                inputmode="numeric"
                                class="input input-bordered h-11 w-full text-right tabular-nums"
                                [class.bg-base-200]="!perms.has('ManageStockAdjustments')"
                                [class.pr-8]="hasDuplicateVariant(line)"
                                [readonly]="!perms.has('ManageStockAdjustments')"
                                [title]="
                                  perms.has('ManageStockAdjustments')
                                    ? ''
                                    : 'Your role can receive stock but cannot change catalog prices'
                                "
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
                                class="input input-bordered h-11 w-full text-right tabular-nums"
                                [class.bg-base-200]="!perms.has('ManageStockAdjustments')"
                                [class.pr-8]="hasDuplicateVariant(line)"
                                [readonly]="!perms.has('ManageStockAdjustments')"
                                [title]="
                                  perms.has('ManageStockAdjustments')
                                    ? ''
                                    : 'Your role can receive stock but cannot change catalog prices'
                                "
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
                          @if (!perms.has('ManageStockAdjustments')) {
                            <p class="type-caption md:col-span-2 lg:col-span-2">
                              Your role can receive stock but cannot change catalog prices.
                            </p>
                          }
                        </div>

                        <div
                          class="grid overflow-hidden rounded-field border border-base-300 bg-base-100/70 sm:grid-cols-2 md:col-span-2 lg:col-span-12 lg:grid-cols-5 lg:divide-x lg:divide-base-300"
                        >
                          <div class="min-w-0 space-y-1 p-3">
                            <p class="type-caption">SKU · current stock</p>
                            <p class="font-semibold tabular-nums">
                              {{ variant.sku }} · {{ variant.stock ?? 0 }}
                              {{ variant.allow_fractional ? 'units' : 'in stock' }}
                            </p>
                          </div>
                          <div class="min-w-0 space-y-1 border-t border-base-300 p-3 sm:border-t-0">
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
                          <div class="min-w-0 space-y-1 border-t border-base-300 p-3 lg:border-t-0">
                            <p class="type-caption">Wholesale margin</p>
                            <app-status-badge
                              size="xs"
                              [type]="marginType(line, enteredCatalogPrice(line.wholesalePrice))"
                              [label]="marginLabel(line, enteredCatalogPrice(line.wholesalePrice))"
                            />
                          </div>
                          <div class="min-w-0 space-y-1 border-t border-base-300 p-3 lg:border-t-0">
                            <p class="type-caption">Retail margin</p>
                            <app-status-badge
                              size="xs"
                              [type]="marginType(line, enteredCatalogPrice(line.retailPrice))"
                              [label]="marginLabel(line, enteredCatalogPrice(line.retailPrice))"
                            />
                          </div>
                          <div class="min-w-0 space-y-1 border-t border-base-300 p-3 lg:border-t-0">
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
                      <a appButton variant="ghost" [routerLink]="['/purchases/drafts', draft.id]"
                        >Open</a
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
            <app-mobile-list>
              @for (s of pagedSuppliers(); track s.id) {
                <div
                  mobileListRow
                  class="cursor-pointer"
                  role="button"
                  tabindex="0"
                  [class.opacity-60]="!s.supplier_active"
                  [class.bg-base-200/50]="drawerSupplierId() === s.id"
                  (click)="openSupplierDrawer(s)"
                  (keydown.enter)="openSupplierDrawer(s)"
                >
                  <div class="flex min-h-20 items-center gap-3 p-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <p class="truncate font-semibold">{{ name(s) }}</p>
                        @if (!s.supplier_active) {
                          <app-status-badge size="xs" type="neutral" label="archived" />
                        }
                      </div>
                      <p class="type-caption mt-1 truncate">
                        {{ s.phone || 'No phone' }} · {{ s.supplier_credit_terms_days || 0 }}d terms
                      </p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="font-semibold tabular-nums" [class.text-warning]="s.ap_balance > 0">
                        <app-money
                          [amount]="s.ap_balance"
                          [masked]="!perms.has('ViewFinancials')"
                        />
                      </p>
                      @if (s.days_outstanding !== null) {
                        <p class="type-caption">{{ s.days_outstanding }}d · {{ s.bucket }}</p>
                      } @else {
                        <p class="type-caption">{{ s.ap_balance > 0 ? 'we owe' : 'clear' }}</p>
                      }
                    </div>
                  </div>
                </div>
              }
            </app-mobile-list>
          }
        </aside>
      </div>

      @if (!isPurchasePage() && filteredSuppliers().length > 0) {
        <app-pagination
          class="mb-4 block"
          [currentPage]="supplierPage()"
          [totalPages]="supplierTotalPages()"
          [totalItems]="filteredSuppliers().length"
          [itemsPerPage]="supplierPageSize()"
          itemLabel="suppliers"
          [showItemsPerPage]="true"
          (pageChange)="supplierPage.set($event)"
          (itemsPerPageChange)="supplierPageSize.set($event); supplierPage.set(1)"
        />
      }

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

              @if (perms.has('ManageSupplierCreditPurchases')) {
                <button
                  appButton
                  variant="outline"
                  type="button"
                  class="mt-3 w-full"
                  [disabled]="busy()"
                  (click)="setSupplierActive(s)"
                >
                  {{ s.supplier_active ? 'Archive supplier' : 'Reactivate supplier' }}
                </button>
              }

              <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <app-stat-card
                  label="We owe"
                  [value]="perms.has('ViewFinancials') ? fmt(s.ap_balance) : 'Hidden'"
                  [tone]="s.ap_balance > 0 ? 'warning' : 'neutral'"
                />
                <app-stat-card
                  label="Advance with supplier"
                  [value]="perms.has('ViewFinancials') ? fmt(supplierAdvanceBalance()) : 'Hidden'"
                  [tone]="supplierAdvanceBalance() > 0 ? 'success' : 'neutral'"
                  [sub]="supplierNetPosition(s)"
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
                @if (perms.has('ManageSupplierCreditPurchases')) {
                  <section>
                    <h3 class="section-title mb-1">Pay advance to supplier</h3>
                    <p class="type-caption">Held separately until you apply it to a purchase.</p>
                    <form
                      (submit)="$event.preventDefault(); recordAdvance(s.id)"
                      class="mt-2 grid gap-2 sm:grid-cols-2"
                    >
                      <app-form-field label="Advance amount (KES)">
                        <input
                          class="input input-bordered input-sm"
                          inputmode="numeric"
                          [formControl]="advanceAmount"
                        />
                      </app-form-field>
                      <app-form-field label="Pay from">
                        <select
                          class="select select-bordered select-sm"
                          [formControl]="advanceAccount"
                        >
                          @for (a of accounts(); track a.code) {
                            <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                          }
                        </select>
                      </app-form-field>
                      <app-form-field label="Reference">
                        <input
                          class="input input-bordered input-sm"
                          [formControl]="advanceReference"
                        />
                      </app-form-field>
                      <button
                        appButton
                        type="submit"
                        class="self-end justify-self-start"
                        [disabled]="busy() || !cashierSession.canTakePayment()"
                      >
                        Record advance
                      </button>
                    </form>
                    @if (supplierAdvanceBalance() > 0) {
                      <details class="mt-2 rounded-field border border-base-300 p-2">
                        <summary class="cursor-pointer text-sm font-medium">
                          Supplier returned unused advance
                        </summary>
                        <form
                          (submit)="$event.preventDefault(); recordAdvanceReturn(s.id)"
                          class="mt-2 grid gap-2 sm:grid-cols-2"
                        >
                          <app-form-field label="Amount returned (KES)">
                            <input
                              class="input input-bordered input-sm"
                              inputmode="numeric"
                              [formControl]="advanceReturnAmount"
                            />
                          </app-form-field>
                          <app-form-field label="Received into">
                            <select
                              class="select select-bordered select-sm"
                              [formControl]="advanceReturnAccount"
                            >
                              @for (a of accounts(); track a.code) {
                                <option [value]="a.code">{{ a.name }}</option>
                              }
                            </select>
                          </app-form-field>
                          <app-form-field label="Reason" [required]="true">
                            <input
                              class="input input-bordered input-sm"
                              [formControl]="advanceReturnReason"
                            />
                          </app-form-field>
                          <app-form-field label="Reference">
                            <input
                              class="input input-bordered input-sm"
                              [formControl]="advanceReturnReference"
                            />
                          </app-form-field>
                          <button
                            appButton
                            variant="outline"
                            type="submit"
                            class="self-end justify-self-start"
                            [disabled]="
                              busy() ||
                              !cashierSession.canTakePayment() ||
                              !advanceReturnReason.value.trim()
                            "
                          >
                            Record return
                          </button>
                        </form>
                      </details>
                    }
                  </section>

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

                @if (perms.has('ViewFinancials') && advanceActivity().length > 0) {
                  <section class="border-t border-base-300/60 pt-3">
                    <h3 class="section-title mb-2">Advance activity</h3>
                    <ol class="divide-y divide-base-300/60 rounded-field border border-base-300">
                      @for (row of advanceActivity(); track row.id) {
                        <li class="flex items-center justify-between gap-3 p-2 text-sm">
                          <div class="min-w-0">
                            <p class="truncate">{{ row.description }}</p>
                            <p class="type-caption">
                              {{ time(row.occurred_at) }}
                              @if (row.reference) {
                                · {{ row.reference }}
                              }
                            </p>
                          </div>
                          <span
                            class="shrink-0 font-semibold tabular-nums"
                            [class.text-success]="row.direction === 'increase'"
                            [class.text-error]="row.direction === 'decrease'"
                          >
                            {{ row.direction === 'increase' ? '+' : '−' }}{{ fmt(row.amount) }}
                          </span>
                        </li>
                      }
                    </ol>
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
                  @if (drawerPurchasesLoading()) {
                    <div class="flex justify-center py-6">
                      <span class="loading loading-spinner loading-sm"></span>
                    </div>
                  } @else if (drawerPurchases().length === 0) {
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
                      across the latest {{ drawerPurchases().length }} purchase(s) · still to pay
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
                                {{ time(p.purchase_date) }} ·
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
                              @if (supplierAdvanceBalance() > 0) {
                                <button
                                  appButton
                                  variant="soft"
                                  size="sm"
                                  type="button"
                                  [disabled]="busy()"
                                  (click)="applyAdvanceToPurchase(p)"
                                >
                                  Use advance
                                </button>
                              }
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
                    <a
                      appButton
                      variant="ghost"
                      class="mt-2"
                      routerLink="/purchases"
                      [queryParams]="{ supplier: s.id, range: 'all' }"
                    >
                      View full purchase history
                    </a>
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
            (searchQueryChange)="onPurchaseSearch($event)"
            [sortOptions]="purchaseSortOptions()"
            [sortKey]="purchaseSort()"
            (sortKeyChange)="purchaseSort.set($event); reloadPurchases()"
            [sortDirection]="purchaseSortDirection()"
            (sortDirectionChange)="purchaseSortDirection.set($event); reloadPurchases()"
            [filtersEnabled]="true"
            [activeFilterCount]="purchaseActiveFilterCount()"
            (clearFilters)="clearPurchaseFilters()"
          >
            <app-stat-bar summary [stats]="purchaseSummary()" />
            <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
              <app-form-field label="Supplier" class="lg:w-56">
                <app-searchable-filter
                  ariaLabel="Filter purchases by supplier"
                  placeholder="All suppliers"
                  emptyValue="all"
                  searchPlaceholder="Search suppliers…"
                  [options]="purchaseSupplierOptions()"
                  [value]="purchaseSupplierFilter()"
                  (valueChange)="setPurchaseSupplierFilter($event)"
                />
              </app-form-field>
              <app-form-field label="Payment" class="lg:w-44">
                <select
                  class="select select-bordered select-sm w-full"
                  [value]="purchasePaymentFilter()"
                  (change)="setPurchaseFilter('payment', $event)"
                >
                  <option value="all">Any status</option>
                  <option value="paid">Paid</option>
                  <option value="part_paid">Part-paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </app-form-field>
              @if (locations().length > 1) {
                <app-form-field label="Location" class="lg:w-48">
                  <select
                    class="select select-bordered select-sm w-full"
                    [value]="purchaseLocationFilter()"
                    (change)="setPurchaseFilter('location', $event)"
                  >
                    @for (location of locations(); track location.id) {
                      <option [value]="location.id">{{ location.name }}</option>
                    }
                  </select>
                </app-form-field>
              }
              <app-form-field label="From" class="lg:w-40">
                <input
                  type="date"
                  class="input input-bordered input-sm w-full"
                  [value]="purchaseFrom()"
                  (change)="setPurchaseDate('from', $event)"
                />
              </app-form-field>
              <app-form-field label="To" class="lg:w-40">
                <input
                  type="date"
                  class="input input-bordered input-sm w-full"
                  [value]="purchaseTo()"
                  (change)="setPurchaseDate('to', $event)"
                />
              </app-form-field>
              <div class="flex flex-wrap gap-2 sm:col-span-2">
                <button
                  appButton
                  [variant]="purchaseMonthActive() ? 'soft' : 'ghost'"
                  type="button"
                  (click)="setPurchaseMonth()"
                >
                  @if (purchaseMonthActive()) {
                    <app-icon name="heroCheck" size="sm" />
                  }
                  This month
                </button>
                <button
                  appButton
                  [variant]="purchaseAllTimeActive() ? 'soft' : 'ghost'"
                  type="button"
                  (click)="setPurchaseAllTime()"
                >
                  @if (purchaseAllTimeActive()) {
                    <app-icon name="heroCheck" size="sm" />
                  }
                  All time
                </button>
              </div>
            </div>
          </app-list-search-bar>

          @if (purchases().length === 0) {
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
            <app-mobile-list>
              @for (p of purchases(); track p.id) {
                <div
                  mobileListRow
                  class="cursor-pointer"
                  role="button"
                  tabindex="0"
                  [class.bg-base-200/50]="drawerPurchaseId() === p.id"
                  (click)="openPurchaseDrawer(p)"
                  (keydown.enter)="openPurchaseDrawer(p)"
                >
                  <div class="flex min-h-20 items-center gap-3 p-3">
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-semibold">{{ supplierName(p.supplier_id) }}</p>
                      <p class="type-caption mt-1 truncate">
                        {{ time(p.purchase_date) }} · {{ p.reference || 'No reference' }}
                      </p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="font-semibold tabular-nums">
                        <app-money
                          [amount]="p.total_cost"
                          [masked]="!perms.has('ViewFinancials')"
                        />
                      </p>
                      <app-status-badge
                        size="xs"
                        [type]="purchaseStatusType(p)"
                        [label]="purchaseStatusLabel(p)"
                      />
                    </div>
                  </div>
                </div>
              }
            </app-mobile-list>
            <div class="hidden lg:block">
              <app-data-table-shell
                heading="Purchase history"
                [description]="purchaseHistoryTotal() + ' matching purchases'"
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
                    @for (p of purchases(); track p.id) {
                      <tr
                        role="button"
                        tabindex="0"
                        class="cursor-pointer"
                        [class.table-row-active]="drawerPurchaseId() === p.id"
                        (click)="openPurchaseDrawer(p)"
                        (keydown.enter)="openPurchaseDrawer(p)"
                      >
                        <td class="whitespace-nowrap text-sm">{{ time(p.purchase_date) }}</td>
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
            </div>

            <!-- Purchase detail drawer -->
            @if (drawerPurchase(); as p) {
              <app-drawer
                [open]="true"
                (closed)="closePurchaseDrawer()"
                [title]="p.reference || 'Purchase'"
                [subtitle]="supplierName(p.supplier_id) + ' · ' + time(p.purchase_date)"
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

                @if (perms.has('ManageCommunications') && perms.has('ViewFinancials')) {
                  <app-document-send
                    class="mt-3 block"
                    documentType="purchase_order"
                    [subjectId]="p.id"
                    title="Send purchase order"
                    description="Supplier and costs come from this purchase."
                    [allowCompanyCopy]="true"
                    (sent)="notice.set($event)"
                    (failed)="error.set($event)"
                  />
                }

                <div class="mt-3 grid grid-cols-2 gap-2">
                  <app-stat-card
                    label="Supplier invoice"
                    [value]="perms.has('ViewFinancials') ? fmt(p.total_cost) : 'Hidden'"
                    [sub]="
                      perms.has('ViewFinancials')
                        ? 'Merchandise ' +
                          fmt(p.goods_subtotal) +
                          ' · expenses ' +
                          fmt(p.expense_total - p.separate_expense_total)
                        : undefined
                    "
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
                  @if (p.separate_expense_total > 0) {
                    <app-stat-card
                      label="Paid separately"
                      [value]="
                        perms.has('ViewFinancials') ? fmt(p.separate_expense_total) : 'Hidden'
                      "
                      sub="Internal expense; not supplier AP"
                    />
                    <app-stat-card
                      label="All-in outlay"
                      [value]="perms.has('ViewFinancials') ? fmt(p.all_in_total) : 'Hidden'"
                    />
                  }
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
                                  {{ purchaseLineManufacturer(line.variant_id) }}
                                  @if (purchaseLineSku(line.variant_id); as sku) {
                                    · {{ sku }}
                                  }
                                  ·
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

                    @if (drawerPurchaseExpenses().length > 0) {
                      <section class="border-t border-base-300/60 pt-3">
                        <h3 class="section-title mb-2">Additional expenses</h3>
                        <ul class="divide-y divide-base-200">
                          @for (expense of drawerPurchaseExpenses(); track expense.id) {
                            <li class="flex items-center gap-3 py-2">
                              <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium capitalize">
                                  {{ expense.custom_label || expense.category }}
                                </p>
                                <p class="type-caption">
                                  {{
                                    expense.settlement === 'supplier_bill'
                                      ? 'Included in supplier bill'
                                      : 'Paid separately from ' + expense.account_code
                                  }}
                                  @if (expense.memo) {
                                    · {{ expense.memo }}
                                  }
                                </p>
                              </div>
                              <strong class="text-sm"
                                ><app-money
                                  [amount]="expense.amount"
                                  [masked]="!perms.has('ViewFinancials')"
                              /></strong>
                            </li>
                          }
                        </ul>
                      </section>
                    }

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
                [totalItems]="purchaseHistoryTotal()"
                [itemsPerPage]="purchasePageSize()"
                itemLabel="purchases"
                [showItemsPerPage]="true"
                (pageChange)="changePurchasePage($event)"
                (itemsPerPageChange)="changePurchasePageSize($event)"
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
  private readonly router = inject(Router);
  private readonly money = inject(MoneyService);
  protected readonly partyCache = inject(PartyCacheService);
  private readonly pos = inject(PosService);
  private readonly catalogSearch = inject(CatalogSearchService);
  private readonly locationContext = inject(LocationContextService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  protected readonly perms = inject(PermissionsService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly preferences = inject(CompanyPreferencesService);
  protected readonly isPurchasePage = signal(this.route.snapshot.data['purchasePage'] === true);

  protected readonly fmt = formatKes;
  protected readonly duplicatePriceTooltip =
    'Same item on multiple lines — the selling price applies once to the product and stays in sync across those lines.';
  protected readonly suppliers = computed<SupplierWithAp[]>(() => this.partyCache.suppliers());
  protected readonly purchaseSupplierOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.suppliers().map(supplier => ({
      value: supplier.id,
      label: this.name(supplier),
      description: supplier.phone || undefined,
      searchText: supplier.email ?? undefined,
    }))
  );
  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly variants = signal<Variant[]>([]);
  protected readonly label = variantLabel;
  protected readonly purchases = signal<PurchaseRow[]>([]);
  protected readonly purchaseHistoryTotal = signal(0);
  protected readonly purchaseQuery = signal('');
  protected readonly purchaseSort = signal('created');
  protected readonly purchaseSortDirection = signal<ListSortDirection>('desc');
  protected readonly purchaseSortOptions = computed<readonly ListSortOption[]>(() => [
    { value: 'created', label: 'Purchase date' },
    ...(this.perms.has('ViewFinancials') ? [{ value: 'total', label: 'Purchase value' }] : []),
  ]);
  protected readonly purchasePage = signal(1);
  protected readonly purchasePageSize = signal(10);
  protected readonly purchaseSupplierFilter = signal('all');
  protected readonly purchasePaymentFilter = signal('all');
  protected readonly purchaseLocationFilter = signal('');
  protected readonly purchaseFrom = signal(this.monthStartIso());
  protected readonly purchaseTo = signal(this.todayIso());
  private purchaseSearchTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly drafts = signal<PurchaseDraft[]>([]);
  protected readonly performance = signal<SupplierVariantPerformance[]>([]);
  protected readonly purchaseMetrics = signal<SupplierPurchaseMetric[]>([]);
  protected readonly locations = this.locationContext.locations;
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
  protected readonly supplierSort = signal('name');
  protected readonly supplierSortDirection = signal<ListSortDirection>('asc');
  protected readonly supplierStatusFilter = signal('all');
  protected readonly supplierBalanceFilter = signal('all');
  protected readonly supplierAgeFilter = signal('all');
  protected readonly supplierPage = signal(1);
  protected readonly supplierPageSize = signal(25);
  protected readonly supplierSortOptions = computed<readonly ListSortOption[]>(() => [
    { value: 'name', label: 'Supplier name' },
    { value: 'aging', label: 'Days outstanding' },
    { value: 'status', label: 'Account status' },
    ...(this.perms.has('ViewFinancials') ? [{ value: 'balance', label: 'Amount owed' }] : []),
  ]);
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
  protected readonly variantSearchResults = signal<Variant[] | null>(null);
  private variantSearchRequest = 0;
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
    let initialPartyRevision = true;
    effect(() => {
      this.partyCache.revision();
      if (initialPartyRevision) {
        initialPartyRevision = false;
        return;
      }
      untracked(() => void this.load(this.suppliers().length > 0));
    });
  }
  protected lines: PurchaseLineForm[] = [this.emptyLine()];

  protected readonly paySupplierId = new FormControl('', { nonNullable: true });
  protected readonly payAmount = new FormControl('', { nonNullable: true });
  protected readonly payAccount = new FormControl('', { nonNullable: true });
  protected readonly payPurchaseId = signal<string | null>(null);
  protected readonly selectedPayAmount = new FormControl('', { nonNullable: true });
  protected readonly selectedPayAccount = new FormControl('', { nonNullable: true });
  protected readonly supplierAdvanceBalance = signal(0);
  protected readonly advanceActivity = signal<PrepaymentActivityRow[]>([]);
  protected readonly advanceAmount = new FormControl('', { nonNullable: true });
  protected readonly advanceAccount = new FormControl('', { nonNullable: true });
  protected readonly advanceReference = new FormControl('', { nonNullable: true });
  protected readonly advanceReturnAmount = new FormControl('', { nonNullable: true });
  protected readonly advanceReturnAccount = new FormControl('', { nonNullable: true });
  protected readonly advanceReturnReason = new FormControl('', { nonNullable: true });
  protected readonly advanceReturnReference = new FormControl('', { nonNullable: true });
  private advanceClientRef: string | null = null;
  private advanceApplicationAttempt: { purchaseId: string; clientRef: string } | null = null;
  private advanceReturnClientRef: string | null = null;

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
    const searched = query
      ? source.filter(supplier =>
          [this.name(supplier), supplier.phone, supplier.email]
            .filter(Boolean)
            .some(value => value!.toLowerCase().includes(query))
        )
      : source;
    const rows = searched.filter(supplier => {
      if (this.supplierStatusFilter() === 'active' && !supplier.supplier_active) return false;
      if (this.supplierStatusFilter() === 'archived' && supplier.supplier_active) return false;
      if (this.supplierBalanceFilter() === 'owed' && supplier.ap_balance <= 0) return false;
      if (this.supplierBalanceFilter() === 'clear' && supplier.ap_balance > 0) return false;
      if (this.supplierAgeFilter() === 'overdue' && (supplier.days_outstanding ?? 0) <= 30)
        return false;
      if (this.supplierAgeFilter() === 'current' && (supplier.days_outstanding ?? 0) > 30)
        return false;
      return true;
    });
    const sortKey = this.supplierSort();
    return sortList(
      rows,
      this.supplierSortDirection(),
      supplier => {
        switch (sortKey) {
          case 'aging':
            return supplier.days_outstanding;
          case 'status':
            return supplier.supplier_active;
          case 'balance':
            return supplier.ap_balance;
          default:
            return this.name(supplier);
        }
      },
      supplier => this.name(supplier)
    );
  });
  protected readonly supplierTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredSuppliers().length / this.supplierPageSize()))
  );
  protected readonly pagedSuppliers = computed(() => {
    const page = Math.min(this.supplierPage(), this.supplierTotalPages());
    const start = (page - 1) * this.supplierPageSize();
    return this.filteredSuppliers().slice(start, start + this.supplierPageSize());
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
  protected readonly drawerPurchases = signal<PurchaseRow[]>([]);
  protected readonly drawerPurchasesLoading = signal(false);
  private drawerPurchasesSequence = 0;
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
  protected readonly drawerPurchaseExpenses = signal<PurchaseExpense[]>([]);
  protected readonly drawerPurchasePayments = signal<PurchasePayment[]>([]);
  protected readonly purchaseDetailLoading = signal(false);
  protected readonly openCreditPurchases = computed(() =>
    this.purchaseMetrics().reduce((sum, metric) => sum + Number(metric.open_purchase_count ?? 0), 0)
  );
  protected readonly supplierSummary = computed(() => [
    {
      label: 'Active suppliers',
      value: this.activeSuppliers().length,
      mobilePriority: 'primary' as const,
    },
    {
      label: 'We owe',
      value: this.perms.has('ViewFinancials') ? this.fmt(this.totalOutstanding()) : 'Hidden',
      tone: this.totalOutstanding() > 0 ? ('warning' as const) : ('neutral' as const),
      mobilePriority: 'primary' as const,
    },
    {
      label: 'Suppliers we owe',
      value: this.suppliersOwed().length,
      tone: this.suppliersOwed().length > 0 ? ('warning' as const) : ('neutral' as const),
      mobilePriority: 'secondary' as const,
    },
    {
      label: 'Purchases we owe',
      value: this.openCreditPurchases(),
      tone: this.openCreditPurchases() > 0 ? ('warning' as const) : ('neutral' as const),
      mobilePriority: 'secondary' as const,
    },
  ]);
  protected readonly purchaseSummary = computed(() => {
    const purchases = this.purchases();
    const value = purchases.reduce((sum, purchase) => sum + purchase.total_cost, 0);
    const outstanding = purchases.reduce(
      (sum, purchase) => sum + Math.max(0, purchase.total_cost - purchase.paid),
      0
    );
    return [
      {
        label: 'Matching purchases',
        value: this.purchaseHistoryTotal(),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Value on page',
        value: this.perms.has('ViewFinancials') ? this.fmt(value) : 'Hidden',
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Still to pay on page',
        value: this.perms.has('ViewFinancials') ? this.fmt(outstanding) : 'Hidden',
        tone: outstanding > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Drafts',
        value: this.drafts().length,
        tone: this.drafts().length > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'secondary' as const,
      },
    ];
  });
  protected readonly purchaseTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.purchaseHistoryTotal() / this.purchasePageSize()))
  );

  private loadQueued = false;

  async ngOnInit(): Promise<void> {
    this.purchaseLocationFilter.set(this.locationContext.requireActiveId());
    if (this.isPurchasePage()) {
      if (window.history.state?.purchaseRecorded) {
        this.notice.set('Purchase recorded successfully. Stock and accounting are up to date.');
      }
      const params = this.route.snapshot.queryParamMap;
      this.purchaseSupplierFilter.set(params.get('supplier') ?? 'all');
      this.purchasePaymentFilter.set(params.get('payment') ?? 'all');
      this.purchaseQuery.set(params.get('q') ?? '');
      this.purchasePage.set(Math.max(1, Number(params.get('page') ?? 1) || 1));
      if (params.get('range') === 'all') {
        this.purchaseFrom.set('');
        this.purchaseTo.set('');
      }
    }
    const [, printerEnabled] = await Promise.all([
      this.preferences.refresh(),
      this.receiptData.printerEnabled(),
    ]);
    this.printerEnabled.set(printerEnabled);
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.purchaseSearchTimer) clearTimeout(this.purchaseSearchTimer);
  }

  /** Silent reloads (realtime events) refresh data without flashing the header spinner. */
  protected async load(silent = false): Promise<void> {
    if (this.loading()) {
      this.loadQueued = true;
      return;
    }
    if (!silent) this.loading.set(true);
    try {
      const purchaseRequest = this.isPurchasePage()
        ? this.money.purchasesPage(this.purchasePageInput())
        : Promise.resolve([]);
      const [suppliers, accounts, variants, purchaseResult, drafts, performance, metrics] =
        await Promise.all([
          this.partyCache.ensureLoaded().then(() => this.partyCache.suppliers()),
          this.money.transactableAccounts(),
          this.catalogSearch.activeCatalog(),
          purchaseRequest,
          this.money.purchaseDrafts(),
          this.money.supplierVariantPerformance(),
          this.money.supplierPurchaseMetrics(),
        ]);
      const purchases = Array.isArray(purchaseResult) ? purchaseResult : purchaseResult.rows;
      this.accounts.set(accounts);
      // Purchases stock goods only (services are rejected server-side).
      this.variants.set(variants.filter(v => v.kind !== 'service'));
      this.purchases.set(purchases as PurchaseRow[]);
      this.purchaseHistoryTotal.set(
        Array.isArray(purchaseResult) ? purchases.length : purchaseResult.count
      );
      this.drafts.set(drafts);
      this.performance.set(performance);
      this.purchaseMetrics.set(metrics);
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
      if (!this.advanceAccount.value && accounts.length > 0)
        this.advanceAccount.setValue(accounts[0].code);
      if (!this.advanceReturnAccount.value && accounts.length > 0)
        this.advanceReturnAccount.setValue(accounts[0].code);
      const locations = this.locations();
      if (!this.purchaseLocation.value && locations.length > 0) {
        this.purchaseLocation.setValue(this.locationContext.activeId() ?? locations[0].id);
      }
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

  protected onPurchaseSearch(value: string): void {
    this.purchaseQuery.set(value);
    if (this.purchaseSearchTimer) clearTimeout(this.purchaseSearchTimer);
    this.purchaseSearchTimer = setTimeout(() => this.reloadPurchases(), 250);
  }

  protected setSupplierFilter(kind: 'status' | 'balance' | 'age', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (kind === 'status') this.supplierStatusFilter.set(value);
    else if (kind === 'balance') this.supplierBalanceFilter.set(value);
    else this.supplierAgeFilter.set(value);
    this.supplierPage.set(1);
  }

  protected supplierActiveFilterCount(): number {
    return (
      Number(this.supplierStatusFilter() !== 'all') +
      Number(this.supplierBalanceFilter() !== 'all') +
      Number(this.supplierAgeFilter() !== 'all')
    );
  }

  protected clearSupplierFilters(): void {
    this.supplierStatusFilter.set('all');
    this.supplierBalanceFilter.set('all');
    this.supplierAgeFilter.set('all');
    this.supplierPage.set(1);
  }

  protected purchaseActiveFilterCount(): number {
    return (
      Number(this.purchaseSupplierFilter() !== 'all') +
      Number(this.purchasePaymentFilter() !== 'all') +
      Number(!this.purchaseMonthActive())
    );
  }

  protected clearPurchaseFilters(): void {
    this.purchaseSupplierFilter.set('all');
    this.purchasePaymentFilter.set('all');
    this.purchaseLocationFilter.set(this.locationContext.requireActiveId());
    this.purchaseFrom.set(this.monthStartIso());
    this.purchaseTo.set(this.todayIso());
    this.reloadPurchases();
  }

  protected setPurchaseFilter(kind: 'location' | 'payment', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (kind === 'location') this.purchaseLocationFilter.set(value);
    else this.purchasePaymentFilter.set(value);
    this.reloadPurchases();
  }

  protected setPurchaseSupplierFilter(value: string): void {
    this.purchaseSupplierFilter.set(value);
    this.reloadPurchases();
  }

  protected setPurchaseDate(kind: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (kind === 'from') this.purchaseFrom.set(value);
    else this.purchaseTo.set(value);
    this.reloadPurchases();
  }

  protected setPurchaseMonth(): void {
    this.purchaseFrom.set(this.monthStartIso());
    this.purchaseTo.set(this.todayIso());
    this.reloadPurchases();
  }

  protected setPurchaseAllTime(): void {
    this.purchaseFrom.set('');
    this.purchaseTo.set('');
    this.reloadPurchases();
  }

  protected purchaseMonthActive(): boolean {
    return this.purchaseFrom() === this.monthStartIso() && this.purchaseTo() === this.todayIso();
  }

  protected purchaseAllTimeActive(): boolean {
    return !this.purchaseFrom() && !this.purchaseTo();
  }

  protected reloadPurchases(): void {
    this.purchasePage.set(1);
    void this.syncPurchaseUrl();
    void this.load();
  }

  protected changePurchasePage(page: number): void {
    this.purchasePage.set(page);
    void this.syncPurchaseUrl();
    void this.load();
  }

  private syncPurchaseUrl(): Promise<boolean> {
    if (!this.isPurchasePage()) return Promise.resolve(false);
    return this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: this.purchaseQuery().trim() || null,
        supplier: this.purchaseSupplierFilter() === 'all' ? null : this.purchaseSupplierFilter(),
        payment: this.purchasePaymentFilter() === 'all' ? null : this.purchasePaymentFilter(),
        range: this.purchaseAllTimeActive() ? 'all' : null,
        page: this.purchasePage() > 1 ? this.purchasePage() : null,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected changePurchasePageSize(size: number): void {
    this.purchasePageSize.set(size);
    this.reloadPurchases();
  }

  private purchasePageInput(): Parameters<MoneyService['purchasesPage']>[0] {
    const query = this.purchaseQuery().trim().toLowerCase();
    const matchingSupplierIds = query
      ? this.suppliers()
          .filter(supplier => this.name(supplier).toLowerCase().includes(query))
          .slice(0, SUPPLIER_SEARCH_ID_LIMIT)
          .map(supplier => supplier.id)
      : [];
    const sortBy = this.purchaseSort() === 'total' ? 'total_cost' : 'purchase_date';
    return {
      page: this.purchasePage(),
      pageSize: this.purchasePageSize(),
      search: query,
      matchingSupplierIds,
      supplierId:
        this.purchaseSupplierFilter() === 'all' ? undefined : this.purchaseSupplierFilter(),
      paymentStatus:
        this.purchasePaymentFilter() === 'all'
          ? undefined
          : (this.purchasePaymentFilter() as 'paid' | 'part_paid' | 'unpaid'),
      locationId: this.purchaseLocationFilter() || this.locationContext.requireActiveId(),
      from: this.purchaseFrom() || undefined,
      to: this.purchaseTo() || undefined,
      sortBy,
      sortDirection: this.purchaseSortDirection(),
    };
  }

  private todayIso(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }

  private monthStartIso(): string {
    const today = this.todayIso();
    return `${today.slice(0, 8)}01`;
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
    return (this.variantSearchResults() ?? this.variants()).slice(0, 50);
  }

  protected updateVariantQuery(value: string): void {
    this.variantQuery.set(value);
    const request = ++this.variantSearchRequest;
    const query = value.trim();
    if (!query) {
      this.variantSearchResults.set(null);
      return;
    }
    void this.catalogSearch.search(query, 50).then(result => {
      if (request !== this.variantSearchRequest) return;
      this.variantSearchResults.set(result.variants.filter(variant => variant.kind !== 'service'));
    });
  }

  protected openVariantPicker(index: number): void {
    this.variantQuery.set('');
    this.variantSearchResults.set(null);
    this.variantPickerFor.set(this.variantPickerFor() === index ? null : index);
  }

  protected chooseVariantForLine(line: PurchaseLineForm, index: number, variantId: string): void {
    const selected = this.variantSearchResults()?.find(variant => variant.variant_id === variantId);
    if (selected && !this.variants().some(variant => variant.variant_id === variantId)) {
      this.variants.update(variants => [...variants, selected]);
    }
    this.selectVariantForLine(line, variantId);
    this.variantPickerFor.set(null);
    this.variantQuery.set('');
    this.variantSearchResults.set(null);
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
    const metric = this.purchaseMetrics().find(row => row.supplier_id === supplierId);
    const rows = this.performance().filter(row => row.supplier_id === supplierId);
    const comparable = rows.filter(row => {
      const peers = this.performance().filter(peer => peer.variant_id === row.variant_id);
      if (peers.length < 2) return false;
      const best = Math.min(...peers.map(peer => peer.average_unit_cost ?? Infinity));
      return (row.average_unit_cost ?? Infinity) === best;
    });
    return {
      purchases: Number(metric?.purchase_count ?? 0),
      products: rows.length,
      averageOrder: Number(metric?.average_order ?? 0),
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
    this.drawerPurchaseExpenses.set([]);
    this.drawerPurchasePayments.set([]);
    this.purchaseDetailLoading.set(true);
    try {
      const [lines, expenses, payments] = await Promise.all([
        this.money.purchaseLines(purchase.id),
        this.money.purchaseExpenses(purchase.id),
        this.money.purchasePayments(purchase.id),
      ]);
      // Ignore stale results when the drawer was closed (or reopened) meanwhile.
      if (this.drawerPurchaseId() !== purchase.id) return;
      this.drawerPurchaseLines.set(lines);
      this.drawerPurchaseExpenses.set(expenses);
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
    this.drawerPurchaseExpenses.set([]);
    this.drawerPurchasePayments.set([]);
  }

  protected purchaseLineLabel(variantId: string): string {
    const variant = this.variants().find(v => v.variant_id === variantId);
    return variant ? this.label(variant) : 'Item';
  }

  protected purchaseLineManufacturer(variantId: string): string {
    return (
      this.variants().find(variant => variant.variant_id === variantId)?.manufacturer_name ??
      'Manufacturer not set'
    );
  }

  protected purchaseLineSku(variantId: string): string | null {
    return this.variants().find(variant => variant.variant_id === variantId)?.sku ?? null;
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
      await this.refreshPaymentSurfaces();
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
      const variant = this.variantFor(line);
      const canModifyCatalogPrices = this.perms.has('ManageStockAdjustments');
      const wholesalePrice = canModifyCatalogPrices
        ? parseKes(line.wholesalePrice)
        : (variant?.wholesale_price ?? 0);
      const retailPrice = canModifyCatalogPrices
        ? parseKes(line.retailPrice)
        : (variant?.price ?? 0);
      if (wholesalePrice === null || retailPrice === null || retailPrice < wholesalePrice) {
        this.error.set('Retail price must be valid and not lower than wholesale');
        return null;
      }
      const wholesaleChanged =
        canModifyCatalogPrices && wholesalePrice !== (variant?.wholesale_price ?? 0);
      const retailChanged = canModifyCatalogPrices && retailPrice !== (variant?.price ?? 0);
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
      const supplierId = this.paySupplierId.value;
      const supplierName = this.supplierName(supplierId);
      await this.money.paySupplier(supplierId, amount, this.payAccount.value);
      this.payAmount.setValue('');
      this.notice.set(`${this.fmt(amount)} payment recorded for ${supplierName}.`);
      await this.refreshPaymentSurfaces();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected supplierNetPosition(supplier: SupplierWithAp): string {
    if (!this.perms.has('ViewFinancials')) return 'Financials hidden';
    const net = supplier.ap_balance - this.supplierAdvanceBalance();
    if (net > 0) return `Net: we owe ${this.fmt(net)}`;
    if (net < 0) return `Net: ${this.fmt(-net)} remains with supplier`;
    return 'Net position settled';
  }

  protected async recordAdvance(supplierId: string): Promise<void> {
    try {
      await this.cashierSession.assertOpen('paying a supplier advance');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const amount = parseKes(this.advanceAmount.value);
    if (amount === null || amount <= 0) {
      this.error.set('Enter a valid advance amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.recordSupplierAdvance({
        supplierId,
        amount,
        accountCode: this.advanceAccount.value,
        reference: this.advanceReference.value.trim() || undefined,
        clientRef: (this.advanceClientRef ??= crypto.randomUUID()),
      });
      this.advanceClientRef = null;
      this.advanceAmount.setValue('');
      this.advanceReference.setValue('');
      this.notice.set('Supplier advance recorded');
      try {
        await this.refreshSupplierAdvance(supplierId);
      } catch {
        this.error.set('Supplier advance was recorded, but the balance could not refresh');
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not record advance');
    } finally {
      this.busy.set(false);
    }
  }

  protected async applyAdvanceToPurchase(purchase: PurchaseRow): Promise<void> {
    const amount = Math.min(this.supplierAdvanceBalance(), purchase.total_cost - purchase.paid);
    if (amount <= 0) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.advanceApplicationAttempt?.purchaseId !== purchase.id) {
        this.advanceApplicationAttempt = {
          purchaseId: purchase.id,
          clientRef: crypto.randomUUID(),
        };
      }
      await this.money.applySupplierAdvance(
        purchase.id,
        amount,
        this.advanceApplicationAttempt.clientRef
      );
      this.advanceApplicationAttempt = null;
      this.notice.set(`${this.fmt(amount)} supplier advance applied`);
      try {
        await this.refreshPaymentSurfaces();
      } catch {
        this.error.set('Supplier advance was applied, but purchase balances could not refresh');
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not apply supplier advance');
    } finally {
      this.busy.set(false);
    }
  }

  protected async recordAdvanceReturn(supplierId: string): Promise<void> {
    try {
      await this.cashierSession.assertOpen('recording a supplier advance return');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const amount = parseKes(this.advanceReturnAmount.value);
    const reason = this.advanceReturnReason.value.trim();
    if (amount === null || amount <= 0 || amount > this.supplierAdvanceBalance()) {
      this.error.set('Enter an amount within the available supplier advance');
      return;
    }
    if (!reason) {
      this.error.set('Enter a return reason');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.recordSupplierAdvanceReturn({
        supplierId,
        amount,
        accountCode: this.advanceReturnAccount.value,
        reason,
        reference: this.advanceReturnReference.value.trim() || undefined,
        clientRef: (this.advanceReturnClientRef ??= crypto.randomUUID()),
      });
      this.advanceReturnClientRef = null;
      this.advanceReturnAmount.setValue('');
      this.advanceReturnReason.setValue('');
      this.advanceReturnReference.setValue('');
      this.notice.set('Supplier advance return recorded');
      try {
        await this.refreshSupplierAdvance(supplierId);
      } catch {
        this.error.set('Supplier return was recorded, but the balance could not refresh');
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not record advance return');
    } finally {
      this.busy.set(false);
    }
  }

  private async refreshSupplierAdvance(supplierId: string): Promise<void> {
    const [balance, activity] = await Promise.all([
      this.money.supplierAdvanceAvailable(supplierId),
      this.perms.has('ViewFinancials')
        ? this.money.supplierAdvanceActivity(supplierId)
        : Promise.resolve([]),
    ]);
    if (this.drawerSupplierId() === supplierId) {
      this.supplierAdvanceBalance.set(balance);
      this.advanceActivity.set(activity);
    }
  }

  protected openSupplierDrawer(supplier: SupplierWithAp): void {
    this.drawerSupplierId.set(supplier.id);
    this.payPurchaseId.set(null);
    this.paySupplierId.setValue(supplier.id);
    this.payAmount.setValue('');
    this.supplierCreditLimit.setValue(formatKesInput(supplier.supplier_credit_limit));
    this.supplierTermsDays.setValue(supplier.supplier_credit_terms_days ?? 0);
    this.drawerPurchases.set([]);
    this.supplierAdvanceBalance.set(0);
    this.advanceActivity.set([]);
    this.advanceAmount.setValue('');
    this.advanceReference.setValue('');
    this.advanceReturnReference.setValue('');
    this.advanceClientRef = null;
    this.advanceApplicationAttempt = null;
    this.advanceReturnClientRef = null;
    void this.loadDrawerPurchases(supplier.id);
    if (this.perms.has('ManageSupplierCreditPurchases') || this.perms.has('ViewFinancials')) {
      void this.refreshSupplierAdvance(supplier.id).catch(error => {
        this.error.set(error instanceof Error ? error.message : 'Could not load supplier advance');
      });
    }
  }

  private async loadDrawerPurchases(supplierId: string): Promise<void> {
    const sequence = ++this.drawerPurchasesSequence;
    this.drawerPurchasesLoading.set(true);
    await this.money
      .purchasesPage({
        page: 1,
        pageSize: 10,
        supplierId,
        allLocations: true,
        sortBy: 'purchase_date',
        sortDirection: 'desc',
      })
      .then(result => {
        if (sequence === this.drawerPurchasesSequence && this.drawerSupplierId() === supplierId) {
          this.drawerPurchases.set(result.rows as PurchaseRow[]);
        }
      })
      .catch(err => {
        if (sequence === this.drawerPurchasesSequence && this.drawerSupplierId() === supplierId) {
          this.error.set(err instanceof Error ? err.message : 'Could not load supplier purchases');
        }
      })
      .finally(() => {
        if (sequence === this.drawerPurchasesSequence && this.drawerSupplierId() === supplierId) {
          this.drawerPurchasesLoading.set(false);
        }
      });
  }

  /** Refresh failures must never make a committed payment look unsuccessful. */
  private async refreshPaymentSurfaces(): Promise<void> {
    await this.load();
    const openPurchaseId = this.drawerPurchaseId();
    const openSupplierId = this.drawerSupplierId();
    const refreshes: Promise<unknown>[] = [];
    if (openPurchaseId) {
      refreshes.push(
        this.money.purchasePayments(openPurchaseId).then(payments => {
          if (this.drawerPurchaseId() === openPurchaseId) this.drawerPurchasePayments.set(payments);
        })
      );
    }
    if (openSupplierId) refreshes.push(this.loadDrawerPurchases(openSupplierId));
    if (openSupplierId) refreshes.push(this.refreshSupplierAdvance(openSupplierId));
    const results = await Promise.allSettled(refreshes);
    if (results.some(result => result.status === 'rejected')) {
      this.error.set(
        'Payment was recorded, but the latest payment details could not be refreshed.'
      );
    }
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeSupplierDrawer(): void {
    this.drawerPurchasesSequence++;
    this.drawerSupplierId.set(null);
    this.payPurchaseId.set(null);
    this.supplierAdvanceBalance.set(0);
    this.advanceActivity.set([]);
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
