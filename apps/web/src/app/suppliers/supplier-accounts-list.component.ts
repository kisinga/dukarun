import { Component, computed, input, output } from '@angular/core';
import { ButtonComponent } from '../shared/ui/button.component';
import {
  DataTableShellComponent,
  TableRowsDirective,
  type TableColumn,
} from '../shared/ui/data-table-shell.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { StatBarComponent, type StatItem } from '../shared/ui/stat-bar.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import type { SupplierWithAp } from './supplier.types';

type SupplierStats = {
  purchases: number;
  averageOrder: number;
  openPurchases: number;
};

@Component({
  selector: 'app-supplier-accounts-list',
  imports: [
    ButtonComponent,
    DataTableShellComponent,
    TableRowsDirective,
    EmptyStateComponent,
    EntityAvatarComponent,
    FormFieldComponent,
    IconComponent,
    ListSearchBarComponent,
    MoneyComponent,
    MobileListComponent,
    PaginationComponent,
    StatBarComponent,
    StatusBadgeComponent,
  ],
  template: `
    <app-list-search-bar
      searchLabel="Search suppliers"
      placeholder="Search supplier name, phone, or email…"
      [searchQuery]="searchQuery()"
      (searchQueryChange)="searchQueryChange.emit($event)"
      [sortOptions]="sortOptions()"
      [sortKey]="sortKey()"
      (sortKeyChange)="sortKeyChange.emit($event)"
      [sortDirection]="sortDirection()"
      (sortDirectionChange)="sortDirectionChange.emit($event)"
      [filtersEnabled]="true"
      [activeFilters]="filterChips()"
      (removeFilter)="removeChip($event)"
      (clearFilters)="clearFilters.emit()"
    >
      <div summary class="grid gap-3 lg:grid-cols-[1fr_2fr]">
        <section>
          <p class="type-caption mb-1">Suppliers · Entire business</p>
          <app-stat-bar [stats]="summary().slice(0, 1)" />
        </section>
        <section>
          <p class="type-caption mb-1">Money owed · Entire business</p>
          <app-stat-bar [stats]="summary().slice(1)" />
        </section>
      </div>
      <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:items-end">
        <app-form-field label="Account status" class="lg:w-44">
          <select
            class="select select-bordered select-sm w-full"
            [value]="statusFilter()"
            (change)="filterChange.emit({ kind: 'status', value: selectValue($event) })"
          >
            <option value="all">All suppliers</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </app-form-field>

        <app-form-field label="Age" class="lg:w-44">
          <select
            class="select select-bordered select-sm w-full"
            [value]="ageFilter()"
            (change)="filterChange.emit({ kind: 'age', value: selectValue($event) })"
          >
            <option value="all">Any age</option>
            <option value="overdue">Over 30 days</option>
            <option value="current">Current or clear</option>
          </select>
        </app-form-field>
      </div>
      <div quickFilters class="flex flex-wrap items-end gap-3">
        <app-form-field label="Balance" class="lg:w-44">
          <select
            class="select select-bordered select-sm min-h-11 w-full"
            [value]="balanceFilter()"
            (change)="filterChange.emit({ kind: 'balance', value: selectValue($event) })"
          >
            <option value="all">Any balance</option>
            <option value="owed">We owe</option>
            <option value="clear">Nothing owed</option>
          </select>
        </app-form-field>
      </div>
    </app-list-search-bar>

    @if (!loading() && filteredCount() === 0) {
      <app-empty-state
        icon="heroTruck"
        title="No suppliers found"
        description="Create a supplier or clear the search to see supplier accounts."
      />
    } @else {
      <div class="mb-4 hidden lg:block">
        <app-data-table-shell
          [columns]="tableColumns1"
          tableClass="list-account-table"
          heading="Supplier accounts"
          [description]="filteredCount() + ' matching suppliers'"
        >
          <ng-template tableRows>
            @for (supplier of suppliers(); track supplier.id) {
              <tr
                [attr.data-list-record]="supplier.id"
                tabindex="0"
                class="cursor-pointer"
                [class.opacity-60]="!supplier.supplier_active"
                [class.table-row-active]="selectedSupplierId() === supplier.id"
                (click)="openSupplier.emit(supplier)"
                (keydown.enter)="openSupplier.emit(supplier)"
              >
                <td>
                  <div class="table-entity">
                    <app-entity-avatar size="sm" [firstName]="supplierName()(supplier)" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="table-primary truncate">{{ supplierName()(supplier) }}</p>
                        @if (!supplier.supplier_active) {
                          <app-status-badge size="xs" type="neutral" label="Archived" />
                        }
                      </div>
                      @if (supplier.notes) {
                        <p class="table-secondary whitespace-normal">{{ supplier.notes }}</p>
                      }
                    </div>
                  </div>
                  <div class="table-secondary mt-1">
                    <p class="table-primary">{{ supplier.phone || '—' }}</p>
                    @if (supplier.email) {
                      <p class="table-secondary">{{ supplier.email }}</p>
                    }
                  </div>
                </td>
                <td>
                  @if (supplierStats()(supplier.id); as stats) {
                    <p class="table-primary">{{ stats.purchases }} purchases</p>
                    <p class="table-secondary">{{ stats.openPurchases }} still open</p>
                  }
                </td>
                <td>
                  @if (supplier.supplier_credit_limit > 0) {
                    <p class="table-primary">
                      <app-money [amount]="supplier.supplier_credit_limit" /> limit
                    </p>
                  } @else {
                    <p class="table-primary">No credit cap</p>
                  }
                  <p class="table-secondary">
                    {{ supplier.supplier_credit_terms_days || 0 }}-day terms
                  </p>
                  @if (supplier.days_outstanding !== null) {
                    <p class="table-secondary">
                      {{ supplier.days_outstanding }} days · {{ supplier.bucket }}
                    </p>
                  }
                </td>
                <td
                  class="table-number"
                  [class.text-warning]="supplier.ap_balance > 0"
                  [class.text-base-content/50]="supplier.ap_balance === 0"
                >
                  <app-money [amount]="supplier.ap_balance" [masked]="!canViewFinancials()" />
                </td>
                <td class="table-actions" (click)="$event.stopPropagation()">
                  <div class="account-row-actions">
                    <button
                      appButton
                      variant="ghost"
                      type="button"
                      (click)="openSupplier.emit(supplier)"
                    >
                      Review
                    </button>
                    <button
                      appButton
                      variant="ghost"
                      [iconOnly]="true"
                      type="button"
                      title="Edit supplier"
                      aria-label="Edit supplier"
                      (click)="editSupplier.emit(supplier)"
                    >
                      <app-icon name="heroPencilSquare" />
                    </button>
                    @if (canManageSupplierCreditPurchases()) {
                      <button
                        appButton
                        variant="ghost"
                        [iconOnly]="true"
                        type="button"
                        [disabled]="busy()"
                        [title]="
                          supplier.supplier_active ? 'Archive supplier' : 'Reactivate supplier'
                        "
                        [attr.aria-label]="
                          supplier.supplier_active ? 'Archive supplier' : 'Reactivate supplier'
                        "
                        (click)="toggleSupplierActive.emit(supplier)"
                      >
                        <app-icon
                          [name]="supplier.supplier_active ? 'heroArchiveBox' : 'heroArrowPath'"
                        />
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </ng-template>
        </app-data-table-shell>
      </div>
    }

    <div class="grid gap-4">
      <aside class="flex flex-col gap-4">
        <app-mobile-list>
          @for (supplier of suppliers(); track supplier.id) {
            <div
              [attr.data-list-record]="supplier.id"
              mobileListRow
              class="cursor-pointer"
              role="button"
              tabindex="0"
              [class.opacity-60]="!supplier.supplier_active"
              [class.bg-base-200/50]="selectedSupplierId() === supplier.id"
              (click)="openSupplier.emit(supplier)"
              (keydown.enter)="openSupplier.emit(supplier)"
            >
              <div class="flex min-h-20 items-center gap-3 p-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate font-semibold">{{ supplierName()(supplier) }}</p>
                    @if (!supplier.supplier_active) {
                      <app-status-badge size="xs" type="neutral" label="archived" />
                    }
                  </div>
                  <p class="type-caption mt-1 truncate">
                    {{ supplier.phone || 'No phone' }} ·
                    {{ supplier.supplier_credit_terms_days || 0 }}d terms
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p
                    class="font-semibold tabular-nums"
                    [class.text-warning]="supplier.ap_balance > 0"
                  >
                    <app-money [amount]="supplier.ap_balance" [masked]="!canViewFinancials()" />
                  </p>
                  @if (supplier.days_outstanding !== null) {
                    <p class="type-caption">
                      {{ supplier.days_outstanding }}d · {{ supplier.bucket }}
                    </p>
                  } @else {
                    <p class="type-caption">{{ supplier.ap_balance > 0 ? 'we owe' : 'clear' }}</p>
                  }
                </div>
              </div>
            </div>
          }
        </app-mobile-list>
      </aside>
    </div>

    @if (filteredCount() > 0) {
      <app-pagination
        class="mb-4 block"
        [currentPage]="currentPage()"
        [totalPages]="totalPages()"
        [totalItems]="filteredCount()"
        [itemsPerPage]="itemsPerPage()"
        itemLabel="suppliers"
        [showItemsPerPage]="true"
        (pageChange)="pageChange.emit($event)"
        (itemsPerPageChange)="itemsPerPageChange.emit($event)"
      />
    }
  `,
})
export class SupplierAccountsListComponent {
  protected readonly tableColumns1: TableColumn[] = [
    { key: 'supplier', label: 'Supplier / contact', pinned: true, width: '26%' },
    { key: 'activity', label: 'Purchase activity', width: '18%' },
    { key: 'terms', label: 'Terms & aging', width: '22%' },
    { key: 'owed', label: 'We owe', align: 'right', width: '14%' },
    { key: 'review', label: 'Review', align: 'right', width: '20%' },
  ];
  readonly loading = input.required<boolean>();
  readonly busy = input.required<boolean>();
  readonly suppliers = input.required<SupplierWithAp[]>();
  readonly filteredCount = input.required<number>();
  readonly selectedSupplierId = input.required<string | null>();
  readonly canViewFinancials = input.required<boolean>();
  readonly canManageSupplierCreditPurchases = input.required<boolean>();
  readonly supplierName = input.required<(supplier: SupplierWithAp) => string>();
  readonly supplierStats = input.required<(supplierId: string) => SupplierStats>();

  readonly searchQuery = input.required<string>();
  readonly sortOptions = input.required<readonly ListSortOption[]>();
  readonly sortKey = input.required<string>();
  readonly sortDirection = input.required<ListSortDirection>();
  readonly activeFilterCount = input.required<number>();
  readonly statusFilter = input.required<string>();
  readonly balanceFilter = input.required<string>();
  readonly ageFilter = input.required<string>();
  readonly summary = input.required<StatItem[]>();
  readonly currentPage = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly itemsPerPage = input.required<number>();

  readonly searchQueryChange = output<string>();
  readonly sortKeyChange = output<string>();
  readonly sortDirectionChange = output<ListSortDirection>();
  readonly clearFilters = output<void>();
  readonly filterChange = output<{ kind: 'status' | 'balance' | 'age'; value: string }>();
  readonly openSupplier = output<SupplierWithAp>();
  readonly editSupplier = output<SupplierWithAp>();
  readonly toggleSupplierActive = output<SupplierWithAp>();
  readonly pageChange = output<number>();
  readonly itemsPerPageChange = output<number>();

  protected readonly filterChips = computed(() => [
    ...(this.statusFilter() !== 'all'
      ? [{ key: 'status', label: 'Status: ' + this.statusFilter() }]
      : []),
    ...(this.balanceFilter() !== 'all'
      ? [{ key: 'balance', label: this.balanceFilter() === 'owed' ? 'We owe' : 'Nothing owed' }]
      : []),
    ...(this.ageFilter() !== 'all'
      ? [
          {
            key: 'age',
            label: this.ageFilter() === 'overdue' ? 'Over 30 days' : 'Current or clear',
          },
        ]
      : []),
  ]);
  protected removeChip(key: string): void {
    if (key === 'status' || key === 'balance' || key === 'age')
      this.filterChange.emit({ kind: key, value: 'all' });
  }

  protected selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
