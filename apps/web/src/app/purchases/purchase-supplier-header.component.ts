import { Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { BusinessLocation } from '../core/location-context.service';
import type { AgingInfo, MoneyCustomer } from '../money/money.service';
import type { SupplierStockRow } from '../pos/pos.service';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';

type PurchaseSupplier = MoneyCustomer & { ap_balance: number } & AgingInfo;

@Component({
  selector: 'app-purchase-supplier-header',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    SearchableFilterComponent,
  ],
  template: `
    <section class="card bg-base-100">
      <div class="card-body gap-4 p-4">
        <div
          class="grid gap-3 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(14rem,1fr)_minmax(12rem,.9fr)_minmax(13rem,.9fr)_minmax(10rem,.55fr)]"
        >
          <app-form-field label="Supplier" [required]="true">
            <app-searchable-filter
              data-supplier-picker
              data-learning-anchor="purchase-supplier"
              [attr.data-learning-state]="selectedSupplier() ? 'selected' : null"
              ariaLabel="Choose supplier"
              placeholder="Choose supplier"
              searchPlaceholder="Search suppliers by name, phone, or email…"
              controlSize="md"
              [options]="supplierOptions()"
              [value]="supplierControl().value"
              (valueChange)="supplierChange.emit($event)"
            />
          </app-form-field>
          <app-form-field label="Receive into" [required]="true">
            <select
              data-location-picker
              data-learning-anchor="purchase-location"
              class="select select-bordered h-12 w-full"
              [formControl]="locationControl()"
              (change)="receivingLocationChange.emit()"
            >
              @for (item of locations(); track item.id) {
                <option [value]="item.id">{{ item.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="claimInputVat() ? 'VAT invoice number' : 'Invoice / reference'"
            [required]="claimInputVat()"
          >
            <input
              class="input input-bordered h-12 w-full"
              [placeholder]="claimInputVat() ? 'Required for input VAT' : 'Optional'"
              [formControl]="referenceControl()"
              (input)="referenceInput.emit()"
            />
          </app-form-field>
          <app-form-field label="Purchase info">
            <button
              type="button"
              class="flex h-12 w-full items-center gap-2 rounded-field border border-base-300 bg-base-200/30 px-3 text-left transition-colors hover:bg-base-200/60 focus-visible:outline-2 focus-visible:outline-primary"
              title="Change the purchase date or add delivery notes"
              [attr.aria-expanded]="invoiceDetailsExpanded()"
              aria-controls="purchase-invoice-details"
              (click)="purchaseInfoToggle.emit()"
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
                class="input input-bordered h-11 w-full"
                [formControl]="purchaseDateControl()"
                (change)="purchaseDateChange.emit()"
              />
            </app-form-field>
            <app-form-field label="Notes">
              <input
                class="input input-bordered h-11 w-full"
                placeholder="Delivery notes…"
                [formControl]="notesControl()"
                (input)="notesInput.emit()"
              />
            </app-form-field>
          </div>
        }
        @if (selectedSupplier(); as selected) {
          <section
            data-learning-anchor="purchase-supplier-selected"
            class="rounded-field border border-base-300 bg-base-200/30 p-3"
            aria-label="Supplier account context"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold">{{ supplierName()(selected) }}</p>
                <p class="type-caption">
                  {{ selected.supplier_credit_terms_days || 0 }} day terms
                  @if (selected.days_outstanding !== null) {
                    · {{ selected.days_outstanding }} days outstanding
                  }
                  @if (selected.bucket) {
                    · {{ selected.bucket }}
                  }
                </p>
              </div>
              <a
                class="link text-xs"
                routerLink="/suppliers"
                [queryParams]="{ supplier: selected.id }"
                >View supplier</a
              >
            </div>
            <div class="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <div class="rounded-field bg-base-100/70 p-3">
                <p class="type-caption">Currently owed</p>
                <p class="font-semibold">
                  <app-money [amount]="selected.ap_balance" [masked]="!canViewFinancials()" />
                </p>
              </div>
              <div class="rounded-field bg-base-100/70 p-3">
                <p class="type-caption">Projected balance</p>
                <p class="font-semibold">
                  <app-money
                    [amount]="projectedSupplierBalance()"
                    [masked]="!canViewFinancials()"
                  />
                </p>
              </div>
              <div class="rounded-field bg-base-100/70 p-3">
                <p class="type-caption">Credit limit</p>
                <p class="font-semibold">
                  @if (!canViewFinancials()) {
                    Hidden
                  } @else if (selected.supplier_credit_limit <= 0) {
                    No configured limit
                  } @else {
                    <app-money [amount]="selected.supplier_credit_limit" />
                  }
                </p>
              </div>
              <div class="rounded-field bg-base-100/70 p-3">
                <p class="type-caption">Available credit after purchase</p>
                <p class="font-semibold">
                  @if (!canViewFinancials()) {
                    Hidden
                  } @else if (projectedCreditAvailable() === null) {
                    Not limited
                  } @else {
                    <app-money [amount]="projectedCreditAvailable()!" />
                  }
                </p>
              </div>
              <div class="rounded-field bg-base-100/70 p-3">
                <p class="type-caption">Advance available</p>
                <p class="font-semibold">
                  <app-money
                    [amount]="supplierAdvanceAvailable()"
                    [masked]="!canViewFinancials()"
                  />
                </p>
              </div>
              <div class="rounded-field bg-base-100/70 p-3">
                <p class="type-caption">Stock sourced here</p>
                @if (supplierStockLoading()) {
                  <span class="loading loading-spinner loading-xs"></span>
                } @else if (supplierStockError()) {
                  <p class="text-xs text-warning">Unavailable</p>
                } @else {
                  <p class="font-semibold">
                    {{ supplierStock().length }} variants ·
                    <app-money [amount]="supplierStockValue()" [masked]="!canViewFinancials()" />
                  </p>
                  <a
                    class="link type-caption"
                    routerLink="/inventory/products"
                    [queryParams]="{ supplier: selected.id }"
                    >{{ receivingLocationName() }}</a
                  >
                }
              </div>
            </div>
          </section>
        }
      </div>
    </section>
  `,
})
export class PurchaseSupplierHeaderComponent {
  readonly supplierOptions = input.required<readonly SearchableFilterOption[]>();
  readonly locations = input.required<BusinessLocation[]>();
  readonly supplierControl = input.required<FormControl<string>>();
  readonly locationControl = input.required<FormControl<string>>();
  readonly referenceControl = input.required<FormControl<string>>();
  readonly purchaseDateControl = input.required<FormControl<string>>();
  readonly notesControl = input.required<FormControl<string>>();
  readonly claimInputVat = input.required<boolean>();
  readonly invoiceDetailsExpanded = input.required<boolean>();
  readonly purchaseInfoSummary = input.required<string>();
  readonly selectedSupplier = input.required<PurchaseSupplier | undefined>();
  readonly supplierName = input.required<(supplier: PurchaseSupplier) => string>();
  readonly canViewFinancials = input.required<boolean>();
  readonly projectedSupplierBalance = input.required<number>();
  readonly projectedCreditAvailable = input.required<number | null>();
  readonly supplierAdvanceAvailable = input.required<number>();
  readonly supplierStockLoading = input.required<boolean>();
  readonly supplierStockError = input.required<string | null>();
  readonly supplierStock = input.required<SupplierStockRow[]>();
  readonly supplierStockValue = input.required<number>();
  readonly receivingLocationName = input.required<string>();

  readonly supplierChange = output<string>();
  readonly receivingLocationChange = output<void>();
  readonly referenceInput = output<void>();
  readonly purchaseInfoToggle = output<void>();
  readonly purchaseDateChange = output<void>();
  readonly notesInput = output<void>();
}
