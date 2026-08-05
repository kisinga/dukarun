import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { reconciliationLabel, reconciliationTypeForCode } from '../core/payment-methods';
import { PermissionsService } from '../core/permissions.service';
import {
  AgingInfo,
  CustomerStatementRow,
  MoneyCustomer,
  MoneyService,
} from '../money/money.service';
import { OrderWithCustomer, PosService } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import {
  StatusBadgeComponent,
  ORDER_STATUS_MAP,
  type BadgeType,
} from '../shared/ui/status-badge.component';
import { CashierSessionService } from '../core/cashier-session.service';
import { CompanyPrintInfo, ReceiptDataService } from '../shared/print/receipt-data.service';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';

type CustomerWithAr = MoneyCustomer & { ar_balance: number } & AgingInfo;
type CreditOrder = {
  id: string;
  code: string;
  total: number;
  status: string;
  created_at: string;
};

@Component({
  selector: 'app-customers',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    FormFieldComponent,
    ButtonComponent,
    MoneyComponent,
    IconComponent,
    EmptyStateComponent,
    EntityAvatarComponent,
    ListSearchBarComponent,
    StatusBadgeComponent,
    SessionRequiredNoticeComponent,
    PaginationComponent,
    DataTableShellComponent,
    DrawerComponent,
    StatBarComponent,
    StatCardComponent,
  ],
  template: `
    <app-page
      title="Customers"
      subtitle="Manage customer details, credit access, balances, and repayment history."
      [wide]="true"
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        title="Refresh customers"
        aria-label="Refresh customers"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
      <button actions appButton type="button" (click)="startCreate()">
        <app-icon name="heroPlus" /> Add customer
      </button>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">{{ error() }}</div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">{{ notice() }}</div>
      }

      <!-- Shared list summary and search toolbar -->
      <app-list-search-bar
        placeholder="Search name or phone…"
        [searchQuery]="query()"
        (searchQueryChange)="query.set($event); customerPage.set(1)"
      >
        <app-stat-bar summary [stats]="customerStats()" />
      </app-list-search-bar>

      <!-- List -->
      @if (!loading() && filtered().length === 0) {
        <app-empty-state
          icon="heroUsers"
          title="No customers found"
          description="Add a customer with the + button to sell on credit, or clear the search."
        />
      } @else {
        <div class="mb-3 hidden lg:block">
          <app-data-table-shell
            title="Customer accounts"
            [description]="filtered().length + ' matching customers'"
          >
            <table class="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Credit</th>
                  <th>Aging</th>
                  <th class="text-right">Owed to us</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (c of pagedCustomers(); track c.id) {
                  <tr
                    role="button"
                    tabindex="0"
                    [class.table-row-active]="selectedCustomerId() === c.id"
                    (click)="openCustomer(c.id)"
                    (keydown.enter)="openCustomer(c.id)"
                  >
                    <td>
                      <div class="table-entity">
                        <app-entity-avatar
                          size="sm"
                          [firstName]="c.first_name"
                          [lastName]="c.last_name ?? ''"
                        />
                        <div class="min-w-0">
                          <p class="table-primary truncate">{{ name(c) }}</p>
                          <p class="table-secondary truncate">{{ c.notes || 'No notes' }}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p class="table-primary">{{ c.phone || '—' }}</p>
                      <p class="table-secondary">{{ c.email || 'No email' }}</p>
                    </td>
                    <td>
                      <div class="flex flex-wrap items-center gap-1">
                        <app-status-badge
                          size="xs"
                          [type]="c.is_credit_approved ? 'success' : 'neutral'"
                          [label]="c.is_credit_approved ? 'Approved' : 'Not approved'"
                        />
                      </div>
                      <p class="table-secondary">
                        @if (c.credit_limit > 0) {
                          Limit <app-money [amount]="c.credit_limit" />
                        } @else {
                          No credit cap
                        }
                      </p>
                    </td>
                    <td>
                      @if (c.days_outstanding !== null) {
                        <p class="table-primary">{{ c.days_outstanding }} days</p>
                        <p class="table-secondary">{{ c.bucket }}</p>
                      } @else {
                        <span class="text-base-content/40">—</span>
                      }
                    </td>
                    <td
                      class="table-number"
                      [class.text-error]="c.ar_balance > 0"
                      [class.text-base-content/50]="c.ar_balance === 0"
                    >
                      <app-money [amount]="c.ar_balance" [masked]="!perms.has('ViewFinancials')" />
                    </td>
                    <td class="table-actions" (click)="$event.stopPropagation()">
                      <button
                        appButton
                        variant="ghost"
                        [iconOnly]="true"
                        type="button"
                        title="Edit customer"
                        aria-label="Edit customer"
                        (click)="startEdit(c)"
                      >
                        <app-icon name="heroPencilSquare" />
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="flex flex-col gap-2 lg:hidden">
          @for (c of pagedCustomers(); track c.id) {
            <div
              class="card cursor-pointer bg-base-100"
              role="button"
              tabindex="0"
              [class.border-primary]="selectedCustomerId() === c.id"
              (click)="openCustomer(c.id)"
              (keydown.enter)="openCustomer(c.id)"
            >
              <div class="card-body p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <app-entity-avatar
                    size="sm"
                    [firstName]="c.first_name"
                    [lastName]="c.last_name ?? ''"
                  />
                  <span class="font-semibold">{{ name(c) }}</span>
                  <span class="text-xs text-base-content/60">{{ c.phone ?? '' }}</span>
                  <span
                    class="ml-auto"
                    [class.font-bold]="c.ar_balance > 0"
                    [class.text-error]="c.ar_balance > 0"
                    [class.text-base-content/60]="c.ar_balance === 0"
                  >
                    <app-money [amount]="c.ar_balance" [masked]="!perms.has('ViewFinancials')" />
                    owed to us
                  </span>
                  <button
                    appButton
                    variant="ghost"
                    (click)="$event.stopPropagation(); startEdit(c)"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Customer detail/edit drawer -->
        @if (selectedCustomerId() !== null || creating()) {
          <app-drawer
            [open]="true"
            (closed)="closeCustomerDrawer()"
            [title]="drawerTitle()"
            [subtitle]="drawerSubtitle()"
          >
            @if (detailCustomer(); as c) {
              <app-entity-avatar
                leading
                size="sm"
                [firstName]="c.first_name"
                [lastName]="c.last_name ?? ''"
              />
            }
            @if (detailCustomer(); as c) {
              <button
                actions
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                title="Edit customer"
                aria-label="Edit customer"
                (click)="editFromDrawer(c)"
              >
                <app-icon name="heroPencilSquare" />
              </button>
            }

            @if (creating() || drawerEditing()) {
              <!-- Create / edit mode: the same 5-field form, in place -->
              <form (submit)="$event.preventDefault(); save()" class="flex flex-col gap-3">
                <p class="type-caption">
                  Contact details are kept separate from credit, sales, and repayment history.
                </p>
                <app-form-field label="First name" [required]="true">
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    autocomplete="given-name"
                    [formControl]="firstName"
                  />
                </app-form-field>
                <app-form-field label="Last name">
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    autocomplete="family-name"
                    [formControl]="lastName"
                  />
                </app-form-field>
                <app-form-field label="Phone">
                  <input
                    type="tel"
                    class="input input-bordered input-sm w-full"
                    autocomplete="tel"
                    [formControl]="phone"
                  />
                </app-form-field>
                <app-form-field label="Email">
                  <input
                    type="email"
                    class="input input-bordered input-sm w-full"
                    autocomplete="email"
                    [formControl]="email"
                  />
                </app-form-field>
                <app-form-field label="Notes">
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Preferences, delivery notes, or context…"
                    [formControl]="notes"
                  />
                </app-form-field>
                <div class="flex gap-2">
                  <button
                    appButton
                    type="submit"
                    [loading]="busy()"
                    [disabled]="firstName.value.trim().length === 0"
                  >
                    {{ editing() ? 'Save changes' : 'Create customer' }}
                  </button>
                  <button appButton variant="ghost" type="button" (click)="closeForm()">
                    Cancel
                  </button>
                </div>
              </form>
            } @else if (selectedCustomer(); as c) {
              <div class="grid grid-cols-2 gap-2">
                <app-stat-card
                  label="Owed to us"
                  [value]="perms.has('ViewFinancials') ? fmtKes(c.ar_balance) : 'Hidden'"
                  [tone]="c.ar_balance > 0 ? 'error' : 'neutral'"
                  [sub]="
                    c.days_outstanding !== null
                      ? c.days_outstanding + ' days · ' + c.bucket
                      : undefined
                  "
                />
                <app-stat-card
                  label="Credit available"
                  [value]="
                    !perms.has('ViewFinancials')
                      ? 'Hidden'
                      : c.credit_limit > 0
                        ? fmtKes(customerCreditAvailable(c))
                        : 'No cap'
                  "
                  [sub]="
                    c.credit_limit > 0
                      ? 'Limit ' + fmtKes(c.credit_limit)
                      : (c.credit_terms_days ?? 0) + 'd terms'
                  "
                />
              </div>

              @if (detailLoading()) {
                <div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
                  <span class="loading loading-spinner loading-md"></span>
                  <span class="text-sm">Loading account details…</span>
                </div>
              } @else {
                <div class="mt-4 flex flex-col gap-4">
                  <section>
                    <h3 class="section-title mb-2">Credit</h3>
                    <div class="flex flex-wrap items-center gap-2">
                      <app-status-badge
                        size="xs"
                        [type]="c.is_credit_approved ? 'success' : 'neutral'"
                        [label]="c.is_credit_approved ? 'Approved' : 'Not approved'"
                      />
                      <span class="type-caption">{{ c.credit_terms_days ?? 0 }}d terms</span>
                      @if (c.days_outstanding !== null) {
                        <span class="type-caption">{{ c.days_outstanding }}d</span>
                        <app-status-badge
                          size="xs"
                          [type]="bucketType(c.bucket)"
                          [label]="c.bucket ?? 'current'"
                        />
                      }
                    </div>
                    @if (
                      perms.has('ApproveCustomerCredit') || perms.has('ManageCustomerCreditLimit')
                    ) {
                      <form
                        (submit)="$event.preventDefault(); saveCredit(c)"
                        class="mt-3 flex flex-col gap-2"
                      >
                        <app-form-field
                          label="Credit limit (KES)"
                          hint="Use 0 for no configured cap. Credit approval is controlled separately."
                        >
                          <input
                            type="text"
                            inputmode="numeric"
                            class="input input-bordered input-sm w-full"
                            [formControl]="creditLimit"
                          />
                        </app-form-field>
                        <app-form-field label="Terms (days)">
                          <input
                            type="number"
                            class="input input-bordered input-sm w-full"
                            [formControl]="termsDays"
                          />
                        </app-form-field>
                        <label class="label cursor-pointer justify-start gap-2">
                          <input
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            [formControl]="approved"
                          />
                          <span class="label-text">Approved for credit</span>
                        </label>
                        <button
                          appButton
                          variant="outline"
                          type="submit"
                          class="self-start"
                          [disabled]="busy()"
                        >
                          Save settings
                        </button>
                      </form>
                    }
                  </section>

                  <section class="border-t border-base-300/60 pt-3">
                    <h3 class="section-title mb-2">Credit sales</h3>
                    @if (!cashierSession.canTakePayment() && creditOrders().length > 0) {
                      <app-session-required-notice action="collecting a repayment" />
                    }
                    @if (creditOrders().length === 0) {
                      <app-empty-state
                        [compact]="true"
                        icon="heroCreditCard"
                        title="No unpaid credit sales"
                      />
                    } @else {
                      @if (perms.has('SettleOrder')) {
                        <form
                          (submit)="$event.preventDefault(); bulkRepay(c.id)"
                          class="mb-3 grid gap-2 rounded-field border border-base-300 bg-base-200/50 p-2 sm:grid-cols-3"
                        >
                          <app-form-field label="Payment received (KES)"
                            ><input
                              class="input input-bordered input-sm"
                              inputmode="numeric"
                              [formControl]="bulkAmount"
                          /></app-form-field>
                          <app-form-field label="Method"
                            ><select
                              class="select select-bordered select-sm"
                              [formControl]="bulkMethod"
                            >
                              @for (m of methods(); track m) {
                                <option [value]="m">{{ methodOptionLabel(m) }}</option>
                              }
                            </select></app-form-field
                          >
                          <app-form-field label="Reference"
                            ><input
                              class="input input-bordered input-sm"
                              [formControl]="bulkReference"
                          /></app-form-field>
                          <button
                            appButton
                            type="submit"
                            class="sm:col-span-3 sm:justify-self-start"
                            [disabled]="busy() || !cashierSession.canTakePayment()"
                          >
                            Allocate oldest first
                          </button>
                        </form>
                      }
                      <ul class="divide-y divide-base-200">
                        @for (o of creditOrders(); track o.id) {
                          <li class="py-2">
                            <div class="flex items-center gap-2">
                              <div class="min-w-0 flex-1">
                                <p class="font-mono text-sm font-medium">{{ o.code }}</p>
                                <p class="type-caption">{{ date(o.created_at) }}</p>
                              </div>
                              <app-status-badge
                                size="xs"
                                [type]="orderStatusType(o.status)"
                                [label]="o.status"
                              />
                              <span class="text-sm font-semibold tabular-nums"
                                ><app-money
                                  [amount]="o.total"
                                  [masked]="!perms.has('ViewFinancials')"
                              /></span>
                              @if (perms.has('SettleOrder')) {
                                <button
                                  appButton
                                  variant="outline"
                                  size="sm"
                                  [disabled]="!cashierSession.canTakePayment()"
                                  (click)="startRepay(o.id, o.total)"
                                >
                                  Repay
                                </button>
                              }
                            </div>
                            @if (repayFor() === o.id) {
                              <form
                                (submit)="$event.preventDefault(); repay(o.id)"
                                class="mt-2 flex flex-wrap items-end gap-2 rounded-field border border-base-300 bg-base-200/50 p-2"
                              >
                                <app-form-field label="Amount (KES)">
                                  <input
                                    type="text"
                                    inputmode="numeric"
                                    class="input input-bordered input-xs w-24"
                                    [formControl]="repayAmount"
                                  />
                                </app-form-field>
                                <app-form-field label="Method">
                                  <select
                                    class="select select-bordered select-xs"
                                    [formControl]="repayMethod"
                                  >
                                    @for (m of methods(); track m) {
                                      <option [value]="m">{{ methodOptionLabel(m) }}</option>
                                    }
                                  </select>
                                </app-form-field>
                                <app-form-field label="Reference">
                                  <input
                                    type="text"
                                    class="input input-bordered input-xs w-28"
                                    [formControl]="repayReference"
                                  />
                                </app-form-field>
                                <button
                                  appButton
                                  size="sm"
                                  type="submit"
                                  [disabled]="busy() || !cashierSession.canTakePayment()"
                                >
                                  Allocate
                                </button>
                                <button
                                  appButton
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  (click)="repayFor.set(null)"
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

                  <section class="border-t border-base-300/60 pt-3">
                    <h3 class="section-title mb-2">Sales history</h3>
                    @if (orders().length === 0) {
                      <app-empty-state
                        [compact]="true"
                        icon="heroShoppingCart"
                        title="No sales yet"
                      />
                    } @else {
                      <ul class="max-h-80 divide-y divide-base-200 overflow-y-auto">
                        @for (o of orders(); track o.id) {
                          <li class="flex items-center gap-2 py-2">
                            <div class="min-w-0 flex-1">
                              <p class="font-mono text-sm font-medium">{{ o.code }}</p>
                              <p class="type-caption">{{ date(o.created_at) }}</p>
                            </div>
                            <app-status-badge
                              size="xs"
                              [type]="orderStatusType(o.status)"
                              [label]="o.status"
                            />
                            @if (o.is_credit_sale) {
                              <app-status-badge size="xs" type="warning" label="credit" />
                            }
                            <span class="text-sm font-semibold tabular-nums">
                              <app-money
                                [amount]="o.total"
                                [masked]="!perms.has('ViewFinancials')"
                              />
                            </span>
                          </li>
                        }
                      </ul>
                    }
                  </section>

                  <section class="border-t border-base-300/60 pt-3 print:mt-0 print:border-0">
                    @if (companyInfo(); as company) {
                      <div class="mb-3 hidden text-center print:block">
                        @if (company.logoUrl) {
                          <img
                            [src]="company.logoUrl"
                            alt="Company logo"
                            class="mx-auto mb-1 max-h-16 object-contain"
                          />
                        }
                        <p class="font-bold">{{ company.name }}</p>
                        @if (company.address) {
                          <p class="text-sm">{{ company.address }}</p>
                        }
                      </div>
                    }
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <h3 class="section-title">Customer statement</h3>
                        <p class="type-caption">Sales, repayments and running balance.</p>
                      </div>
                      <button appButton variant="ghost" size="sm" (click)="printStatement()">
                        <app-icon name="heroPrinter" /> Print
                      </button>
                    </div>
                    @if (statement().length === 0) {
                      <app-empty-state
                        [compact]="true"
                        icon="heroDocumentText"
                        title="No statement activity"
                      />
                    } @else {
                      <ul
                        class="max-h-80 divide-y divide-base-200 overflow-y-auto print:max-h-none print:overflow-visible"
                      >
                        @for (row of statement(); track row.id) {
                          <li class="flex items-center gap-3 py-2">
                            <div class="min-w-0 flex-1">
                              <p class="truncate text-sm">{{ row.description }}</p>
                              <p class="type-caption">
                                {{ date(row.date) }} ·
                                <span class="font-mono">{{ row.reference }}</span>
                              </p>
                            </div>
                            <div class="shrink-0 text-right">
                              <p class="text-sm font-semibold tabular-nums">
                                <app-money [amount]="row.balance" />
                              </p>
                              <p class="type-caption">
                                @if (row.debit > 0) {
                                  charged <app-money [amount]="row.debit" direction="out" />
                                }
                                @if (row.credit > 0) {
                                  paid <app-money [amount]="row.credit" direction="in" />
                                }
                              </p>
                            </div>
                          </li>
                        }
                      </ul>
                    }
                    @if (perms.has('OverrideCustomerBalance')) {
                      <form
                        (submit)="$event.preventDefault(); adjustBalance(c.id)"
                        class="mt-3 flex flex-wrap items-end gap-2 print:hidden"
                      >
                        <app-form-field label="Balance adjustment (KES)"
                          ><input
                            class="input input-bordered input-sm w-32"
                            placeholder="Use - to reduce"
                            [formControl]="adjustmentAmount"
                        /></app-form-field>
                        <app-form-field label="Reason"
                          ><input
                            class="input input-bordered input-sm"
                            [formControl]="adjustmentReason"
                        /></app-form-field>
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          type="submit"
                          [disabled]="busy()"
                        >
                          Post adjustment
                        </button>
                      </form>
                    }
                  </section>
                </div>
              }
            }
          </app-drawer>
        }
        <div class="mt-3">
          <app-pagination
            [currentPage]="customerPage()"
            [totalPages]="customerTotalPages()"
            [totalItems]="filtered().length"
            [itemsPerPage]="customerPageSize()"
            itemLabel="customers"
            [showItemsPerPage]="true"
            (pageChange)="customerPage.set($event)"
            (itemsPerPageChange)="customerPageSize.set($event); customerPage.set(1)"
          />
        </div>
      }
    </app-page>
  `,
})
export class CustomersComponent implements OnInit {
  protected readonly cashierSession = inject(CashierSessionService);
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  protected readonly perms = inject(PermissionsService);
  protected readonly fmtKes = formatKes;

  protected readonly customers = signal<CustomerWithAr[]>([]);
  protected readonly selectedCustomerId = signal<string | null>(null);
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly creditOrders = signal<CreditOrder[]>([]);
  protected readonly statement = signal<CustomerStatementRow[]>([]);
  protected readonly companyInfo = signal<CompanyPrintInfo | null>(null);
  protected readonly methods = signal<string[]>([]);
  protected readonly repayFor = signal<string | null>(null);
  protected readonly detailLoading = signal(false);

  protected readonly query = signal('');
  protected readonly customerPage = signal(1);
  protected readonly customerPageSize = signal(10);
  /** Drawer edit mode: creating = empty form, drawerEditing = form for the open customer. */
  protected readonly creating = signal(false);
  protected readonly drawerEditing = signal(false);
  protected readonly editing = signal<CustomerWithAr | null>(null);

  protected readonly firstName = new FormControl('', { nonNullable: true });
  protected readonly lastName = new FormControl('', { nonNullable: true });
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly email = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });

  protected readonly repayAmount = new FormControl('', { nonNullable: true });
  protected readonly repayMethod = new FormControl('cash', { nonNullable: true });
  protected readonly repayReference = new FormControl('', { nonNullable: true });
  protected readonly bulkAmount = new FormControl('', { nonNullable: true });
  protected readonly bulkMethod = new FormControl('cash', { nonNullable: true });
  protected readonly bulkReference = new FormControl('', { nonNullable: true });
  protected readonly adjustmentAmount = new FormControl('', { nonNullable: true });
  protected readonly adjustmentReason = new FormControl('', { nonNullable: true });

  protected readonly creditLimit = new FormControl('', { nonNullable: true });
  protected readonly termsDays = new FormControl(0, { nonNullable: true });
  protected readonly approved = new FormControl(false, { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly filtered = computed(() => {
    const q = this.query().toLowerCase();
    if (!q) return this.customers();
    return this.customers().filter(
      c => this.name(c).toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q)
    );
  });
  protected readonly selectedCustomer = computed(() => {
    const id = this.selectedCustomerId();
    return id ? (this.customers().find(c => c.id === id) ?? null) : null;
  });
  /** Customer shown in the drawer's detail chrome (null while editing/creating). */
  protected readonly detailCustomer = computed(() =>
    this.creating() || this.drawerEditing() ? null : this.selectedCustomer()
  );
  protected readonly drawerTitle = computed(() => {
    if (this.creating()) return 'New customer';
    const c = this.selectedCustomer();
    if (!c) return 'Customer';
    return this.drawerEditing() ? `Edit ${this.name(c)}` : this.name(c);
  });
  protected readonly drawerSubtitle = computed(() => {
    if (this.creating()) return undefined;
    const c = this.selectedCustomer();
    return c ? c.phone || c.email || undefined : undefined;
  });
  protected readonly customerTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.customerPageSize()))
  );
  protected readonly pagedCustomers = computed(() => {
    const page = Math.min(this.customerPage(), this.customerTotalPages());
    const start = (page - 1) * this.customerPageSize();
    return this.filtered().slice(start, start + this.customerPageSize());
  });
  protected readonly customerStats = computed(() => {
    const rows = this.customers();
    const outstanding = rows.reduce((sum, customer) => sum + Math.max(0, customer.ar_balance), 0);
    const overdue = rows.filter(
      customer =>
        customer.ar_balance > 0 && customer.bucket !== null && customer.bucket !== 'current'
    ).length;
    return [
      { label: 'Customers', value: rows.length },
      {
        label: 'Owed to us',
        value: this.perms.has('ViewFinancials') ? formatKes(outstanding) : 'Hidden',
        tone: outstanding > 0 ? ('warning' as const) : ('neutral' as const),
      },
      {
        label: 'Credit approved',
        value: rows.filter(customer => customer.is_credit_approved).length,
      },
      { label: 'Overdue to us', value: overdue, tone: 'error' as const },
    ];
  });

  async ngOnInit(): Promise<void> {
    try {
      this.methods.set(await this.money.enabledMethodCodes());
    } catch (err) {
      // Without the real method list the repayment selects would silently
      // submit hardcoded 'cash' — surface the failure instead.
      this.error.set(err instanceof Error ? err.message : 'Failed to load payment methods');
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.customers.set(await this.money.customersWithAr());
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      this.loading.set(false);
    }
  }

  protected async openCustomer(customerId: string): Promise<void> {
    this.selectedCustomerId.set(customerId);
    this.repayFor.set(null);
    this.orders.set([]);
    this.creditOrders.set([]);
    this.statement.set([]);
    this.detailLoading.set(true);
    const customer = this.customers().find(c => c.id === customerId);
    if (customer) {
      this.creditLimit.setValue(formatKesInput(customer.credit_limit));
      this.termsDays.setValue(customer.credit_terms_days ?? 0);
      this.approved.setValue(customer.is_credit_approved);
    }
    try {
      const [orders, creditOrders, statement, company] = await Promise.all([
        this.pos.customerOrders(customerId),
        this.money.creditOrders(customerId),
        this.money.customerStatement(customerId),
        this.receiptData.companyPrintInfo().catch(() => null),
      ]);
      // Ignore stale results when the drawer was closed (or reopened) meanwhile.
      if (this.selectedCustomerId() !== customerId) return;
      this.orders.set(orders);
      this.creditOrders.set(creditOrders);
      this.statement.set(statement);
      this.companyInfo.set(company);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      if (this.selectedCustomerId() === customerId) this.detailLoading.set(false);
    }
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeCustomerDrawer(): void {
    this.selectedCustomerId.set(null);
    this.repayFor.set(null);
    this.detailLoading.set(false);
    this.creating.set(false);
    this.drawerEditing.set(false);
    this.editing.set(null);
    this.orders.set([]);
    this.creditOrders.set([]);
    this.statement.set([]);
  }

  /** Edit in place: flip the open drawer to its form without closing it. */
  protected editFromDrawer(c: CustomerWithAr): void {
    this.editing.set(c);
    this.firstName.setValue(c.first_name);
    this.lastName.setValue(c.last_name ?? '');
    this.phone.setValue(c.phone ?? '');
    this.email.setValue(c.email ?? '');
    this.notes.setValue(c.notes ?? '');
    this.drawerEditing.set(true);
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.firstName.setValue('');
    this.lastName.setValue('');
    this.phone.setValue('');
    this.email.setValue('');
    this.notes.setValue('');
    this.drawerEditing.set(false);
    this.creating.set(true);
  }

  protected startEdit(c: CustomerWithAr): void {
    void this.openCustomer(c.id);
    this.editFromDrawer(c);
  }

  protected closeForm(): void {
    this.editing.set(null);
    if (this.creating()) {
      this.creating.set(false);
    } else {
      this.drawerEditing.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.firstName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const editing = this.editing();
      if (editing) {
        await this.money.updateCustomer(editing.id, {
          first_name: this.firstName.value.trim(),
          last_name: this.lastName.value.trim() || undefined,
          phone: this.phone.value.trim() || undefined,
          email: this.email.value.trim() || undefined,
          notes: this.notes.value.trim() || undefined,
        });
        this.notice.set(`Updated ${this.firstName.value.trim()}`);
      } else {
        const customerId = await this.money.createCustomer(
          this.firstName.value.trim(),
          this.lastName.value.trim() || undefined,
          this.phone.value.trim() || undefined,
          this.email.value.trim() || undefined
        );
        if (this.notes.value.trim()) {
          await this.money.updateCustomer(customerId, { notes: this.notes.value.trim() });
        }
        this.notice.set(`Created ${this.firstName.value.trim()}`);
      }
      if (editing) {
        // Return to the drawer's detail view with fresh data.
        this.drawerEditing.set(false);
        this.editing.set(null);
        await this.load();
        await this.openCustomer(editing.id);
      } else {
        this.closeForm();
        await this.load();
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected startRepay(orderId: string, total: number): void {
    if (!this.cashierSession.canTakePayment()) {
      this.error.set('Open a cashier session before collecting a repayment.');
      return;
    }
    this.repayFor.set(orderId);
    this.repayAmount.setValue(formatKesInput(total));
    this.repayReference.setValue('');
  }

  protected async repay(orderId: string): Promise<void> {
    try {
      await this.cashierSession.assertOpen('collecting a repayment');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const amount = parseKes(this.repayAmount.value);
    if (amount === null || amount <= 0) {
      this.error.set('Enter a valid repayment amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postPaymentAllocation(
        orderId,
        amount,
        this.repayMethod.value,
        this.repayReference.value.trim() || undefined
      );
      this.notice.set('Repayment allocated');
      this.repayFor.set(null);
      await this.load();
      const current = this.customers().find(c => c.id === this.selectedCustomerId());
      if (current) {
        this.creditOrders.set(await this.money.creditOrders(current.id));
        this.orders.set(await this.pos.customerOrders(current.id));
        this.statement.set(await this.money.customerStatement(current.id));
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Repayment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async bulkRepay(customerId: string): Promise<void> {
    try {
      await this.cashierSession.assertOpen('collecting a repayment');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Open a cashier session first');
      return;
    }
    const amount = parseKes(this.bulkAmount.value);
    if (amount === null || amount <= 0) {
      this.error.set('Enter a valid payment amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postCustomerPayment(
        customerId,
        amount,
        this.bulkMethod.value,
        this.bulkReference.value.trim() || undefined
      );
      this.bulkAmount.setValue('');
      this.bulkReference.setValue('');
      this.notice.set('Payment allocated to the oldest outstanding credit sales');
      await this.load();
      this.creditOrders.set(await this.money.creditOrders(customerId));
      this.statement.set(await this.money.customerStatement(customerId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async adjustBalance(customerId: string): Promise<void> {
    const raw = Number(this.adjustmentAmount.value.replace(/,/g, '').trim());
    const amount = Math.round(raw);
    if (!Number.isFinite(amount) || amount === 0 || !this.adjustmentReason.value.trim()) {
      this.error.set('Enter a non-zero adjustment and a reason');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.adjustCustomerBalance(
        customerId,
        amount,
        this.adjustmentReason.value.trim()
      );
      this.adjustmentAmount.setValue('');
      this.adjustmentReason.setValue('');
      this.notice.set('Amount owed to us adjusted');
      await this.load();
      this.statement.set(await this.money.customerStatement(customerId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Adjustment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected printStatement(): void {
    window.print();
  }

  protected async saveCredit(c: CustomerWithAr): Promise<void> {
    const limitAmount = parseKes(this.creditLimit.value);
    if (limitAmount === null) {
      this.error.set('Enter a valid credit limit');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.updateCustomerCredit(
        c.id,
        limitAmount,
        this.approved.value,
        this.termsDays.value > 0 ? this.termsDays.value : undefined
      );
      this.notice.set(`Credit settings saved for ${this.name(c)}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected customerCreditAvailable(customer: CustomerWithAr): number {
    return Math.max(0, customer.credit_limit - customer.ar_balance);
  }

  protected orderStatusType(status: string): BadgeType {
    return ORDER_STATUS_MAP[status] ?? 'neutral';
  }

  /** Select option label: method code plus its reconciliation-type caption. */
  protected methodOptionLabel(code: string): string {
    const type = reconciliationLabel(reconciliationTypeForCode(code));
    return type === '—' ? code : `${code} · ${type}`;
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

  protected name(c: MoneyCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
