import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import type {
  PurchasePriceBasis,
  PurchaseTaxContext,
  PurchaseTaxEstimate,
} from '@dukarun/tax-types';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogSearchService } from '../core/catalog-search.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { LocationContextService } from '../core/location-context.service';
import { runIndependentLoads } from '../core/independent-load';
import {
  LedgerAccount,
  MoneyService,
  PurchaseDraft,
  PurchaseExpenseInput,
  PurchaseLineInput,
  SupplierVariantPerformance,
} from '../money/money.service';
import { Variant, variantLabel } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import {
  PurchaseLineRowComponent,
  type PurchaseLineDetailField,
  type PurchaseLineForm,
  type PurchaseLinePriceContext,
} from './purchase-line-row.component';

type PaymentMode = 'paid' | 'partial' | 'later';
type ExpenseSettlement = '' | 'supplier_bill' | 'separate';

interface ExpenseForm {
  key: number;
  category: string;
  customCategory: string;
  memo: string;
  amount: string;
  settlement: ExpenseSettlement;
  accountCode: string;
  error: string | null;
  grossAmountOverride?: number;
}

interface EnteredTaxBreakdown {
  entered: number;
  gross: number;
  net: number;
  tax: number;
  rateBps: number;
}

@Component({
  selector: 'app-purchase-editor',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    SessionRequiredNoticeComponent,
    SearchableFilterComponent,
    PurchaseLineRowComponent,
  ],
  template: `
    <app-page
      [title]="draftId() ? 'Continue purchase' : 'Record purchase'"
      subtitle="Receive stock, match the supplier invoice, and post the books in one transaction."
      backLink="/purchases"
      [wide]="true"
    >
      @if (loading()) {
        <div class="flex min-h-64 items-center justify-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else {
        @if (error()) {
          <div class="alert alert-error mb-4 text-sm" role="alert">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ error() }}</span>
          </div>
        }
        @if (notice()) {
          <div class="alert alert-success mb-4 text-sm" role="status">
            <app-icon name="heroCheckCircle" />
            <span>{{ notice() }}</span>
          </div>
        }

        <nav class="mb-6 max-w-lg" aria-label="Purchase progress">
          <ol class="flex items-center">
            <li class="flex shrink-0 items-center gap-2">
              <span
                class="flex size-6 items-center justify-center rounded-full border text-xs font-semibold"
                [class.border-primary]="stage() === 'build'"
                [class.bg-primary]="stage() === 'build'"
                [class.text-primary-content]="stage() === 'build'"
                [class.border-base-content/30]="stage() === 'review'"
                [class.bg-base-content/10]="stage() === 'review'"
              >
                @if (stage() === 'review') {
                  <app-icon name="heroCheck" size="sm" />
                } @else {
                  1
                }
              </span>
              <span
                class="text-sm"
                [class.font-semibold]="stage() === 'build'"
                [class.text-base-content/60]="stage() === 'review'"
                >Build purchase</span
              >
            </li>
            <li
              class="mx-3 h-px min-w-8 flex-1 bg-base-300"
              [class.bg-base-content/30]="stage() === 'review'"
              aria-hidden="true"
            ></li>
            <li class="flex shrink-0 items-center gap-2">
              <span
                class="flex size-6 items-center justify-center rounded-full border text-xs font-semibold"
                [class.border-primary]="stage() === 'review'"
                [class.bg-primary]="stage() === 'review'"
                [class.text-primary-content]="stage() === 'review'"
                [class.border-base-300]="stage() === 'build'"
                [class.text-base-content/60]="stage() === 'build'"
                >2</span
              >
              <span
                class="text-sm"
                [class.font-semibold]="stage() === 'review'"
                [class.text-base-content/60]="stage() === 'build'"
                >Review and pay</span
              >
            </li>
          </ol>
        </nav>

        @if (stage() === 'build') {
          <div class="grid items-start gap-6 lg:grid-cols-12">
            <div class="min-w-0 space-y-6 lg:col-span-9">
              <section class="card bg-base-100">
                <div class="card-body gap-4 p-4">
                  <div
                    class="grid gap-3 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(14rem,1fr)_minmax(12rem,.9fr)_minmax(13rem,.9fr)_minmax(10rem,.55fr)]"
                  >
                    <app-form-field label="Supplier" [required]="true">
                      <app-searchable-filter
                        data-supplier-picker
                        ariaLabel="Choose supplier"
                        placeholder="Choose supplier"
                        searchPlaceholder="Search suppliers by name, phone, or email…"
                        controlSize="md"
                        [options]="supplierOptions()"
                        [value]="supplier.value"
                        (valueChange)="onSupplierChange($event)"
                      />
                    </app-form-field>
                    <app-form-field label="Receive into" [required]="true">
                      <select
                        data-location-picker
                        class="select select-bordered h-12 w-full"
                        [formControl]="location"
                        (change)="markDirty()"
                      >
                        @for (item of locations(); track item.id) {
                          <option [value]="item.id">{{ item.name }}</option>
                        }
                      </select>
                    </app-form-field>
                    <app-form-field
                      [label]="claimInputVat.value ? 'VAT invoice number' : 'Invoice / reference'"
                      [required]="claimInputVat.value"
                    >
                      <input
                        class="input input-bordered h-12 w-full"
                        [placeholder]="claimInputVat.value ? 'Required for input VAT' : 'Optional'"
                        [formControl]="reference"
                        (input)="markDirty()"
                      />
                    </app-form-field>
                    <app-form-field label="Purchase info">
                      <button
                        type="button"
                        class="flex h-12 w-full items-center gap-2 rounded-field border border-base-300 bg-base-200/30 px-3 text-left transition-colors hover:bg-base-200/60 focus-visible:outline-2 focus-visible:outline-primary"
                        title="Change the purchase date or add delivery notes"
                        [attr.aria-expanded]="invoiceDetailsExpanded()"
                        aria-controls="purchase-invoice-details"
                        (click)="invoiceDetailsExpanded.update(value => !value)"
                      >
                        <span class="type-caption min-w-0 flex-1 truncate text-base-content/70">
                          {{ purchaseInfoSummary() }}
                        </span>
                        <app-icon
                          [name]="invoiceDetailsExpanded() ? 'heroChevronUp' : 'heroChevronDown'"
                          class="shrink-0 text-base-content/50"
                        />
                      </button>
                    </app-form-field>
                  </div>
                  @if (invoiceDetailsExpanded()) {
                    <div
                      id="purchase-invoice-details"
                      class="grid gap-3 border-t border-base-300 pt-3 md:grid-cols-2"
                    >
                      <app-form-field label="Purchase date">
                        <input
                          type="date"
                          class="input input-bordered h-11 w-full md:h-10"
                          [formControl]="purchaseDate"
                          (change)="onPurchaseDateChange()"
                        />
                      </app-form-field>
                      <app-form-field label="Notes">
                        <input
                          class="input input-bordered h-11 w-full md:h-10"
                          placeholder="Delivery notes…"
                          [formControl]="notes"
                          (input)="markDirty()"
                        />
                      </app-form-field>
                    </div>
                  }
                </div>
              </section>

              <section class="card bg-base-100" data-purchase-input-vat>
                <div class="card-body gap-4 p-4">
                  <label class="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-primary mt-0.5"
                      [checked]="claimInputVat.value"
                      (change)="setClaimInputVat($any($event.target).checked)"
                    />
                    <span>
                      <span class="block text-sm font-semibold"
                        >Claim input VAT from this invoice</span
                      >
                      <span class="type-caption mt-1 block">
                        Claiming VAT changes how the cost is posted, not what the supplier is paid.
                      </span>
                    </span>
                  </label>

                  @if (claimInputVat.value) {
                    <div class="grid gap-4 border-t border-base-300 pt-4 md:grid-cols-2">
                      <app-form-field
                        label="Supplier tax PIN"
                        [required]="true"
                        hint="Saved to this supplier and snapshotted on the completed purchase."
                        [error]="supplierPinError()"
                      >
                        <div class="flex gap-2">
                          <input
                            data-supplier-tax-pin
                            class="input input-bordered h-11 min-w-0 flex-1"
                            placeholder="e.g. P000000000A"
                            [formControl]="supplierTaxPin"
                            (input)="onSupplierPinInput()"
                          />
                          <button
                            appButton
                            variant="outline"
                            size="sm"
                            type="button"
                            [loading]="supplierPinSaving()"
                            [disabled]="supplierPinSaved() || !supplierTaxPin.value.trim()"
                            (click)="saveSupplierPin()"
                          >
                            {{ supplierPinSaved() ? 'Saved' : 'Save PIN' }}
                          </button>
                        </div>
                      </app-form-field>
                      <app-form-field
                        label="Tax invoice date"
                        [required]="true"
                        hint="This is the VAT tax point and may differ from the stock receipt date."
                      >
                        <input
                          data-tax-invoice-date
                          type="date"
                          class="input input-bordered h-11 w-full"
                          [formControl]="taxInvoiceDate"
                          (change)="onTaxInvoiceDateChange()"
                        />
                      </app-form-field>
                    </div>

                    <div class="rounded-field border border-base-300 bg-base-200/30 p-3">
                      @if (taxContextLoading()) {
                        <div class="flex items-center gap-2 text-sm text-base-content/70">
                          <span class="loading loading-spinner loading-sm"></span>
                          Calculating VAT from the configured product rates…
                        </div>
                      } @else if (taxContextError()) {
                        <div class="flex items-start gap-2 text-sm text-error" role="alert">
                          <app-icon name="heroExclamationTriangle" />
                          <span>{{ taxContextError() }}</span>
                        </div>
                      } @else if (lines().length > 0) {
                        <div class="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p class="type-caption">Gross supplier invoice</p>
                            <p class="font-semibold">
                              <app-money [amount]="invoiceTotal()" />
                            </p>
                          </div>
                          <div>
                            <p class="type-caption">Net inventory and expense cost</p>
                            <p class="font-semibold"><app-money [amount]="invoiceNetTotal()" /></p>
                          </div>
                          <div>
                            <p class="type-caption">Recoverable input VAT</p>
                            <p class="font-semibold text-success">
                              <app-money [amount]="invoiceTaxTotal()" />
                            </p>
                          </div>
                        </div>
                      } @else {
                        <p class="type-caption">
                          Add valid items to see the VAT extracted from this supplier invoice.
                        </p>
                      }
                    </div>
                    <p class="type-caption">
                      Expenses included in the supplier bill share this invoice's VAT treatment.
                      Separately paid expenses remain outside this claim.
                    </p>
                  }
                </div>
              </section>

              <section class="card overflow-visible bg-base-100">
                <div class="card-body gap-4 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 class="section-title">Items</h2>
                      <p class="type-caption mt-1">
                        Search or scan once to add an item. Unit cost and line total are both
                        editable.
                      </p>
                    </div>
                    @if (taxContext()?.tax_configured || priceEntryBasis() === 'exclusive') {
                      <div data-purchase-price-basis>
                        <p class="mb-1 text-xs font-medium">Supplier prices</p>
                        <div class="join" role="group" aria-label="Supplier price VAT basis">
                          <button
                            type="button"
                            class="btn btn-sm join-item"
                            [class.btn-primary]="priceEntryBasis() === 'inclusive'"
                            [class.btn-outline]="priceEntryBasis() !== 'inclusive'"
                            (click)="setPriceEntryBasis('inclusive')"
                          >
                            Include VAT
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm join-item"
                            [class.btn-primary]="priceEntryBasis() === 'exclusive'"
                            [class.btn-outline]="priceEntryBasis() !== 'exclusive'"
                            (click)="setPriceEntryBasis('exclusive')"
                          >
                            Exclude VAT
                          </button>
                        </div>
                        <p class="type-caption mt-1 max-w-xs">
                          This changes price entry only. The VAT claim is controlled separately.
                        </p>
                      </div>
                    }
                  </div>
                  @if (
                    taxContextError() && (priceEntryBasis() === 'exclusive' || claimInputVat.value)
                  ) {
                    <div class="alert alert-error py-2 text-sm" role="alert">
                      <app-icon name="heroExclamationTriangle" />
                      <span>{{ taxContextError() }}</span>
                    </div>
                  }
                  <div class="sticky top-16 z-30 bg-base-100 py-1">
                    <div class="relative">
                      <span
                        class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50"
                      >
                        <app-icon name="heroMagnifyingGlass" />
                      </span>
                      <input
                        type="search"
                        class="input input-bordered h-12 w-full pl-9"
                        placeholder="Scan barcode or search product, manufacturer, or SKU…"
                        [value]="productQuery()"
                        (input)="searchProducts($any($event.target).value)"
                        (keydown.enter)="$event.preventDefault(); addFirstSearchResult()"
                      />
                      @if (productQuery().trim()) {
                        <div
                          class="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-overlay"
                        >
                          @for (variant of searchResults(); track variant.variant_id) {
                            <button
                              type="button"
                              class="flex min-h-12 w-full items-center justify-between gap-3 rounded-field px-3 py-2 text-left hover:bg-base-200"
                              (click)="addVariant(variant)"
                            >
                              <span class="min-w-0">
                                <span class="block truncate text-sm font-medium">{{
                                  label(variant)
                                }}</span>
                                <span class="type-caption block truncate"
                                  >{{ variant.manufacturer_name || 'Manufacturer not set' }} ·
                                  {{ variant.sku
                                  }}{{ variant.barcode ? ' · ' + variant.barcode : '' }}</span
                                >
                              </span>
                              <span class="type-caption shrink-0"
                                >{{ variant.stock ?? 0 }} in stock</span
                              >
                            </button>
                          } @empty {
                            <p class="p-3 text-sm text-base-content/60">
                              No matching stock products.
                            </p>
                          }
                        </div>
                      }
                    </div>
                  </div>

                  @if (lines().length === 0) {
                    <div class="rounded-box border border-dashed border-base-300 p-6 text-center">
                      <p class="text-sm font-medium">No items added</p>
                      <p class="type-caption mt-1">
                        Use the search above to begin matching the supplier invoice.
                      </p>
                    </div>
                  }

                  @if (lines().length > 0) {
                    <div class="divide-y divide-base-300 border-y border-base-300">
                      <div
                        class="hidden grid-cols-[minmax(14rem,1fr)_7rem_10rem_10rem_3rem] items-center gap-3 border-b border-base-300 bg-base-200/30 px-3 py-2 xl:grid"
                        aria-hidden="true"
                      >
                        <span class="type-caption">Item</span>
                        <span class="type-caption text-right">Quantity</span>
                        <span class="type-caption text-right">{{
                          priceEntryBasis() === 'exclusive' ? 'Unit cost before VAT' : 'Unit cost'
                        }}</span>
                        <span class="type-caption text-right">{{
                          priceEntryBasis() === 'exclusive' ? 'Line total before VAT' : 'Line total'
                        }}</span>
                        <span class="sr-only">Actions</span>
                      </div>
                      @for (line of lines(); track line.key; let index = $index) {
                        <app-purchase-line-row
                          [line]="line"
                          [variant]="lineVariant(line)"
                          [label]="lineLabel(line)"
                          [priceContext]="linePriceContext(line)"
                          [priceBasis]="priceEntryBasis()"
                          [canEditPrices]="perms.has('ManageStockAdjustments')"
                          [trackExpiry]="preferences.batchExpiryEnabled()"
                          (quantityChange)="quantityChanged(line, $event)"
                          (unitCostChange)="unitCostChanged(line, $event)"
                          (lineTotalChange)="lineTotalChanged(line, $event)"
                          (detailChange)="updateLineDetail(line, $event.field, $event.value)"
                          (expandedChange)="setLineExpanded(line, $event)"
                          (remove)="removeLine(index)"
                        />
                      }
                    </div>
                  }
                </div>
              </section>

              <section class="card bg-base-100">
                <div class="card-body gap-4 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h2 class="section-title">Additional expenses</h2>
                      <p class="type-caption mt-1">
                        Transport, loading, packaging, duty, or another cost associated with this
                        purchase.
                      </p>
                    </div>
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      type="button"
                      (click)="addExpense()"
                    >
                      <app-icon name="heroPlus" /> Add expense
                    </button>
                  </div>
                  @if (expenses().length > 0) {
                    <div class="divide-y divide-base-300 border-y border-base-300">
                      @for (expense of expenses(); track expense.key; let index = $index) {
                        <article
                          class="overflow-visible bg-base-100"
                          [attr.data-expense-key]="expense.key"
                        >
                          <div
                            class="flex items-center justify-between gap-3 bg-base-200/30 px-3 py-2"
                          >
                            <div class="min-w-0">
                              <h3 class="truncate text-sm font-semibold">
                                Expense {{ index + 1 }}
                              </h3>
                              <p class="type-caption truncate">
                                {{ expenseCategoryLabel(expense) }}
                              </p>
                            </div>
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              [iconOnly]="true"
                              type="button"
                              title="Remove expense"
                              [attr.aria-label]="'Remove expense ' + (index + 1)"
                              (click)="removeExpense(index)"
                            >
                              <app-icon name="heroXMark" />
                            </button>
                          </div>

                          <div
                            class="grid gap-x-4 gap-y-3 border-t border-base-300 p-3 md:grid-cols-2 xl:grid-cols-4"
                          >
                            <app-form-field label="Category">
                              <select
                                class="select select-bordered h-11 w-full md:h-10"
                                [(ngModel)]="expense.category"
                                [ngModelOptions]="{ standalone: true }"
                                (change)="markDirty()"
                              >
                                <option value="transport">Transport</option>
                                <option value="loading">Loading</option>
                                <option value="packaging">Packaging</option>
                                <option value="duty">Duty</option>
                                <option value="other">Other</option>
                              </select>
                            </app-form-field>
                            @if (expense.category === 'other') {
                              <app-form-field label="Expense name" [required]="true">
                                <input
                                  class="input input-bordered h-11 w-full md:h-10"
                                  placeholder="e.g. Port handling"
                                  [(ngModel)]="expense.customCategory"
                                  [ngModelOptions]="{ standalone: true }"
                                  (input)="markDirty()"
                                />
                              </app-form-field>
                            }
                            <app-form-field
                              [label]="
                                priceEntryBasis() === 'exclusive' &&
                                expense.settlement === 'supplier_bill'
                                  ? 'Amount before VAT'
                                  : 'Amount (KES)'
                              "
                              [required]="true"
                            >
                              <input
                                class="input input-bordered h-11 w-full text-right md:h-10"
                                inputmode="numeric"
                                placeholder="0"
                                [(ngModel)]="expense.amount"
                                [ngModelOptions]="{ standalone: true }"
                                (input)="expenseAmountChanged(expense)"
                              />
                            </app-form-field>
                            <app-form-field
                              label="Settlement"
                              [required]="true"
                              [hint]="expenseSettlementHint(expense.settlement)"
                            >
                              <select
                                class="select select-bordered h-11 w-full md:h-10"
                                [ngModel]="expense.settlement"
                                [ngModelOptions]="{ standalone: true }"
                                (ngModelChange)="setExpenseSettlement(expense, $event)"
                              >
                                <option value="" disabled>Choose settlement</option>
                                <option value="supplier_bill">Included in supplier bill</option>
                                @if (perms.has('CreateInterAccountTransfer')) {
                                  <option value="separate">Paid separately</option>
                                }
                              </select>
                            </app-form-field>
                            @if (expense.settlement === 'separate') {
                              <app-form-field
                                label="Paid from"
                                [required]="true"
                                class="xl:col-span-2"
                                [error]="
                                  accountOptions().length === 0
                                    ? accountsError() ||
                                      'No cash, bank, or M-Pesa account is configured.'
                                    : null
                                "
                              >
                                <app-searchable-filter
                                  data-expense-account-picker
                                  ariaLabel="Choose account used for this expense"
                                  placeholder="Choose cash, bank, or M-Pesa account"
                                  searchPlaceholder="Search accounts by name or code…"
                                  controlSize="md"
                                  [options]="accountOptions()"
                                  [value]="expense.accountCode"
                                  (valueChange)="expense.accountCode = $event; markDirty()"
                                />
                              </app-form-field>
                              <app-form-field label="Memo" class="xl:col-span-2">
                                <input
                                  class="input input-bordered h-11 w-full md:h-10"
                                  placeholder="Optional note about this charge"
                                  [(ngModel)]="expense.memo"
                                  [ngModelOptions]="{ standalone: true }"
                                  (input)="markDirty()"
                                />
                              </app-form-field>
                            } @else {
                              <app-form-field label="Memo" class="md:col-span-2 xl:col-span-4">
                                <input
                                  class="input input-bordered h-11 w-full md:h-10"
                                  placeholder="Optional note about this charge"
                                  [(ngModel)]="expense.memo"
                                  [ngModelOptions]="{ standalone: true }"
                                  (input)="markDirty()"
                                />
                              </app-form-field>
                            }
                            @if (expense.error) {
                              <p
                                class="text-sm text-error md:col-span-2 xl:col-span-4"
                                role="alert"
                              >
                                {{ expense.error }}
                              </p>
                            }
                          </div>
                        </article>
                      }
                    </div>
                  }
                </div>
              </section>
            </div>

            <aside class="card bg-base-100 lg:sticky lg:top-20 lg:col-span-3">
              <div class="card-body gap-3 p-4">
                <h2 class="section-title">Purchase summary</h2>
                <div class="flex justify-between text-sm">
                  <span>Items</span><strong>{{ lines().length }}</strong>
                </div>
                <div class="flex justify-between text-sm">
                  <span>{{ priceEntryBasis() === 'exclusive' ? 'Goods before VAT' : 'Goods' }}</span
                  ><app-money
                    [amount]="
                      priceEntryBasis() === 'exclusive' ? enteredGoodsSubtotal() : goodsSubtotal()
                    "
                  />
                </div>
                <div class="flex justify-between text-sm">
                  <span>{{
                    priceEntryBasis() === 'exclusive'
                      ? 'Supplier expenses before VAT'
                      : 'Supplier expenses'
                  }}</span
                  ><app-money
                    [amount]="
                      priceEntryBasis() === 'exclusive'
                        ? enteredSupplierExpenseTotal()
                        : supplierExpenseTotal()
                    "
                  />
                </div>
                @if (priceEntryBasis() === 'exclusive') {
                  <div class="flex justify-between text-sm">
                    <span>VAT on supplier invoice</span><app-money [amount]="invoiceTaxTotal()" />
                  </div>
                }
                <div class="flex justify-between border-t border-base-300 pt-3">
                  <strong>Invoice total</strong
                  ><strong><app-money [amount]="invoiceTotal()" /></strong>
                </div>
                @if (claimInputVat.value && invoiceTaxTotal() > 0) {
                  <div class="flex justify-between text-sm">
                    <span>Net cost</span><app-money [amount]="invoiceNetTotal()" />
                  </div>
                  <div class="flex justify-between text-sm text-success">
                    <span>Input VAT</span><app-money [amount]="invoiceTaxTotal()" />
                  </div>
                } @else if (priceEntryBasis() === 'exclusive' && invoiceTaxTotal() > 0) {
                  <p class="type-caption">VAT will be included in inventory and expense cost.</p>
                }
                @if (separateExpenseTotal() > 0) {
                  <div class="flex justify-between text-sm">
                    <span>Paid separately</span><app-money [amount]="separateExpenseTotal()" />
                  </div>
                }
                <button
                  appButton
                  type="button"
                  class="mt-2 w-full"
                  (click)="goToReview()"
                  [disabled]="lines().length === 0"
                >
                  Review purchase
                </button>
                <button
                  appButton
                  variant="outline"
                  type="button"
                  class="w-full"
                  [loading]="savingDraft()"
                  (click)="saveDraft()"
                >
                  Save draft
                </button>
                <a appButton variant="ghost" routerLink="/purchases" (click)="allowExit()"
                  >Cancel</a
                >
              </div>
            </aside>
          </div>
        } @else {
          <div class="grid items-start gap-6 lg:grid-cols-12">
            <section class="card bg-base-100 lg:col-span-9">
              <div class="card-body gap-5 p-4 md:p-5">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="section-title">Payment</h2>
                    <p class="type-caption mt-1">How is the supplier invoice being settled?</p>
                  </div>
                  <button appButton variant="ghost" type="button" (click)="stage.set('build')">
                    Edit purchase
                  </button>
                </div>
                <div class="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    class="min-h-14 rounded-field border px-3 text-left"
                    [class.border-primary]="paymentMode.value === 'paid'"
                    (click)="setPaymentMode('paid')"
                  >
                    <strong class="block text-sm">Paid now</strong
                    ><span class="type-caption">Full supplier invoice</span>
                  </button>
                  @if (perms.has('ManageSupplierCreditPurchases')) {
                    <button
                      type="button"
                      class="min-h-14 rounded-field border px-3 text-left"
                      [class.border-primary]="paymentMode.value === 'partial'"
                      (click)="setPaymentMode('partial')"
                    >
                      <strong class="block text-sm">Part-paid</strong
                      ><span class="type-caption">Pay some, owe the rest</span>
                    </button>
                    <button
                      type="button"
                      class="min-h-14 rounded-field border px-3 text-left"
                      [class.border-warning]="paymentMode.value === 'later'"
                      (click)="setPaymentMode('later')"
                    >
                      <strong class="block text-sm">Pay later</strong
                      ><span class="type-caption">Supplier credit</span>
                    </button>
                  }
                </div>
                @if (supplierAdvanceAvailable() > 0 && perms.has('ManageSupplierCreditPurchases')) {
                  <div class="rounded-field border border-info/30 bg-info/5 p-3">
                    <div class="flex items-center justify-between gap-2">
                      <div>
                        <p class="type-heading">Advance with supplier</p>
                        <p class="type-caption">Explicitly choose how much to apply.</p>
                      </div>
                      <app-money [amount]="supplierAdvanceAvailable()" />
                    </div>
                    <app-form-field
                      class="mt-2 block"
                      label="Use advance (KES)"
                      [error]="advanceAmountError()"
                    >
                      <input
                        class="input input-bordered w-full text-right"
                        inputmode="numeric"
                        [formControl]="advanceAmount"
                        (input)="markDirty()"
                      />
                    </app-form-field>
                    <button
                      appButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      class="mt-2"
                      (click)="useSuggestedAdvance()"
                    >
                      Use suggested <app-money [amount]="suggestedAdvance()" />
                    </button>
                  </div>
                }
                @if (paymentMode.value === 'partial') {
                  <app-form-field label="Amount paid now" [error]="partialPaymentError()">
                    <input
                      class="input input-bordered w-full text-right"
                      inputmode="numeric"
                      [formControl]="partialAmount"
                      (input)="markDirty()"
                    />
                  </app-form-field>
                }
                @if (paymentMode.value !== 'later') {
                  <app-form-field
                    label="Paid from"
                    [required]="true"
                    [error]="
                      accountOptions().length === 0
                        ? accountsError() || 'No cash, bank, or M-Pesa account is configured.'
                        : null
                    "
                  >
                    <app-searchable-filter
                      data-purchase-account-picker
                      ariaLabel="Choose account used to pay the supplier"
                      placeholder="Choose cash, bank, or M-Pesa account"
                      searchPlaceholder="Search accounts by name or code…"
                      controlSize="md"
                      [options]="accountOptions()"
                      [value]="account.value"
                      (valueChange)="account.setValue($event); markDirty()"
                    />
                  </app-form-field>
                }
                @if (requiresSession() && !cashierSession.canTakePayment()) {
                  <app-session-required-notice action="recording this purchase" />
                }
                @if (creditExceeded()) {
                  <div class="alert alert-error text-sm">
                    <app-icon name="heroExclamationTriangle" /><span
                      >This purchase would exceed the supplier's available credit.</span
                    >
                  </div>
                }
              </div>
            </section>
            <aside class="card bg-base-100 lg:sticky lg:top-20 lg:col-span-3">
              <div class="card-body gap-3 p-4">
                <h2 class="section-title">Review</h2>
                <div class="flex justify-between text-sm">
                  <span>{{
                    priceEntryBasis() === 'exclusive' ? 'Merchandise before VAT' : 'Merchandise'
                  }}</span
                  ><app-money
                    [amount]="
                      priceEntryBasis() === 'exclusive' ? enteredGoodsSubtotal() : goodsSubtotal()
                    "
                  />
                </div>
                <div class="flex justify-between text-sm">
                  <span>{{
                    priceEntryBasis() === 'exclusive'
                      ? 'Supplier expenses before VAT'
                      : 'Supplier-bill expenses'
                  }}</span
                  ><app-money
                    [amount]="
                      priceEntryBasis() === 'exclusive'
                        ? enteredSupplierExpenseTotal()
                        : supplierExpenseTotal()
                    "
                  />
                </div>
                @if (priceEntryBasis() === 'exclusive') {
                  <div class="flex justify-between text-sm">
                    <span>VAT on supplier invoice</span><app-money [amount]="invoiceTaxTotal()" />
                  </div>
                }
                <div class="flex justify-between border-t border-base-300 pt-3">
                  <strong>Supplier invoice</strong
                  ><strong><app-money [amount]="invoiceTotal()" /></strong>
                </div>
                @if (claimInputVat.value && taxEstimate(); as estimate) {
                  <div class="flex justify-between text-sm">
                    <span>Net inventory and expense cost</span
                    ><app-money [amount]="estimate.net_total" />
                  </div>
                  <div class="flex justify-between text-sm text-success">
                    <span>Recoverable input VAT</span><app-money [amount]="estimate.tax_total" />
                  </div>
                } @else if (priceEntryBasis() === 'exclusive' && invoiceTaxTotal() > 0) {
                  <p class="type-caption">VAT is included in inventory and expense cost.</p>
                }
                <div class="flex justify-between text-sm">
                  <span>Separately paid expenses</span
                  ><app-money [amount]="separateExpenseTotal()" />
                </div>
                <div class="flex justify-between text-sm">
                  <span>Initial supplier payment</span><app-money [amount]="initialPayment()" />
                </div>
                <div class="flex justify-between text-sm">
                  <span>Advance applied</span><app-money [amount]="advanceUsed()" />
                </div>
                <div class="flex justify-between text-sm">
                  <span>Cash leaving now</span
                  ><strong><app-money [amount]="cashLeavingNow()" /></strong>
                </div>
                <div class="flex justify-between text-sm">
                  <span>Remaining supplier balance</span
                  ><strong><app-money [amount]="balanceDue()" /></strong>
                </div>
                <button
                  appButton
                  type="button"
                  class="mt-2 w-full"
                  [loading]="busy()"
                  [disabled]="!canConfirm()"
                  (click)="confirmPurchase()"
                >
                  {{ draftId() ? 'Confirm draft purchase' : 'Confirm purchase' }}
                </button>
                <button
                  appButton
                  variant="outline"
                  type="button"
                  class="w-full"
                  [loading]="savingDraft()"
                  (click)="saveDraft()"
                >
                  Save draft
                </button>
              </div>
            </aside>
          </div>
        }

        @if (stage() === 'build') {
          <div
            class="fixed inset-x-0 bottom-0 z-30 border-t border-base-300 bg-base-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
          >
            <div class="mx-auto flex max-w-lg items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="type-caption">{{ lines().length }} item(s)</p>
                <p class="font-semibold"><app-money [amount]="invoiceTotal()" /></p>
              </div>
              <button
                appButton
                type="button"
                (click)="goToReview()"
                [disabled]="lines().length === 0"
              >
                Review
              </button>
            </div>
          </div>
        }
      }
    </app-page>
  `,
})
export class PurchaseEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly money = inject(MoneyService);
  private readonly catalog = inject(CatalogSearchService);
  private readonly parties = inject(PartyCacheService);
  private readonly locationContext = inject(LocationContextService);
  protected readonly perms = inject(PermissionsService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly preferences = inject(CompanyPreferencesService);

  protected readonly suppliers = computed(() =>
    this.parties.suppliers().filter(item => item.supplier_active)
  );
  protected readonly supplierOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.suppliers().map(item => {
      const contact = [item.phone, item.email].filter(Boolean).join(' · ');
      return {
        value: item.id,
        label: this.supplierName(item),
        ...(contact ? { description: contact } : {}),
      };
    })
  );
  protected readonly locations = this.locationContext.locations;
  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly accountOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.accounts().map(item => ({
      value: item.code,
      label: item.name,
      description: item.code,
      searchText: `${item.code} ${item.name}`,
    }))
  );
  protected readonly variants = signal<Variant[]>([]);
  protected readonly performance = signal<SupplierVariantPerformance[]>([]);
  protected readonly lines = signal<PurchaseLineForm[]>([]);
  protected readonly expenses = signal<ExpenseForm[]>([]);
  protected readonly searchResults = signal<Variant[]>([]);
  protected readonly productQuery = signal('');
  protected readonly stage = signal<'build' | 'review'>('build');
  protected readonly invoiceDetailsExpanded = signal(false);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly savingDraft = signal(false);
  protected readonly dirty = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly accountsError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly draftId = signal<string | null>(null);
  protected readonly taxEstimate = signal<PurchaseTaxEstimate | null>(null);
  protected readonly taxEstimateLoading = signal(false);
  protected readonly taxEstimateError = signal<string | null>(null);
  protected readonly taxContext = signal<PurchaseTaxContext | null>(null);
  protected readonly taxContextLoading = signal(false);
  protected readonly taxContextError = signal<string | null>(null);
  protected readonly priceEntryBasis = signal<PurchasePriceBasis>('inclusive');
  protected readonly supplierPinSaving = signal(false);
  protected readonly supplierPinSaved = signal(true);
  protected readonly label = variantLabel;

  protected readonly supplier = new FormControl('', { nonNullable: true });
  protected readonly location = new FormControl('', { nonNullable: true });
  protected readonly reference = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly purchaseDate = new FormControl(this.today(), { nonNullable: true });
  protected readonly claimInputVat = new FormControl(false, { nonNullable: true });
  protected readonly supplierTaxPin = new FormControl('', { nonNullable: true });
  protected readonly taxInvoiceDate = new FormControl(this.today(), { nonNullable: true });
  protected readonly paymentMode = new FormControl<PaymentMode>('paid', { nonNullable: true });
  protected readonly partialAmount = new FormControl('', { nonNullable: true });
  protected readonly advanceAmount = new FormControl('0', { nonNullable: true });
  protected readonly supplierAdvanceAvailable = signal(0);
  protected readonly account = new FormControl('', { nonNullable: true });
  private nextKey = 1;
  private searchRequest = 0;
  private taxEstimateRequest = 0;
  private taxContextRequest = 0;
  private taxContextTimer: ReturnType<typeof setTimeout> | null = null;
  private taxInvoiceDateTouched = false;
  private purchaseClientRef: string = crypto.randomUUID();
  private advanceAwareDraft = false;
  private exitAllowed = false;

  protected readonly lineTaxBreakdowns = computed(() => {
    const context = this.taxContext();
    const basis = this.priceEntryBasis();
    return new Map(
      this.lines().map(line => {
        const rule = context?.lines.find(item => item.variant_id === line.variantId);
        return [line.key, this.lineTaxBreakdown(line, rule?.tax_rate_bps ?? 0, basis)] as const;
      })
    );
  });
  protected readonly expenseTaxBreakdowns = computed(() => {
    const context = this.taxContext();
    const basis = this.priceEntryBasis();
    return new Map(
      this.expenses().map(
        expense => [expense.key, this.expenseTaxBreakdown(expense, context, basis)] as const
      )
    );
  });
  protected readonly enteredGoodsSubtotal = computed(() =>
    this.lines().reduce((sum, line) => sum + this.lineAmount(line), 0)
  );
  protected readonly enteredSupplierExpenseTotal = computed(() =>
    this.expenses().reduce(
      (sum, item) => sum + (item.settlement === 'supplier_bill' ? (parseKes(item.amount) ?? 0) : 0),
      0
    )
  );
  protected readonly goodsSubtotal = computed(() =>
    [...this.lineTaxBreakdowns().values()].reduce((sum, item) => sum + item.gross, 0)
  );
  protected readonly supplierExpenseTotal = computed(() =>
    this.expenses().reduce(
      (sum, item) =>
        sum +
        (item.settlement === 'supplier_bill'
          ? (this.expenseTaxBreakdowns().get(item.key)?.gross ?? 0)
          : 0),
      0
    )
  );
  protected readonly invoiceNetTotal = computed(
    () =>
      [...this.lineTaxBreakdowns().values()].reduce((sum, item) => sum + item.net, 0) +
      this.expenses().reduce(
        (sum, item) =>
          sum +
          (item.settlement === 'supplier_bill'
            ? (this.expenseTaxBreakdowns().get(item.key)?.net ?? 0)
            : 0),
        0
      )
  );
  protected readonly invoiceTaxTotal = computed(
    () =>
      [...this.lineTaxBreakdowns().values()].reduce((sum, item) => sum + item.tax, 0) +
      this.expenses().reduce(
        (sum, item) =>
          sum +
          (item.settlement === 'supplier_bill'
            ? (this.expenseTaxBreakdowns().get(item.key)?.tax ?? 0)
            : 0),
        0
      )
  );
  protected readonly separateExpenseTotal = computed(() =>
    this.expenses().reduce(
      (sum, item) => sum + (item.settlement === 'separate' ? (parseKes(item.amount) ?? 0) : 0),
      0
    )
  );
  protected readonly invoiceTotal = computed(
    () => this.goodsSubtotal() + this.supplierExpenseTotal()
  );
  protected readonly suggestedAdvance = computed(() =>
    Math.min(this.supplierAdvanceAvailable(), this.invoiceTotal())
  );

  async ngOnInit(): Promise<void> {
    const requestedDraft = this.route.snapshot.paramMap.get('id');
    let draftToRestore: PurchaseDraft | undefined;
    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load suppliers',
        run: () => this.parties.ensureLoaded(),
      },
      {
        fallback: 'Failed to load payment accounts',
        run: async () => {
          const accounts = await this.money.transactableAccounts();
          this.accounts.set(accounts);
          this.accountsError.set(null);
          this.account.setValue(accounts[0]?.code ?? '');
        },
        onError: message => this.accountsError.set(message),
      },
      {
        fallback: 'Failed to load the product catalogue',
        run: async () =>
          this.variants.set(
            (await this.catalog.activeCatalog()).filter(item => item.kind !== 'service')
          ),
      },
      {
        fallback: 'Failed to load purchase drafts',
        run: async () => {
          const drafts = await this.money.purchaseDrafts();
          if (requestedDraft) draftToRestore = drafts.find(item => item.id === requestedDraft);
        },
      },
      {
        fallback: 'Failed to load supplier purchase history',
        run: async () => this.performance.set(await this.money.supplierVariantPerformance()),
      },
    ]);
    this.location.setValue(this.locationContext.activeId() ?? this.locations()[0]?.id ?? '');
    if (requestedDraft) {
      if (draftToRestore) this.restoreDraft(draftToRestore);
      else errors.push('Purchase draft was not found');
    }
    this.syncSupplierPin();
    await this.refreshTaxContext();
    this.error.set(errors.length > 0 ? errors.join('. ') : null);
    this.dirty.set(false);
    this.loading.set(false);
  }

  canDeactivate(): boolean {
    return this.exitAllowed || !this.dirty() || window.confirm('Discard unsaved purchase changes?');
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && !this.exitAllowed) event.preventDefault();
  }
  protected allowExit(): void {
    this.exitAllowed = true;
  }
  protected markDirty(): void {
    this.dirty.set(true);
    this.notice.set(null);
  }
  protected setClaimInputVat(claim: boolean): void {
    this.claimInputVat.setValue(claim);
    if (claim) {
      if (!this.taxInvoiceDateTouched) this.taxInvoiceDate.setValue(this.purchaseDate.value);
      this.syncSupplierPin();
    } else {
      this.taxEstimateRequest++;
      this.taxEstimate.set(null);
      this.taxEstimateError.set(null);
      this.taxEstimateLoading.set(false);
    }
    this.clearGrossOverrides();
    this.scheduleTaxContext();
    this.markDirty();
  }
  protected onPurchaseDateChange(): void {
    if (this.claimInputVat.value && !this.taxInvoiceDateTouched) {
      this.taxInvoiceDate.setValue(this.purchaseDate.value);
    }
    this.clearGrossOverrides();
    this.scheduleTaxContext();
    this.markDirty();
  }
  protected onTaxInvoiceDateChange(): void {
    this.taxInvoiceDateTouched = true;
    this.clearGrossOverrides();
    this.scheduleTaxContext();
    this.markDirty();
  }
  protected onSupplierPinInput(): void {
    const savedPin = this.selectedSupplier()?.tax_registration_number?.trim() ?? '';
    this.supplierPinSaved.set(this.supplierTaxPin.value.trim() === savedPin && !!savedPin);
    this.markDirty();
  }
  protected supplierPinError(): string | null {
    if (!this.claimInputVat.value) return null;
    if (!this.supplier.value) return 'Choose a supplier first';
    if (!this.supplierTaxPin.value.trim()) return 'Enter the supplier tax PIN';
    if (!this.supplierPinSaved()) return 'Save this PIN to the supplier before claiming VAT';
    return null;
  }
  protected async saveSupplierPin(): Promise<void> {
    const supplierId = this.supplier.value;
    const pin = this.supplierTaxPin.value.trim();
    if (!supplierId || !pin) return;
    this.supplierPinSaving.set(true);
    this.error.set(null);
    try {
      await this.money.updateSupplierTaxRegistration(supplierId, pin);
      this.parties.suppliers.update(items =>
        items.map(item =>
          item.id === supplierId ? { ...item, tax_registration_number: pin } : item
        )
      );
      this.supplierPinSaved.set(true);
      this.notice.set('Supplier tax PIN saved');
    } catch (error) {
      this.supplierPinSaved.set(false);
      this.error.set(
        error instanceof Error ? error.message : 'Supplier tax PIN could not be saved'
      );
    } finally {
      this.supplierPinSaving.set(false);
    }
  }
  private selectedSupplier() {
    return this.suppliers().find(item => item.id === this.supplier.value);
  }
  private syncSupplierPin(): void {
    const pin = this.selectedSupplier()?.tax_registration_number?.trim() ?? '';
    this.supplierTaxPin.setValue(pin);
    this.supplierPinSaved.set(!!pin);
  }
  private taxDate(): string {
    return this.claimInputVat.value ? this.taxInvoiceDate.value : this.purchaseDate.value;
  }
  private clearGrossOverrides(): void {
    this.lines.update(lines => lines.map(line => ({ ...line, grossAmountOverride: undefined })));
    this.expenses.update(expenses =>
      expenses.map(expense => ({ ...expense, grossAmountOverride: undefined }))
    );
  }
  private scheduleTaxContext(): void {
    if (this.taxContextTimer) clearTimeout(this.taxContextTimer);
    this.taxContextTimer = setTimeout(() => {
      this.taxContextTimer = null;
      void this.refreshTaxContext();
    }, 120);
  }
  private async refreshTaxContext(): Promise<boolean> {
    if (this.taxContextTimer) {
      clearTimeout(this.taxContextTimer);
      this.taxContextTimer = null;
    }
    const taxDate = this.taxDate();
    if (!taxDate) return false;
    const request = ++this.taxContextRequest;
    this.taxContextLoading.set(true);
    this.taxContextError.set(null);
    try {
      const context = await this.money.purchaseTaxContext({
        variantIds: [...new Set(this.lines().map(line => line.variantId))],
        taxDate,
      });
      if (request !== this.taxContextRequest) return false;
      this.taxContext.set(context);
      this.convertPendingDefaultCosts(context);
      return true;
    } catch (error) {
      if (request !== this.taxContextRequest) return false;
      this.taxContext.set(null);
      this.taxContextError.set(
        error instanceof Error ? error.message : 'Purchase VAT rates could not be loaded'
      );
      return false;
    } finally {
      if (request === this.taxContextRequest) this.taxContextLoading.set(false);
    }
  }
  protected setPriceEntryBasis(basis: PurchasePriceBasis): void {
    if (basis === this.priceEntryBasis()) return;
    const context = this.taxContext();
    if (basis === 'exclusive' && !context?.tax_configured) {
      this.taxContextError.set(
        'Configure a supported tax jurisdiction for this purchase date before entering prices without VAT.'
      );
      return;
    }
    this.clearGrossOverrides();
    this.lines.update(lines => lines.map(line => ({ ...line, defaultCostNeedsConversion: false })));
    this.priceEntryBasis.set(basis);
    this.taxContextError.set(null);
    this.markDirty();
  }
  private convertPendingDefaultCosts(context: PurchaseTaxContext): void {
    if (this.priceEntryBasis() !== 'exclusive') return;
    this.lines.update(lines =>
      lines.map(line => {
        if (!line.defaultCostNeedsConversion) return line;
        const rate =
          context.lines.find(item => item.variant_id === line.variantId)?.tax_rate_bps ?? 0;
        const net = this.taxBreakdown(this.lineAmount(line), rate, 'inclusive').net;
        return {
          ...line,
          unitCost: formatKesInput(line.quantity > 0 ? net / line.quantity : 0),
          lineTotal: formatKesInput(net),
          valueSource: 'total',
          defaultCostNeedsConversion: false,
          grossAmountOverride: this.lineAmount(line),
        };
      })
    );
  }
  private taxBreakdown(
    entered: number,
    rateBps: number,
    basis: PurchasePriceBasis
  ): EnteredTaxBreakdown {
    if (basis === 'exclusive') {
      const tax = Math.round((entered * rateBps) / 10_000);
      return { entered, net: entered, tax, gross: entered + tax, rateBps };
    }
    const net = Math.round((entered * 10_000) / (10_000 + rateBps));
    return { entered, gross: entered, net, tax: entered - net, rateBps };
  }
  private lineTaxBreakdown(
    line: PurchaseLineForm,
    rateBps: number,
    basis: PurchasePriceBasis
  ): EnteredTaxBreakdown {
    const entered = this.lineAmount(line);
    if (basis === 'exclusive' && line.grossAmountOverride !== undefined) {
      const gross = line.grossAmountOverride;
      return { entered, gross, net: entered, tax: gross - entered, rateBps };
    }
    return this.taxBreakdown(entered, rateBps, basis);
  }
  private expenseTaxBreakdown(
    expense: ExpenseForm,
    context: PurchaseTaxContext | null,
    basis: PurchasePriceBasis
  ): EnteredTaxBreakdown {
    const entered = parseKes(expense.amount) ?? 0;
    const supplierBill = expense.settlement === 'supplier_bill';
    const rateBps = supplierBill ? (context?.supplier_expense.tax_rate_bps ?? 0) : 0;
    if (supplierBill && basis === 'exclusive' && expense.grossAmountOverride !== undefined) {
      const gross = expense.grossAmountOverride;
      return { entered, gross, net: entered, tax: gross - entered, rateBps };
    }
    return this.taxBreakdown(entered, rateBps, supplierBill ? basis : 'inclusive');
  }
  private canEstimateVat(): boolean {
    if (!this.taxInvoiceDate.value || this.lines().length === 0) return false;
    if (
      this.lines().some(
        line =>
          line.quantity <= 0 ||
          (parseKes(line.unitCost) ?? 0) <= 0 ||
          (parseKes(line.lineTotal) ?? 0) <= 0
      )
    )
      return false;
    return !this.expenses().some(
      expense => (parseKes(expense.amount) ?? 0) <= 0 || !expense.settlement
    );
  }
  private async refreshVatEstimate(): Promise<boolean> {
    if (!this.claimInputVat.value) return true;
    if (!this.canEstimateVat()) {
      this.taxEstimate.set(null);
      this.taxEstimateError.set(null);
      return false;
    }
    const request = ++this.taxEstimateRequest;
    this.taxEstimateLoading.set(true);
    this.taxEstimateError.set(null);
    try {
      const estimate = await this.money.estimatePurchaseInputVat({
        lines: this.parsedLines(),
        expenses: this.parsedExpenses(),
        taxInvoiceDate: this.taxInvoiceDate.value,
      });
      if (request !== this.taxEstimateRequest) return false;
      this.taxEstimate.set(estimate);
      if (!estimate.vat_registered) {
        this.taxEstimateError.set(
          'Input VAT cannot be claimed because the shop was not VAT-registered on this invoice date.'
        );
        return false;
      }
      return true;
    } catch (error) {
      if (request !== this.taxEstimateRequest) return false;
      this.taxEstimate.set(null);
      this.taxEstimateError.set(
        error instanceof Error ? error.message : 'VAT could not be calculated'
      );
      return false;
    } finally {
      if (request === this.taxEstimateRequest) this.taxEstimateLoading.set(false);
    }
  }
  protected expenseSettlementHint(settlement: ExpenseSettlement): string {
    if (settlement === 'supplier_bill') {
      return 'Follows the supplier payment and affects the supplier balance.';
    }
    if (settlement === 'separate') {
      return 'Paid now from the selected account; does not affect the supplier balance.';
    }
    return 'Choose who is being paid before continuing.';
  }
  protected expenseCategoryLabel(expense: ExpenseForm): string {
    if (expense.category === 'other') {
      return expense.customCategory.trim() || 'Other purchase cost';
    }
    return expense.category.charAt(0).toUpperCase() + expense.category.slice(1);
  }
  protected purchaseInfoSummary(): string {
    const [year, month, day] = this.purchaseDate.value.split('-').map(Number);
    const date =
      year && month && day
        ? new Intl.DateTimeFormat('en-KE', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(new Date(year, month - 1, day))
        : this.purchaseDate.value;
    const note = this.notes.value.trim();
    return `${date}${note ? ` · ${note}` : ' · No notes'}`;
  }
  protected supplierName(item: { first_name: string; last_name: string | null }): string {
    return [item.first_name, item.last_name].filter(Boolean).join(' ');
  }
  protected lineVariant(line: PurchaseLineForm): Variant | undefined {
    return this.variants().find(item => item.variant_id === line.variantId);
  }
  protected lineLabel(line: PurchaseLineForm): string {
    const variant = this.lineVariant(line);
    return variant ? this.label(variant) : 'Unknown item';
  }
  protected linePriceContext(line: PurchaseLineForm): PurchaseLinePriceContext {
    const variant = this.lineVariant(line);
    const currentCost = parseKes(line.unitCost);
    const supplierInsight = this.performance().find(
      item => item.variant_id === line.variantId && item.supplier_id === this.supplier.value
    );
    const supplierCost = supplierInsight?.last_unit_cost ?? null;
    const peers = this.performance().filter(
      item => item.variant_id === line.variantId && (item.average_unit_cost ?? 0) > 0
    );
    const best = peers.length
      ? peers.reduce((lowest, item) =>
          (item.average_unit_cost ?? Infinity) < (lowest.average_unit_cost ?? Infinity)
            ? item
            : lowest
        )
      : null;
    const wholesale = parseKes(line.wholesalePrice) ?? variant?.wholesale_price ?? 0;
    const retail = parseKes(line.retailPrice) ?? variant?.price ?? 0;
    return {
      supplierCost,
      supplierComparison: this.supplierPriceComparison(currentCost, supplierCost),
      purchaseCount: Number(supplierInsight?.purchase_count ?? 0),
      wholesaleMargin: this.marginContext(currentCost, wholesale),
      retailMargin: this.marginContext(currentCost, retail),
      bestRecordedCost: best?.average_unit_cost ?? null,
      bestRecordedSupplier: best?.supplier_id
        ? this.supplierName(
            this.suppliers().find(item => item.id === best.supplier_id) ?? {
              first_name: 'Unknown supplier',
              last_name: null,
            }
          )
        : null,
      warning: this.linePriceWarning(currentCost, wholesale, retail, supplierCost),
      catalogPriceChanged:
        !!variant &&
        (wholesale !== (variant.wholesale_price ?? 0) || retail !== (variant.price ?? 0)),
    };
  }

  private supplierPriceComparison(current: number | null, previous: number | null): string {
    if (previous === null || current === null || current <= 0) return 'Last recorded cost';
    const difference = current - previous;
    if (difference === 0) return 'Same as last price';
    return `${formatKes(Math.abs(difference))} ${difference > 0 ? 'higher' : 'lower'} than last`;
  }

  private marginContext(
    cost: number | null,
    sellingPrice: number
  ): PurchaseLinePriceContext['retailMargin'] {
    if (cost === null || cost <= 0 || sellingPrice <= 0)
      return { label: 'No price', type: 'neutral' };
    const margin = ((sellingPrice - cost) / sellingPrice) * 100;
    return {
      label: `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}% margin`,
      type: margin < 0 ? 'error' : margin < 15 ? 'warning' : 'success',
    };
  }

  private linePriceWarning(
    cost: number | null,
    wholesale: number,
    retail: number,
    previous: number | null
  ): string | null {
    if (cost === null || cost <= 0) return null;
    if (retail > 0 && cost > retail)
      return `Unit cost is ${formatKes(cost - retail)} above the current retail price.`;
    if (wholesale > 0 && cost > wholesale)
      return `Unit cost is ${formatKes(cost - wholesale)} above the current wholesale price.`;
    if (previous && cost > previous)
      return `This supplier's unit cost is ${formatKes(cost - previous)} above their last price.`;
    return null;
  }

  protected async searchProducts(value: string): Promise<void> {
    this.productQuery.set(value);
    const request = ++this.searchRequest;
    if (!value.trim()) {
      this.searchResults.set([]);
      return;
    }
    const result = await this.catalog.search(value, 20);
    if (request === this.searchRequest)
      this.searchResults.set(result.variants.filter(item => item.kind !== 'service'));
  }
  protected addFirstSearchResult(): void {
    const first = this.searchResults()[0];
    if (first) this.addVariant(first);
  }
  protected addVariant(variant: Variant): void {
    const supplierCost = this.performance().find(
      item => item.variant_id === variant.variant_id && item.supplier_id === this.supplier.value
    )?.last_unit_cost;
    const cost = supplierCost ?? variant.wholesale_price ?? 0;
    const key = this.nextKey++;
    this.lines.update(items => [
      ...items,
      {
        key,
        variantId: variant.variant_id!,
        quantity: 1,
        unitCost: cost > 0 ? formatKesInput(cost) : '',
        lineTotal: cost > 0 ? formatKesInput(cost) : '',
        valueSource: 'unit',
        batchNumber: '',
        expiryDate: '',
        wholesalePrice: formatKesInput(variant.wholesale_price ?? 0),
        retailPrice: formatKesInput(variant.price ?? 0),
        expanded: false,
        error: null,
        defaultCostNeedsConversion: this.priceEntryBasis() === 'exclusive' && cost > 0,
      },
    ]);
    this.productQuery.set('');
    this.searchResults.set([]);
    this.scheduleTaxContext();
    this.markDirty();
    setTimeout(() => {
      const quantity = document.querySelector<HTMLInputElement>(
        `[data-line-key="${key}"] [data-quantity]`
      );
      quantity?.scrollIntoView({ block: 'center' });
      quantity?.focus({ preventScroll: true });
    });
  }
  protected removeLine(index: number): void {
    this.lines.update(items => items.filter((_, itemIndex) => itemIndex !== index));
    this.scheduleTaxContext();
    this.markDirty();
  }
  protected setLineExpanded(line: PurchaseLineForm, expanded: boolean): void {
    line.expanded = expanded;
    this.lines.update(items => [...items]);
  }
  protected updateLineDetail(
    line: PurchaseLineForm,
    field: PurchaseLineDetailField,
    value: string
  ): void {
    line[field] = value;
    this.lines.update(items => [...items]);
    this.markDirty();
  }
  protected quantityChanged(line: PurchaseLineForm, value: number | string): void {
    line.quantity = Math.max(0, Number(value) || 0);
    if (line.valueSource === 'unit') this.syncTotal(line);
    else this.syncUnit(line);
    line.grossAmountOverride = undefined;
    this.lines.update(items => [...items]);
    this.markDirty();
  }
  protected unitCostChanged(line: PurchaseLineForm, value: string): void {
    line.unitCost = value;
    line.valueSource = 'unit';
    line.defaultCostNeedsConversion = false;
    line.grossAmountOverride = undefined;
    this.syncTotal(line);
    this.lines.update(items => [...items]);
    this.markDirty();
  }
  protected lineTotalChanged(line: PurchaseLineForm, value: string): void {
    line.lineTotal = value;
    line.valueSource = 'total';
    line.defaultCostNeedsConversion = false;
    line.grossAmountOverride = undefined;
    this.syncUnit(line);
    this.lines.update(items => [...items]);
    this.markDirty();
  }
  private syncTotal(line: PurchaseLineForm): void {
    const unit = parseKes(line.unitCost);
    line.lineTotal = unit === null ? '' : formatKesInput(line.quantity * unit);
  }
  private syncUnit(line: PurchaseLineForm): void {
    const total = parseKes(line.lineTotal);
    line.unitCost =
      total === null || line.quantity <= 0 ? '' : formatKesInput(total / line.quantity);
  }
  private lineAmount(line: PurchaseLineForm): number {
    return line.valueSource === 'total'
      ? (parseKes(line.lineTotal) ?? 0)
      : Math.round(line.quantity * (parseKes(line.unitCost) ?? 0));
  }

  protected addExpense(): void {
    this.expenses.update(items => [
      ...items,
      {
        key: this.nextKey++,
        category: 'transport',
        customCategory: '',
        memo: '',
        amount: '',
        settlement: '',
        accountCode: this.account.value || this.accounts()[0]?.code || '',
        error: null,
      },
    ]);
    this.markDirty();
  }
  protected expenseAmountChanged(expense: ExpenseForm): void {
    expense.grossAmountOverride = undefined;
    this.expenses.update(items => [...items]);
    this.markDirty();
  }
  protected setExpenseSettlement(expense: ExpenseForm, settlement: ExpenseSettlement): void {
    if (expense.settlement === settlement) return;
    const amount = parseKes(expense.amount);
    if (this.priceEntryBasis() === 'exclusive' && amount !== null && amount > 0) {
      const previousGross = this.expenseTaxBreakdowns().get(expense.key)?.gross ?? amount;
      if (settlement === 'supplier_bill') {
        const rate = this.taxContext()?.supplier_expense.tax_rate_bps ?? 0;
        const net = this.taxBreakdown(previousGross, rate, 'inclusive').net;
        expense.amount = formatKesInput(net);
        expense.grossAmountOverride = previousGross;
      } else {
        expense.amount = formatKesInput(previousGross);
        expense.grossAmountOverride = undefined;
      }
    } else {
      expense.grossAmountOverride = undefined;
    }
    expense.settlement = settlement;
    this.expenses.update(items => [...items]);
    this.markDirty();
  }
  protected removeExpense(index: number): void {
    this.expenses.update(items => items.filter((_, itemIndex) => itemIndex !== index));
    this.markDirty();
  }

  protected async goToReview(): Promise<void> {
    if (this.priceEntryBasis() === 'exclusive' && !(await this.refreshTaxContext())) return;
    if (!this.validateBuild() || !this.validateTaxEvidence()) return;
    if (this.claimInputVat.value && !(await this.refreshVatEstimate())) return;
    this.error.set(null);
    this.stage.set('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  protected setPaymentMode(mode: PaymentMode): void {
    this.paymentMode.setValue(mode);
    if (mode !== 'partial') this.partialAmount.setValue('');
    this.markDirty();
  }
  protected onSupplierChange(supplierId: string): void {
    this.supplier.setValue(supplierId);
    this.syncSupplierPin();
    this.advanceAmount.setValue('0');
    this.supplierAdvanceAvailable.set(0);
    this.markDirty();
    if (supplierId) {
      void this.money.supplierAdvanceAvailable(supplierId).then(balance => {
        if (this.supplier.value === supplierId) this.supplierAdvanceAvailable.set(balance);
      });
    }
  }
  protected advanceUsed(): number {
    return parseKes(this.advanceAmount.value) ?? 0;
  }
  protected advanceAmountError(): string | null {
    const amount = parseKes(this.advanceAmount.value);
    if (amount === null || amount < 0) return 'Enter zero or a positive amount';
    if (amount > this.supplierAdvanceAvailable()) return 'Amount exceeds the available advance';
    if (amount > this.invoiceTotal()) return 'Amount exceeds the supplier invoice';
    return null;
  }
  protected useSuggestedAdvance(): void {
    this.advanceAmount.setValue(formatKesInput(this.suggestedAdvance()));
    this.markDirty();
  }
  protected initialPayment(): number {
    if (this.paymentMode.value === 'paid')
      return Math.max(0, this.invoiceTotal() - this.advanceUsed());
    if (this.paymentMode.value === 'later') return 0;
    return parseKes(this.partialAmount.value) ?? 0;
  }
  protected balanceDue(): number {
    return Math.max(0, this.invoiceTotal() - this.initialPayment() - this.advanceUsed());
  }
  protected cashLeavingNow(): number {
    return this.initialPayment() + this.separateExpenseTotal();
  }
  protected requiresSession(): boolean {
    return this.cashLeavingNow() > 0;
  }
  protected partialPaymentError(): string | null {
    const amount = parseKes(this.partialAmount.value);
    if (this.paymentMode.value !== 'partial') return null;
    if (amount === null || amount <= 0) return 'Enter an amount greater than zero';
    if (amount + this.advanceUsed() >= this.invoiceTotal())
      return 'Use Paid now when the invoice is fully settled';
    return null;
  }
  protected creditExceeded(): boolean {
    const item = this.suppliers().find(value => value.id === this.supplier.value);
    return (
      !!item &&
      item.supplier_credit_limit > 0 &&
      item.ap_balance + this.balanceDue() > item.supplier_credit_limit
    );
  }
  protected canConfirm(): boolean {
    return (
      !this.busy() &&
      (this.priceEntryBasis() !== 'exclusive' ||
        (!!this.taxContext()?.tax_configured &&
          !this.taxContextLoading() &&
          !this.taxContextError())) &&
      (!this.claimInputVat.value ||
        (!!this.taxEstimate() && !this.taxEstimateError() && !this.taxEstimateLoading())) &&
      !this.advanceAmountError() &&
      !this.partialPaymentError() &&
      !this.creditExceeded() &&
      (!this.requiresSession() || this.cashierSession.canTakePayment())
    );
  }

  protected async saveDraft(): Promise<void> {
    if (this.priceEntryBasis() === 'exclusive' && !(await this.refreshTaxContext())) return;
    if (!this.validateBuild()) return;
    this.savingDraft.set(true);
    this.error.set(null);
    try {
      const id = await this.money.savePurchaseWorkspaceDraft({
        draftId: this.draftId() ?? undefined,
        supplierId: this.supplier.value,
        lines: this.parsedLines(),
        expenses: this.parsedExpenses(),
        reference: this.reference.value.trim() || undefined,
        notes: this.notes.value.trim() || undefined,
        purchaseDate: this.purchaseDate.value,
        stockLocationId: this.location.value,
        paymentAmount: this.initialPayment(),
        paymentMode: this.paymentMode.value,
        advanceAmount: this.advanceUsed(),
        accountCode: this.account.value || undefined,
        clientRef: this.purchaseClientRef,
        claimInputVat: this.claimInputVat.value,
        taxInvoiceDate: this.claimInputVat.value ? this.taxInvoiceDate.value : undefined,
      });
      this.advanceAwareDraft = this.advanceUsed() > 0;
      this.draftId.set(id);
      this.dirty.set(false);
      this.notice.set('Purchase draft saved');
      await this.router.navigate(['/purchases/drafts', id], { replaceUrl: true });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Draft save failed');
    } finally {
      this.savingDraft.set(false);
    }
  }

  protected async confirmPurchase(): Promise<void> {
    if (this.priceEntryBasis() === 'exclusive' && !(await this.refreshTaxContext())) return;
    if (!this.validateBuild() || !this.validateTaxEvidence()) return;
    if (this.claimInputVat.value && !(await this.refreshVatEstimate())) return;
    if (!this.canConfirm()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.requiresSession()) await this.cashierSession.assertOpen('recording this purchase');
      const draftId = await this.money.savePurchaseWorkspaceDraft({
        draftId: this.draftId() ?? undefined,
        supplierId: this.supplier.value,
        lines: this.parsedLines(),
        expenses: this.parsedExpenses(),
        reference: this.reference.value.trim() || undefined,
        notes: this.notes.value.trim() || undefined,
        purchaseDate: this.purchaseDate.value,
        stockLocationId: this.location.value,
        paymentMode: this.paymentMode.value,
        paymentAmount: this.initialPayment(),
        advanceAmount: this.advanceUsed(),
        accountCode: this.account.value || undefined,
        clientRef: this.purchaseClientRef,
        claimInputVat: this.claimInputVat.value,
        taxInvoiceDate: this.claimInputVat.value ? this.taxInvoiceDate.value : undefined,
      });
      this.draftId.set(draftId);
      const purchaseId = await this.money.finalizePurchaseDraft(draftId);
      this.exitAllowed = true;
      this.dirty.set(false);
      await this.router.navigate(['/purchases'], { state: { purchaseRecorded: true, purchaseId } });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Purchase could not be recorded');
    } finally {
      this.busy.set(false);
    }
  }

  private validateBuild(): boolean {
    this.error.set(null);
    let valid = true;
    if (!this.supplier.value) {
      this.error.set('Choose a supplier');
      this.focusControl('[data-supplier-picker] button');
      return false;
    }
    if (!this.location.value) {
      this.error.set('Choose a receiving location');
      this.focusControl('[data-location-picker]');
      return false;
    }
    if (this.priceEntryBasis() === 'exclusive') {
      const context = this.taxContext();
      const missingLineRate = this.lines().some(
        line => !context?.lines.some(item => item.variant_id === line.variantId)
      );
      if (
        this.taxContextLoading() ||
        !context?.tax_configured ||
        missingLineRate ||
        this.lines().some(line => line.defaultCostNeedsConversion)
      ) {
        this.error.set(
          this.taxContextError() ||
            'Wait for the applicable VAT rates before reviewing this purchase'
        );
        return false;
      }
    }
    if (this.lines().length === 0) {
      this.error.set('Add at least one item');
      return false;
    }
    for (const line of this.lines()) {
      line.error = null;
      const unit = parseKes(line.unitCost);
      const total = parseKes(line.lineTotal);
      if (line.quantity <= 0 || unit === null || unit <= 0 || total === null || total <= 0) {
        line.error = 'Enter a valid quantity, unit cost, and line total';
        valid = false;
      }
      const wholesale = parseKes(line.wholesalePrice);
      const retail = parseKes(line.retailPrice);
      if (wholesale === null || retail === null || retail < wholesale) {
        line.error = 'Retail price must not be lower than wholesale';
        valid = false;
      }
    }
    for (const expense of this.expenses()) {
      expense.error = null;
      const amount = parseKes(expense.amount);
      if (amount === null || amount <= 0) {
        expense.error = 'Enter an amount greater than zero';
        valid = false;
      } else if (!expense.settlement) {
        expense.error = 'Choose how this expense was paid';
        valid = false;
      } else if (expense.category === 'other' && !expense.customCategory.trim()) {
        expense.error = 'Name this expense';
        valid = false;
      } else if (expense.settlement === 'separate' && !expense.accountCode) {
        expense.error = 'Choose the account used';
        valid = false;
      }
    }
    this.lines.update(items => [...items]);
    this.expenses.update(items => [...items]);
    if (!valid) {
      this.error.set('Review the highlighted purchase details');
      setTimeout(() => {
        const message = document.querySelector<HTMLElement>(
          '[data-line-key] .text-error, [data-expense-key] .text-error'
        );
        const row = message?.closest<HTMLElement>('[data-line-key], [data-expense-key]');
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row?.querySelector<HTMLElement>('input, select, button')?.focus();
      });
    }
    return valid;
  }

  private validateTaxEvidence(): boolean {
    if (!this.claimInputVat.value) return true;
    if (!this.reference.value.trim()) {
      this.error.set('Enter the VAT invoice number in Invoice / reference');
      this.focusControl('input[placeholder="Required for input VAT"]');
      return false;
    }
    if (!this.taxInvoiceDate.value) {
      this.error.set('Enter the supplier tax invoice date');
      this.focusControl('[data-tax-invoice-date]');
      return false;
    }
    const pinError = this.supplierPinError();
    if (pinError) {
      this.error.set(pinError);
      this.focusControl('[data-supplier-tax-pin]');
      return false;
    }
    return true;
  }

  private focusControl(selector: string): void {
    setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus());
  }

  private parsedLines(): PurchaseLineInput[] {
    return this.lines().map(line => {
      const variant = this.lineVariant(line)!;
      const wholesale = parseKes(line.wholesalePrice) ?? 0;
      const retail = parseKes(line.retailPrice) ?? 0;
      const enteredUnitCost = parseKes(line.unitCost)!;
      const enteredLineTotal = parseKes(line.lineTotal)!;
      const breakdown = this.lineTaxBreakdowns().get(line.key)!;
      const exclusive = this.priceEntryBasis() === 'exclusive';
      return {
        variant_id: line.variantId,
        quantity: line.quantity,
        unit_cost: exclusive ? Math.round(breakdown.gross / line.quantity) : enteredUnitCost,
        line_total: exclusive ? breakdown.gross : enteredLineTotal,
        value_source: exclusive ? 'total' : line.valueSource,
        price_entry_basis: this.priceEntryBasis(),
        entered_value_source: line.valueSource,
        entered_unit_cost: enteredUnitCost,
        entered_line_total: enteredLineTotal,
        ...(this.preferences.batchExpiryEnabled() && line.expiryDate
          ? { expiry_date: line.expiryDate }
          : {}),
        ...(line.batchNumber.trim() ? { batch_number: line.batchNumber.trim() } : {}),
        ...(this.perms.has('ManageStockAdjustments') && wholesale !== (variant.wholesale_price ?? 0)
          ? { new_wholesale_price: wholesale }
          : {}),
        ...(this.perms.has('ManageStockAdjustments') && retail !== (variant.price ?? 0)
          ? { new_retail_price: retail }
          : {}),
      };
    });
  }
  private parsedExpenses(): PurchaseExpenseInput[] {
    return this.expenses().map(item => {
      const enteredAmount = parseKes(item.amount)!;
      const breakdown = this.expenseTaxBreakdowns().get(item.key)!;
      return {
        category: item.category as PurchaseExpenseInput['category'],
        ...(item.category === 'other' ? { custom_label: item.customCategory.trim() } : {}),
        ...(item.memo.trim() ? { memo: item.memo.trim() } : {}),
        amount:
          this.priceEntryBasis() === 'exclusive' && item.settlement === 'supplier_bill'
            ? breakdown.gross
            : enteredAmount,
        settlement: item.settlement as Exclude<ExpenseSettlement, ''>,
        ...(item.settlement === 'separate' ? { account_code: item.accountCode } : {}),
        price_entry_basis: this.priceEntryBasis(),
        entered_amount: enteredAmount,
      };
    });
  }

  private restoreDraft(draft: PurchaseDraft | undefined): void {
    if (!draft) {
      this.error.set('Purchase draft was not found');
      return;
    }
    this.draftId.set(draft.id);
    this.purchaseClientRef =
      (draft as unknown as { client_ref?: string | null }).client_ref ?? crypto.randomUUID();
    this.supplier.setValue(draft.supplier_id);
    const restoredAdvance = Number(
      (draft as unknown as { advance_amount?: number }).advance_amount ?? 0
    );
    this.advanceAwareDraft = restoredAdvance > 0 || !!draft.client_ref;
    this.advanceAmount.setValue(formatKesInput(restoredAdvance));
    void this.money.supplierAdvanceAvailable(draft.supplier_id).then(balance => {
      if (this.supplier.value === draft.supplier_id) this.supplierAdvanceAvailable.set(balance);
    });
    this.reference.setValue(draft.reference ?? '');
    this.notes.setValue(draft.notes ?? '');
    this.purchaseDate.setValue(draft.purchase_date);
    this.claimInputVat.setValue(draft.claim_input_vat);
    this.priceEntryBasis.set(draft.price_entry_basis === 'exclusive' ? 'exclusive' : 'inclusive');
    this.taxInvoiceDate.setValue(draft.tax_invoice_date ?? draft.purchase_date);
    this.taxInvoiceDateTouched = draft.tax_invoice_date !== null;
    this.location.setValue(draft.stock_location_id ?? this.location.value);
    this.paymentMode.setValue((draft.payment_mode as PaymentMode | null) ?? 'paid');
    this.partialAmount.setValue(
      draft.payment_mode === 'partial' ? formatKesInput(draft.payment_amount ?? 0) : ''
    );
    this.account.setValue(draft.account_code ?? this.account.value);
    const rawLines = Array.isArray(draft.lines)
      ? (draft.lines as unknown as Record<string, unknown>[])
      : [];
    this.lines.set(
      rawLines.map(item => {
        const exclusive = this.priceEntryBasis() === 'exclusive';
        const unitCost = exclusive ? item['entered_unit_cost'] : item['unit_cost'];
        const lineTotal = exclusive ? item['entered_line_total'] : item['line_total'];
        const valueSource = exclusive ? item['entered_value_source'] : item['value_source'];
        return {
          key: this.nextKey++,
          variantId: String(item['variant_id'] ?? ''),
          quantity: Number(item['quantity'] ?? 1),
          unitCost: formatKesInput(Number(unitCost ?? item['unit_cost'] ?? 0)),
          lineTotal: formatKesInput(
            Number(
              lineTotal ??
                item['line_total'] ??
                Number(item['quantity'] ?? 1) * Number(unitCost ?? item['unit_cost'] ?? 0)
            )
          ),
          valueSource: valueSource === 'total' ? 'total' : 'unit',
          batchNumber: String(item['batch_number'] ?? ''),
          expiryDate: String(item['expiry_date'] ?? ''),
          wholesalePrice: formatKesInput(
            Number(
              item['new_wholesale_price'] ??
                this.variants().find(v => v.variant_id === item['variant_id'])?.wholesale_price ??
                0
            )
          ),
          retailPrice: formatKesInput(
            Number(
              item['new_retail_price'] ??
                this.variants().find(v => v.variant_id === item['variant_id'])?.price ??
                0
            )
          ),
          expanded: false,
          error: null,
          defaultCostNeedsConversion: false,
          grossAmountOverride:
            exclusive && item['line_total'] !== undefined ? Number(item['line_total']) : undefined,
        };
      })
    );
    const rawExpenses = Array.isArray(draft.expenses)
      ? (draft.expenses as unknown as Record<string, unknown>[])
      : [];
    this.expenses.set(
      rawExpenses.map(item => {
        const category = String(item['category'] ?? 'other');
        const preset = ['transport', 'loading', 'packaging', 'duty'].includes(category);
        return {
          key: this.nextKey++,
          category: preset ? category : 'other',
          customCategory: String(item['custom_label'] ?? (preset ? '' : category)),
          memo: String(item['memo'] ?? ''),
          amount: formatKesInput(
            Number(
              this.priceEntryBasis() === 'exclusive'
                ? (item['entered_amount'] ?? item['amount'] ?? 0)
                : (item['amount'] ?? 0)
            )
          ),
          settlement: String(item['settlement'] ?? '') as ExpenseSettlement,
          accountCode: String(item['account_code'] ?? this.account.value),
          error: null,
          grossAmountOverride:
            this.priceEntryBasis() === 'exclusive' && item['settlement'] === 'supplier_bill'
              ? Number(item['amount'] ?? 0)
              : undefined,
        };
      })
    );
  }
  private today(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }
}
