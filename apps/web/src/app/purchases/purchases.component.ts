import { Component, OnInit, effect, inject, untracked } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DocumentSendComponent } from '../communications/document-send.component';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
} from '../shared/ui/list-search-bar.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { SearchableFilterComponent } from '../shared/ui/searchable-filter.component';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PurchaseHistoryStore, type PurchaseRow } from './purchase-history.store';

/** Purchase-history route shell; purchase creation remains in PurchaseEditorComponent. */
@Component({
  selector: 'app-purchases',
  providers: [PurchaseHistoryStore],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    DataTableShellComponent,
    DocumentSendComponent,
    DrawerComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    ListSearchBarComponent,
    MobileListComponent,
    MoneyComponent,
    PageActionsComponent,
    PageLayoutComponent,
    PaginationComponent,
    SearchableFilterComponent,
    SessionRequiredNoticeComponent,
    StatBarComponent,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  template: `
    <app-page
      title="Purchases"
      subtitle="Receive stock with the pricing and supplier context needed to buy well."
      [wide]="true"
    >
      <app-page-actions actions>
        <button
          utilityAction
          appButton
          variant="ghost"
          [iconOnly]="true"
          [loading]="store.loading()"
          type="button"
          title="Refresh purchases"
          aria-label="Refresh purchases"
          (click)="store.load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
        <a overflowAction appButton variant="secondary" routerLink="/suppliers">
          <app-icon name="heroTruck" /> Suppliers
        </a>
        <a primaryAction appButton routerLink="/purchases/new">
          <app-icon name="heroPlus" /> Record purchase
        </a>
      </app-page-actions>

      @if (store.error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ store.error() }}</span>
          <button appButton variant="ghost" size="sm" type="button" (click)="store.load()">
            Retry
          </button>
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

      @if (store.drafts().length > 0) {
        <section class="mb-4 border-b border-base-300 pb-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="section-title">Purchase drafts</h2>
              <p class="type-caption">Continue or cancel unfinished receiving work.</p>
            </div>
            <span class="badge badge-warning badge-sm">{{ store.drafts().length }}</span>
          </div>
          <div class="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            @for (draft of store.drafts(); track draft.id) {
              <div class="flex min-w-0 items-center gap-2 rounded-field border border-base-300 p-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">
                    {{ store.supplierName(draft.supplier_id) }}
                  </p>
                  <p class="type-caption truncate">
                    {{ draft.reference || 'No reference' }} · {{ fmt(draft.total_cost) }}
                  </p>
                </div>
                <a appButton variant="ghost" [routerLink]="['/purchases/drafts', draft.id]">Open</a>
                <button appButton variant="ghost" type="button" (click)="cancelDraft(draft.id)">
                  Cancel
                </button>
              </div>
            }
          </div>
        </section>
      }

      <app-list-search-bar
        placeholder="Search supplier or reference…"
        [searchQuery]="store.query()"
        (searchQueryChange)="store.search($event)"
        [sortOptions]="store.sortOptions()"
        [sortKey]="store.sort()"
        (sortKeyChange)="store.setSort($event)"
        [sortDirection]="store.sortDirection()"
        (sortDirectionChange)="setSortDirection($event)"
        [filtersEnabled]="true"
        [activeFilterCount]="store.activeFilterCount()"
        (clearFilters)="store.clearFilters()"
      >
        <app-stat-bar summary [stats]="store.summary()" />
        <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <app-form-field label="Supplier" class="lg:w-56">
            <app-searchable-filter
              ariaLabel="Filter purchases by supplier"
              placeholder="All suppliers"
              emptyValue="all"
              searchPlaceholder="Search suppliers…"
              [options]="store.supplierOptions()"
              [value]="store.supplierFilter()"
              (valueChange)="store.setSupplier($event)"
            />
          </app-form-field>
          <app-form-field label="Payment" class="lg:w-44">
            <select
              class="select select-bordered select-sm w-full"
              [value]="store.paymentFilter()"
              (change)="store.setPayment($any($event.target).value)"
            >
              <option value="all">Any status</option>
              <option value="paid">Paid</option>
              <option value="part_paid">Part-paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </app-form-field>
          @if (store.locations().length > 1) {
            <app-form-field label="Location" class="lg:w-48">
              <select
                class="select select-bordered select-sm w-full"
                [value]="store.locationFilter()"
                (change)="store.setLocation($any($event.target).value)"
              >
                @for (location of store.locations(); track location.id) {
                  <option [value]="location.id">{{ location.name }}</option>
                }
              </select>
            </app-form-field>
          }
          <app-form-field label="From" class="lg:w-40">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [value]="store.from()"
              (change)="store.setDate('from', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field label="To" class="lg:w-40">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [value]="store.to()"
              (change)="store.setDate('to', $any($event.target).value)"
            />
          </app-form-field>
          <div class="flex flex-wrap gap-2 sm:col-span-2">
            <button
              appButton
              [variant]="store.monthActive() ? 'soft' : 'ghost'"
              type="button"
              (click)="store.setMonth()"
            >
              This month
            </button>
            <button
              appButton
              [variant]="store.allTimeActive() ? 'soft' : 'ghost'"
              type="button"
              (click)="store.setAllTime()"
            >
              All time
            </button>
          </div>
        </div>
      </app-list-search-bar>

      @if (store.loading() && store.purchases().length === 0) {
        <div class="flex min-h-64 items-center justify-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else if (store.purchases().length === 0) {
        <app-empty-state
          icon="heroBanknotes"
          [title]="store.query() ? 'No matching purchases' : 'No purchases recorded'"
          [description]="
            store.query()
              ? 'Try a different supplier name or reference.'
              : 'Record a purchase from the page header to add supplier stock.'
          "
        />
      } @else {
        <app-mobile-list>
          @for (purchase of store.purchases(); track purchase.id) {
            <div
              mobileListRow
              class="cursor-pointer"
              role="button"
              tabindex="0"
              [class.bg-base-200/50]="store.selectedPurchase()?.id === purchase.id"
              (click)="store.openPurchase(purchase)"
              (keydown.enter)="store.openPurchase(purchase)"
            >
              <div class="flex min-h-20 items-center gap-3 p-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">
                    {{ store.supplierName(purchase.supplier_id) }}
                  </p>
                  <p class="type-caption mt-1 truncate">
                    {{ store.date(purchase.purchase_date) }} ·
                    {{ purchase.reference || 'No reference' }}
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-semibold tabular-nums">
                    <app-money
                      [amount]="purchase.total_cost"
                      [masked]="!store.permissions.has('ViewFinancials')"
                    />
                  </p>
                  <app-status-badge
                    size="xs"
                    [type]="store.statusType(purchase)"
                    [label]="store.statusLabel(purchase)"
                  />
                </div>
              </div>
            </div>
          }
        </app-mobile-list>

        <div class="hidden lg:block">
          <app-data-table-shell
            heading="Purchase history"
            [description]="store.total() + ' matching purchases'"
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
                </tr>
              </thead>
              <tbody>
                @for (purchase of store.purchases(); track purchase.id) {
                  <tr
                    role="button"
                    tabindex="0"
                    class="cursor-pointer"
                    [class.table-row-active]="store.selectedPurchase()?.id === purchase.id"
                    (click)="store.openPurchase(purchase)"
                    (keydown.enter)="store.openPurchase(purchase)"
                  >
                    <td class="whitespace-nowrap">{{ store.date(purchase.purchase_date) }}</td>
                    <td class="font-medium">{{ store.supplierName(purchase.supplier_id) }}</td>
                    <td>{{ store.settlementLabel(purchase) }}</td>
                    <td class="type-caption">{{ purchase.reference || '—' }}</td>
                    <td class="text-right font-semibold">
                      <app-money
                        [amount]="purchase.total_cost"
                        [masked]="!store.permissions.has('ViewFinancials')"
                      />
                    </td>
                    <td class="text-right">
                      <app-status-badge
                        [type]="store.statusType(purchase)"
                        [label]="store.statusLabel(purchase)"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <app-pagination
          class="mt-3 block"
          [currentPage]="store.page()"
          [totalPages]="store.totalPages()"
          [totalItems]="store.total()"
          [itemsPerPage]="store.pageSize()"
          itemLabel="purchases"
          [showItemsPerPage]="true"
          (pageChange)="store.setPage($event)"
          (itemsPerPageChange)="store.setPageSize($event)"
        />
      }

      @if (store.selectedPurchase(); as purchase) {
        <app-drawer
          [open]="true"
          (closed)="store.closePurchase()"
          [title]="purchase.reference || 'Purchase'"
          [subtitle]="
            store.supplierName(purchase.supplier_id) + ' · ' + store.date(purchase.purchase_date)
          "
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
              (click)="store.printPurchase(purchase.id)"
            >
              <app-icon name="heroPrinter" />
            </button>
          }

          <div class="flex flex-wrap items-center gap-1">
            <app-status-badge
              size="xs"
              [type]="store.statusType(purchase)"
              [label]="store.statusLabel(purchase)"
            />
            <app-status-badge size="xs" type="neutral" [label]="store.settlementLabel(purchase)" />
          </div>

          @if (
            store.permissions.has('ManageCommunications') && store.permissions.has('ViewFinancials')
          ) {
            <app-document-send
              class="mt-3 block"
              documentType="purchase_order"
              [subjectId]="purchase.id"
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
                store.permissions.has('ViewFinancials') ? fmt(purchase.total_cost) : 'Hidden'
              "
            />
            <app-stat-card
              label="Paid"
              [value]="store.permissions.has('ViewFinancials') ? fmt(purchase.paid) : 'Hidden'"
              [tone]="purchase.paid >= purchase.total_cost ? 'success' : 'warning'"
              [sub]="
                purchase.total_cost > purchase.paid && store.permissions.has('ViewFinancials')
                  ? 'Still to pay ' + fmt(purchase.total_cost - purchase.paid)
                  : undefined
              "
            />
          </div>

          @if (purchase.claim_input_vat && store.permissions.has('ViewFinancials')) {
            <section class="mt-3 rounded-field border border-base-300 p-3 text-sm">
              <div class="flex items-center justify-between gap-2">
                <h3 class="section-title">Input VAT</h3>
                <app-status-badge size="xs" type="success" label="Claimed" />
              </div>
              <dl class="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <dt class="type-caption">Net cost</dt>
                  <dd>{{ fmt(purchase.net_total) }}</dd>
                </div>
                <div>
                  <dt class="type-caption">Recoverable VAT</dt>
                  <dd>{{ fmt(purchase.input_tax_total) }}</dd>
                </div>
                <div>
                  <dt class="type-caption">Tax invoice</dt>
                  <dd>{{ purchase.tax_invoice_number }}</dd>
                </div>
                <div>
                  <dt class="type-caption">Supplier PIN</dt>
                  <dd>{{ purchase.supplier_tax_pin }}</dd>
                </div>
              </dl>
            </section>
          }

          @if (store.detailLoading()) {
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
                        <span class="capitalize">{{
                          expense.custom_label || expense.category
                        }}</span>
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
                purchase.paid < purchase.total_cost &&
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
                        (click)="store.applyAdvance()"
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
                      (submit)="$event.preventDefault(); store.paySelectedPurchase()"
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
                purchase.paid === 0 &&
                store.permissions.has('ManageSupplierCreditPurchases') &&
                store.permissions.has('ReverseOrder')
              ) {
                <section class="border-t border-base-300 pt-3">
                  <details class="rounded-field border border-base-300 p-3">
                    <summary class="min-h-11 cursor-pointer py-2 text-sm font-medium">
                      Purchase entered incorrectly?
                    </summary>
                    <p class="type-caption mt-2">Reverse only if none of this stock has moved.</p>
                    <form class="mt-3" (submit)="$event.preventDefault(); store.reversePurchase()">
                      <app-form-field
                        label="Why is this purchase being reversed?"
                        [required]="true"
                      >
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
        </app-drawer>
      }
    </app-page>
  `,
})
export class PurchasesComponent implements OnInit {
  protected readonly store = inject(PurchaseHistoryStore);
  protected readonly fmt = formatKes;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const request = this.store.urlRequest();
      if (!request) return;
      untracked(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: request.queryParams,
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    });
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    await this.store.initialize({
      supplierId: params.get('supplier'),
      paymentStatus: params.get('payment'),
      query: params.get('q'),
      page: Number(params.get('page') ?? 1) || 1,
      allTime: params.get('range') === 'all',
      purchaseId: params.get('purchase'),
      purchaseRecorded: window.history.state?.purchaseRecorded === true,
    });
  }

  protected async cancelDraft(id: string): Promise<void> {
    if (!window.confirm('Cancel this purchase draft?')) return;
    await this.store.cancelDraft(id);
  }

  protected setSortDirection(value: ListSortDirection): void {
    void this.store.setSortDirection(value);
  }
}
