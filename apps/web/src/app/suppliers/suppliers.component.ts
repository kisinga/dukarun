import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { MoneyService, SupplierPurchaseMetric } from '../money/money.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import type { ListSortDirection, ListSortOption } from '../shared/ui/list-search-bar.component';
import { sortList } from '../shared/ui/list-sort';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { SupplierAccountsListComponent } from './supplier-accounts-list.component';
import {
  SupplierDetailDrawerComponent,
  type SupplierDetailMetrics,
} from './supplier-detail-drawer.component';
import type { SupplierProfileFormResult } from './supplier-profile-form.component';
import type { SupplierWithAp } from './supplier.types';

/** Supplier-directory route shell. Purchase history and purchase creation have separate owners. */
@Component({
  selector: 'app-suppliers',
  imports: [
    RouterLink,
    ButtonComponent,
    IconComponent,
    PageActionsComponent,
    PageLayoutComponent,
    SupplierAccountsListComponent,
    SupplierDetailDrawerComponent,
  ],
  template: `
    <app-page
      title="Suppliers"
      subtitle="Manage supplier relationships, balances, and purchasing performance."
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
          title="Refresh suppliers"
          aria-label="Refresh suppliers"
          (click)="load(true)"
        >
          <app-icon name="heroArrowPath" />
        </button>
        <a overflowAction appButton variant="secondary" routerLink="/purchases/new">
          <app-icon name="heroShoppingCart" /> New purchase
        </a>
        <button primaryAction appButton type="button" (click)="startCreate()">
          <app-icon name="heroPlus" /> Add supplier
        </button>
      </app-page-actions>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
          <button appButton variant="ghost" size="sm" type="button" (click)="load(true)">
            Retry
          </button>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }
      @if (partyCache.loaded() && !partyCache.complete()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          Supplier limit reached. List, totals, and local filters cover cached suppliers only.
        </div>
      }

      <app-supplier-accounts-list
        [loading]="loading()"
        [busy]="busy()"
        [suppliers]="pagedSuppliers()"
        [filteredCount]="filteredSuppliers().length"
        [selectedSupplierId]="selectedSupplierId()"
        [canViewFinancials]="permissions.has('ViewFinancials')"
        [canManageSupplierCreditPurchases]="permissions.has('ManageSupplierCreditPurchases')"
        [supplierName]="supplierName"
        [supplierStats]="supplierStats"
        [searchQuery]="query()"
        [sortOptions]="sortOptions()"
        [sortKey]="sort()"
        [sortDirection]="sortDirection()"
        [activeFilterCount]="activeFilterCount()"
        [statusFilter]="statusFilter()"
        [balanceFilter]="balanceFilter()"
        [ageFilter]="ageFilter()"
        [summary]="summary()"
        [currentPage]="page()"
        [totalPages]="totalPages()"
        [itemsPerPage]="pageSize()"
        (searchQueryChange)="setSearch($event)"
        (sortKeyChange)="setSort($event)"
        (sortDirectionChange)="setSortDirection($event)"
        (filterChange)="setFilter($event.kind, $event.value)"
        (clearFilters)="clearFilters()"
        (openSupplier)="openSupplier($event)"
        (editSupplier)="editSupplier($event)"
        (toggleSupplierActive)="toggleActive($event)"
        (pageChange)="page.set($event)"
        (itemsPerPageChange)="setPageSize($event)"
      />

      @if (selectedSupplierId() !== null || creating()) {
        <app-supplier-detail-drawer
          [supplierId]="selectedSupplierId()"
          [creating]="creating()"
          [initialMode]="drawerMode()"
          [directoryBusy]="busy()"
          [metrics]="selectedMetrics()"
          (closed)="closeDrawer()"
          (changed)="supplierChanged($event)"
          (activeToggleRequested)="toggleActive($event)"
        />
      }
    </app-page>
  `,
})
export class SuppliersComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly money = inject(MoneyService);
  private readonly locations = inject(LocationContextService);
  protected readonly partyCache = inject(PartyCacheService);
  protected readonly permissions = inject(PermissionsService);

  protected readonly suppliers = computed<SupplierWithAp[]>(() => this.partyCache.suppliers());
  protected readonly metrics = signal<SupplierPurchaseMetric[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly selectedSupplierId = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly drawerMode = signal<'view' | 'edit'>('view');
  protected readonly query = signal('');
  protected readonly sort = signal('name');
  protected readonly sortDirection = signal<ListSortDirection>('asc');
  protected readonly statusFilter = signal('all');
  protected readonly balanceFilter = signal('all');
  protected readonly ageFilter = signal('all');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  protected readonly sortOptions = computed<readonly ListSortOption[]>(() => [
    { value: 'name', label: 'Supplier name' },
    { value: 'aging', label: 'Days outstanding' },
    { value: 'status', label: 'Account status' },
    ...(this.permissions.has('ViewFinancials') ? [{ value: 'balance', label: 'Amount owed' }] : []),
  ]);
  protected readonly activeSuppliers = computed(() =>
    this.suppliers().filter(supplier => supplier.supplier_active)
  );
  protected readonly filteredSuppliers = computed(() => {
    const query = this.query().trim().toLowerCase();
    const searched = query
      ? this.suppliers().filter(supplier =>
          [this.supplierName(supplier), supplier.phone, supplier.email]
            .filter(Boolean)
            .some(value => value!.toLowerCase().includes(query))
        )
      : this.suppliers();
    const rows = searched.filter(supplier => {
      if (this.statusFilter() === 'active' && !supplier.supplier_active) return false;
      if (this.statusFilter() === 'archived' && supplier.supplier_active) return false;
      if (this.balanceFilter() === 'owed' && supplier.ap_balance <= 0) return false;
      if (this.balanceFilter() === 'clear' && supplier.ap_balance > 0) return false;
      if (this.ageFilter() === 'overdue' && (supplier.days_outstanding ?? 0) <= 30) return false;
      if (this.ageFilter() === 'current' && (supplier.days_outstanding ?? 0) > 30) return false;
      return true;
    });
    const sort = this.sort();
    return sortList(
      rows,
      this.sortDirection(),
      supplier => {
        if (sort === 'aging') return supplier.days_outstanding;
        if (sort === 'status') return supplier.supplier_active;
        if (sort === 'balance') return supplier.ap_balance;
        return this.supplierName(supplier);
      },
      this.supplierName
    );
  });
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredSuppliers().length / this.pageSize()))
  );
  protected readonly pagedSuppliers = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    const start = (page - 1) * this.pageSize();
    return this.filteredSuppliers().slice(start, start + this.pageSize());
  });
  protected readonly activeFilterCount = computed(
    () =>
      [this.statusFilter(), this.balanceFilter(), this.ageFilter()].filter(value => value !== 'all')
        .length
  );
  protected readonly totalOutstanding = computed(() =>
    this.suppliers().reduce((sum, supplier) => sum + Math.max(0, supplier.ap_balance), 0)
  );
  protected readonly suppliersOwed = computed(() =>
    this.suppliers().filter(supplier => supplier.ap_balance > 0)
  );
  protected readonly openPurchases = computed(() =>
    this.metrics().reduce((sum, metric) => sum + Number(metric.open_purchase_count ?? 0), 0)
  );
  protected readonly summary = computed(() => [
    {
      label: 'Active suppliers',
      value: this.activeSuppliers().length,
      mobilePriority: 'primary' as const,
    },
    {
      label: 'We owe',
      value: this.permissions.has('ViewFinancials') ? formatKes(this.totalOutstanding()) : 'Hidden',
      tone: this.totalOutstanding() > 0 ? ('warning' as const) : ('neutral' as const),
      mobilePriority: 'primary' as const,
    },
    {
      label: 'Suppliers we owe',
      value: this.suppliersOwed().length,
      tone: this.suppliersOwed().length > 0 ? ('warning' as const) : ('neutral' as const),
      mobilePriority: 'secondary' as const,
    },
    {
      label: 'Purchases we owe',
      value: this.openPurchases(),
      tone: this.openPurchases() > 0 ? ('warning' as const) : ('neutral' as const),
      mobilePriority: 'secondary' as const,
    },
  ]);
  protected readonly selectedMetrics = computed<SupplierDetailMetrics>(() => {
    const id = this.selectedSupplierId();
    const metric = this.metrics().find(row => row.supplier_id === id);
    return {
      purchases: Number(metric?.purchase_count ?? 0),
      averageOrder: Number(metric?.average_order ?? 0),
      openPurchases: Number(metric?.open_purchase_count ?? 0),
      activeLocationName: this.locations.active()?.name ?? 'Active location',
    };
  });

  protected readonly supplierName = (supplier: SupplierWithAp): string =>
    [supplier.first_name, supplier.last_name].filter(Boolean).join(' ');
  protected readonly supplierStats = (supplierId: string) => {
    const metric = this.metrics().find(row => row.supplier_id === supplierId);
    return {
      purchases: Number(metric?.purchase_count ?? 0),
      averageOrder: Number(metric?.average_order ?? 0),
      openPurchases: Number(metric?.open_purchase_count ?? 0),
    };
  };

  async ngOnInit(): Promise<void> {
    await this.load();
    const supplierId = this.route.snapshot.queryParamMap.get('supplier');
    if (supplierId && this.suppliers().some(supplier => supplier.id === supplierId)) {
      this.selectedSupplierId.set(supplierId);
    }
  }

  protected async load(force = false): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (force) this.partyCache.invalidate();
      const [, metrics] = await Promise.all([
        this.partyCache.ensureLoaded(),
        this.money.supplierPurchaseMetrics(),
      ]);
      this.metrics.set(metrics);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load suppliers');
    } finally {
      this.loading.set(false);
    }
  }

  protected setSearch(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  protected setSort(value: string): void {
    this.sort.set(value);
    this.page.set(1);
  }

  protected setSortDirection(value: ListSortDirection): void {
    this.sortDirection.set(value);
    this.page.set(1);
  }

  protected setFilter(kind: 'status' | 'balance' | 'age', value: string): void {
    if (kind === 'status') this.statusFilter.set(value);
    if (kind === 'balance') this.balanceFilter.set(value);
    if (kind === 'age') this.ageFilter.set(value);
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.statusFilter.set('all');
    this.balanceFilter.set('all');
    this.ageFilter.set('all');
    this.page.set(1);
  }

  protected setPageSize(value: number): void {
    this.pageSize.set(value);
    this.page.set(1);
  }

  protected openSupplier(supplier: SupplierWithAp): void {
    this.creating.set(false);
    this.drawerMode.set('view');
    this.selectedSupplierId.set(supplier.id);
    void this.syncSupplierQuery(supplier.id);
  }

  protected editSupplier(supplier: SupplierWithAp): void {
    this.creating.set(false);
    this.drawerMode.set('edit');
    this.selectedSupplierId.set(supplier.id);
    void this.syncSupplierQuery(supplier.id);
  }

  protected startCreate(): void {
    this.selectedSupplierId.set(null);
    this.creating.set(true);
    this.drawerMode.set('view');
    this.notice.set(null);
    this.error.set(null);
  }

  protected closeDrawer(): void {
    this.creating.set(false);
    this.drawerMode.set('view');
    this.selectedSupplierId.set(null);
    void this.syncSupplierQuery(null);
  }

  protected async supplierChanged(
    result: SupplierProfileFormResult | { supplierId: string; mode: 'account' }
  ): Promise<void> {
    await this.load(true);
    this.creating.set(false);
    this.selectedSupplierId.set(result.supplierId);
    this.notice.set(
      result.mode === 'created'
        ? 'Supplier created'
        : result.mode === 'updated'
          ? 'Supplier details updated'
          : 'Supplier account updated'
    );
    await this.syncSupplierQuery(result.supplierId);
  }

  protected async toggleActive(supplier: SupplierWithAp): Promise<void> {
    const active = !supplier.supplier_active;
    if (
      !active &&
      !window.confirm(
        `Archive ${this.supplierName(supplier)}? Existing purchases remain available, but the supplier cannot be used for new purchases.`
      )
    ) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.setSupplierActive(supplier.id, active);
      await this.load(true);
      this.notice.set(active ? 'Supplier reactivated' : 'Supplier archived');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Supplier update failed');
    } finally {
      this.busy.set(false);
    }
  }

  private async syncSupplierQuery(supplierId: string | null): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { supplier: supplierId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
