import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { reconciliationLabel, reconciliationTypeForCode } from '../core/payment-methods';
import { PermissionsService } from '../core/permissions.service';
import {
  AgingInfo,
  CustomerReceiptOutcome,
  CustomerStatementRow,
  MoneyCustomer,
  MoneyService,
  SupplierAccountStatus,
} from '../money/money.service';
import { OrderWithCustomer, PosService } from '../pos/pos.service';
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
import {
  StatusBadgeComponent,
  ORDER_STATUS_MAP,
  type BadgeType,
} from '../shared/ui/status-badge.component';
import { CashierSessionService } from '../core/cashier-session.service';
import { CompanyPrintInfo, ReceiptDataService } from '../shared/print/receipt-data.service';
import { PrintService } from '../shared/print/print.service';
import { renderCustomerStatement } from '../shared/print/customer-statement.renderer';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { PartyCacheService } from '../core/party-cache.service';
import { Approval, ApprovalsService } from '../approvals/approvals.service';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import {
  customerAccountState,
  planCustomerReceipt,
  type CustomerReceiptPlan,
} from './customer-account';
import { CustomerStatementSendComponent } from '../communications/customer-statement-send.component';
import { MpesaService } from '../core/mpesa.service';
import { MpesaCheckoutCoordinator } from '../core/mpesa-checkout-coordinator.service';
import { LocationContextService } from '../core/location-context.service';
import { TaskDialogComponent } from '../shared/ui/task-dialog.component';
import { FormSectionComponent } from '../shared/ui/form-section.component';
import { PreferenceRowComponent } from '../shared/ui/preference-row.component';

type CustomerWithAr = MoneyCustomer & {
  ar_balance: number;
  downpayment_balance: number;
  net_balance: number;
} & AgingInfo;
type CreditOrder = {
  id: string;
  code: string;
  total: number;
  paid: number;
  outstanding: number;
  status: string;
  created_at: string;
};
const CUSTOMER_STATEMENT_PAGE_SIZE = 25;
const CUSTOMER_STATEMENT_PRINT_PAGE_SIZE = 100;

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
    DeleteConfirmationModalComponent,
    MobileListComponent,
    PageActionsComponent,
    CustomerStatementSendComponent,
    TaskDialogComponent,
    FormSectionComponent,
    PreferenceRowComponent,
  ],
  template: `
    <app-page
      title="Customers"
      subtitle="Manage customer details, credit access, balances, and repayment history."
      [wide]="true"
    >
      <app-page-actions actions>
        <button
          utilityAction
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
        @if (perms.has('ManageCustomers')) {
          <button primaryAction appButton type="button" (click)="startCreate()">
            <app-icon name="heroPlus" /> Add customer
          </button>
        }
      </app-page-actions>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">{{ error() }}</div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">{{ notice() }}</div>
      }
      @if (partyCache.loaded() && !partyCache.complete()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          Customer limit reached. List, totals, and local filters cover cached customers only.
        </div>
      }

      <!-- Shared list summary and search toolbar -->
      <app-list-search-bar
        placeholder="Search name or phone…"
        [searchQuery]="query()"
        (searchQueryChange)="query.set($event); customerPage.set(1)"
        [sortOptions]="customerSortOptions()"
        [sortKey]="customerSort()"
        (sortKeyChange)="customerSort.set($event); customerPage.set(1)"
        [sortDirection]="customerSortDirection()"
        (sortDirectionChange)="customerSortDirection.set($event); customerPage.set(1)"
        [filtersEnabled]="true"
        [activeFilterCount]="accountStatus() === 'active' ? 0 : 1"
        (clearFilters)="clearCustomerFilters()"
      >
        <app-stat-bar summary [stats]="customerStats()" />
        <div filters class="flex items-center gap-2">
          <label for="customer-account-status" class="text-sm font-medium">Account status</label>
          <select
            id="customer-account-status"
            class="select select-bordered select-sm"
            [value]="accountStatus()"
            (change)="setAccountStatus($event)"
          >
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
            <option value="all">All</option>
          </select>
        </div>
      </app-list-search-bar>

      <!-- List -->
      @if (!loading() && filtered().length === 0 && !creating() && selectedCustomerId() === null) {
        <app-empty-state
          icon="heroUsers"
          title="No customers found"
          description="Add a customer with the + button to sell on credit, or clear the search."
        />
      } @else {
        <div class="mb-3 hidden lg:block">
          <app-data-table-shell
            heading="Customer accounts"
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
                    [class.opacity-60]="c.deleted_at !== null"
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
                          <div class="flex items-center gap-2">
                            <p class="table-primary truncate">{{ name(c) }}</p>
                            @if (c.deleted_at) {
                              <app-status-badge size="xs" type="error" label="Deleted" />
                            }
                          </div>
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
                        @if (latestCustomerApproval(c.id); as approval) {
                          <app-status-badge
                            size="xs"
                            [type]="approvalTone(approval.status)"
                            [label]="
                              approval.status === 'pending'
                                ? 'Policy change pending'
                                : 'Policy ' + approval.status
                            "
                          />
                        }
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
                      @if (c.deleted_at) {
                        @if (perms.has('ManageCustomers')) {
                          <button
                            appButton
                            variant="ghost"
                            [iconOnly]="true"
                            type="button"
                            title="Restore customer"
                            aria-label="Restore customer"
                            [disabled]="busy()"
                            (click)="restoreCustomer(c)"
                          >
                            <app-icon name="heroArrowPath" />
                          </button>
                        }
                      } @else {
                        @if (perms.has('ManageCustomers')) {
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
                        }
                        @if (perms.has('ManageCustomers')) {
                          <button
                            appButton
                            variant="ghost"
                            [iconOnly]="true"
                            type="button"
                            title="Delete customer"
                            aria-label="Delete customer"
                            [disabled]="busy()"
                            (click)="startDelete(c)"
                          >
                            <app-icon name="heroArchiveBox" />
                          </button>
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <app-mobile-list>
          @for (c of pagedCustomers(); track c.id) {
            <div
              mobileListRow
              class="cursor-pointer"
              role="button"
              tabindex="0"
              [class.border-primary]="selectedCustomerId() === c.id"
              [class.opacity-60]="c.deleted_at !== null"
              (click)="openCustomer(c.id)"
              (keydown.enter)="openCustomer(c.id)"
            >
              <div class="flex min-h-20 items-center gap-3 p-3">
                <app-entity-avatar
                  size="sm"
                  [firstName]="c.first_name"
                  [lastName]="c.last_name ?? ''"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate font-semibold">{{ name(c) }}</span>
                    @if (c.deleted_at) {
                      <app-status-badge size="xs" type="error" label="Deleted" />
                    }
                  </div>
                  <p class="type-caption mt-1 truncate">
                    {{ c.phone || 'No phone' }}
                    @if (c.days_outstanding !== null && c.ar_balance > 0) {
                      · {{ c.days_outstanding }} days · {{ c.bucket }}
                    }
                  </p>
                </div>
                <div
                  class="shrink-0 text-right"
                  [class.font-bold]="c.ar_balance > 0"
                  [class.text-error]="c.ar_balance > 0"
                  [class.text-base-content/60]="c.ar_balance === 0"
                >
                  <p class="tabular-nums">
                    <app-money [amount]="c.ar_balance" [masked]="!perms.has('ViewFinancials')" />
                  </p>
                  <p class="type-caption">owed to us</p>
                </div>
              </div>
            </div>
          }
        </app-mobile-list>

        <!-- Customer detail/edit drawer -->
        @if (selectedCustomerId() !== null && !drawerEditing()) {
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
              @if (c.deleted_at) {
                @if (perms.has('ManageCustomers')) {
                  <button
                    actions
                    appButton
                    variant="outline"
                    type="button"
                    (click)="restoreCustomer(c)"
                  >
                    <app-icon name="heroArrowPath" /> Restore
                  </button>
                }
              } @else {
                @if (perms.has('ManageCustomers')) {
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
                @if (perms.has('ManageCustomers')) {
                  <button actions appButton variant="ghost" type="button" (click)="startDelete(c)">
                    <app-icon name="heroArchiveBox" /> Delete
                  </button>
                }
              }
            }

            @if (selectedCustomer(); as c) {
              @if (c.deleted_at) {
                <div role="status" class="alert alert-warning mb-3 text-sm">
                  <app-icon name="heroArchiveBox" />
                  <span>
                    Deleted {{ date(c.deleted_at) }}. This account is kept for sales and payment
                    history, and cannot be selected for new sales.
                  </span>
                </div>
              }
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
              @if (c.tax_registration_number) {
                <div class="mt-3 rounded-field border border-base-300 px-3 py-2">
                  <p class="type-caption">Customer tax PIN</p>
                  <p class="text-sm font-medium">{{ c.tax_registration_number }}</p>
                </div>
              }
              @if (c.delivery_address) {
                <div class="mt-3 flex items-start gap-3 border-y border-base-300/60 py-3">
                  <app-icon name="heroMapPin" class="mt-0.5 shrink-0 text-base-content/55" />
                  <div class="min-w-0">
                    <p class="type-caption">Delivery address</p>
                    <p class="mt-0.5 text-sm font-medium whitespace-pre-line">
                      {{ c.delivery_address }}
                    </p>
                  </div>
                </div>
              }

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
                      @if (pendingCreditApproval(); as pending) {
                        <app-status-badge
                          size="xs"
                          type="warning"
                          label="Change pending approval"
                        />
                      }
                    </div>
                    @if (customerIntegrityLoading()) {
                      <p class="type-caption mt-2">Checking customer account integrity…</p>
                    } @else if (customerIntegrity()?.is_consistent === false) {
                      <div role="alert" class="alert alert-error mt-3 text-sm">
                        <app-icon name="heroExclamationTriangle" />
                        <div>
                          <p class="font-semibold">Receipts are paused for this customer</p>
                          @if (perms.has('ViewFinancials')) {
                            <p class="text-xs">
                              Ledger {{ fmtKes(customerIntegrity()!.ledger_balance) }} · sales
                              {{ fmtKes(customerIntegrity()!.document_balance) }}. Finance must
                              reconcile the source records first.
                            </p>
                          }
                        </div>
                      </div>
                    }
                    @if (
                      !c.deleted_at && perms.actionMode('customer.credit.update') !== 'blocked'
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
                        <app-form-field
                          label="Reason"
                          [required]="true"
                          hint="Included in the approval history."
                        >
                          <textarea
                            class="textarea textarea-bordered min-h-20 w-full"
                            [formControl]="creditReason"
                            placeholder="Why is this policy changing?"
                          ></textarea>
                        </app-form-field>
                        <button
                          appButton
                          variant="outline"
                          type="submit"
                          class="self-start"
                          [disabled]="
                            busy() ||
                            creditReason.value.trim().length === 0 ||
                            !!pendingCreditApproval()
                          "
                        >
                          {{
                            perms.actionMode('customer.credit.update') === 'execute'
                              ? 'Save settings'
                              : 'Request change'
                          }}
                        </button>
                      </form>
                    }
                  </section>

                  @if (customerApprovals().length > 0) {
                    <section class="border-t border-base-300/60 pt-3">
                      <h3 class="section-title mb-2">Credit-policy activity</h3>
                      <ol class="flex flex-col gap-2">
                        @for (approval of customerApprovals(); track approval.id) {
                          <li
                            class="rounded-field border border-base-300 p-3"
                            [class.ring-2]="highlightedApprovalId() === approval.id"
                            [class.ring-primary]="highlightedApprovalId() === approval.id"
                          >
                            <div class="flex items-center justify-between gap-2">
                              <app-status-badge
                                size="xs"
                                [type]="approvalTone(approval.status)"
                                [label]="approval.status"
                              />
                              <span class="type-caption">{{
                                date(approval.decided_at ?? approval.created_at)
                              }}</span>
                            </div>
                            <p class="mt-2 text-sm">{{ approvalReason(approval) }}</p>
                            <p class="type-caption mt-1">
                              Requested by {{ approvalPerson(approval.requested_by) }}
                              @if (approval.decided_by) {
                                · Decided by {{ approvalPerson(approval.decided_by) }}
                              }
                            </p>
                            @if (approval.decision_reason) {
                              <p class="type-caption mt-1">
                                Decision: {{ approval.decision_reason }}
                              </p>
                            }
                          </li>
                        }
                      </ol>
                    </section>
                  }

                  <section class="border-t border-base-300/60 pt-3">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 class="section-title">Customer account</h3>
                        <p class="type-caption">Invoices and downpayments share one balance.</p>
                      </div>
                      @if (perms.has('ViewFinancials')) {
                        <div class="text-right">
                          <p class="font-semibold tabular-nums">{{ customerAccountLabel() }}</p>
                          <p class="type-caption">
                            {{ fmtKes(customerOutstanding()) }} invoices ·
                            {{ fmtKes(customerDepositBalance()) }} downpayment
                          </p>
                        </div>
                      }
                    </div>
                    @if (!cashierSession.canTakePayment()) {
                      <app-session-required-notice action="receiving a customer payment" />
                    }
                    @if (perms.has('SettleOrder')) {
                      <form
                        (submit)="$event.preventDefault(); receivePayment(c.id)"
                        class="mt-3 grid gap-2 rounded-field border border-base-300 bg-base-200/50 p-3 sm:grid-cols-3"
                      >
                        <app-form-field label="Payment received (KES)">
                          <input
                            class="input input-bordered input-sm"
                            inputmode="numeric"
                            [formControl]="bulkAmount"
                          />
                        </app-form-field>
                        <app-form-field label="Method">
                          <select
                            class="select select-bordered select-sm"
                            [formControl]="bulkMethod"
                          >
                            @for (m of methods(); track m) {
                              <option [value]="m">{{ methodOptionLabel(m) }}</option>
                            }
                          </select>
                        </app-form-field>
                        @if (
                          bulkMethod.value === 'mpesa' &&
                          mpesa.availability().active &&
                          !bulkMpesaManual.value
                        ) {
                          <app-form-field label="Payer phone">
                            <input
                              class="input input-bordered input-sm"
                              inputmode="tel"
                              [formControl]="bulkMpesaPhone"
                            />
                          </app-form-field>
                        } @else {
                          <app-form-field
                            [label]="
                              bulkMethod.value === 'mpesa' ? 'M-PESA receipt code' : 'Reference'
                            "
                            [required]="bulkMethod.value === 'mpesa' && bulkMpesaManual.value"
                          >
                            <input
                              class="input input-bordered input-sm"
                              [formControl]="bulkReference"
                            />
                          </app-form-field>
                        }
                        @if (bulkMethod.value === 'mpesa' && mpesa.availability().manualFallback) {
                          <label class="sm:col-span-3 flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              class="toggle toggle-sm"
                              [formControl]="bulkMpesaManual"
                            />
                            Use temporary manual fallback
                          </label>
                        }
                        <button
                          appButton
                          type="submit"
                          class="sm:col-span-3 sm:justify-self-start"
                          [disabled]="
                            busy() ||
                            !cashierSession.canTakePayment() ||
                            customerIntegrityLoading() ||
                            customerIntegrity()?.is_consistent !== true
                          "
                        >
                          {{
                            bulkMethod.value === 'mpesa' &&
                            mpesa.availability().active &&
                            !bulkMpesaManual.value
                              ? 'Send STK prompt'
                              : 'Receive payment'
                          }}
                        </button>
                        @if (bulkPaymentPlan(); as plan) {
                          <div
                            class="sm:col-span-3 rounded-field border border-info/30 bg-info/5 p-3 text-sm"
                            aria-live="polite"
                          >
                            <div class="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p class="font-semibold">How this payment will be applied</p>
                                <p class="type-caption mt-0.5">
                                  Oldest invoices are cleared first.
                                </p>
                              </div>
                              <p class="shrink-0 font-semibold tabular-nums">
                                <app-money [amount]="plan.applied + plan.excess" /> received
                              </p>
                            </div>
                            <ol class="mt-2 flex flex-wrap gap-2">
                              @for (allocation of plan.allocations; track allocation.code) {
                                <li
                                  class="rounded-field border border-base-300/70 bg-base-100 px-2 py-1 text-xs"
                                >
                                  <span class="font-mono">{{ allocation.code }}</span> ·
                                  <app-money [amount]="allocation.amount" />
                                  @if (allocation.clearsInvoice) {
                                    <span class="text-success"> · cleared</span>
                                  }
                                </li>
                              }
                              @if (plan.hiddenAllocations > 0) {
                                <li class="px-1 py-1 text-xs text-base-content/60">
                                  +{{ plan.hiddenAllocations }} more
                                </li>
                              }
                            </ol>
                            <div class="mt-2 grid gap-2 sm:grid-cols-2">
                              <p class="rounded-field bg-base-100 px-2.5 py-2 text-xs">
                                <span class="text-base-content/60">Applied to invoices</span><br />
                                <span class="font-semibold tabular-nums"
                                  ><app-money [amount]="plan.applied" />
                                  @if (plan.clearedInvoices > 0) {
                                    · {{ plan.clearedInvoices }} cleared
                                  }
                                </span>
                              </p>
                              @if (plan.excess > 0) {
                                <p class="rounded-field bg-info/10 px-2.5 py-2 text-xs">
                                  <span class="text-base-content/60">Available after receipt</span
                                  ><br />
                                  <span class="font-semibold tabular-nums text-info"
                                    ><app-money [amount]="plan.excess" /> downpayment</span
                                  >
                                </p>
                              }
                            </div>
                          </div>
                        }
                        @if (lastReceiptResult(); as result) {
                          <div
                            class="sm:col-span-3 rounded-field border border-success/30 bg-success/5 p-3 text-sm"
                            role="status"
                          >
                            <p class="font-semibold">Receipt posted</p>
                            <p class="type-caption mt-1">
                              {{ fmtKes(result.applied_amount) }} applied to invoices
                              @if (result.downpayment_amount > 0) {
                                · {{ fmtKes(result.downpayment_amount) }} saved as downpayment
                              }
                            </p>
                          </div>
                        }
                      </form>
                    }
                    @if (
                      customerDepositBalance() > 0 &&
                      (perms.has('SettleOrder') || perms.has('ReverseOrder'))
                    ) {
                      <details class="mt-2 rounded-field border border-base-300 p-2">
                        <summary class="cursor-pointer text-sm font-medium">
                          Refund unused deposit
                        </summary>
                        <form
                          (submit)="$event.preventDefault(); refundDeposit(c.id)"
                          class="mt-2 grid gap-2 sm:grid-cols-4"
                        >
                          <app-form-field label="Refund amount (KES)">
                            <input
                              class="input input-bordered input-sm"
                              inputmode="numeric"
                              [formControl]="depositRefundAmount"
                            />
                          </app-form-field>
                          <app-form-field label="Method">
                            <select
                              class="select select-bordered select-sm"
                              [formControl]="depositRefundMethod"
                            >
                              <option value="">Original deposit channel</option>
                              @for (m of methods(); track m) {
                                <option [value]="m">{{ methodOptionLabel(m) }}</option>
                              }
                            </select>
                          </app-form-field>
                          <app-form-field label="Reference">
                            <input
                              class="input input-bordered input-sm"
                              [formControl]="depositRefundReference"
                            />
                          </app-form-field>
                          <app-form-field label="Reason" [required]="true">
                            <input
                              class="input input-bordered input-sm"
                              [formControl]="depositRefundReason"
                            />
                          </app-form-field>
                          <button
                            appButton
                            variant="outline"
                            type="submit"
                            class="sm:col-span-3 sm:justify-self-start"
                            [disabled]="
                              busy() ||
                              !cashierSession.canTakePayment() ||
                              !depositRefundReason.value.trim()
                            "
                          >
                            {{
                              perms.has('ReverseOrder')
                                ? 'Refund deposit'
                                : 'Request refund approval'
                            }}
                          </button>
                        </form>
                      </details>
                    }
                  </section>

                  <section class="border-t border-base-300/60 pt-3">
                    <h3 class="section-title mb-2">Open invoices</h3>
                    @if (creditOrders().length === 0) {
                      <app-empty-state
                        [compact]="true"
                        icon="heroCreditCard"
                        title="No open invoices"
                      />
                    } @else {
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
                                  [amount]="o.outstanding"
                                  [masked]="!perms.has('ViewFinancials')"
                              /></span>
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                type="button"
                                title="View order details"
                                (click)="viewSale(c.id, o.id)"
                              >
                                View
                              </button>
                            </div>
                          </li>
                        }
                      </ul>
                    }
                  </section>

                  <section class="border-t border-base-300/60 pt-3">
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <h3 class="section-title">Recent sales</h3>
                      <button
                        class="btn btn-ghost btn-xs"
                        type="button"
                        (click)="viewAllSales(c.id)"
                      >
                        View all sales <app-icon name="heroArrowRight" size="sm" />
                      </button>
                    </div>
                    @if (orders().length === 0) {
                      <app-empty-state
                        [compact]="true"
                        icon="heroShoppingCart"
                        title="No sales yet"
                      />
                    } @else {
                      <ul class="max-h-80 divide-y divide-base-200 overflow-y-auto">
                        @for (o of orders(); track o.id) {
                          <li
                            class="flex cursor-pointer items-center gap-2 rounded-field py-2 hover:bg-base-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            role="button"
                            tabindex="0"
                            (click)="viewSale(c.id, o.id)"
                            (keydown.enter)="viewSale(c.id, o.id)"
                          >
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
                            <app-icon
                              name="heroChevronRight"
                              size="sm"
                              class="text-base-content/40"
                            />
                          </li>
                        }
                      </ul>
                    }
                  </section>

                  @if (perms.has('ViewFinancials')) {
                    <section class="border-t border-base-300/60 pt-3">
                      <div class="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <h3 class="section-title">Customer statement</h3>
                          <p class="type-caption">Sales, repayments and running balance.</p>
                        </div>
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          [disabled]="statementBusy() || statement().length === 0"
                          (click)="printStatement()"
                        >
                          <app-icon name="heroPrinter" />
                          {{ statementBusy() ? 'Preparing…' : 'Print' }}
                        </button>
                      </div>
                      @if (perms.has('ManageCommunications') && statement().length > 0) {
                        <app-customer-statement-send
                          class="mb-3 block"
                          [customerId]="c.id"
                          [disabled]="statementBusy()"
                          (sent)="notice.set($event)"
                          (failed)="error.set($event)"
                        />
                      }
                      @if (statement().length === 0) {
                        <app-empty-state
                          [compact]="true"
                          icon="heroDocumentText"
                          title="No statement activity"
                        />
                      } @else {
                        <ul class="max-h-80 divide-y divide-base-200 overflow-y-auto">
                          @for (row of statement(); track row.id) {
                            <li class="py-2">
                              <div class="flex items-center gap-3">
                                <div class="min-w-0 flex-1">
                                  <p class="truncate text-sm">{{ row.description }}</p>
                                  <p class="type-caption">
                                    {{ date(row.date) }} ·
                                    <span class="font-mono">{{ row.reference }}</span>
                                  </p>
                                </div>
                                <div class="shrink-0 text-right">
                                  <p class="text-sm font-semibold tabular-nums">
                                    {{ statementBalanceLabel(row.balance) }}
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
                              </div>
                              @if (row.receipt_id && row.details; as receipt) {
                                <details
                                  class="mt-2 rounded-field border border-base-300/70 bg-base-200/40 p-2"
                                >
                                  <summary class="cursor-pointer text-xs font-medium">
                                    Receipt allocation
                                  </summary>
                                  <dl class="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                                    <div>
                                      <dt class="text-base-content/60">Received</dt>
                                      <dd class="font-semibold">
                                        {{ fmtKes(receipt.amount ?? 0) }}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt class="text-base-content/60">Invoices</dt>
                                      <dd class="font-semibold">
                                        {{ fmtKes(receipt.applied_amount ?? 0) }}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt class="text-base-content/60">Downpayment</dt>
                                      <dd class="font-semibold">
                                        {{ fmtKes(receipt.downpayment_amount ?? 0) }}
                                      </dd>
                                    </div>
                                  </dl>
                                  @if ((receipt.allocations?.length ?? 0) > 0) {
                                    <ul class="mt-2 flex flex-wrap gap-1.5">
                                      @for (
                                        allocation of receipt.allocations ?? [];
                                        track allocation.order_id
                                      ) {
                                        <li class="rounded-field bg-base-100 px-2 py-1 text-xs">
                                          <span class="font-mono">{{ allocation.order_code }}</span>
                                          · {{ fmtKes(allocation.amount) }}
                                        </li>
                                      }
                                    </ul>
                                  }
                                  @if (
                                    row.activity_kind === 'customer_receipt' &&
                                    (perms.has('ReverseOrder') || perms.has('SettleOrder'))
                                  ) {
                                    <form
                                      (submit)="
                                        $event.preventDefault(); reverseReceipt(row.receipt_id!)
                                      "
                                      class="mt-2 flex flex-wrap items-end gap-2"
                                    >
                                      <app-form-field label="Reversal reason" [required]="true">
                                        <input
                                          class="input input-bordered input-xs"
                                          [formControl]="receiptReversalReason"
                                        />
                                      </app-form-field>
                                      <button
                                        appButton
                                        variant="outline"
                                        size="sm"
                                        type="submit"
                                        [disabled]="busy() || !receiptReversalReason.value.trim()"
                                      >
                                        {{
                                          perms.has('ReverseOrder')
                                            ? 'Reverse receipt'
                                            : 'Request reversal'
                                        }}
                                      </button>
                                    </form>
                                  }
                                </details>
                              }
                            </li>
                          }
                        </ul>
                        @if (statementHasMore()) {
                          <div class="mt-2 flex justify-center">
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              [disabled]="statementBusy()"
                              (click)="loadOlderStatement()"
                            >
                              Load older activity
                            </button>
                          </div>
                        }
                      }
                      @if (
                        perms.has('ManageCustomers') ||
                        perms.has('SettleOrder') ||
                        perms.has('ReverseOrder') ||
                        perms.has('ViewFinancials')
                      ) {
                        <div class="mt-3 border-t border-base-300/60 pt-3">
                          <h3 class="section-title mb-1">Correct this account</h3>
                          <p class="type-caption">
                            Fix the source transaction so sales, receipts, and the ledger remain in
                            agreement.
                          </p>
                          <div class="mt-3 grid gap-2 sm:grid-cols-2">
                            <button
                              appButton
                              variant="outline"
                              type="button"
                              (click)="recordMissingSale(c.id)"
                            >
                              <app-icon name="heroShoppingCart" /> Missing sale
                            </button>
                            <button
                              appButton
                              variant="ghost"
                              type="button"
                              (click)="viewAllSales(c.id)"
                            >
                              <app-icon name="heroDocumentText" /> Wrong sale
                            </button>
                          </div>
                          <p class="type-caption mt-2">
                            Missing amount owed? Record the sale. Wrong sale? Open it from sales.
                            Wrong receipt? Use Reverse on the receipt in the activity above.
                          </p>
                        </div>
                      }
                    </section>
                  }
                </div>
              }
            }
          </app-drawer>
        }

        <app-task-dialog
          #customerEditor
          [open]="creating() || drawerEditing()"
          [title]="editing() ? 'Edit ' + name(editing()!) : 'New customer'"
          subtitle="Customer profile"
          size="lg"
          [dirty]="editorDirty()"
          [error]="editorError()"
          (closed)="closeForm()"
        >
          <form
            id="customer-profile-form"
            (submit)="$event.preventDefault(); save()"
            (input)="editorDirty.set(true)"
            (change)="editorDirty.set(true)"
          >
            <app-form-section title="Contact" description="The person or business buying from you.">
              <div class="grid gap-3 md:grid-cols-2">
                <app-form-field label="First name" [required]="true">
                  <input
                    type="text"
                    class="input input-bordered min-h-11 w-full"
                    autocomplete="given-name"
                    [formControl]="firstName"
                  />
                </app-form-field>
                <app-form-field label="Last name">
                  <input
                    type="text"
                    class="input input-bordered min-h-11 w-full"
                    autocomplete="family-name"
                    [formControl]="lastName"
                  />
                </app-form-field>
                <app-form-field label="Phone">
                  <input
                    type="tel"
                    class="input input-bordered min-h-11 w-full"
                    autocomplete="tel"
                    [formControl]="phone"
                  />
                </app-form-field>
                <app-form-field label="Email">
                  <input
                    type="email"
                    class="input input-bordered min-h-11 w-full"
                    autocomplete="email"
                    [formControl]="email"
                  />
                </app-form-field>
              </div>
            </app-form-section>

            <app-form-section
              title="Delivery"
              description="Used to prefill future delivery orders; each order keeps its own copy."
            >
              <app-form-field label="Delivery address">
                <textarea
                  class="textarea textarea-bordered min-h-24 w-full"
                  autocomplete="street-address"
                  maxlength="500"
                  [formControl]="deliveryAddress"
                ></textarea>
              </app-form-field>
            </app-form-section>

            <app-form-section title="Tax and notes">
              <div class="grid gap-3 md:grid-cols-2">
                <app-form-field
                  label="Customer tax PIN"
                  hint="Snapshotted on future VAT invoices for business customers."
                >
                  <input
                    type="text"
                    class="input input-bordered min-h-11 w-full"
                    autocomplete="off"
                    [formControl]="taxRegistrationNumber"
                  />
                </app-form-field>
                <app-form-field label="Notes">
                  <textarea
                    class="textarea textarea-bordered min-h-24 w-full"
                    placeholder="Preferences or useful account context"
                    [formControl]="notes"
                  ></textarea>
                </app-form-field>
              </div>
            </app-form-section>

            <app-form-section
              title="Messages"
              description="Choose which non-order customer messages are allowed."
            >
              <app-preference-row
                label="Allow customer messages"
                description="Statements, reminders and other account communication."
              >
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                  [formControl]="notificationsEnabled"
                />
              </app-preference-row>
              <div
                class="mt-3 grid gap-2 md:grid-cols-2"
                [class.opacity-40]="!notificationsEnabled.value"
              >
                <app-preference-row label="SMS">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [formControl]="smsNotificationsEnabled"
                  />
                </app-preference-row>
                <app-preference-row label="WhatsApp">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [formControl]="whatsappNotificationsEnabled"
                  />
                </app-preference-row>
              </div>
            </app-form-section>
          </form>

          <div taskFooter class="flex items-center justify-end gap-2">
            <button
              appButton
              variant="ghost"
              type="button"
              [disabled]="busy()"
              (click)="customerEditor.requestClose()"
            >
              Cancel
            </button>
            <button
              appButton
              type="submit"
              form="customer-profile-form"
              [loading]="busy()"
              [disabled]="firstName.value.trim().length === 0"
            >
              {{ editing() ? 'Save changes' : 'Create customer' }}
            </button>
          </div>
        </app-task-dialog>

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
      <app-delete-confirmation-modal
        [data]="deleteConfirmationData()"
        title="Delete customer account?"
        entityType="customer"
        verb="delete"
        confirmButtonText="Delete customer"
        [irreversible]="false"
        (confirm)="confirmDelete()"
        (cancel)="deletingCustomer.set(null)"
      />
    </app-page>
  `,
})
export class CustomersComponent implements OnInit {
  protected readonly cashierSession = inject(CashierSessionService);
  private readonly money = inject(MoneyService);
  protected readonly partyCache = inject(PartyCacheService);
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  protected readonly perms = inject(PermissionsService);
  private readonly approvals = inject(ApprovalsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly mpesa = inject(MpesaService);
  private readonly mpesaCheckout = inject(MpesaCheckoutCoordinator);
  private readonly locations = inject(LocationContextService);
  private readonly routeParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly fmtKes = formatKes;

  protected readonly customers = computed<CustomerWithAr[]>(() =>
    this.partyCache.customerRows(true)
  );
  protected readonly selectedCustomerId = signal<string | null>(null);
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly creditOrders = signal<CreditOrder[]>([]);
  protected readonly statement = signal<CustomerStatementRow[]>([]);
  protected readonly statementHasMore = signal(false);
  protected readonly statementBusy = signal(false);
  private statementSequence = 0;
  private depositRefundClientRef: string | null = null;
  private receiptAttempt: {
    fingerprint: string;
    clientRef: string;
    mpesaRetryAllowed: boolean;
  } | null = null;
  protected readonly companyInfo = signal<CompanyPrintInfo | null>(null);
  protected readonly customerApprovals = signal<Approval[]>([]);
  protected readonly pageCustomerApprovals = signal<Map<string, Approval>>(new Map());
  private pageApprovalSequence = 0;
  protected readonly customerApprovalPeople = signal<Map<string, string>>(new Map());
  protected readonly highlightedApprovalId = signal<string | null>(null);
  protected readonly methods = signal<string[]>([]);
  protected readonly customerDepositBalance = signal(0);
  protected readonly customerIntegrity = signal<SupplierAccountStatus | null>(null);
  protected readonly customerIntegrityLoading = signal(false);
  protected readonly lastReceiptResult = signal<Extract<
    CustomerReceiptOutcome,
    { status: 'completed' }
  > | null>(null);
  protected readonly detailLoading = signal(false);

  protected readonly query = signal('');
  protected readonly accountStatus = signal<'active' | 'deleted' | 'all'>('active');
  protected readonly customerSort = signal('name');
  protected readonly customerSortDirection = signal<ListSortDirection>('asc');
  protected readonly customerSortOptions = computed<readonly ListSortOption[]>(() => [
    { value: 'name', label: 'Customer name' },
    { value: 'aging', label: 'Days outstanding' },
    { value: 'status', label: 'Account status' },
    ...(this.perms.has('ViewFinancials')
      ? [
          { value: 'balance', label: 'Amount owed' },
          { value: 'credit_limit', label: 'Credit limit' },
        ]
      : []),
  ]);
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
  protected readonly deliveryAddress = new FormControl('', { nonNullable: true });
  protected readonly taxRegistrationNumber = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly notificationsEnabled = new FormControl(true, { nonNullable: true });
  protected readonly smsNotificationsEnabled = new FormControl(true, { nonNullable: true });
  protected readonly whatsappNotificationsEnabled = new FormControl(true, { nonNullable: true });

  protected readonly depositRefundAmount = new FormControl('', { nonNullable: true });
  protected readonly depositRefundMethod = new FormControl('', { nonNullable: true });
  protected readonly depositRefundReference = new FormControl('', { nonNullable: true });
  protected readonly depositRefundReason = new FormControl('', { nonNullable: true });
  protected readonly bulkAmount = new FormControl('', { nonNullable: true });
  protected readonly bulkMethod = new FormControl('cash', { nonNullable: true });
  protected readonly bulkReference = new FormControl('', { nonNullable: true });
  protected readonly bulkMpesaPhone = new FormControl('', { nonNullable: true });
  protected readonly bulkMpesaManual = new FormControl(false, { nonNullable: true });
  protected readonly receiptReversalReason = new FormControl('', { nonNullable: true });

  protected readonly creditLimit = new FormControl('', { nonNullable: true });
  protected readonly termsDays = new FormControl(0, { nonNullable: true });
  protected readonly approved = new FormControl(false, { nonNullable: true });
  protected readonly creditReason = new FormControl('', { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly editorDirty = signal(false);
  protected readonly editorError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingCustomer = signal<CustomerWithAr | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);
  protected readonly pendingCreditApproval = computed(
    () => this.customerApprovals().find(approval => approval.status === 'pending') ?? null
  );

  constructor() {
    effect(() => {
      const params = this.routeParams();
      untracked(() => {
        const customerId = params.get('customer');
        const approvalId = params.get('approval');
        this.highlightedApprovalId.set(approvalId);
        if (customerId && (this.selectedCustomerId() !== customerId || approvalId)) {
          void this.openCustomer(customerId, false);
        }
      });
    });
    effect(() => {
      if (!this.partyCache.loaded()) return;
      const ids = this.pagedCustomers().map(customer => customer.id);
      untracked(() => void this.loadPageCustomerApprovals(ids));
    });
  }

  protected readonly filtered = computed(() => {
    const q = this.query().toLowerCase();
    const status = this.accountStatus();
    const sortKey = this.customerSort();
    const rows = this.customers().filter(c => {
      if (status === 'active' && c.deleted_at !== null) return false;
      if (status === 'deleted' && c.deleted_at === null) return false;
      return (
        !q || this.name(c).toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q)
      );
    });
    return sortList(
      rows,
      this.customerSortDirection(),
      customer => {
        switch (sortKey) {
          case 'aging':
            return customer.days_outstanding;
          case 'status':
            return customer.deleted_at === null;
          case 'balance':
            return customer.ar_balance;
          case 'credit_limit':
            return customer.credit_limit;
          default:
            return this.name(customer);
        }
      },
      customer => this.name(customer)
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
    if (!c) return undefined;
    return c.deleted_at ? `Deleted ${this.date(c.deleted_at)}` : c.phone || c.email || undefined;
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
    const active = rows.filter(customer => customer.deleted_at === null);
    const outstanding = rows.reduce((sum, customer) => sum + Math.max(0, customer.ar_balance), 0);
    const overdue = rows.filter(
      customer =>
        customer.ar_balance > 0 && customer.bucket !== null && customer.bucket !== 'current'
    ).length;
    return [
      {
        label: 'Active customers',
        value: active.length,
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Owed to us',
        value: this.perms.has('ViewFinancials') ? formatKes(outstanding) : 'Hidden',
        tone: outstanding > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Credit approved',
        value: active.filter(customer => customer.is_credit_approved).length,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Overdue to us',
        value: overdue,
        tone: 'error' as const,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Deleted',
        value: rows.length - active.length,
        mobilePriority: 'secondary' as const,
      },
    ];
  });
  protected readonly deleteConfirmationData = computed(() => {
    const customer = this.deletingCustomer();
    const warningDetails = [
      'The customer will no longer appear when selecting a customer for a new sale.',
      'Past sales, statements, and payment history will remain available.',
      'You can restore the account later.',
    ];
    if (customer && customer.ar_balance > 0) {
      warningDetails.unshift(
        `${this.name(customer)} still owes ${formatKes(customer.ar_balance)}; repayments remain available after deletion.`
      );
    }
    return { entityName: customer ? this.name(customer) : 'customer', warningDetails };
  });

  async ngOnInit(): Promise<void> {
    void this.mpesa.refreshAvailability();
    try {
      this.methods.set(await this.money.enabledMethodCodes());
    } catch (err) {
      // Without the real method list the repayment selects would silently
      // submit hardcoded 'cash' — surface the failure instead.
      this.error.set(err instanceof Error ? err.message : 'Failed to load payment methods');
    }
    await this.load();
  }

  protected async load(forceRefresh = false): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (forceRefresh) await this.partyCache.refresh();
      else await this.partyCache.ensureLoaded();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPageCustomerApprovals(customerIds: string[]): Promise<void> {
    const sequence = ++this.pageApprovalSequence;
    if (customerIds.length === 0) {
      this.pageCustomerApprovals.set(new Map());
      return;
    }
    try {
      const approvals = await this.approvals.forCustomers(customerIds);
      if (sequence !== this.pageApprovalSequence) return;
      const latest = new Map<string, Approval>();
      for (const approval of approvals) {
        if (approval.subject_id && !latest.has(approval.subject_id))
          latest.set(approval.subject_id, approval);
      }
      this.pageCustomerApprovals.set(latest);
    } catch (err) {
      if (sequence === this.pageApprovalSequence) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load customer approvals');
      }
    }
  }

  protected async openCustomer(customerId: string, updateUrl = true): Promise<void> {
    const statementSequence = ++this.statementSequence;
    this.selectedCustomerId.set(customerId);
    this.customerDepositBalance.set(0);
    this.customerIntegrity.set(null);
    this.customerIntegrityLoading.set(true);
    this.lastReceiptResult.set(null);
    this.receiptAttempt = null;
    this.depositRefundClientRef = null;
    this.depositRefundMethod.setValue('');
    this.depositRefundReference.setValue('');
    this.orders.set([]);
    this.creditOrders.set([]);
    this.statement.set([]);
    this.statementHasMore.set(false);
    this.statementBusy.set(false);
    this.customerApprovals.set([]);
    this.detailLoading.set(true);
    const customer =
      this.customers().find(c => c.id === customerId) ??
      (await this.pos.customerWithCredit(customerId).catch(() => null));
    if (customer) {
      this.bulkMpesaPhone.setValue(customer.phone ?? '');
      this.creditLimit.setValue(formatKesInput(customer.credit_limit));
      this.termsDays.setValue(customer.credit_terms_days ?? 0);
      this.approved.setValue(customer.is_credit_approved);
      this.creditReason.setValue('');
    }
    try {
      const statementRequest = this.perms.has('ViewFinancials')
        ? this.money.customerStatement(customerId, undefined, CUSTOMER_STATEMENT_PAGE_SIZE)
        : Promise.resolve({ rows: [], hasMore: false });
      const [orders, creditOrders, statementPage, company, approvals, depositBalance, integrity] =
        await Promise.all([
          this.pos.customerOrders(customerId),
          this.money.creditOrders(customerId),
          statementRequest,
          this.receiptData.companyPrintInfo().catch(() => null),
          this.approvals.forCustomer(customerId),
          this.perms.has('SettleOrder') ||
          this.perms.has('ReverseOrder') ||
          this.perms.has('ViewFinancials')
            ? this.money.customerDepositAvailable(customerId)
            : Promise.resolve(0),
          this.perms.has('ViewFinancials') ||
          this.perms.has('SettleOrder') ||
          this.perms.has('ManageCustomers')
            ? this.money.customerAccountStatus(customerId)
            : Promise.resolve(null),
        ]);
      // Ignore stale results when the drawer was closed (or reopened) meanwhile.
      if (this.selectedCustomerId() !== customerId || statementSequence !== this.statementSequence)
        return;
      this.orders.set(orders);
      this.creditOrders.set(creditOrders);
      this.statement.set(statementPage.rows);
      this.statementHasMore.set(statementPage.hasMore);
      this.companyInfo.set(company);
      this.customerApprovals.set(approvals);
      this.customerDepositBalance.set(depositBalance);
      this.customerIntegrity.set(integrity);
      this.customerApprovalPeople.set(
        await this.approvals.staffNames(
          approvals.flatMap(approval => [approval.requested_by, approval.decided_by])
        )
      );
      if (updateUrl) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { customer: customerId, approval: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      if (this.selectedCustomerId() === customerId) {
        this.detailLoading.set(false);
        this.customerIntegrityLoading.set(false);
      }
    }
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeCustomerDrawer(): void {
    this.statementSequence++;
    this.selectedCustomerId.set(null);
    this.customerDepositBalance.set(0);
    this.customerIntegrity.set(null);
    this.customerIntegrityLoading.set(false);
    this.lastReceiptResult.set(null);
    this.receiptAttempt = null;
    this.depositRefundClientRef = null;
    this.depositRefundMethod.setValue('');
    this.depositRefundReference.setValue('');
    this.detailLoading.set(false);
    this.creating.set(false);
    this.drawerEditing.set(false);
    this.editing.set(null);
    this.editorDirty.set(false);
    this.editorError.set(null);
    this.orders.set([]);
    this.creditOrders.set([]);
    this.statement.set([]);
    this.statementHasMore.set(false);
    this.statementBusy.set(false);
    this.customerApprovals.set([]);
    this.customerApprovalPeople.set(new Map());
    this.highlightedApprovalId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { customer: null, approval: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Move editing into the focused task surface; the inspector returns on close. */
  protected editFromDrawer(c: CustomerWithAr): void {
    if (!this.perms.has('ManageCustomers')) return;
    this.editing.set(c);
    this.firstName.setValue(c.first_name);
    this.lastName.setValue(c.last_name ?? '');
    this.phone.setValue(c.phone ?? '');
    this.email.setValue(c.email ?? '');
    this.deliveryAddress.setValue(c.delivery_address ?? '');
    this.taxRegistrationNumber.setValue(c.tax_registration_number ?? '');
    this.notes.setValue(c.notes ?? '');
    this.notificationsEnabled.setValue(c.notifications_enabled);
    this.smsNotificationsEnabled.setValue(c.sms_notifications_enabled);
    this.whatsappNotificationsEnabled.setValue(c.whatsapp_notifications_enabled);
    this.editorDirty.set(false);
    this.editorError.set(null);
    this.drawerEditing.set(true);
  }

  protected startCreate(): void {
    if (!this.perms.has('ManageCustomers')) return;
    this.editing.set(null);
    this.firstName.setValue('');
    this.lastName.setValue('');
    this.phone.setValue('');
    this.email.setValue('');
    this.deliveryAddress.setValue('');
    this.taxRegistrationNumber.setValue('');
    this.notes.setValue('');
    this.notificationsEnabled.setValue(true);
    this.smsNotificationsEnabled.setValue(true);
    this.whatsappNotificationsEnabled.setValue(true);
    this.editorDirty.set(false);
    this.editorError.set(null);
    this.drawerEditing.set(false);
    this.creating.set(true);
  }

  protected startEdit(c: CustomerWithAr): void {
    if (c.deleted_at || !this.perms.has('ManageCustomers')) return;
    void this.openCustomer(c.id);
    this.editFromDrawer(c);
  }

  protected setAccountStatus(event: Event): void {
    this.accountStatus.set(
      (event.target as HTMLSelectElement).value as 'active' | 'deleted' | 'all'
    );
    this.customerPage.set(1);
  }

  protected clearCustomerFilters(): void {
    this.accountStatus.set('active');
    this.customerPage.set(1);
  }

  protected startDelete(customer: CustomerWithAr): void {
    if (!this.perms.has('ManageCustomers')) return;
    this.deletingCustomer.set(customer);
    this.deleteModal()?.show();
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.perms.has('ManageCustomers')) return;
    const customer = this.deletingCustomer();
    if (!customer) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.setCustomerDeleted(customer.id, true);
      this.deleteModal()?.hide();
      this.deletingCustomer.set(null);
      this.closeCustomerDrawer();
      await this.load();
      this.notice.set(`${this.name(customer)} was deleted. Past account activity is preserved.`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Customer deletion failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async restoreCustomer(customer: CustomerWithAr): Promise<void> {
    if (!this.perms.has('ManageCustomers')) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.setCustomerDeleted(customer.id, false);
      await this.load();
      this.notice.set(`${this.name(customer)} was restored and can be selected for new sales.`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Customer restore failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected closeForm(): void {
    this.editing.set(null);
    this.editorDirty.set(false);
    this.editorError.set(null);
    if (this.creating()) {
      this.creating.set(false);
    } else {
      this.drawerEditing.set(false);
    }
  }

  protected viewAllSales(customerId: string): void {
    void this.router.navigate(['/orders'], {
      queryParams: { customer: customerId, range: 'all' },
    });
  }

  protected recordMissingSale(customerId: string): void {
    void this.router.navigate(['/pos/sell'], { queryParams: { customer: customerId } });
  }

  protected viewSale(customerId: string, orderId: string): void {
    void this.router.navigate(['/orders'], {
      queryParams: { customer: customerId, range: 'all', order: orderId },
    });
  }

  protected async save(): Promise<void> {
    if (!this.perms.has('ManageCustomers') || this.firstName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.editorError.set(null);
    this.notice.set(null);
    try {
      const editing = this.editing();
      const savedId = await this.money.saveCustomerProfile({
        customerId: editing?.id,
        firstName: this.firstName.value.trim(),
        lastName: this.lastName.value.trim(),
        phone: this.phone.value.trim(),
        email: this.email.value.trim(),
        deliveryAddress: this.deliveryAddress.value.trim(),
        taxRegistrationNumber: this.taxRegistrationNumber.value.trim(),
        notes: this.notes.value.trim(),
        notificationsEnabled: this.notificationsEnabled.value,
        smsNotificationsEnabled: this.smsNotificationsEnabled.value,
        whatsappNotificationsEnabled: this.whatsappNotificationsEnabled.value,
      });
      this.notice.set(`${editing ? 'Updated' : 'Created'} ${this.firstName.value.trim()}`);
      if (editing) {
        // Return to the drawer's detail view with fresh data.
        this.drawerEditing.set(false);
        this.editorDirty.set(false);
        this.editing.set(null);
        await this.load(true);
        await this.openCustomer(savedId);
      } else {
        this.closeForm();
        await this.load(true);
      }
    } catch (err) {
      this.editorError.set(err instanceof Error ? err.message : 'Customer could not be saved');
    } finally {
      this.busy.set(false);
    }
  }

  protected async refundDeposit(customerId: string): Promise<void> {
    const amount = parseKes(this.depositRefundAmount.value);
    const reason = this.depositRefundReason.value.trim();
    if (amount === null || amount <= 0 || amount > this.customerDepositBalance()) {
      this.error.set('Enter a refund amount within the held balance');
      return;
    }
    if (!reason) {
      this.error.set('Enter a refund reason');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const outcome = await this.money.refundCustomerDeposit({
        customerId,
        amount,
        reason,
        methodCode: this.depositRefundMethod.value || undefined,
        reference: this.depositRefundReference.value.trim() || undefined,
        clientRef: (this.depositRefundClientRef ??= crypto.randomUUID()),
      });
      this.depositRefundAmount.setValue('');
      this.depositRefundMethod.setValue('');
      this.depositRefundReference.setValue('');
      this.depositRefundReason.setValue('');
      this.depositRefundClientRef = null;
      if (outcome.status === 'approval_required') {
        this.notice.set('Deposit refund sent for approval');
      } else {
        this.notice.set('Customer deposit refunded');
        try {
          await this.refreshCustomerDepositData(customerId);
        } catch {
          this.error.set('Deposit was refunded, but the balance could not refresh');
        }
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not refund deposit');
    } finally {
      this.busy.set(false);
    }
  }

  private async refreshCustomerDepositData(customerId: string): Promise<void> {
    const balance = await this.money.customerDepositAvailable(customerId);
    if (this.selectedCustomerId() !== customerId) return;
    this.customerDepositBalance.set(balance);
  }

  protected async receivePayment(customerId: string): Promise<void> {
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
      const fingerprint = JSON.stringify({
        customerId,
        amount,
        method: this.bulkMethod.value,
        reference: this.bulkReference.value.trim(),
        phone: this.bulkMpesaPhone.value.trim(),
        manualMpesa: this.bulkMpesaManual.value,
      });
      if (this.receiptAttempt?.fingerprint !== fingerprint) {
        this.receiptAttempt = {
          fingerprint,
          clientRef: crypto.randomUUID(),
          mpesaRetryAllowed: false,
        };
      }
      const integratedMpesa =
        this.bulkMethod.value === 'mpesa' &&
        ((this.mpesa.availability().active && !this.bulkMpesaManual.value) ||
          (this.mpesa.availability().manualFallback && this.bulkMpesaManual.value));
      if (integratedMpesa) {
        if (!this.bulkMpesaManual.value && !this.bulkMpesaPhone.value.trim())
          throw new Error('Enter the M-PESA payer phone');
        const receipt = this.bulkReference.value.trim();
        if (this.bulkMpesaManual.value && !/^[A-Z0-9]{8,12}$/i.test(receipt))
          throw new Error('Enter a valid M-PESA receipt code');
        const outcome = await this.mpesaCheckout.run(
          retry =>
            this.mpesa.initiateCustomerReceipt({
              customerId,
              locationId: this.locations.requireActiveId(),
              amount,
              clientRef: this.receiptAttempt!.clientRef,
              retry,
              ...(this.bulkMpesaManual.value ? { receipt } : { phone: this.bulkMpesaPhone.value }),
            }),
          this.receiptAttempt.mpesaRetryAllowed
        );
        if (outcome.kind !== 'completed') {
          if (outcome.kind === 'manual_review') {
            this.receiptAttempt = null;
            this.bulkAmount.setValue('');
          } else if (outcome.kind === 'failed' && outcome.retryAllowed) {
            this.receiptAttempt.mpesaRetryAllowed = true;
          }
          throw new Error(
            'message' in outcome ? outcome.message : 'M-PESA cash split is not supported here'
          );
        }
        this.receiptAttempt = null;
        this.bulkAmount.setValue('');
        this.bulkReference.setValue('');
        this.notice.set('M-PESA payment posted to the customer account');
        await Promise.all([
          this.load(),
          this.money.creditOrders(customerId).then(rows => this.creditOrders.set(rows)),
          this.refreshCustomerStatement(customerId),
          this.refreshCustomerDepositData(customerId),
        ]);
        return;
      }
      const outcome = await this.money.postCustomerPayment(
        customerId,
        amount,
        this.bulkMethod.value,
        this.bulkReference.value.trim() || undefined,
        this.receiptAttempt.clientRef
      );
      if (outcome.status === 'approval_required') {
        this.notice.set('Payment sent for finance approval');
      } else {
        this.lastReceiptResult.set(outcome);
        this.receiptAttempt = null;
        this.bulkAmount.setValue('');
        this.bulkReference.setValue('');
        this.notice.set(
          outcome.downpayment_amount > 0
            ? 'Payment posted; the remainder is available as downpayment'
            : 'Payment posted to the oldest invoices'
        );
        await Promise.all([
          this.load(),
          this.money.creditOrders(customerId).then(rows => this.creditOrders.set(rows)),
          this.refreshCustomerStatement(customerId),
          this.refreshCustomerDepositData(customerId),
        ]);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected bulkPaymentPlan(): CustomerReceiptPlan | null {
    const amount = parseKes(this.bulkAmount.value);
    if (amount === null || amount <= 0) return null;
    return planCustomerReceipt(amount, this.creditOrders());
  }

  protected statementBalanceLabel(balance: number): string {
    const state = customerAccountState(balance);
    return balance === 0 ? state : `${state} ${formatKes(Math.abs(balance))}`;
  }

  protected async reverseReceipt(receiptId: string): Promise<void> {
    const reason = this.receiptReversalReason.value.trim();
    if (!reason) return;
    const customerId = this.selectedCustomerId();
    if (!customerId) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const outcome = await this.money.reverseCustomerReceipt(receiptId, reason);
      this.receiptReversalReason.setValue('');
      this.notice.set(
        outcome.status === 'approval_required'
          ? 'Receipt reversal sent for approval'
          : 'Receipt reversed'
      );
      if (outcome.status === 'completed') {
        await Promise.all([
          this.load(),
          this.money.creditOrders(customerId).then(rows => this.creditOrders.set(rows)),
          this.refreshCustomerStatement(customerId),
          this.refreshCustomerDepositData(customerId),
        ]);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Receipt could not be reversed');
    } finally {
      this.busy.set(false);
    }
  }

  private async refreshCustomerStatement(customerId: string): Promise<void> {
    const sequence = ++this.statementSequence;
    if (!this.perms.has('ViewFinancials')) {
      this.statement.set([]);
      this.statementHasMore.set(false);
      this.statementBusy.set(false);
      return;
    }
    this.statementBusy.set(true);
    try {
      const page = await this.money.customerStatement(
        customerId,
        undefined,
        CUSTOMER_STATEMENT_PAGE_SIZE
      );
      if (this.selectedCustomerId() !== customerId || sequence !== this.statementSequence) return;
      this.statement.set(page.rows);
      this.statementHasMore.set(page.hasMore);
    } finally {
      if (this.selectedCustomerId() === customerId && sequence === this.statementSequence) {
        this.statementBusy.set(false);
      }
    }
  }

  protected async loadOlderStatement(): Promise<void> {
    const customerId = this.selectedCustomerId();
    const cursor = this.statement()[this.statement().length - 1];
    if (!customerId || !cursor || !this.statementHasMore() || this.statementBusy()) return;
    const sequence = ++this.statementSequence;
    this.statementBusy.set(true);
    this.error.set(null);
    try {
      const page = await this.money.customerStatement(
        customerId,
        { id: cursor.id, date: cursor.date },
        CUSTOMER_STATEMENT_PAGE_SIZE
      );
      if (this.selectedCustomerId() !== customerId || sequence !== this.statementSequence) return;
      this.statement.update(rows => [...rows, ...page.rows]);
      this.statementHasMore.set(page.hasMore);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load older activity');
    } finally {
      if (this.selectedCustomerId() === customerId && sequence === this.statementSequence) {
        this.statementBusy.set(false);
      }
    }
  }

  protected async printStatement(): Promise<void> {
    const customerId = this.selectedCustomerId();
    const customer = this.selectedCustomer();
    if (!customerId || !customer || !this.perms.has('ViewFinancials') || this.statementBusy())
      return;
    const sequence = ++this.statementSequence;
    this.statementBusy.set(true);
    this.error.set(null);
    try {
      const rows = [...this.statement()];
      let hasMore = this.statementHasMore();
      const visitedCursors = new Set<string>();
      while (hasMore) {
        const cursor = rows[rows.length - 1];
        if (!cursor) break;
        const cursorKey = `${cursor.date}:${cursor.id}`;
        if (visitedCursors.has(cursorKey)) {
          throw new Error('Statement preparation stopped because pagination did not advance.');
        }
        visitedCursors.add(cursorKey);
        const page = await this.money.customerStatement(
          customerId,
          { id: cursor.id, date: cursor.date },
          CUSTOMER_STATEMENT_PRINT_PAGE_SIZE
        );
        if (this.selectedCustomerId() !== customerId || sequence !== this.statementSequence) return;
        if (page.rows.length === 0) {
          if (page.hasMore) throw new Error('The complete statement could not be loaded.');
          break;
        }
        rows.push(...page.rows);
        hasMore = page.hasMore;
      }
      const company = this.companyInfo() ?? (await this.receiptData.companyPrintInfo());
      if (this.selectedCustomerId() !== customerId || sequence !== this.statementSequence) return;
      const rendered = renderCustomerStatement({
        company: {
          name: company.name,
          address: company.address,
          logoUrl: company.logoUrl,
        },
        customerName: this.name(customer),
        currency: 'KES',
        generatedAt: new Date().toISOString(),
        rows,
      });
      await this.print.printDocument(rendered.title, rendered.html, rendered.styles);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to prepare statement');
    } finally {
      if (this.selectedCustomerId() === customerId && sequence === this.statementSequence) {
        this.statementBusy.set(false);
      }
    }
  }

  protected async saveCredit(c: CustomerWithAr): Promise<void> {
    const limitAmount = parseKes(this.creditLimit.value);
    if (limitAmount === null) {
      this.error.set('Enter a valid credit limit');
      return;
    }
    if (!this.creditReason.value.trim()) {
      this.error.set('Enter a reason for the credit-policy change');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const outcome = await this.money.changeCustomerCredit(
        c.id,
        limitAmount,
        this.approved.value,
        Math.max(0, this.termsDays.value),
        this.creditReason.value.trim()
      );
      this.creditReason.setValue('');
      this.notice.set(
        outcome.status === 'approval_required'
          ? `Credit-policy change sent for approval for ${this.name(c)}`
          : `Credit settings saved for ${this.name(c)}`
      );
      await this.load();
      const approvals = await this.approvals.forCustomer(c.id);
      this.customerApprovals.set(approvals);
      if (approvals[0]) {
        this.pageCustomerApprovals.update(rows => new Map(rows).set(c.id, approvals[0]));
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected customerCreditAvailable(customer: CustomerWithAr): number {
    return Math.max(0, customer.credit_limit - customer.ar_balance);
  }

  protected customerOutstanding(): number {
    return this.creditOrders().reduce((sum, order) => sum + order.outstanding, 0);
  }

  protected customerAccountLabel(): string {
    const net =
      this.selectedCustomer()?.net_balance ??
      this.customerOutstanding() - this.customerDepositBalance();
    const state = customerAccountState(net);
    return net === 0 ? state : `${state} ${formatKes(Math.abs(net))}`;
  }

  protected approvalTone(status: Approval['status']): BadgeType {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'denied' || status === 'expired') return 'error';
    return 'neutral';
  }

  protected approvalReason(approval: Approval): string {
    return (approval.metadata as { reason?: string }).reason ?? 'Credit policy change';
  }

  protected approvalPerson(userId: string | null): string {
    if (!userId) return 'Unknown user';
    return this.customerApprovalPeople().get(userId) ?? `User …${userId.slice(-4)}`;
  }

  protected latestCustomerApproval(customerId: string): Approval | null {
    return this.pageCustomerApprovals().get(customerId) ?? null;
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
