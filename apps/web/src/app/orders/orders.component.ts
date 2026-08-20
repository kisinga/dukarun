import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { formatKes } from '../core/money';
import { reconciliationLabel, reconciliationTypeForCode } from '../core/payment-methods';
import { OrderLineWithProduct, OrderWithCustomer, Payment, PosService } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { ORDER_STATUS_MAP, StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { MoneyService } from '../money/money.service';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { PermissionsService } from '../core/permissions.service';
import { Approval, ApprovalsService } from '../approvals/approvals.service';
import { RecentSalesCacheService } from '../core/recent-sales-cache.service';
import { DocumentSendComponent } from '../communications/document-send.component';
import { PartyCacheService } from '../core/party-cache.service';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';

const ALL_STATUSES = ['completed', 'voided', 'draft', 'expired', 'pending_payment'];

const SALE_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'created_at', label: 'Sale date' },
  { value: 'code', label: 'Sale code' },
  { value: 'total', label: 'Sale value' },
  { value: 'status', label: 'Status' },
];

/**
 * Sales history — the canonical sales screen. Defaults to "today" with realtime
 * updates (live badge); status + date-range filters for full history;
 * drawer detail with lines/payments, void flow, and receipt reprint.
 */
@Component({
  selector: 'app-orders',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ListSearchBarComponent,
    PaginationComponent,
    StatusBadgeComponent,
    DataTableShellComponent,
    DrawerComponent,
    StatCardComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    StatBarComponent,
    MoneyComponent,
    DocumentSendComponent,
    SearchableFilterComponent,
    MobileListComponent,
    PageActionsComponent,
  ],
  template: `
    <app-page
      title="Sales"
      subtitle="Review completed sales, cashier handoffs, proformas, refunds, and voids."
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
          title="Refresh sales"
          aria-label="Refresh sales"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
      </app-page-actions>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (warning()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ warning() }}</span>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }

      <app-list-search-bar
        placeholder="Search sale code or customer…"
        [searchQuery]="query()"
        (searchQueryChange)="onSearch($event)"
        [sortOptions]="saleSortOptions"
        [sortKey]="saleSort()"
        (sortKeyChange)="changeSort($event, saleSortDirection())"
        [sortDirection]="saleSortDirection()"
        (sortDirectionChange)="changeSort(saleSort(), $event)"
        [filtersEnabled]="true"
        [activeFilterCount]="salesActiveFilterCount()"
        (clearFilters)="clearSalesFilters()"
      >
        <app-stat-bar summary [stats]="salesStats()" />
        <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <app-form-field label="Status" class="sm:col-span-2 lg:w-44">
            <select class="select select-bordered select-sm w-full" [formControl]="status">
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="draft">Draft (proforma)</option>
              <option value="expired">Expired proforma</option>
              <option value="pending_payment">Cashier queue</option>
            </select>
          </app-form-field>
          <app-form-field label="Customer" class="sm:col-span-2 lg:w-56">
            <app-searchable-filter
              ariaLabel="Filter sales by customer"
              placeholder="All customers"
              searchPlaceholder="Search customers…"
              [options]="customerFilterOptions()"
              [value]="customerId() ?? ''"
              (valueChange)="setCustomerFilter($event)"
            />
          </app-form-field>
          <app-form-field label="From" class="lg:w-40">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [formControl]="from"
              [disabled]="allTime()"
            />
          </app-form-field>
          <app-form-field label="To" class="lg:w-40">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [formControl]="to"
              [disabled]="allTime()"
            />
          </app-form-field>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button appButton type="button" (click)="apply()">Apply filters</button>
            <button
              appButton
              [variant]="todayActive() ? 'soft' : 'ghost'"
              type="button"
              [attr.aria-pressed]="todayActive()"
              (click)="setToday()"
            >
              @if (todayActive()) {
                <app-icon name="heroCheck" size="sm" />
              }
              Today
            </button>
            <button
              appButton
              [variant]="weekActive() ? 'soft' : 'ghost'"
              type="button"
              [attr.aria-pressed]="weekActive()"
              (click)="setWeek()"
            >
              @if (weekActive()) {
                <app-icon name="heroCheck" size="sm" />
              }
              7 days
            </button>
            <button
              appButton
              [variant]="allTime() ? 'soft' : 'ghost'"
              type="button"
              [attr.aria-pressed]="allTime()"
              (click)="setAllTime()"
            >
              @if (allTime()) {
                <app-icon name="heroCheck" size="sm" />
              }
              All time
            </button>
          </div>
        </div>
      </app-list-search-bar>

      @if (customerId() || allTime()) {
        <div
          class="mb-3 flex flex-wrap items-center gap-2 rounded-box border border-info/20 bg-info/10 px-3 py-2 text-sm"
        >
          <app-icon name="heroUsers" size="sm" />
          <span>
            @if (customerId()) {
              Showing <strong>{{ selectedCustomerName() }}</strong>
              @if (allTime()) {
                across all time and locations
              }
            } @else {
              Showing all time for the current location
            }
          </span>
          @if (customerId()) {
            <button
              class="btn btn-ghost btn-xs ml-auto"
              type="button"
              (click)="clearCustomerFilter()"
            >
              Clear customer
            </button>
          }
        </div>
      }

      @if (!loading() && orders().length === 0) {
        <div class="mt-3">
          <app-empty-state
            [compact]="true"
            icon="heroClipboardDocumentList"
            [title]="allTime() ? 'No matching sales' : 'No sales in this range'"
            [description]="
              allTime()
                ? 'Clear the customer, search, or status filter.'
                : 'Widen the dates or clear the status filter.'
            "
          />
        </div>
      } @else {
        <app-mobile-list class="mt-3">
          @for (order of orders(); track order.id) {
            <div
              mobileListRow
              class="cursor-pointer"
              role="button"
              tabindex="0"
              [class.border-primary]="selectedOrderId() === order.id"
              (click)="openOrder(order.id)"
              (keydown.enter)="openOrder(order.id)"
            >
              <div class="flex min-h-20 items-center gap-3 p-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate font-mono font-semibold">{{ order.code }}</span>
                    <app-status-badge
                      size="xs"
                      [type]="statusType(order.status)"
                      [label]="statusLabel(order.status, order.id)"
                    />
                  </div>
                  <p class="type-caption mt-1 truncate">
                    {{ time(order.created_at) }} · {{ customerName(order) }}
                    @if (order.is_credit_sale) {
                      · {{ creditBadge(order).label }}
                    }
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-bold tabular-nums"><app-money [amount]="order.total" /></p>
                  @if (
                    order.status === 'pending_payment' &&
                    order.cashier_pending_at &&
                    permissions.has('SettleOrder') &&
                    !pendingApprovalHold(order.id)
                  ) {
                    <a
                      appButton
                      variant="soft"
                      size="sm"
                      routerLink="/pos/cashier"
                      (click)="$event.stopPropagation()"
                    >
                      <app-icon name="heroBanknotes" />
                      Collect payment
                    </a>
                  }
                </div>
              </div>
            </div>
          }
        </app-mobile-list>

        <div class="mt-3 hidden lg:block">
          <app-data-table-shell
            heading="Sales history"
            [description]="totalItems() + ' matching sales'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sale</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th class="text-right">Total</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.id) {
                  <tr
                    role="button"
                    tabindex="0"
                    class="cursor-pointer"
                    [class.table-row-active]="selectedOrderId() === order.id"
                    (click)="openOrder(order.id)"
                    (keydown.enter)="openOrder(order.id)"
                  >
                    <td>{{ time(order.created_at) }}</td>
                    <td class="font-mono font-semibold">{{ order.code }}</td>
                    <td>{{ customerName(order) }}</td>
                    <td>
                      <app-status-badge
                        [type]="statusType(order.status)"
                        [label]="statusLabel(order.status, order.id)"
                      />
                      @if (order.is_credit_sale) {
                        <app-status-badge
                          [type]="creditBadge(order).type"
                          [label]="creditBadge(order).label"
                        />
                      }
                      @for (approval of approvalBadges(order.id); track approval.id) {
                        <span
                          class="badge badge-xs ml-1"
                          [class.badge-warning]="approval.status === 'pending'"
                          [class.badge-success]="approval.status === 'approved'"
                          [class.badge-error]="
                            approval.status === 'denied' || approval.status === 'expired'
                          "
                          [class.badge-ghost]="approval.status === 'cancelled'"
                        >
                          {{ approvalBadgeLabel(approval) }}
                        </span>
                      }
                    </td>
                    <td
                      [class.font-medium]="order.status === 'pending_payment'"
                      [class.text-warning]="order.status === 'pending_payment'"
                    >
                      {{ paymentLabel(order) }}
                    </td>
                    <td class="table-number"><app-money [amount]="order.total" /></td>
                    <td class="table-actions" (click)="$event.stopPropagation()">
                      @if (printerEnabled() && order.status === 'completed') {
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          title="Print receipt"
                          aria-label="Print receipt"
                          (click)="printOrder(order.id)"
                        >
                          <app-icon name="heroPrinter" />
                        </button>
                      } @else if (
                        order.status === 'pending_payment' &&
                        order.cashier_pending_at &&
                        permissions.has('SettleOrder') &&
                        !pendingApprovalHold(order.id)
                      ) {
                        <a
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          routerLink="/pos/cashier"
                          title="Collect payment"
                          aria-label="Collect payment"
                        >
                          <app-icon name="heroBanknotes" />
                        </a>
                      } @else if (order.status === 'draft') {
                        <a
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          routerLink="/pos/proformas"
                          title="Open proforma"
                          aria-label="Open proforma"
                        >
                          <app-icon name="heroDocumentText" />
                        </a>
                      }
                      @if (
                        order.status === 'completed' &&
                        permissions.actionMode('sale.void') !== 'blocked' &&
                        !isPending('order_reversal', order.id)
                      ) {
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          title="Void sale"
                          aria-label="Void sale"
                          (click)="openOrder(order.id); startVoid(order.id)"
                        >
                          <app-icon name="heroXMark" />
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <!-- Order detail drawer -->
        @if (selectedOrder(); as order) {
          <app-drawer
            [open]="true"
            (closed)="closeOrderDrawer()"
            [title]="order.code"
            [subtitle]="time(order.created_at) + ' · ' + customerName(order)"
          >
            @if (printerEnabled() && order.status === 'completed') {
              <button
                actions
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                title="Print receipt"
                aria-label="Print receipt"
                (click)="printOrder(order.id)"
              >
                <app-icon name="heroPrinter" />
              </button>
            }

            <div class="flex flex-wrap items-center gap-1">
              <app-status-badge
                size="xs"
                [type]="statusType(order.status)"
                [label]="statusLabel(order.status, order.id)"
              />
              @if (order.is_credit_sale) {
                <app-status-badge
                  size="xs"
                  [type]="creditBadge(order).type"
                  [label]="creditBadge(order).label"
                />
              }
            </div>
            @if (order.status === 'voided' && order.void_reason) {
              <p class="type-caption mt-1">Void reason: {{ order.void_reason }}</p>
            }

            <div class="mt-3 grid grid-cols-2 gap-2">
              <app-stat-card label="Total" [value]="fmtKes(order.total)" />
              @if (order.is_credit_sale && order.status === 'completed') {
                <app-stat-card
                  label="Paid so far"
                  [value]="fmtKes(creditPaid().get(order.id) ?? 0)"
                  [tone]="(creditPaid().get(order.id) ?? 0) >= order.total ? 'success' : 'warning'"
                  [sub]="paymentLabel(order)"
                />
              } @else {
                <app-stat-card
                  label="Payment"
                  [value]="paymentLabel(order)"
                  [tone]="order.status === 'pending_payment' ? 'warning' : 'neutral'"
                />
              }
              @if (order.status === 'completed') {
                <app-stat-card label="COGS" [value]="fmtKes(order.cogs_total)" />
                <app-stat-card
                  label="Gross profit"
                  [value]="fmtKes(margin(order.net_total, order.cogs_total))"
                  [tone]="margin(order.net_total, order.cogs_total) >= 0 ? 'success' : 'error'"
                  [sub]="marginPercent(order.net_total, order.cogs_total)"
                />
              }
            </div>

            @if (
              order.status === 'completed' &&
              order.customer_id &&
              permissions.has('ManageCommunications')
            ) {
              <div class="mt-3 space-y-2">
                @if (canSendReceipt(order)) {
                  <app-document-send
                    documentType="receipt"
                    [subjectId]="order.id"
                    title="Send receipt"
                    description="Customer and totals come from this completed sale."
                    (sent)="notice.set($event)"
                    (failed)="error.set($event)"
                  />
                }
                @if (order.is_credit_sale) {
                  <app-document-send
                    documentType="invoice"
                    [subjectId]="order.id"
                    title="Send invoice"
                    description="Customer, total, and balance come from this credit sale."
                    [allowCompanyCopy]="true"
                    (sent)="notice.set($event)"
                    (failed)="error.set($event)"
                  />
                }
              </div>
            }

            @if (detailLoading()) {
              <div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
                <span class="loading loading-spinner loading-md"></span>
                <span class="text-sm">Loading sale details…</span>
              </div>
            } @else {
              <div class="mt-4 flex flex-col gap-4">
                <section>
                  <h3 class="section-title mb-2">Items</h3>
                  @if (lines().length === 0) {
                    <app-empty-state
                      [compact]="true"
                      icon="heroShoppingCart"
                      title="No line items"
                    />
                  } @else {
                    <ul class="divide-y divide-base-200">
                      @for (line of lines(); track line.id) {
                        <li class="flex items-center gap-3 py-2">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{{ line.label }}</p>
                            <p class="type-caption">
                              {{ line.manufacturer_name || 'Manufacturer not set' }}
                              @if (line.sku) {
                                · {{ line.sku }}
                              }
                              ·
                              {{ line.quantity }} ×
                              <app-money [amount]="line.custom_price ?? line.unit_price" />
                            </p>
                            @if (order.status === 'completed') {
                              <p class="type-caption mt-0.5">
                                @if (line.cogs_total !== null) {
                                  COGS <app-money [amount]="line.cogs_total" /> · Gross profit
                                  <app-money [amount]="margin(line.net_total, line.cogs_total)" />
                                  ({{ marginPercent(line.net_total, line.cogs_total) }})
                                } @else {
                                  COGS unavailable
                                }
                              </p>
                            }
                          </div>
                          <span class="text-sm font-semibold tabular-nums">
                            <app-money [amount]="line.line_total" />
                          </span>
                        </li>
                      }
                    </ul>
                  }
                </section>

                <section class="border-t border-base-300/60 pt-3">
                  <h3 class="section-title mb-2">Payments</h3>
                  @if (payments().length === 0) {
                    <p class="text-xs text-base-content/60">{{ noPaymentsMessage(order) }}</p>
                  } @else {
                    <div class="flex flex-wrap gap-2">
                      @for (p of payments(); track p.id) {
                        <div
                          class="inline-flex items-center gap-1 rounded-field border border-base-300 px-2 py-1 text-xs"
                        >
                          {{ p.method_code }} · <app-money [amount]="p.amount" /> · {{ p.status }}
                          @if (p.reference) {
                            · {{ p.reference }}
                          }
                          @if (
                            p.status === 'settled' &&
                            permissions.actionMode('payment.reverse') !== 'blocked'
                          ) {
                            @if (
                              isPending(
                                p.customer_receipt_id
                                  ? 'customer_receipt_reversal'
                                  : 'payment_reversal',
                                p.customer_receipt_id ?? p.id
                              )
                            ) {
                              <span class="badge badge-warning badge-xs">Approval pending</span>
                            } @else if (reversingPaymentId() !== p.id) {
                              <button
                                class="btn btn-ghost btn-xs"
                                [disabled]="busy()"
                                (click)="startPaymentReversal(p.id)"
                              >
                                {{
                                  permissions.actionMode('payment.reverse') === 'execute'
                                    ? p.customer_receipt_id
                                      ? 'Reverse receipt'
                                      : 'Reverse'
                                    : 'Request reversal'
                                }}
                              </button>
                            } @else {
                              <form
                                class="flex items-center gap-1"
                                (submit)="$event.preventDefault(); reversePayment(p)"
                              >
                                <input
                                  class="input input-bordered input-xs w-40"
                                  placeholder="Reason"
                                  [formControl]="paymentReversalReason"
                                />
                                <button
                                  class="btn btn-error btn-xs"
                                  type="submit"
                                  [disabled]="
                                    busy() || paymentReversalReason.value.trim().length === 0
                                  "
                                >
                                  {{
                                    permissions.actionMode('payment.reverse') === 'execute'
                                      ? 'Confirm'
                                      : 'Request'
                                  }}
                                </button>
                                <button
                                  class="btn btn-ghost btn-xs"
                                  type="button"
                                  (click)="reversingPaymentId.set(null)"
                                >
                                  Cancel
                                </button>
                              </form>
                            }
                          }
                        </div>
                      }
                    </div>
                  }
                </section>

                @if (approvalHistory().length > 0) {
                  <section class="border-t border-base-300/60 pt-3">
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <h3 class="section-title">Approval activity</h3>
                        <p class="type-caption">Requests and decisions linked to this sale</p>
                      </div>
                    </div>
                    <div class="flex flex-col gap-2">
                      @for (approval of approvalHistory(); track approval.id) {
                        <article
                          class="rounded-field border border-base-300 p-3"
                          [class.ring-2]="highlightedApprovalId() === approval.id"
                          [class.ring-primary]="highlightedApprovalId() === approval.id"
                          [class.bg-primary/5]="highlightedApprovalId() === approval.id"
                        >
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-semibold">
                              {{ approvalTypeLabel(approval.type) }}
                            </p>
                            <app-status-badge
                              size="xs"
                              [type]="approvalStatusTone(approval.status)"
                              [label]="approval.status"
                            />
                            <span class="type-caption ml-auto">{{
                              time(approval.created_at)
                            }}</span>
                          </div>
                          <p class="type-caption mt-1">
                            Requested by {{ approvalPerson(approval.requested_by) }}
                          </p>
                          @if (approvalRequestReason(approval)) {
                            <p class="mt-2 text-sm">“{{ approvalRequestReason(approval) }}”</p>
                          }
                          @if (approval.status !== 'pending') {
                            <div class="mt-2 rounded-field bg-base-200/70 p-2 text-sm">
                              <span class="font-medium capitalize">{{ approval.status }}</span>
                              by {{ approvalPerson(approval.decided_by) }}
                              @if (approval.decision_reason) {
                                <span> — {{ approval.decision_reason }}</span>
                              }
                            </div>
                          }
                          @if (
                            permissions.has('ManageApprovals') || permissions.has('ViewFinancials')
                          ) {
                            <a
                              class="link link-primary mt-2 inline-block text-xs font-semibold"
                              [routerLink]="['/approvals']"
                              [queryParams]="{ approval: approval.id }"
                            >
                              View approval request
                            </a>
                          }
                        </article>
                      }
                    </div>
                  </section>
                }

                @if (order.status === 'pending_payment' || order.status === 'draft') {
                  <section class="border-t border-base-300/60 pt-3">
                    @if (
                      order.status === 'pending_payment' &&
                      order.cashier_pending_at &&
                      permissions.has('SettleOrder') &&
                      !pendingApprovalHold(order.id)
                    ) {
                      <a appButton variant="soft" size="sm" routerLink="/pos/cashier">
                        <app-icon name="heroBanknotes" />
                        Collect payment
                      </a>
                    } @else {
                      <a appButton variant="outline" size="sm" routerLink="/pos/proformas">
                        <app-icon name="heroDocumentText" />
                        Open proforma
                      </a>
                    }
                  </section>
                }

                @if (order.status === 'completed') {
                  @if (permissions.actionMode('sale.refund') !== 'blocked') {
                    <section class="border-t border-base-300/60 pt-3">
                      <h3 class="section-title mb-2">Refund</h3>
                      @if (isPending('sale_refund', order.id)) {
                        <span class="badge badge-warning">Refund approval pending</span>
                      } @else if (refundingFor() !== order.id) {
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          (click)="startRefund(order.id)"
                        >
                          {{
                            permissions.actionMode('sale.refund') === 'execute'
                              ? 'Post refund'
                              : 'Request refund'
                          }}
                        </button>
                      } @else {
                        <form
                          (submit)="$event.preventDefault(); confirmRefund(order.id)"
                          class="flex flex-col gap-2 rounded-field border border-base-300 bg-base-200/50 p-2"
                        >
                          <div class="rounded-field bg-base-100 p-2 text-sm">
                            <span class="type-caption">Full-sale credit note</span>
                            <strong class="ml-2">{{ fmtKes(order.total) }}</strong>
                            <p class="type-caption mt-1">Partial refunds are not available yet.</p>
                          </div>
                          <app-form-field label="Method">
                            <select
                              class="select select-bordered select-sm w-full"
                              [formControl]="refundMethod"
                            >
                              <option value="cash">{{ methodOptionLabel('cash') }}</option>
                              <option value="mpesa">{{ methodOptionLabel('mpesa') }}</option>
                              <option value="bank">{{ methodOptionLabel('bank') }}</option>
                            </select>
                          </app-form-field>
                          <app-form-field label="Stock outcome" [required]="true">
                            <select
                              class="select select-bordered select-sm w-full"
                              [formControl]="refundStockOutcome"
                            >
                              <option value="return_to_stock">Return to sellable stock</option>
                              <option value="write_off">Write off / do not restore stock</option>
                            </select>
                          </app-form-field>
                          <app-form-field label="Reason" [required]="true">
                            <input
                              class="input input-bordered input-sm w-full"
                              [formControl]="refundReason"
                            />
                          </app-form-field>
                          <div class="flex gap-2">
                            <button
                              appButton
                              variant="error"
                              size="sm"
                              type="submit"
                              [disabled]="busy()"
                            >
                              {{
                                permissions.actionMode('sale.refund') === 'execute'
                                  ? 'Post refund'
                                  : 'Request refund'
                              }}
                            </button>
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              (click)="refundingFor.set(null)"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      }
                    </section>
                  }

                  @if (permissions.actionMode('sale.void') !== 'blocked') {
                    <section class="border-t border-base-300/60 pt-3">
                      <h3 class="section-title mb-2">Void sale</h3>
                      @if (isPending('order_reversal', order.id)) {
                        <span class="badge badge-warning">Void approval pending</span>
                      } @else if (voidingFor() !== order.id) {
                        <button appButton variant="error" size="sm" (click)="startVoid(order.id)">
                          {{
                            permissions.actionMode('sale.void') === 'execute'
                              ? 'Void sale'
                              : 'Request void'
                          }}
                        </button>
                      } @else {
                        <form
                          (submit)="$event.preventDefault(); confirmVoid(order.id)"
                          class="flex flex-col gap-2 rounded-field border border-base-300 bg-base-200/50 p-2"
                        >
                          <app-form-field label="Reason" [required]="true">
                            <input
                              type="text"
                              class="input input-bordered input-sm w-full"
                              placeholder="e.g. Wrong item rung up"
                              [formControl]="voidReason"
                            />
                          </app-form-field>
                          <div class="flex gap-2">
                            <button
                              appButton
                              variant="error"
                              size="sm"
                              type="submit"
                              [disabled]="voidReason.value.trim().length === 0 || busy()"
                            >
                              {{
                                permissions.actionMode('sale.void') === 'execute'
                                  ? 'Confirm void'
                                  : 'Send request'
                              }}
                            </button>
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              (click)="voidingFor.set(null)"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      }
                    </section>
                  }
                }
              </div>
            }
          </app-drawer>
        }

        <div class="mt-3">
          <app-pagination
            [currentPage]="page()"
            [totalPages]="totalPages()"
            [totalItems]="totalItems()"
            [itemsPerPage]="pageSize()"
            [showItemsPerPage]="true"
            itemLabel="sales"
            (pageChange)="changePage($event)"
            (itemsPerPageChange)="changePageSize($event)"
          />
        </div>
      }
    </app-page>
  `,
})
export class OrdersComponent implements OnInit, OnDestroy {
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  private readonly money = inject(MoneyService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly routeReady = signal(false);
  protected readonly permissions = inject(PermissionsService);
  private readonly approvals = inject(ApprovalsService);
  private readonly recentSales = inject(RecentSalesCacheService);
  private readonly partyCache = inject(PartyCacheService);
  protected readonly fmtKes = formatKes;

  protected readonly pageSize = signal(20);
  protected readonly totalItems = signal(0);
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  /** Paid-so-far totals (shillings) for the credit sales currently listed. */
  protected readonly creditPaid = signal<Map<string, number>>(new Map());
  protected readonly selectedOrderId = signal<string | null>(null);
  private readonly selectedOrderRecord = signal<OrderWithCustomer | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly voidingFor = signal<string | null>(null);
  protected readonly voidReason = new FormControl('', { nonNullable: true });
  protected readonly refundingFor = signal<string | null>(null);
  protected readonly refundMethod = new FormControl('cash', { nonNullable: true });
  protected readonly refundStockOutcome = new FormControl<'return_to_stock' | 'write_off'>(
    'return_to_stock',
    { nonNullable: true }
  );
  protected readonly refundReason = new FormControl('', { nonNullable: true });
  protected readonly reversingPaymentId = signal<string | null>(null);
  protected readonly paymentReversalReason = new FormControl('', { nonNullable: true });
  private readonly pendingActions = signal<ReadonlySet<string>>(new Set());
  protected readonly approvalHistory = signal<Approval[]>([]);
  private readonly pageApprovals = signal<Map<string, Approval[]>>(new Map());
  private readonly approvalPeople = signal<Map<string, string>>(new Map());
  protected readonly highlightedApprovalId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly warning = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly page = signal(1);
  protected readonly query = signal('');
  protected readonly customerId = signal<string | null>(null);
  protected readonly allTime = signal(false);
  protected readonly customerOptions = computed(() =>
    this.partyCache.customers().filter(customer => customer.deleted_at === null)
  );
  protected readonly customerFilterOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.customerOptions().map(customer => ({
      value: customer.id,
      label: this.customerNameFromParty(customer),
      description: customer.phone || undefined,
      searchText: customer.email ?? undefined,
    }))
  );
  protected readonly selectedCustomerName = computed(() => {
    const customer = this.customerOptions().find(row => row.id === this.customerId());
    return customer ? this.customerNameFromParty(customer) : 'Selected customer';
  });
  protected readonly saleSortOptions = SALE_SORT_OPTIONS;
  protected readonly saleSort = signal('created_at');
  protected readonly saleSortDirection = signal<ListSortDirection>('desc');

  protected readonly status = new FormControl('all', { nonNullable: true });
  protected readonly from = new FormControl(this.todayIso(), { nonNullable: true });
  protected readonly to = new FormControl(this.todayIso(), { nonNullable: true });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private pageApprovalSequence = 0;
  private loadSequence = 0;
  private authoritativeLoaded = false;
  constructor() {
    effect(() => {
      const revision = this.approvals.revision();
      if (revision === 0) return;
      untracked(() => {
        const orderId = this.selectedOrderId();
        if (orderId) {
          void this.loadApprovalHistory(orderId).catch(error => {
            this.error.set(
              error instanceof Error ? error.message : 'Failed to refresh approval status'
            );
          });
        }
        void this.loadPageApprovals();
      });
    });
    effect(() => {
      const revision = this.recentSales.revision();
      if (revision === 0) return;
      untracked(() => {
        if (this.authoritativeLoaded) void this.load();
        else this.applyRecentCache();
      });
    });
    effect(() => {
      const params = this.routeParams();
      if (!this.routeReady()) return;
      untracked(() => {
        const orderId = params.get('order');
        const routedCustomerId = params.get('customer');
        const routedAllTime = params.get('range') === 'all' || routedCustomerId !== null;
        const historyFiltersChanged =
          routedCustomerId !== this.customerId() || routedAllTime !== this.allTime();
        if (historyFiltersChanged) {
          this.customerId.set(routedCustomerId);
          this.allTime.set(routedAllTime);
          this.page.set(1);
          void this.load();
        }
        this.highlightedApprovalId.set(params.get('approval'));
        if (orderId && this.selectedOrderId() !== orderId) void this.openOrder(orderId, false);
        if (!orderId && this.selectedOrderId()) this.closeOrderDrawer(false);
      });
    });
  }

  protected todayActive(): boolean {
    const today = this.todayIso();
    return !this.allTime() && this.from.value === today && this.to.value === today;
  }

  protected weekActive(): boolean {
    return (
      !this.allTime() && this.from.value === this.daysAgoIso(6) && this.to.value === this.todayIso()
    );
  }

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );
  protected readonly selectedOrder = computed(() => {
    const id = this.selectedOrderId();
    if (!id) return null;
    return this.orders().find(order => order.id === id) ?? this.selectedOrderRecord();
  });

  protected margin(revenue: number, cogs: number): number {
    return revenue - cogs;
  }

  protected marginPercent(revenue: number, cogs: number): string {
    if (revenue <= 0) return '0%';
    return `${(((revenue - cogs) / revenue) * 100).toFixed(1)}%`;
  }

  protected canSendReceipt(order: OrderWithCustomer): boolean {
    if (order.status !== 'completed') return false;
    const paid = this.payments()
      .filter(payment => payment.status === 'settled')
      .reduce((sum, payment) => sum + payment.amount, 0);
    return paid >= order.total;
  }

  protected readonly salesStats = computed(() => {
    const rows = this.orders();
    const completed = rows.filter(order => order.status === 'completed');
    const pending = rows.filter(order => order.status === 'pending_payment').length;
    return [
      {
        label: 'Matching sales',
        value: this.totalItems(),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Sales value on page',
        value: formatKes(completed.reduce((sum, order) => sum + order.total, 0)),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Completed on page',
        value: completed.length,
        tone: 'success' as const,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Awaiting payment',
        value: pending,
        tone: 'warning' as const,
        mobilePriority: 'secondary' as const,
      },
    ];
  });

  async ngOnInit(): Promise<void> {
    const initialParams = this.route.snapshot.queryParamMap;
    const initialCustomer = initialParams.get('customer');
    this.customerId.set(initialCustomer);
    this.allTime.set(initialParams.get('range') === 'all' || initialCustomer !== null);
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    await Promise.all([this.recentSales.ensureLoaded(), this.partyCache.ensureLoaded()]);
    this.applyRecentCache();
    await this.load();
    this.routeReady.set(true);
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected onSearch(query: string): void {
    this.query.set(query);
    this.page.set(1);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 250);
  }

  protected async apply(): Promise<void> {
    this.page.set(1);
    await this.load();
  }

  protected salesActiveFilterCount(): number {
    return (
      Number(this.status.value !== 'all') +
      Number(Boolean(this.customerId())) +
      Number(!this.todayActive())
    );
  }

  protected async clearSalesFilters(): Promise<void> {
    this.status.setValue('all');
    this.customerId.set(null);
    await this.setToday();
  }

  protected async setToday(): Promise<void> {
    this.allTime.set(false);
    this.from.setValue(this.todayIso());
    this.to.setValue(this.todayIso());
    await this.syncHistoryFilters();
    await this.apply();
  }

  protected async setWeek(): Promise<void> {
    this.allTime.set(false);
    this.from.setValue(this.daysAgoIso(6));
    this.to.setValue(this.todayIso());
    await this.syncHistoryFilters();
    await this.apply();
  }

  protected async setAllTime(): Promise<void> {
    this.allTime.set(true);
    await this.syncHistoryFilters();
    await this.apply();
  }

  protected async setCustomerFilter(selected: string): Promise<void> {
    const value = selected || null;
    this.customerId.set(value);
    if (value) this.allTime.set(true);
    await this.syncHistoryFilters();
    await this.apply();
  }

  protected async clearCustomerFilter(): Promise<void> {
    this.customerId.set(null);
    await this.syncHistoryFilters();
    await this.apply();
  }

  protected async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    try {
      await this.pos.expireProformas();
      const statuses = this.status.value === 'all' ? ALL_STATUSES : [this.status.value];
      const since = this.allTime()
        ? undefined
        : new Date(`${this.from.value}T00:00:00`).toISOString();
      const untilDate = new Date(`${this.to.value}T00:00:00`);
      untilDate.setDate(untilDate.getDate() + 1); // "to" inclusive
      const result = await this.pos.ordersPage({
        statuses,
        since,
        until: this.allTime() ? undefined : untilDate.toISOString(),
        search: this.query(),
        customerId: this.customerId() ?? undefined,
        allLocations: this.customerId() !== null,
        page: this.page(),
        pageSize: this.pageSize(),
        sortBy: this.saleSort() as 'created_at' | 'code' | 'total' | 'status',
        sortDirection: this.saleSortDirection(),
      });
      const creditIds = result.rows.filter(order => order.is_credit_sale).map(order => order.id);
      const paidTotals = await this.pos.paidTotalsByOrder(creditIds);
      if (sequence !== this.loadSequence) return;
      // Publish the page and all derived metadata together after every request
      // succeeds; journal revisions never patch only one part of this state.
      this.orders.set(result.rows);
      this.totalItems.set(result.count);
      this.creditPaid.set(paidTotals);
      this.authoritativeLoaded = true;
      await this.loadPageApprovals();
      if (sequence !== this.loadSequence) return;
      // Keep an open drawer's lines/payments in sync with realtime refreshes.
      const openId = this.selectedOrderId();
      if (openId && result.rows.some(order => order.id === openId)) {
        void this.refreshDetail(openId);
      }
      this.error.set(null);
    } catch (err) {
      if (sequence === this.loadSequence) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load sales');
      }
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  protected async changePage(page: number): Promise<void> {
    this.page.set(page);
    await this.load();
  }

  protected async changePageSize(size: number): Promise<void> {
    this.pageSize.set(size);
    this.page.set(1);
    await this.load();
  }

  protected changeSort(key: string, direction: ListSortDirection): void {
    this.saleSort.set(key);
    this.saleSortDirection.set(direction);
    this.page.set(1);
    void this.load();
  }

  protected async openOrder(orderId: string, updateUrl = true): Promise<void> {
    this.selectedOrderId.set(orderId);
    this.selectedOrderRecord.set(this.orders().find(order => order.id === orderId) ?? null);
    this.voidingFor.set(null);
    this.refundingFor.set(null);
    this.lines.set([]);
    this.payments.set([]);
    this.reversingPaymentId.set(null);
    this.pendingActions.set(new Set());
    this.approvalHistory.set([]);
    this.detailLoading.set(true);
    const cached = await this.recentSales.detail<{
      lines: OrderLineWithProduct[];
      payments: Payment[];
      history: Approval[];
    }>(orderId);
    if (cached && this.selectedOrderId() === orderId) {
      this.lines.set(cached.lines);
      this.payments.set(cached.payments);
      this.setApprovalHistory(cached.history);
      this.detailLoading.set(false);
    }
    if (!this.selectedOrderRecord()) {
      try {
        this.selectedOrderRecord.set(await this.pos.getOrder(orderId));
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'Sale not found');
        this.closeOrderDrawer();
        return;
      }
    }
    if (updateUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { order: orderId, approval: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    await this.refreshDetail(orderId);
  }

  /** Refetch lines + payments for the open drawer; ignores stale results. */
  protected async refreshDetail(orderId: string): Promise<void> {
    try {
      const [lines, payments, history] = await Promise.all([
        this.pos.orderLines(orderId),
        this.pos.orderPayments(orderId),
        this.approvals.forOrder(orderId),
      ]);
      if (this.selectedOrderId() !== orderId) return;
      this.lines.set(lines);
      this.payments.set(payments);
      this.setApprovalHistory(history);
      await this.recentSales.rememberDetail(orderId, { lines, payments, history });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load order details');
    } finally {
      if (this.selectedOrderId() === orderId) this.detailLoading.set(false);
    }
  }

  private applyRecentCache(): void {
    if (
      !this.recentSales.loaded() ||
      this.page() !== 1 ||
      this.query().trim() ||
      this.customerId() ||
      this.allTime()
    )
      return;
    if (this.saleSort() !== 'created_at' || this.saleSortDirection() !== 'desc') return;
    const today = this.todayIso();
    // The 100-row cache is only authoritative enough for the first page of the
    // unfiltered live view. Historical/status-filtered pages stay server-owned.
    if (this.status.value !== 'all' || this.from.value !== today || this.to.value !== today) return;
    const since = new Date(`${this.from.value}T00:00:00`).toISOString();
    const until = new Date(`${this.to.value}T00:00:00`);
    until.setDate(until.getDate() + 1);
    const statuses =
      this.status.value === 'all' ? new Set(ALL_STATUSES) : new Set([this.status.value]);
    const rows = this.recentSales
      .orders()
      .filter(
        order =>
          statuses.has(order.status) &&
          order.created_at >= since &&
          order.created_at < until.toISOString()
      )
      .slice(0, this.pageSize());
    this.orders.set(rows);
    if (this.totalItems() === 0) this.totalItems.set(rows.length);
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeOrderDrawer(updateUrl = true): void {
    this.selectedOrderId.set(null);
    this.selectedOrderRecord.set(null);
    this.voidingFor.set(null);
    this.refundingFor.set(null);
    this.detailLoading.set(false);
    this.lines.set([]);
    this.payments.set([]);
    this.reversingPaymentId.set(null);
    this.pendingActions.set(new Set());
    this.approvalHistory.set([]);
    this.highlightedApprovalId.set(null);
    if (updateUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { order: null, approval: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  protected startVoid(orderId: string): void {
    this.voidingFor.set(orderId);
    this.voidReason.setValue('');
  }

  protected async confirmVoid(orderId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.warning.set(null);
    try {
      const result = await this.pos.voidSale(orderId, this.voidReason.value.trim());
      this.voidingFor.set(null);
      if (result.status === 'approval_required') {
        this.addPending('order_reversal', orderId);
        this.warning.set('Void request sent for approval');
        await this.loadApprovalHistory(orderId);
      } else {
        this.closeOrderDrawer();
      }
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Void failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected startRefund(orderId: string): void {
    this.refundingFor.set(orderId);
    this.refundStockOutcome.setValue('return_to_stock');
    this.refundReason.setValue('');
  }

  protected async confirmRefund(orderId: string): Promise<void> {
    if (!this.refundReason.value.trim()) {
      this.error.set('A refund reason is required');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.money.postFullRefund(
        orderId,
        this.refundMethod.value,
        this.refundReason.value.trim(),
        this.refundStockOutcome.value
      );
      this.refundingFor.set(null);
      if (result.status === 'approval_required') {
        this.addPending('sale_refund', orderId);
        this.warning.set('Refund request sent for approval');
        await this.loadApprovalHistory(orderId);
      } else {
        await this.refreshDetail(orderId);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Refund failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected startPaymentReversal(paymentId: string): void {
    this.reversingPaymentId.set(paymentId);
    this.paymentReversalReason.setValue('');
  }

  protected async reversePayment(payment: Payment): Promise<void> {
    const reason = this.paymentReversalReason.value.trim();
    if (!reason) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = payment.customer_receipt_id
        ? await this.money.reverseCustomerReceipt(payment.customer_receipt_id, reason)
        : await this.money.reversePayment(payment.id, reason);
      this.reversingPaymentId.set(null);
      if (result.status === 'approval_required') {
        this.addPending(
          payment.customer_receipt_id ? 'customer_receipt_reversal' : 'payment_reversal',
          payment.customer_receipt_id ?? payment.id
        );
        this.warning.set(
          payment.customer_receipt_id
            ? 'Whole receipt reversal sent for approval'
            : 'Payment reversal request sent for approval'
        );
      }
      const orderId = this.selectedOrderId();
      if (orderId) {
        if (result.status === 'completed') await this.refreshDetail(orderId);
        else await this.loadApprovalHistory(orderId);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Payment reversal failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected isPending(type: string, subjectId: string): boolean {
    return this.pendingActions().has(`${type}:${subjectId}`);
  }

  private addPending(type: string, subjectId: string): void {
    this.pendingActions.update(current => new Set(current).add(`${type}:${subjectId}`));
  }

  private async loadApprovalHistory(orderId: string): Promise<void> {
    const history = await this.approvals.forOrder(orderId);
    if (this.selectedOrderId() === orderId) this.setApprovalHistory(history);
  }

  private setApprovalHistory(history: Approval[]): void {
    this.approvalHistory.set(history);
    this.pendingActions.set(
      new Set(
        history
          .filter(approval => approval.status === 'pending')
          .map(approval => `${approval.type}:${approval.subject_id}`)
      )
    );
    void this.loadApprovalPeople(history);
  }

  private async loadPageApprovals(): Promise<void> {
    const sequence = ++this.pageApprovalSequence;
    try {
      const history = await this.approvals.forOrders(this.orders().map(order => order.id));
      if (sequence !== this.pageApprovalSequence) return;
      const grouped = new Map<string, Approval[]>();
      for (const approval of history) {
        const orderId = (approval.metadata as { order_id?: string }).order_id;
        if (!orderId) continue;
        grouped.set(orderId, [...(grouped.get(orderId) ?? []), approval]);
      }
      this.pageApprovals.set(grouped);
    } catch {
      if (sequence === this.pageApprovalSequence) this.pageApprovals.set(new Map());
    }
  }

  private async loadApprovalPeople(history: Approval[]): Promise<void> {
    try {
      this.approvalPeople.set(
        await this.approvals.staffNames(
          history.flatMap(approval => [approval.requested_by, approval.decided_by])
        )
      );
    } catch {
      // Names are a presentation enhancement; retain id fallbacks if lookup fails.
    }
  }

  protected async printOrder(orderId: string): Promise<void> {
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildReceiptData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    }
  }

  protected statusType(status: string) {
    return ORDER_STATUS_MAP[status] ?? 'neutral';
  }

  protected approvalBadges(orderId: string): Approval[] {
    const latestByType = new Map<string, Approval>();
    for (const approval of this.pageApprovals().get(orderId) ?? []) {
      if (!latestByType.has(approval.type)) latestByType.set(approval.type, approval);
    }
    return [...latestByType.values()].slice(0, 2);
  }

  protected approvalBadgeLabel(approval: Approval): string {
    const action =
      approval.type === 'order_reversal'
        ? 'Void'
        : approval.type === 'sale_refund'
          ? 'Refund'
          : approval.type === 'payment_reversal'
            ? 'Payment reversal'
            : this.approvalTypeLabel(approval.type);
    return `${action} ${approval.status}`;
  }

  protected approvalTypeLabel(type: string): string {
    if (type === 'order_reversal') return 'Sale void';
    return type.replace(/_/g, ' ').replace(/^./, value => value.toUpperCase());
  }

  protected approvalStatusTone(
    status: Approval['status']
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'denied' || status === 'expired') return 'error';
    return 'neutral';
  }

  protected approvalPerson(userId: string | null): string {
    if (!userId) return 'Unknown user';
    return this.approvalPeople().get(userId) ?? `User …${userId.slice(-4)}`;
  }

  protected approvalRequestReason(approval: Approval): string | null {
    return (approval.metadata as { reason?: string }).reason ?? null;
  }

  /** Select option label: method code plus its reconciliation-type caption. */
  protected methodOptionLabel(code: string): string {
    const type = reconciliationLabel(reconciliationTypeForCode(code));
    return type === '—' ? code : `${code} · ${type}`;
  }

  protected statusLabel(status: string, orderId?: string): string {
    switch (status) {
      case 'pending_payment':
        if (orderId) {
          const hold = this.pendingApprovalHold(orderId);
          if (hold?.type === 'overdraft') return 'Credit approval pending';
          if (hold?.type === 'external_account_payment') return 'Payment approval pending';
        }
        return 'Cashier queue';
      case 'draft':
        return 'Proforma';
      case 'expired':
        return 'Expired proforma';
      case 'completed':
        return 'Completed';
      case 'voided':
        return 'Voided';
      default:
        return status.replaceAll('_', ' ');
    }
  }

  protected paymentLabel(order: OrderWithCustomer): string {
    if (order.status === 'pending_payment') {
      const hold = this.pendingApprovalHold(order.id);
      if (hold?.type === 'overdraft') return 'Credit approval pending';
      if (hold?.type === 'external_account_payment') return 'Payment approval pending';
      return 'Awaiting payment';
    }
    if (order.status === 'draft') return 'Not posted';
    if (order.status === 'expired') return 'Expired';
    if (order.status === 'voided') return 'Voided';
    if (!order.is_credit_sale) return 'Paid';
    const paid = this.creditPaid().get(order.id) ?? 0;
    if (paid <= 0) return 'Credit · Unpaid';
    if (paid >= order.total) return 'Credit · Settled';
    return `Credit · Part-paid (${formatKes(paid)} of ${formatKes(order.total)})`;
  }

  protected pendingApprovalHold(orderId: string): Approval | null {
    return (
      (this.pageApprovals().get(orderId) ?? []).find(
        approval =>
          approval.status === 'pending' &&
          ['overdraft', 'external_account_payment'].includes(approval.type)
      ) ?? null
    );
  }

  /** Badge for a credit sale: warning while anything is outstanding, success once settled. */
  protected creditBadge(order: OrderWithCustomer): { type: 'warning' | 'success'; label: string } {
    const paid = this.creditPaid().get(order.id) ?? 0;
    return paid >= order.total
      ? { type: 'success', label: 'credit · settled' }
      : { type: 'warning', label: paid > 0 ? 'credit · part-paid' : 'credit' };
  }

  protected noPaymentsMessage(order: OrderWithCustomer): string {
    if (order.status === 'pending_payment') return 'Awaiting payment in the cashier queue.';
    if (order.status === 'draft') return 'No payments on this proforma.';
    if (order.status === 'expired') return 'This proforma expired without being converted.';
    if (order.is_credit_sale) {
      const paid = this.creditPaid().get(order.id) ?? 0;
      if (paid >= order.total) return 'Credit sale — fully repaid.';
      if (paid > 0) return `Credit sale — ${formatKes(order.total - paid)} still outstanding.`;
      return 'Credit sale — no payment collected yet.';
    }
    return 'No payments recorded.';
  }

  protected customerName(order: OrderWithCustomer): string {
    if (!order.customers) return 'Walk-in';
    return [order.customers.first_name, order.customers.last_name].filter(Boolean).join(' ');
  }

  protected customerNameFromParty(customer: {
    first_name: string;
    last_name: string | null;
  }): string {
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  }

  private async syncHistoryFilters(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        customer: this.customerId(),
        range: this.allTime() ? 'all' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private todayIso(): string {
    return this.nairobiDate(new Date());
  }

  private daysAgoIso(n: number): string {
    return this.nairobiDate(new Date(Date.now() - n * 86_400_000));
  }

  /** Business dates are Africa/Nairobi, not UTC (00:00-03:00 EAT is still "today"). */
  private nairobiDate(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }
}
