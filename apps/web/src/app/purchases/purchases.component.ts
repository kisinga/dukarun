import { Component, OnInit, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
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
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PurchaseDetailDrawerComponent } from './purchase-detail-drawer.component';
import type { PurchaseDetailChangedResult } from './purchase-detail.store';
import { PurchaseHistoryStore } from './purchase-history.store';

/** Purchase-history route shell; purchase creation remains in PurchaseEditorComponent. */
@Component({
  selector: 'app-purchases',
  providers: [PurchaseHistoryStore],
  imports: [
    RouterLink,
    ButtonComponent,
    DataTableShellComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    ListSearchBarComponent,
    MobileListComponent,
    MoneyComponent,
    PageActionsComponent,
    PageLayoutComponent,
    PaginationComponent,
    PurchaseDetailDrawerComponent,
    SearchableFilterComponent,
    StatBarComponent,
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
        <app-purchase-detail-drawer
          [purchase]="purchase"
          [supplierName]="store.supplierName(purchase.supplier_id)"
          (closed)="store.closePurchase()"
          (changed)="detailChanged($event)"
        />
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

  protected async detailChanged(result: PurchaseDetailChangedResult): Promise<void> {
    this.store.setNotice(result.message);
    if (result.close) this.store.closePurchase();
    const listRefreshed = await this.store.load(true);
    if (result.refreshWarning) {
      const listError = this.store.error();
      this.store.setError(
        listRefreshed || !listError
          ? result.refreshWarning
          : `${result.refreshWarning} ${listError}`
      );
    }
  }
}
