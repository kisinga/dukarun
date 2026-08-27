import { Component, effect, inject, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DocumentSendComponent } from '../communications/document-send.component';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PurchaseDetailStore, type PurchaseDetailChangedResult } from './purchase-detail.store';
import type { PurchaseRow } from './purchase-history.store';

/** Posted-purchase drawer; its scoped store is the only owner of detail reads and mutations. */
@Component({
  selector: 'app-purchase-detail-drawer',
  providers: [PurchaseDetailStore],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    DocumentSendComponent,
    DrawerComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    SessionRequiredNoticeComponent,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  template: `
    <app-drawer
      [open]="true"
      [closeDisabled]="store.busy()"
      (closed)="requestClose()"
      [title]="purchase().reference || 'Purchase'"
      [subtitle]="supplierName() + ' · ' + store.date(purchase().purchase_date)"
    >
      @if (store.printerEnabled()) {
        <button
          drawerActions
          appButton
          variant="ghost"
          [iconOnly]="true"
          type="button"
          title="Print purchase order"
          aria-label="Print purchase order"
          (click)="store.printPurchase()"
        >
          <app-icon name="heroPrinter" />
        </button>
      }

      @if (store.purchase(); as detailPurchase) {
        @if (store.error()) {
          <div role="alert" class="alert alert-error mb-3 text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ store.error() }}</span>
          </div>
        }
        @if (store.notice()) {
          <div role="status" class="alert alert-success mb-3 text-sm">
            <app-icon name="heroCheckCircle" />
            <span>{{ store.notice() }}</span>
          </div>
        }
        @if (store.accountsError()) {
          <div role="alert" class="alert alert-warning mb-3 text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ store.accountsError() }}</span>
          </div>
        }

        <div class="flex flex-wrap items-center gap-1">
          <app-status-badge
            size="xs"
            [type]="store.statusType(detailPurchase)"
            [label]="store.statusLabel(detailPurchase)"
          />
          <app-status-badge
            size="xs"
            type="neutral"
            [label]="store.settlementLabel(detailPurchase)"
          />
        </div>

        @if (
          store.permissions.has('ManageCommunications') && store.permissions.has('ViewFinancials')
        ) {
          <app-document-send
            class="mt-3 block"
            documentType="purchase_order"
            [subjectId]="detailPurchase.id"
            title="Send purchase order"
            description="Supplier and costs come from this purchase."
            [allowCompanyCopy]="true"
            (sent)="store.setNotice($event)"
            (failed)="store.setError($event)"
          />
        }

        <div class="mt-3 grid grid-cols-2 gap-2">
          <app-stat-card
            label="Supplier invoice"
            [value]="
              store.permissions.has('ViewFinancials') ? fmt(detailPurchase.total_cost) : 'Hidden'
            "
          />
          <app-stat-card
            label="Paid"
            [value]="store.permissions.has('ViewFinancials') ? fmt(detailPurchase.paid) : 'Hidden'"
            [tone]="detailPurchase.paid >= detailPurchase.total_cost ? 'success' : 'warning'"
            [sub]="
              detailPurchase.total_cost > detailPurchase.paid &&
              store.permissions.has('ViewFinancials')
                ? 'Still to pay ' + fmt(detailPurchase.total_cost - detailPurchase.paid)
                : undefined
            "
          />
        </div>

        @if (detailPurchase.claim_input_vat && store.permissions.has('ViewFinancials')) {
          <section class="mt-3 rounded-field border border-base-300 p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <h3 class="section-title">Input VAT</h3>
              <app-status-badge size="xs" type="success" label="Claimed" />
            </div>
            <dl class="mt-2 grid grid-cols-2 gap-2">
              <div>
                <dt class="type-caption">Net cost</dt>
                <dd>{{ fmt(detailPurchase.net_total) }}</dd>
              </div>
              <div>
                <dt class="type-caption">Recoverable VAT</dt>
                <dd>{{ fmt(detailPurchase.input_tax_total) }}</dd>
              </div>
              <div>
                <dt class="type-caption">Tax invoice</dt>
                <dd>{{ detailPurchase.tax_invoice_number }}</dd>
              </div>
              <div>
                <dt class="type-caption">Supplier PIN</dt>
                <dd>{{ detailPurchase.supplier_tax_pin }}</dd>
              </div>
            </dl>
          </section>
        }

        @if (store.loading()) {
          <div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
            <span class="loading loading-spinner loading-md"></span>
            <span class="text-sm">Loading purchase details…</span>
          </div>
        } @else {
          <div class="mt-4 flex flex-col gap-4">
            <section>
              <h3 class="section-title mb-2">Items</h3>
              <ul class="divide-y divide-base-200">
                @for (line of store.lines(); track line.id) {
                  <li class="flex items-center gap-3 py-2">
                    <div class="min-w-0 flex-1">
                      @if (store.variant(line.variant_id)?.product_id; as productId) {
                        <a
                          class="link block truncate text-sm font-medium"
                          routerLink="/inventory/products"
                          [queryParams]="{ product: productId, variant: line.variant_id }"
                          >{{ store.lineLabel(line.variant_id) }}</a
                        >
                      } @else {
                        <p class="truncate text-sm font-medium">
                          {{ store.lineLabel(line.variant_id) }}
                        </p>
                      }
                      <p class="type-caption">
                        {{ line.quantity }} × {{ fmt(line.unit_cost) }}
                        @if (line.expiry_date) {
                          · exp {{ line.expiry_date }}
                        }
                        @if (line.batch_number) {
                          · batch {{ line.batch_number }}
                        }
                      </p>
                    </div>
                    <strong class="tabular-nums">{{ fmt(line.line_total) }}</strong>
                  </li>
                } @empty {
                  <li>
                    <app-empty-state
                      [compact]="true"
                      icon="heroShoppingCart"
                      title="No line items"
                    />
                  </li>
                }
              </ul>
            </section>

            @if (store.expenses().length > 0) {
              <section class="border-t border-base-300 pt-3">
                <h3 class="section-title mb-2">Additional expenses</h3>
                <ul class="divide-y divide-base-200">
                  @for (expense of store.expenses(); track expense.id) {
                    <li class="flex justify-between gap-3 py-2 text-sm">
                      <span class="capitalize">{{ expense.custom_label || expense.category }}</span>
                      <strong>{{ fmt(expense.amount) }}</strong>
                    </li>
                  }
                </ul>
              </section>
            }

            <section class="border-t border-base-300 pt-3">
              <h3 class="section-title mb-2">Payments</h3>
              <ul class="divide-y divide-base-200">
                @for (payment of store.payments(); track payment.id) {
                  <li class="flex justify-between gap-3 py-2 text-sm">
                    <span>{{ payment.account_code }} · {{ store.date(payment.created_at) }}</span>
                    <strong>{{ fmt(payment.amount) }}</strong>
                  </li>
                } @empty {
                  <li class="type-caption py-2">No payments recorded.</li>
                }
              </ul>
            </section>

            @if (
              detailPurchase.paid < detailPurchase.total_cost &&
              store.permissions.has('ManageSupplierCreditPurchases')
            ) {
              <section class="border-t border-base-300 pt-3">
                @if (!store.cashierSession.canTakePayment()) {
                  <app-session-required-notice action="paying a supplier" />
                }
                <div class="flex flex-wrap gap-2">
                  @if (store.supplierAdvance() > 0) {
                    <button
                      appButton
                      variant="soft"
                      type="button"
                      [loading]="store.busy()"
                      (click)="runMutation('advance')"
                    >
                      Use {{ fmt(store.supplierAdvance()) }} advance
                    </button>
                  }
                  @if (!store.paymentOpen()) {
                    <button appButton type="button" (click)="store.startPayment()">
                      Record payment
                    </button>
                  }
                </div>
                @if (store.paymentOpen()) {
                  <form
                    class="mt-3 grid gap-2 sm:grid-cols-2"
                    (submit)="$event.preventDefault(); runMutation('payment')"
                  >
                    <app-form-field label="Amount (KES)">
                      <input
                        class="input input-bordered w-full"
                        inputmode="numeric"
                        [formControl]="store.paymentAmount"
                      />
                    </app-form-field>
                    <app-form-field label="Pay from" [error]="store.accountSelectionError()">
                      <select
                        class="select select-bordered w-full"
                        [formControl]="store.paymentAccount"
                      >
                        @for (account of store.accounts(); track account.code) {
                          <option [value]="account.code">
                            {{ account.code }} — {{ account.name }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    <div class="flex gap-2 sm:col-span-2">
                      <button
                        appButton
                        type="submit"
                        [loading]="store.busy()"
                        [disabled]="!store.cashierSession.canTakePayment()"
                      >
                        Save payment
                      </button>
                      <button
                        appButton
                        variant="ghost"
                        type="button"
                        (click)="store.closePayment()"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                }
              </section>
            }

            @if (
              detailPurchase.paid === 0 &&
              store.permissions.has('ManageSupplierCreditPurchases') &&
              store.permissions.has('ReverseOrder')
            ) {
              <section class="border-t border-base-300 pt-3">
                <details class="rounded-field border border-base-300 p-3">
                  <summary class="min-h-11 cursor-pointer py-2 text-sm font-medium">
                    Purchase entered incorrectly?
                  </summary>
                  <p class="type-caption mt-2">Reverse only if none of this stock has moved.</p>
                  <form class="mt-3" (submit)="$event.preventDefault(); runMutation('reversal')">
                    <app-form-field label="Why is this purchase being reversed?" [required]="true">
                      <input
                        class="input input-bordered w-full"
                        maxlength="500"
                        [formControl]="store.reversalReason"
                      />
                    </app-form-field>
                    <button
                      appButton
                      variant="outline"
                      class="mt-2"
                      type="submit"
                      [loading]="store.reversing()"
                    >
                      Reverse purchase
                    </button>
                  </form>
                </details>
              </section>
            }
          </div>
        }
      }
    </app-drawer>
  `,
})
export class PurchaseDetailDrawerComponent {
  readonly purchase = input.required<PurchaseRow>();
  readonly supplierName = input.required<string>();
  readonly closed = output<void>();
  readonly changed = output<PurchaseDetailChangedResult>();

  protected readonly store = inject(PurchaseDetailStore);
  protected readonly fmt = formatKes;

  constructor() {
    effect(() => void this.store.open(this.purchase()));
  }

  protected requestClose(): void {
    this.store.close();
    this.closed.emit();
  }

  protected async runMutation(kind: 'payment' | 'advance' | 'reversal'): Promise<void> {
    const result =
      kind === 'payment'
        ? await this.store.payPurchase()
        : kind === 'advance'
          ? await this.store.applyAdvance()
          : await this.store.reversePurchase();
    if (result) this.changed.emit(result);
  }
}
