import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatKes } from '../../core/money';
import { AgingInfo, MoneyCustomer, MoneyService } from '../money.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../../shared/ui/entity-avatar.component';
import { IconComponent } from '../../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../../shared/ui/list-search-bar.component';
import { sortList } from '../../shared/ui/list-sort';
import { MoneyComponent } from '../../shared/ui/money.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatBarComponent } from '../../shared/ui/stat-bar.component';
import { StatusBadgeComponent, type BadgeType } from '../../shared/ui/status-badge.component';
import { PartyCacheService } from '../../core/party-cache.service';

type CreditMode = 'receivables' | 'payables';
type CustomerWithAr = MoneyCustomer & { ar_balance: number } & AgingInfo;
type SupplierWithAp = MoneyCustomer & { ap_balance: number } & AgingInfo;

const CREDIT_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'name', label: 'Name' },
  { value: 'outstanding', label: 'Outstanding value' },
  { value: 'aging', label: 'Days outstanding' },
  { value: 'limit', label: 'Credit limit' },
  { value: 'available', label: 'Available credit' },
  { value: 'status', label: 'Credit status' },
];

interface CreditParty {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  outstanding: number;
  limit: number;
  available: number | null;
  termsDays: number;
  daysOutstanding: number | null;
  bucket: string | null;
  status: string;
  statusType: BadgeType;
}

/**
 * Cross-ledger credit overview. It deliberately stays read-only: customer and
 * supplier pages remain the operational source of truth for edits and payments.
 */
@Component({
  selector: 'app-money-credit',
  imports: [
    RouterLink,
    ButtonComponent,
    DataTableShellComponent,
    EmptyStateComponent,
    EntityAvatarComponent,
    IconComponent,
    ListSearchBarComponent,
    MoneyComponent,
    PaginationComponent,
    StatBarComponent,
    StatusBadgeComponent,
  ],
  template: `
    <section>
      <div class="mb-3 flex flex-wrap items-start gap-3">
        <div class="min-w-0">
          <h2 class="section-title">Credit position</h2>
          <p class="type-caption mt-1">
            Compare money owed to us with money we owe, then manage each party in its own record.
          </p>
        </div>
        <button
          appButton
          variant="ghost"
          [iconOnly]="true"
          class="ml-auto"
          type="button"
          title="Refresh credit position"
          aria-label="Refresh credit position"
          [loading]="loading()"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
        <a appButton variant="outline" [routerLink]="manageRoute()">
          Manage {{ mode() === 'receivables' ? 'customers' : 'suppliers' }}
          <app-icon name="heroArrowRight" />
        </a>
      </div>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (partyCache.loaded() && !partyCache.complete()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          Party limit reached. Credit totals and local filters cover cached parties only.
        </div>
      }

      <app-list-search-bar
        [placeholder]="mode() === 'receivables' ? 'Search customers…' : 'Search suppliers…'"
        [searchQuery]="query()"
        (searchQueryChange)="query.set($event); page.set(1)"
        [sortOptions]="creditSortOptions"
        [sortKey]="creditSort()"
        (sortKeyChange)="creditSort.set($event); page.set(1)"
        [sortDirection]="creditSortDirection()"
        (sortDirectionChange)="creditSortDirection.set($event); page.set(1)"
        [filtersEnabled]="true"
      >
        <app-stat-bar summary [stats]="positionStats()" />
        <div filters class="flex flex-wrap gap-1 rounded-field bg-base-200 p-1">
          <button
            appButton
            size="sm"
            type="button"
            [variant]="mode() === 'receivables' ? 'soft' : 'ghost'"
            [attr.aria-pressed]="mode() === 'receivables'"
            (click)="setMode('receivables')"
          >
            <app-icon name="heroUsers" /> Customers
          </button>
          <button
            appButton
            size="sm"
            type="button"
            [variant]="mode() === 'payables' ? 'soft' : 'ghost'"
            [attr.aria-pressed]="mode() === 'payables'"
            (click)="setMode('payables')"
          >
            <app-icon name="heroTruck" /> Suppliers
          </button>
        </div>
      </app-list-search-bar>

      @if (!loading() && filteredParties().length === 0) {
        <div class="mt-3">
          <app-empty-state
            icon="heroCreditCard"
            [title]="query() ? 'No matching credit records' : emptyTitle()"
            [description]="
              query()
                ? 'Try a different name, phone, or email.'
                : mode() === 'receivables'
                  ? 'Customer credit approvals and outstanding balances will appear here.'
                  : 'Supplier credit limits and outstanding purchase balances will appear here.'
            "
          >
            @if (!query()) {
              <a actions appButton variant="outline" [routerLink]="manageRoute()">
                Manage {{ mode() === 'receivables' ? 'customers' : 'suppliers' }}
              </a>
            }
          </app-empty-state>
        </div>
      } @else if (filteredParties().length > 0) {
        <div class="mt-3 hidden lg:block">
          <app-data-table-shell>
            <table class="table">
              <thead>
                <tr>
                  <th>{{ mode() === 'receivables' ? 'Customer' : 'Supplier' }}</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Aging</th>
                  <th>Terms</th>
                  <th class="text-right">Limit</th>
                  <th class="text-right">Available</th>
                  <th class="text-right">
                    {{ mode() === 'receivables' ? 'Owed to us' : 'We owe' }}
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (party of pagedParties(); track party.id) {
                  <tr>
                    <td>
                      <div class="table-entity">
                        <app-entity-avatar size="sm" [firstName]="party.name" />
                        <span class="table-primary">{{ party.name }}</span>
                      </div>
                    </td>
                    <td>
                      <p class="table-primary">{{ party.phone || '—' }}</p>
                      <p class="table-secondary">{{ party.email || 'No email' }}</p>
                    </td>
                    <td>
                      <app-status-badge
                        size="xs"
                        [type]="party.statusType"
                        [label]="party.status"
                      />
                    </td>
                    <td>
                      <p class="table-primary">{{ agingLabel(party) }}</p>
                      @if (party.daysOutstanding !== null) {
                        <p class="table-secondary">{{ party.daysOutstanding }} days</p>
                      }
                    </td>
                    <td class="table-number">{{ party.termsDays }} days</td>
                    <td class="table-number">
                      @if (party.limit > 0) {
                        <app-money [amount]="party.limit" />
                      } @else {
                        <span class="text-base-content/50">No cap</span>
                      }
                    </td>
                    <td class="table-number">
                      @if (party.available !== null) {
                        <app-money [amount]="party.available" />
                      } @else {
                        <span class="text-base-content/50">No cap</span>
                      }
                    </td>
                    <td
                      class="table-number"
                      [class.text-error]="mode() === 'receivables' && party.outstanding > 0"
                      [class.text-warning]="mode() === 'payables' && party.outstanding > 0"
                    >
                      <app-money [amount]="party.outstanding" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="mt-3 flex flex-col gap-2 lg:hidden">
          @for (party of pagedParties(); track party.id) {
            <article class="card block bg-base-100">
              <div class="card-body gap-3 p-4">
                <div class="flex items-start gap-3">
                  <app-entity-avatar size="sm" [firstName]="party.name" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold">{{ party.name }}</p>
                    <p class="type-caption truncate">{{ party.phone || party.email || '—' }}</p>
                  </div>
                  <app-status-badge size="xs" [type]="party.statusType" [label]="party.status" />
                </div>
                <div class="grid grid-cols-3 gap-3 border-t border-base-300 pt-3">
                  <div>
                    <p class="type-caption">
                      {{ mode() === 'receivables' ? 'Owed to us' : 'We owe' }}
                    </p>
                    <p class="text-sm font-bold"><app-money [amount]="party.outstanding" /></p>
                  </div>
                  <div>
                    <p class="type-caption">Limit</p>
                    <p class="text-sm font-semibold">
                      @if (party.limit > 0) {
                        <app-money [amount]="party.limit" />
                      } @else {
                        No cap
                      }
                    </p>
                  </div>
                  <div>
                    <p class="type-caption">Aging</p>
                    <p class="text-sm font-semibold">{{ agingLabel(party) }}</p>
                  </div>
                </div>
              </div>
            </article>
          }
        </div>

        <div class="mt-3">
          <app-pagination
            [currentPage]="page()"
            [totalPages]="totalPages()"
            [totalItems]="filteredParties().length"
            [itemsPerPage]="pageSize"
            [itemLabel]="mode() === 'receivables' ? 'customers' : 'suppliers'"
            (pageChange)="page.set($event)"
          />
        </div>
      }
    </section>
  `,
})
export class MoneyCreditComponent implements OnInit {
  private readonly money = inject(MoneyService);
  protected readonly partyCache = inject(PartyCacheService);

  protected readonly customers = computed<CustomerWithAr[]>(() => this.partyCache.customerRows());
  protected readonly suppliers = computed<SupplierWithAp[]>(() => this.partyCache.suppliers());
  protected readonly mode = signal<CreditMode>('receivables');
  protected readonly query = signal('');
  protected readonly creditSortOptions = CREDIT_SORT_OPTIONS;
  protected readonly creditSort = signal('name');
  protected readonly creditSortDirection = signal<ListSortDirection>('asc');
  protected readonly page = signal(1);
  protected readonly pageSize = 15;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly receivables = computed(() =>
    this.customers().reduce((sum, customer) => sum + Math.max(0, customer.ar_balance), 0)
  );
  protected readonly payables = computed(() =>
    this.suppliers().reduce((sum, supplier) => sum + Math.max(0, supplier.ap_balance), 0)
  );
  protected readonly positionStats = computed(() => {
    const receivables = this.receivables();
    const payables = this.payables();
    const net = receivables - payables;
    return [
      {
        label: 'Customers owe us',
        value: this.moneyLabel(receivables),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'We owe suppliers',
        value: this.moneyLabel(payables),
        tone: payables > 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'primary' as const,
      },
      {
        label: net >= 0 ? 'Net owed to us' : 'Net we owe',
        value: this.moneyLabel(Math.abs(net)),
        tone: net < 0 ? ('warning' as const) : ('neutral' as const),
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Overdue customers',
        value: this.customers().filter(
          customer =>
            customer.ar_balance > 0 && customer.bucket !== null && customer.bucket !== 'current'
        ).length,
        tone: 'error' as const,
        mobilePriority: 'secondary' as const,
      },
    ];
  });

  protected readonly parties = computed<CreditParty[]>(() =>
    this.mode() === 'receivables'
      ? this.customers()
          .filter(
            customer =>
              customer.is_credit_approved || customer.credit_limit > 0 || customer.ar_balance > 0
          )
          .map(customer => this.customerParty(customer))
      : this.suppliers()
          .filter(supplier => supplier.supplier_credit_limit > 0 || supplier.ap_balance > 0)
          .map(supplier => this.supplierParty(supplier))
  );
  protected readonly filteredParties = computed(() => {
    const query = this.query().trim().toLowerCase();
    const rows = query
      ? this.parties().filter(party =>
          [party.name, party.phone, party.email]
            .filter(Boolean)
            .some(value => value!.toLowerCase().includes(query))
        )
      : this.parties();
    const sortKey = this.creditSort();
    return sortList(
      rows,
      this.creditSortDirection(),
      party => {
        switch (sortKey) {
          case 'outstanding':
            return party.outstanding;
          case 'aging':
            return party.daysOutstanding;
          case 'limit':
            return party.limit;
          case 'available':
            return party.available;
          case 'status':
            return party.status;
          default:
            return party.name;
        }
      },
      party => party.name
    );
  });
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredParties().length / this.pageSize))
  );
  protected readonly pagedParties = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredParties().slice(start, start + this.pageSize);
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.partyCache.ensureLoaded();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load credit position');
    } finally {
      this.loading.set(false);
    }
  }

  protected setMode(mode: CreditMode): void {
    this.mode.set(mode);
    this.query.set('');
    this.page.set(1);
  }

  protected emptyTitle(): string {
    return this.mode() === 'receivables' ? 'No customer credit yet' : 'No supplier credit yet';
  }

  protected manageRoute(): string {
    return this.mode() === 'receivables' ? '/customers' : '/suppliers';
  }

  protected agingLabel(party: CreditParty): string {
    if (party.outstanding === 0) return 'Current';
    if (!party.bucket || party.bucket === 'current') return 'Current';
    return party.bucket.replaceAll('_', ' ');
  }

  private customerParty(customer: CustomerWithAr): CreditParty {
    const outstanding = Math.max(0, customer.ar_balance);
    const frozen = outstanding > 0 && !customer.is_credit_approved;
    return {
      id: customer.id,
      name: this.name(customer),
      phone: customer.phone,
      email: customer.email,
      outstanding,
      limit: customer.credit_limit,
      available:
        customer.credit_limit > 0 ? Math.max(0, customer.credit_limit - outstanding) : null,
      termsDays: customer.credit_terms_days ?? 0,
      daysOutstanding: customer.days_outstanding,
      bucket: customer.bucket,
      status: frozen ? 'Frozen' : customer.is_credit_approved ? 'Approved' : 'Not approved',
      statusType: frozen ? 'error' : customer.is_credit_approved ? 'success' : 'neutral',
    };
  }

  private supplierParty(supplier: SupplierWithAp): CreditParty {
    const outstanding = Math.max(0, supplier.ap_balance);
    return {
      id: supplier.id,
      name: this.name(supplier),
      phone: supplier.phone,
      email: supplier.email,
      outstanding,
      limit: supplier.supplier_credit_limit,
      available:
        supplier.supplier_credit_limit > 0
          ? Math.max(0, supplier.supplier_credit_limit - outstanding)
          : null,
      termsDays: supplier.supplier_credit_terms_days ?? 0,
      daysOutstanding: supplier.days_outstanding,
      bucket: supplier.bucket,
      status: supplier.supplier_active ? 'Active' : 'Archived',
      statusType: supplier.supplier_active ? 'success' : 'neutral',
    };
  }

  private name(party: MoneyCustomer): string {
    return [party.first_name, party.last_name].filter(Boolean).join(' ');
  }

  private moneyLabel(amount: number): string {
    return formatKes(amount);
  }
}
