import { Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { PurchasePriceBasis, PurchaseTaxContext } from '@dukarun/tax-types';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';

export interface PurchaseVatPanelViewModel {
  visible: boolean;
  contextLoading: boolean;
  context: PurchaseTaxContext | null;
  contextError: string | null;
  claimInputVat: boolean;
  priceEntryBasis: PurchasePriceBasis;
  supplierPinError: string | null;
  supplierPinSaving: boolean;
  supplierPinSaved: boolean;
  hasLines: boolean;
  invoiceTotal: number;
  invoiceNetTotal: number;
  invoiceTaxTotal: number;
}

export type PurchaseVatPanelIntent =
  | { type: 'set-price-basis'; basis: PurchasePriceBasis }
  | { type: 'set-claim'; claim: boolean }
  | { type: 'supplier-pin-input' }
  | { type: 'save-supplier-pin' }
  | { type: 'tax-invoice-date-change' };

/**
 * VAT evidence is one cohesive view over the purchase aggregate. It owns no draft state and emits
 * domain intents, keeping tax calculation and persistence sequencing in PurchaseEditorStore.
 */
@Component({
  selector: 'app-purchase-vat-panel',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
  ],
  template: `
    @if (viewModel().visible) {
      <section class="card bg-base-100" data-purchase-input-vat data-purchase-vat-settings>
        <div class="card-body gap-3 p-4">
          <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div class="flex shrink-0 items-center gap-2 text-primary">
              <app-icon name="heroReceiptPercent" size="sm" />
              <h2 class="section-title text-base-content">VAT</h2>
            </div>
            <span class="hidden h-7 w-px bg-base-300 lg:block" aria-hidden="true"></span>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">Supplier prices</span>
              <div
                class="join"
                role="group"
                aria-label="How supplier prices are entered"
                data-purchase-price-basis
              >
                <button
                  type="button"
                  class="btn btn-sm join-item"
                  [attr.aria-pressed]="viewModel().priceEntryBasis === 'inclusive'"
                  [class.btn-primary]="viewModel().priceEntryBasis === 'inclusive'"
                  [class.btn-outline]="viewModel().priceEntryBasis !== 'inclusive'"
                  (click)="intent.emit({ type: 'set-price-basis', basis: 'inclusive' })"
                >
                  VAT included
                </button>
                <button
                  type="button"
                  class="btn btn-sm join-item"
                  [attr.aria-pressed]="viewModel().priceEntryBasis === 'exclusive'"
                  [class.btn-primary]="viewModel().priceEntryBasis === 'exclusive'"
                  [class.btn-outline]="viewModel().priceEntryBasis !== 'exclusive'"
                  [disabled]="
                    viewModel().priceEntryBasis !== 'exclusive' &&
                    (viewModel().contextLoading || !viewModel().context?.tax_configured)
                  "
                  (click)="intent.emit({ type: 'set-price-basis', basis: 'exclusive' })"
                >
                  Before VAT
                </button>
              </div>
            </div>
            <label
              class="flex cursor-pointer items-center gap-3 lg:ml-auto"
              [class.cursor-not-allowed]="
                !viewModel().claimInputVat &&
                (viewModel().contextLoading || !viewModel().context?.vat_registered)
              "
            >
              <span class="text-sm font-medium">Claim input VAT</span>
              <input
                type="checkbox"
                class="toggle toggle-primary toggle-sm shrink-0"
                aria-label="Claim input VAT"
                [checked]="viewModel().claimInputVat"
                [disabled]="
                  !viewModel().claimInputVat &&
                  (viewModel().contextLoading || !viewModel().context?.vat_registered)
                "
                (change)="intent.emit({ type: 'set-claim', claim: $any($event.target).checked })"
              />
            </label>
          </div>

          <p class="type-caption">
            @if (viewModel().contextLoading) {
              Checking the VAT setup...
            } @else if (!viewModel().context?.tax_configured) {
              VAT rates are not configured; enter invoice totals exactly as shown.
            } @else if (viewModel().priceEntryBasis === 'exclusive') {
              Enter net prices; Dukarun calculates VAT on top.
            } @else {
              Enter prices as shown; Dukarun extracts the VAT portion.
            }
            <span class="mx-1" aria-hidden="true">&middot;</span>
            @if (viewModel().contextLoading) {
              Checking claim eligibility.
            } @else if (!viewModel().context?.vat_registered && !viewModel().claimInputVat) {
              Claiming becomes available when the shop is VAT registered.
            } @else if (viewModel().claimInputVat) {
              VAT is recorded separately from inventory and expense cost.
            } @else {
              VAT remains part of inventory and expense cost.
            }
          </p>

          @if (viewModel().contextError) {
            <div class="alert alert-error py-2 text-sm" role="alert">
              <app-icon name="heroExclamationTriangle" />
              <span>{{ viewModel().contextError }}</span>
            </div>
          }

          @if (viewModel().claimInputVat) {
            <div class="grid gap-4 border-t border-base-300 pt-4 md:grid-cols-2">
              <app-form-field
                label="Supplier tax PIN"
                [required]="true"
                hint="Saved to this supplier and snapshotted on the completed purchase."
                [error]="viewModel().supplierPinError"
              >
                <div class="flex gap-2">
                  <input
                    data-supplier-tax-pin
                    class="input input-bordered h-11 min-w-0 flex-1"
                    placeholder="e.g. P000000000A"
                    [formControl]="supplierTaxPin()"
                    (input)="intent.emit({ type: 'supplier-pin-input' })"
                  />
                  <button
                    appButton
                    variant="outline"
                    size="sm"
                    type="button"
                    [loading]="viewModel().supplierPinSaving"
                    [disabled]="viewModel().supplierPinSaved || !supplierTaxPin().value.trim()"
                    (click)="intent.emit({ type: 'save-supplier-pin' })"
                  >
                    {{ viewModel().supplierPinSaved ? 'Saved' : 'Save PIN' }}
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
                  [formControl]="taxInvoiceDate()"
                  (change)="intent.emit({ type: 'tax-invoice-date-change' })"
                />
              </app-form-field>
            </div>

            <div class="rounded-field border border-base-300 bg-base-200/30 p-3">
              @if (viewModel().contextLoading) {
                <div class="flex items-center gap-2 text-sm text-base-content/70">
                  <span class="loading loading-spinner loading-sm"></span>
                  Calculating VAT from the configured product rates...
                </div>
              } @else if (viewModel().hasLines) {
                <div class="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p class="type-caption">Gross supplier invoice</p>
                    <p class="font-semibold"><app-money [amount]="viewModel().invoiceTotal" /></p>
                  </div>
                  <div>
                    <p class="type-caption">Net inventory and expense cost</p>
                    <p class="font-semibold">
                      <app-money [amount]="viewModel().invoiceNetTotal" />
                    </p>
                  </div>
                  <div>
                    <p class="type-caption">Recoverable input VAT</p>
                    <p class="font-semibold text-success">
                      <app-money [amount]="viewModel().invoiceTaxTotal" />
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
              Expenses included in the supplier bill share this invoice's VAT treatment. Separately
              paid expenses remain outside this claim.
            </p>
          }
        </div>
      </section>
    }
  `,
})
export class PurchaseVatPanelComponent {
  readonly viewModel = input.required<PurchaseVatPanelViewModel>();
  readonly supplierTaxPin = input.required<FormControl<string>>();
  readonly taxInvoiceDate = input.required<FormControl<string>>();
  readonly intent = output<PurchaseVatPanelIntent>();
}
