import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { StatusBadgeComponent, type BadgeType } from '../shared/ui/status-badge.component';
import { SupplierAccountStore } from './supplier-account.store';
import {
  SupplierProfileFormComponent,
  type SupplierProfileFormResult,
} from './supplier-profile-form.component';

export interface SupplierDetailMetrics {
  purchases: number;
  averageOrder: number;
  openPurchases: number;
  activeLocationName: string;
}

/** Supplier profile and AP-account workspace. All financial commands delegate to one scoped store. */
@Component({
  selector: 'app-supplier-detail-drawer',
  providers: [SupplierAccountStore],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    DrawerComponent,
    EmptyStateComponent,
    EntityAvatarComponent,
    FormFieldComponent,
    IconComponent,
    SessionRequiredNoticeComponent,
    StatCardComponent,
    StatusBadgeComponent,
    SupplierProfileFormComponent,
  ],
  template: `
    <app-drawer [open]="true" (closed)="requestClose()" [title]="title()" [subtitle]="subtitle()">
      @if (!creating() && !editing() && store.supplier(); as supplier) {
        <app-entity-avatar
          leading
          size="sm"
          [firstName]="supplier.first_name"
          [lastName]="supplier.last_name ?? ''"
        />
      }
      @if (!creating() && !editing() && store.supplier()) {
        <button
          drawerActions
          appButton
          variant="ghost"
          [iconOnly]="true"
          type="button"
          title="Edit supplier"
          aria-label="Edit supplier"
          (click)="editing.set(true)"
        >
          <app-icon name="heroPencilSquare" />
        </button>
      }

      @if (creating() || editing()) {
        <app-supplier-profile-form
          [supplier]="creating() ? null : store.supplier()"
          [canManageCredit]="store.permissions.has('ManageSupplierCreditPurchases')"
          (saved)="profileSaved($event)"
          (failed)="localError.set($event)"
          (cancelled)="cancelProfile()"
        />
      } @else if (store.supplier(); as supplier) {
        @if (localError() || store.error(); as error) {
          <div class="alert alert-error mb-3 text-sm" role="alert">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ localError() || error }}</span>
          </div>
        }
        @if (store.notice()) {
          <div class="alert alert-success mb-3 text-sm" role="status">
            <app-icon name="heroCheckCircle" />
            <span>{{ store.notice() }}</span>
          </div>
        }

        <div class="flex flex-wrap items-center gap-1">
          <app-status-badge
            size="xs"
            [type]="supplier.supplier_active ? 'success' : 'neutral'"
            [label]="supplier.supplier_active ? 'Active' : 'Archived'"
          />
          @if (supplier.days_outstanding !== null) {
            <span class="type-caption">{{ supplier.days_outstanding }}d</span>
            <app-status-badge
              size="xs"
              [type]="bucketType(supplier.bucket)"
              [label]="supplier.bucket ?? 'current'"
            />
          }
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <app-stat-card
            label="We owe"
            [value]="store.permissions.has('ViewFinancials') ? fmt(supplier.ap_balance) : 'Hidden'"
            [tone]="supplier.ap_balance > 0 ? 'warning' : 'neutral'"
          />
          <app-stat-card
            label="Advance with supplier"
            [value]="store.permissions.has('ViewFinancials') ? fmt(store.advance()) : 'Hidden'"
            [tone]="store.advance() > 0 ? 'success' : 'neutral'"
            [sub]="store.netPosition()"
          />
          <app-stat-card
            label="Credit available"
            [value]="
              !store.permissions.has('ViewFinancials')
                ? 'Hidden'
                : supplier.supplier_credit_limit > 0
                  ? fmt(Math.max(0, supplier.supplier_credit_limit - supplier.ap_balance))
                  : 'No cap'
            "
            [sub]="
              supplier.supplier_credit_limit > 0
                ? 'Limit ' + fmt(supplier.supplier_credit_limit)
                : (supplier.supplier_credit_terms_days || 0) + 'd terms'
            "
          />
        </div>

        <div class="mt-3 rounded-field border border-base-300 p-3 text-sm">
          <div class="grid gap-2 sm:grid-cols-2">
            <div>
              <p class="type-caption">Contact</p>
              <p>{{ supplier.phone || supplier.email || 'Not provided' }}</p>
            </div>
            <div>
              <p class="type-caption">Supplier tax PIN</p>
              <p>{{ supplier.tax_registration_number || 'Not provided' }}</p>
            </div>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2 rounded-field bg-base-200/50 p-3 text-sm">
          <div>
            <p class="type-caption">Purchases</p>
            <p class="font-semibold">{{ metrics().purchases }}</p>
          </div>
          <div>
            <p class="type-caption">Open purchases</p>
            <p class="font-semibold">{{ metrics().openPurchases }}</p>
          </div>
          <div>
            <p class="type-caption">Average order</p>
            <p class="font-semibold">{{ fmt(metrics().averageOrder) }}</p>
          </div>
          <div>
            <p class="type-caption">Stock sourced · {{ metrics().activeLocationName }}</p>
            @if (store.stockLoading()) {
              <span class="loading loading-spinner loading-xs"></span>
            } @else {
              <p class="font-semibold">
                {{ store.stock().length }} variants
                @if (store.permissions.has('ViewFinancials')) {
                  · {{ fmt(store.stockValue()) }}
                }
              </p>
              <a
                class="link type-caption"
                routerLink="/inventory/products"
                [queryParams]="{ supplier: supplier.id }"
                >View products</a
              >
            }
          </div>
        </div>

        @if (store.loading()) {
          <div class="flex justify-center py-6">
            <span class="loading loading-spinner loading-md"></span>
          </div>
        } @else {
          <div class="mt-4 flex flex-col gap-4">
            @if (store.permissions.has('ManageSupplierCreditPurchases')) {
              <section>
                <h3 class="section-title">Supplier advance</h3>
                <p class="type-caption mt-1">Held separately until it is applied to a purchase.</p>
                <form
                  class="mt-3 grid gap-2 sm:grid-cols-2"
                  (submit)="$event.preventDefault(); runMutation('advance')"
                >
                  <app-form-field label="Advance amount (KES)">
                    <input
                      class="input input-bordered w-full"
                      inputmode="numeric"
                      [formControl]="store.advanceAmount"
                    />
                  </app-form-field>
                  <app-form-field label="Pay from" [error]="store.accountSelectionError()">
                    <select
                      class="select select-bordered w-full"
                      [formControl]="store.advanceAccount"
                    >
                      @for (account of store.accounts(); track account.code) {
                        <option [value]="account.code">
                          {{ account.code }} — {{ account.name }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-form-field label="Reference">
                    <input
                      class="input input-bordered w-full"
                      [formControl]="store.advanceReference"
                    />
                  </app-form-field>
                  <button
                    appButton
                    type="submit"
                    class="self-end justify-self-start"
                    [loading]="store.busy()"
                    [disabled]="!store.cashierSession.canTakePayment()"
                  >
                    Record advance
                  </button>
                </form>

                @if (store.advance() > 0) {
                  <details class="mt-3 rounded-field border border-base-300 p-3">
                    <summary class="min-h-11 cursor-pointer py-2 text-sm font-medium">
                      Supplier returned unused advance
                    </summary>
                    <form
                      class="mt-2 grid gap-2 sm:grid-cols-2"
                      (submit)="$event.preventDefault(); runMutation('return')"
                    >
                      <app-form-field label="Amount returned (KES)">
                        <input
                          class="input input-bordered w-full"
                          inputmode="numeric"
                          [formControl]="store.advanceReturnAmount"
                        />
                      </app-form-field>
                      <app-form-field label="Received into" [error]="store.accountSelectionError()">
                        <select
                          class="select select-bordered w-full"
                          [formControl]="store.advanceReturnAccount"
                        >
                          @for (account of store.accounts(); track account.code) {
                            <option [value]="account.code">{{ account.name }}</option>
                          }
                        </select>
                      </app-form-field>
                      <app-form-field label="Reason" [required]="true">
                        <input
                          class="input input-bordered w-full"
                          [formControl]="store.advanceReturnReason"
                        />
                      </app-form-field>
                      <app-form-field label="Reference">
                        <input
                          class="input input-bordered w-full"
                          [formControl]="store.advanceReturnReference"
                        />
                      </app-form-field>
                      <button
                        appButton
                        variant="outline"
                        type="submit"
                        class="self-end justify-self-start"
                        [loading]="store.busy()"
                      >
                        Record return
                      </button>
                    </form>
                  </details>
                }
              </section>

              <section class="border-t border-base-300 pt-3">
                <h3 class="section-title">Pay this supplier</h3>
                @if (supplier.ap_balance <= 0) {
                  <p class="type-caption mt-1">We do not owe this supplier.</p>
                } @else {
                  @if (!store.cashierSession.canTakePayment()) {
                    <app-session-required-notice action="paying a supplier" />
                  }
                  <form
                    class="mt-3 grid gap-2 sm:grid-cols-2"
                    (submit)="$event.preventDefault(); runMutation('payment')"
                  >
                    <app-form-field label="Amount (KES)">
                      <input
                        class="input input-bordered w-full"
                        inputmode="numeric"
                        [formControl]="store.payAmount"
                      />
                    </app-form-field>
                    <app-form-field label="Pay from" [error]="store.accountSelectionError()">
                      <select
                        class="select select-bordered w-full"
                        [formControl]="store.payAccount"
                      >
                        @for (account of store.accounts(); track account.code) {
                          <option [value]="account.code">
                            {{ account.code }} — {{ account.name }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    <button
                      appButton
                      type="submit"
                      class="self-start sm:col-span-2"
                      [loading]="store.busy()"
                      [disabled]="
                        !store.cashierSession.canTakePayment() ||
                        store.accountLoading() ||
                        store.accountStatus()?.is_consistent !== true
                      "
                    >
                      Record supplier payment
                    </button>
                  </form>
                  @if (store.accountStatus()?.is_consistent === false) {
                    <p class="type-caption mt-2 text-error">
                      Payment unavailable until Finance reconciles this account.
                    </p>
                  }
                }
              </section>
            }

            @if (store.permissions.has('ViewFinancials')) {
              <section class="border-t border-base-300 pt-3">
                <h3 class="section-title">Account activity</h3>
                @if (store.accountStatus()?.is_consistent === false) {
                  <div role="alert" class="alert alert-error mt-3 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span
                      >Payments are paused until Finance reconciles purchases and the ledger.</span
                    >
                  </div>
                }
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                  <a
                    appButton
                    variant="outline"
                    routerLink="/purchases/new"
                    [queryParams]="{ supplier: supplier.id }"
                  >
                    <app-icon name="heroDocumentText" /> Missing purchase
                  </a>
                  <a
                    appButton
                    variant="ghost"
                    routerLink="/purchases"
                    [queryParams]="{ supplier: supplier.id, range: 'all' }"
                  >
                    <app-icon name="heroShoppingCart" /> Purchase history
                  </a>
                </div>

                <details class="mt-3 rounded-field border border-base-300 p-3">
                  <summary class="min-h-11 cursor-pointer py-2 text-sm font-medium">
                    Recent payments and reversals
                  </summary>
                  <ul class="divide-y divide-base-300">
                    @for (payment of store.payments(); track payment.id) {
                      <li class="py-3">
                        <div class="flex items-center justify-between gap-3">
                          <div>
                            <p class="text-sm font-medium">{{ payment.account_code }}</p>
                            <p class="type-caption">
                              {{ date(payment.created_at) }} · {{ payment.status }}
                            </p>
                          </div>
                          <strong>{{ fmt(payment.amount) }}</strong>
                        </div>
                        @if (payment.status === 'posted' && store.permissions.has('ReverseOrder')) {
                          @if (store.reversingPaymentId() === payment.id) {
                            <form
                              class="mt-2"
                              (submit)="$event.preventDefault(); reversePayment(payment)"
                            >
                              <app-form-field label="Why is this payment wrong?" [required]="true">
                                <input
                                  class="input input-bordered w-full"
                                  maxlength="500"
                                  [formControl]="store.paymentReversalReason"
                                />
                              </app-form-field>
                              <div class="mt-2 flex gap-2">
                                <button appButton type="submit" [loading]="store.busy()">
                                  Reverse payment
                                </button>
                                <button
                                  appButton
                                  variant="ghost"
                                  type="button"
                                  (click)="store.cancelPaymentReversal()"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          } @else {
                            <button
                              appButton
                              variant="ghost"
                              type="button"
                              class="mt-2"
                              (click)="store.startPaymentReversal(payment.id)"
                            >
                              Reverse
                            </button>
                          }
                        }
                      </li>
                    } @empty {
                      <li class="type-caption py-3">No reversible payments recorded.</li>
                    }
                  </ul>
                </details>
              </section>
            }

            @if (store.permissions.has('ManageSupplierCreditPurchases')) {
              <section class="border-t border-base-300 pt-3">
                <h3 class="section-title">Credit terms</h3>
                <form
                  class="mt-3 grid gap-2 sm:grid-cols-2"
                  (submit)="$event.preventDefault(); saveCredit()"
                >
                  <app-form-field label="Credit limit (KES)">
                    <input
                      class="input input-bordered w-full"
                      inputmode="numeric"
                      [formControl]="store.creditLimit"
                    />
                  </app-form-field>
                  <app-form-field label="Terms (days)">
                    <input
                      type="number"
                      min="0"
                      class="input input-bordered w-full"
                      [formControl]="store.termsDays"
                    />
                  </app-form-field>
                  <div class="flex flex-wrap gap-2 sm:col-span-2">
                    <button appButton type="submit" [loading]="store.busy()">Save terms</button>
                    <button
                      appButton
                      variant="outline"
                      type="button"
                      [disabled]="store.busy() || directoryBusy()"
                      (click)="requestActiveToggle(supplier)"
                    >
                      {{ supplier.supplier_active ? 'Archive supplier' : 'Reactivate supplier' }}
                    </button>
                  </div>
                </form>
              </section>
            }

            <section class="border-t border-base-300 pt-3">
              <div class="flex items-center justify-between gap-2">
                <h3 class="section-title">Recent purchases</h3>
                <a
                  class="link type-caption"
                  routerLink="/purchases"
                  [queryParams]="{ supplier: supplier.id, range: 'all' }"
                  >View all</a
                >
              </div>
              <ul class="mt-2 divide-y divide-base-200">
                @for (purchase of store.purchases(); track purchase.id) {
                  <li class="flex items-center gap-3 py-2">
                    <div class="min-w-0 flex-1">
                      <a
                        class="link block truncate text-sm font-medium"
                        routerLink="/purchases"
                        [queryParams]="{ purchase: purchase.id }"
                      >
                        {{ purchase.reference || 'Purchase' }}
                      </a>
                      <p class="type-caption">
                        {{ date(purchase.purchase_date) }} ·
                        {{ fmt(purchase.total_cost - purchase.paid) }} due
                      </p>
                    </div>
                    @if (purchase.paid < purchase.total_cost && store.advance() > 0) {
                      <button
                        appButton
                        variant="soft"
                        type="button"
                        [loading]="store.busy()"
                        (click)="applyAdvance(purchase)"
                      >
                        Use advance
                      </button>
                    }
                  </li>
                } @empty {
                  <li>
                    <app-empty-state
                      [compact]="true"
                      icon="heroShoppingCart"
                      title="No purchases yet"
                    />
                  </li>
                }
              </ul>
            </section>

            @if (store.advanceActivity().length > 0 && store.permissions.has('ViewFinancials')) {
              <section class="border-t border-base-300 pt-3">
                <h3 class="section-title">Advance activity</h3>
                <ul class="mt-2 divide-y divide-base-200">
                  @for (activity of store.advanceActivity(); track activity.id) {
                    <li class="flex justify-between gap-3 py-2 text-sm">
                      <span>{{ activity.description }} · {{ date(activity.occurred_at) }}</span>
                      <strong>{{ fmt(activity.amount) }}</strong>
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
        }
      }
    </app-drawer>
  `,
})
export class SupplierDetailDrawerComponent {
  readonly supplierId = input<string | null>(null);
  readonly creating = input(false);
  readonly initialMode = input<'view' | 'edit'>('view');
  readonly directoryBusy = input(false);
  readonly metrics = input.required<SupplierDetailMetrics>();
  readonly closed = output<void>();
  readonly changed = output<SupplierProfileFormResult | { supplierId: string; mode: 'account' }>();
  readonly activeToggleRequested =
    output<NonNullable<ReturnType<SupplierAccountStore['supplier']>>>();

  protected readonly store = inject(SupplierAccountStore);
  private readonly parties = inject(PartyCacheService);
  protected readonly editing = signal(false);
  protected readonly localError = signal<string | null>(null);
  protected readonly fmt = formatKes;
  protected readonly Math = Math;

  protected readonly title = computed(() => {
    if (this.creating()) return 'New supplier';
    const supplier = this.store.supplier();
    if (!supplier) return 'Supplier';
    const name = [supplier.first_name, supplier.last_name].filter(Boolean).join(' ');
    return this.editing() ? `Edit ${name}` : name;
  });
  protected readonly subtitle = computed(() => {
    if (this.creating()) return undefined;
    const supplier = this.store.supplier();
    return supplier ? supplier.phone || supplier.email || undefined : undefined;
  });

  constructor() {
    effect(() => {
      const id = this.supplierId();
      const creating = this.creating();
      const initialMode = this.initialMode();
      this.editing.set(!creating && initialMode === 'edit');
      this.localError.set(null);
      if (id && !creating) void this.store.open(id);
      else this.store.close();
    });
  }

  protected requestClose(): void {
    if (this.editing()) {
      this.editing.set(false);
      return;
    }
    this.store.close();
    this.closed.emit();
  }

  protected cancelProfile(): void {
    if (this.creating()) this.closed.emit();
    else this.editing.set(false);
  }

  protected async profileSaved(result: SupplierProfileFormResult): Promise<void> {
    this.parties.invalidate();
    await this.parties.ensureLoaded();
    this.editing.set(false);
    this.changed.emit(result);
    if (result.mode === 'updated') await this.store.open(result.supplierId);
  }

  protected async runMutation(kind: 'advance' | 'return' | 'payment'): Promise<void> {
    const ok =
      kind === 'advance'
        ? await this.store.recordAdvance()
        : kind === 'return'
          ? await this.store.recordAdvanceReturn()
          : await this.store.paySupplier();
    if (ok) this.emitAccountChanged();
  }

  protected async reversePayment(
    payment: Parameters<SupplierAccountStore['reversePayment']>[0]
  ): Promise<void> {
    if (await this.store.reversePayment(payment)) this.emitAccountChanged();
  }

  protected async applyAdvance(
    purchase: Parameters<SupplierAccountStore['applyAdvanceToPurchase']>[0]
  ): Promise<void> {
    if (await this.store.applyAdvanceToPurchase(purchase)) this.emitAccountChanged();
  }

  protected async saveCredit(): Promise<void> {
    if (await this.store.saveCreditTerms()) this.emitAccountChanged();
  }

  protected requestActiveToggle(
    supplier: NonNullable<ReturnType<SupplierAccountStore['supplier']>>
  ): void {
    this.activeToggleRequested.emit(supplier);
  }

  protected bucketType(bucket: string | null): BadgeType {
    if (bucket === '60+') return 'error';
    if (bucket === '31-60') return 'warning';
    if (bucket === '8-30') return 'info';
    return 'neutral';
  }

  protected date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      month: 'short',
      day: 'numeric',
    });
  }

  private emitAccountChanged(): void {
    const supplierId = this.store.supplierId();
    if (supplierId) this.changed.emit({ supplierId, mode: 'account' });
  }
}
