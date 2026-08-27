import { Component, input, output } from '@angular/core';
import type { PurchasePriceBasis, PurchaseTaxEstimate } from '@dukarun/tax-types';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';

export type PurchasePaymentMode = 'paid' | 'partial' | 'later';

export interface PurchaseReviewSupplier {
  ap_balance: number;
  supplier_credit_limit: number;
}

export interface PurchasePaymentReviewState {
  priceEntryBasis: PurchasePriceBasis;
  claimInputVat: boolean;
  taxEstimate: PurchaseTaxEstimate | null;
  enteredGoodsSubtotal: number;
  goodsSubtotal: number;
  supplierExpenseTotal: number;
  enteredSupplierExpenseTotal: number;
  invoiceTaxTotal: number;
  invoiceTotal: number;
  invoiceNetTotal: number;
  separateExpenseTotal: number;
  supplierAdvanceAvailable: number;
  canManageSupplierCreditPurchases: boolean;
  accountOptions: readonly SearchableFilterOption[];
  accountsError: string | null;
  requiresSession: boolean;
  canTakePayment: boolean;
  creditExceeded: boolean;
  partialPaymentError: string | null;
  advanceAmountError: string | null;
  suggestedAdvance: number;
  initialPayment: number;
  advanceUsed: number;
  cashLeavingNow: number;
  balanceDue: number;
  selectedSupplier: PurchaseReviewSupplier | undefined;
  projectedSupplierBalance: number;
  canViewFinancials: boolean;
  busy: boolean;
  savingDraft: boolean;
  canConfirm: boolean;
  draftId: string | null;
}

/**
 * Review-stage payment composition for a purchase.
 *
 * Keep draft saving and finalization in PurchaseEditorComponent so idempotency,
 * validation, and navigation stay in one transaction owner. This component owns
 * only the review UI contract: payment mode controls, account picker, advance
 * visibility, and the summary the buyer checks before confirming.
 */
@Component({
  selector: 'app-purchase-payment-review',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    SearchableFilterComponent,
    SessionRequiredNoticeComponent,
  ],
  template: `
    @if (state(); as state) {
      <div class="grid items-start gap-4 lg:grid-cols-12">
        <section class="card bg-base-100 lg:col-span-9">
          <div class="card-body gap-5 p-4 md:p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="section-title">Payment</h2>
                <p class="type-caption mt-1">How is the supplier invoice being settled?</p>
              </div>
              <button appButton variant="ghost" type="button" (click)="editPurchase.emit()">
                Edit purchase
              </button>
            </div>
            <div class="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                class="min-h-14 rounded-field border px-3 text-left"
                [class.border-primary]="paymentModeControl().value === 'paid'"
                (click)="paymentModeChange.emit('paid')"
              >
                <strong class="block text-sm">Paid now</strong
                ><span class="type-caption">Full supplier invoice</span>
              </button>
              @if (state.canManageSupplierCreditPurchases) {
                <button
                  type="button"
                  class="min-h-14 rounded-field border px-3 text-left"
                  [class.border-primary]="paymentModeControl().value === 'partial'"
                  (click)="paymentModeChange.emit('partial')"
                >
                  <strong class="block text-sm">Part-paid</strong
                  ><span class="type-caption">Pay some, owe the rest</span>
                </button>
                <button
                  type="button"
                  data-learning-anchor="purchase-pay-later"
                  class="min-h-14 rounded-field border px-3 text-left"
                  [class.border-warning]="paymentModeControl().value === 'later'"
                  (click)="paymentModeChange.emit('later')"
                >
                  <strong class="block text-sm">Pay later</strong
                  ><span class="type-caption">Supplier credit</span>
                </button>
              }
            </div>
            @if (state.supplierAdvanceAvailable > 0 && state.canManageSupplierCreditPurchases) {
              <div class="rounded-field border border-info/30 bg-info/5 p-3">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <p class="type-heading">Advance with supplier</p>
                    <p class="type-caption">Explicitly choose how much to apply.</p>
                  </div>
                  <app-money [amount]="state.supplierAdvanceAvailable" />
                </div>
                <app-form-field
                  class="mt-2 block"
                  label="Use advance (KES)"
                  [error]="state.advanceAmountError"
                >
                  <input
                    class="input input-bordered w-full text-right"
                    inputmode="numeric"
                    [formControl]="advanceAmountControl()"
                    (input)="markDirty.emit()"
                  />
                </app-form-field>
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="mt-2"
                  (click)="useSuggestedAdvance.emit()"
                >
                  Use suggested <app-money [amount]="state.suggestedAdvance" />
                </button>
              </div>
            }
            @if (paymentModeControl().value === 'partial') {
              <app-form-field label="Amount paid now" [error]="state.partialPaymentError">
                <input
                  class="input input-bordered w-full text-right"
                  inputmode="numeric"
                  [formControl]="partialAmountControl()"
                  (input)="markDirty.emit()"
                />
              </app-form-field>
            }
            @if (paymentModeControl().value !== 'later') {
              <app-form-field
                label="Paid from"
                [required]="true"
                [error]="
                  state.accountOptions.length === 0
                    ? state.accountsError || 'No cash, bank, or M-Pesa account is configured.'
                    : null
                "
              >
                <app-searchable-filter
                  data-purchase-account-picker
                  ariaLabel="Choose account used to pay the supplier"
                  placeholder="Choose cash, bank, or M-Pesa account"
                  searchPlaceholder="Search accounts by name or code..."
                  controlSize="md"
                  [options]="state.accountOptions"
                  [value]="accountControl().value"
                  (valueChange)="accountControl().setValue($event); markDirty.emit()"
                />
              </app-form-field>
            }
            @if (state.requiresSession && !state.canTakePayment) {
              <app-session-required-notice action="recording this purchase" />
            }
            @if (state.creditExceeded) {
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
                state.priceEntryBasis === 'exclusive' ? 'Merchandise before VAT' : 'Merchandise'
              }}</span
              ><app-money
                [amount]="
                  state.priceEntryBasis === 'exclusive'
                    ? state.enteredGoodsSubtotal
                    : state.goodsSubtotal
                "
              />
            </div>
            @if (state.supplierExpenseTotal > 0) {
              <div class="flex justify-between text-sm">
                <span>{{
                  state.priceEntryBasis === 'exclusive'
                    ? 'Additional costs before VAT'
                    : 'Additional costs'
                }}</span
                ><app-money
                  [amount]="
                    state.priceEntryBasis === 'exclusive'
                      ? state.enteredSupplierExpenseTotal
                      : state.supplierExpenseTotal
                  "
                />
              </div>
            }
            @if (state.priceEntryBasis === 'exclusive') {
              <div class="flex justify-between text-sm">
                <span>VAT on supplier invoice</span><app-money [amount]="state.invoiceTaxTotal" />
              </div>
            }
            <div class="flex justify-between border-t border-base-300 pt-3">
              <strong>Supplier invoice</strong
              ><strong><app-money [amount]="state.invoiceTotal" /></strong>
            </div>
            @if (state.claimInputVat && state.taxEstimate) {
              <div class="flex justify-between text-sm">
                <span>Net inventory and expense cost</span
                ><app-money [amount]="state.taxEstimate.net_total" />
              </div>
              <div class="flex justify-between text-sm text-success">
                <span>Recoverable input VAT</span
                ><app-money [amount]="state.taxEstimate.tax_total" />
              </div>
            } @else if (state.priceEntryBasis === 'exclusive' && state.invoiceTaxTotal > 0) {
              <p class="type-caption">VAT is included in inventory and expense cost.</p>
            }
            @if (state.separateExpenseTotal > 0) {
              <div class="flex justify-between text-sm">
                <span>Costs paid separately</span
                ><app-money [amount]="state.separateExpenseTotal" />
              </div>
            }
            <div class="flex justify-between text-sm">
              <span>Initial supplier payment</span><app-money [amount]="state.initialPayment" />
            </div>
            @if (state.advanceUsed > 0) {
              <div class="flex justify-between text-sm">
                <span>Advance applied</span><app-money [amount]="state.advanceUsed" />
              </div>
            }
            <div class="flex justify-between text-sm">
              <span>Cash leaving now</span
              ><strong><app-money [amount]="state.cashLeavingNow" /></strong>
            </div>
            @if (state.balanceDue > 0) {
              <div class="flex justify-between text-sm">
                <span>Remaining supplier balance</span
                ><strong><app-money [amount]="state.balanceDue" /></strong>
              </div>
            }
            @if (state.selectedSupplier; as selected) {
              <div class="rounded-field bg-base-200/60 p-3 text-sm">
                <div class="flex justify-between gap-3">
                  <span>Currently owed</span>
                  <app-money [amount]="selected.ap_balance" [masked]="!state.canViewFinancials" />
                </div>
                <div class="mt-1 flex justify-between gap-3 font-semibold">
                  <span>Projected balance</span>
                  <app-money
                    [amount]="state.projectedSupplierBalance"
                    [masked]="!state.canViewFinancials"
                  />
                </div>
                @if (selected.supplier_credit_limit > 0) {
                  <p class="type-caption mt-1 text-right">
                    Limit
                    <app-money
                      [amount]="selected.supplier_credit_limit"
                      [masked]="!state.canViewFinancials"
                    />
                  </p>
                } @else {
                  <p class="type-caption mt-1 text-right">No configured credit limit</p>
                }
              </div>
            }
            <button
              appButton
              type="button"
              data-learning-anchor="purchase-confirm"
              class="mt-2 w-full"
              [loading]="state.busy"
              [disabled]="!state.canConfirm"
              (click)="confirmPurchase.emit()"
            >
              {{ state.draftId ? 'Confirm draft purchase' : 'Confirm purchase' }}
            </button>
            <button
              appButton
              variant="outline"
              type="button"
              class="w-full"
              [loading]="state.savingDraft"
              (click)="saveDraft.emit()"
            >
              Save draft
            </button>
          </div>
        </aside>
      </div>
    }
  `,
})
export class PurchasePaymentReviewComponent {
  readonly state = input.required<PurchasePaymentReviewState>();
  readonly paymentModeControl = input.required<FormControl<PurchasePaymentMode>>();
  readonly partialAmountControl = input.required<FormControl<string>>();
  readonly advanceAmountControl = input.required<FormControl<string>>();
  readonly accountControl = input.required<FormControl<string>>();

  readonly editPurchase = output<void>();
  readonly paymentModeChange = output<PurchasePaymentMode>();
  readonly markDirty = output<void>();
  readonly useSuggestedAdvance = output<void>();
  readonly confirmPurchase = output<void>();
  readonly saveDraft = output<void>();
}
