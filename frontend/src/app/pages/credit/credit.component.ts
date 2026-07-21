import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { AuthService } from '@dukarun/auth';
import { CurrencyService } from '../../shared/services/currency.service';
import { CustomerService, CreditCustomerSummary } from '@dukarun/customer';
import { SupplierService } from '@dukarun/supplier';
import { PageHeaderComponent } from '../../shared/components/dashboard/page-header.component';
import { ListSearchBarComponent } from '../../shared/components/dashboard/list-search-bar.component';
import {
  StatBarComponent,
  type StatItem,
} from '../../shared/components/dashboard/stat-bar.component';
import { EmptyStateComponent } from '../../shared/components/dashboard/empty-state.component';
import { PaginationComponent } from '../../shared/components/dashboard/pagination.component';

type CreditMode = 'receivables' | 'payables';

/** A customer (receivable) or supplier (payable) reduced to one credit row. */
interface CreditParty {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  approved: boolean;
  outstanding: number; // cents, absolute
  limit: number;
  available: number;
  duration: number;
  manageLink: string[];
}

/**
 * Credit & Payables — one page, two roles.
 *
 * Receivables = customers who owe the shop (AR). Payables = suppliers the shop
 * owes (AP). Both sides share one layout (stats strip → list) and one data
 * shape (CreditParty); a segmented toggle is the signifier for switching.
 */
@Component({
  selector: 'app-credit',
  standalone: true,
  imports: [
    RouterLink,
    NgIcon,
    PageHeaderComponent,
    ListSearchBarComponent,
    StatBarComponent,
    EmptyStateComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5 lg:space-y-6">
      <!-- Header -->
      <app-page-header
        [title]="'Credit & Payables'"
        [subtitle]="subtitle()"
        [isLoading]="isLoading()"
        (refresh)="reload()"
      >
        <app-stat-bar header-stats [stats]="statItems()" (select)="onStatSelect($event)" />
      </app-page-header>

      @if (!hasPermission()) {
        <div role="alert" class="alert alert-warning">
          <ng-icon name="heroExclamationTriangle" size="1.25rem" />
          <span>You need credit management permissions to access this page.</span>
        </div>
      } @else {
        <!-- Receivables / Payables switch -->
        <div class="join">
          <button
            type="button"
            class="join-item btn btn-sm sm:btn-md"
            [class.btn-active]="mode() === 'receivables'"
            [class.btn-primary]="mode() === 'receivables'"
            (click)="setMode('receivables')"
          >
            <ng-icon name="heroUsers" size="1rem" />
            Receivables · Customers
          </button>
          <button
            type="button"
            class="join-item btn btn-sm sm:btn-md"
            [class.btn-active]="mode() === 'payables'"
            [class.btn-primary]="mode() === 'payables'"
            (click)="setMode('payables')"
          >
            <ng-icon name="heroTruck" size="1rem" />
            Payables · Suppliers
          </button>
        </div>

        <!-- Search + active filter badges -->
        <app-list-search-bar
          [(searchQuery)]="searchTerm"
          [placeholder]="'Search by ' + partyNoun() + ' name or phone…'"
        >
          @if (approvedFilter() || outstandingFilter()) {
            <div badges class="flex flex-wrap gap-2">
              @if (approvedFilter()) {
                <span class="badge badge-success gap-1">
                  On credit
                  <button
                    class="btn btn-ghost btn-xs btn-circle p-0 h-4 w-4 min-h-0"
                    (click)="toggleApproved()"
                    type="button"
                    aria-label="Clear filter"
                  >
                    <ng-icon name="heroXMark" size="0.875rem" />
                  </button>
                </span>
              }
              @if (outstandingFilter()) {
                <span class="badge badge-error gap-1">
                  {{ outstandingLabel() }}
                  <button
                    class="btn btn-ghost btn-xs btn-circle p-0 h-4 w-4 min-h-0"
                    (click)="toggleOutstanding()"
                    type="button"
                    aria-label="Clear filter"
                  >
                    <ng-icon name="heroXMark" size="0.875rem" />
                  </button>
                </span>
              }
            </div>
          }
        </app-list-search-bar>

        <!-- Loading -->
        @if (isLoading()) {
          <div class="card bg-base-100">
            <div class="card-body items-center py-12">
              <span class="loading loading-spinner loading-lg text-primary"></span>
              <p class="text-sm text-base-content/60 mt-2">Loading…</p>
            </div>
          </div>
        } @else if (filteredParties().length === 0) {
          <!-- Empty -->
          <app-empty-state
            icon="heroCreditCard"
            [title]="'No ' + partyNoun() + 's found'"
            [description]="
              searchTerm()
                ? 'Try adjusting your search.'
                : 'No ' + partyNoun() + 's with credit data yet.'
            "
          >
            @if (searchTerm()) {
              <button actions (click)="searchTerm.set('')" class="btn btn-outline btn-sm">
                Clear search
              </button>
            }
          </app-empty-state>
        } @else {
          <!-- Mobile cards -->
          <div class="lg:hidden space-y-3">
            @for (party of pagedParties(); track party.id) {
              <div class="card bg-base-100">
                <a [routerLink]="party.manageLink" class="block">
                  <div class="card-body p-4 gap-0">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 class="font-semibold truncate">{{ party.name }}</h3>
                        <p class="text-xs text-base-content/60 truncate">
                          {{ party.phone || party.email || '—' }}
                        </p>
                      </div>
                      <span
                        class="badge badge-sm shrink-0"
                        [class.badge-success]="party.approved"
                        [class.badge-warning]="!party.approved"
                      >
                        {{ party.approved ? 'On credit' : 'Pending' }}
                      </span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-base-300/60">
                      <div>
                        <p class="text-xs text-base-content/60">{{ outstandingLabel() }}</p>
                        <p class="text-sm font-semibold tabular-nums text-error">
                          {{ currencyService.format(party.outstanding) }}
                        </p>
                      </div>
                      <div>
                        <p class="text-xs text-base-content/60">Limit</p>
                        <p class="text-sm font-semibold tabular-nums">
                          {{ currencyService.format(party.limit) }}
                        </p>
                      </div>
                      <div>
                        <p class="text-xs text-base-content/60">Available</p>
                        <p class="text-sm font-semibold tabular-nums text-success">
                          {{ currencyService.format(party.available) }}
                        </p>
                      </div>
                    </div>
                  </div>
                </a>
              </div>
            }
          </div>

          <!-- Desktop table -->
          <div class="card bg-base-100 hidden lg:block">
            <div class="overflow-x-auto">
              <table class="table table-zebra">
                <thead>
                  <tr>
                    <th>{{ partyNoun() === 'customer' ? 'Customer' : 'Supplier' }}</th>
                    <th>Contact</th>
                    <th class="text-right">{{ outstandingLabel() }}</th>
                    <th class="text-right">Limit</th>
                    <th class="text-right">Available</th>
                    <th>Terms</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (party of pagedParties(); track party.id) {
                    <tr class="hover cursor-pointer" (click)="goTo(party)">
                      <td>
                        <div class="font-semibold">{{ party.name }}</div>
                      </td>
                      <td>
                        <div class="text-sm">{{ party.phone || '—' }}</div>
                        <div class="text-xs text-base-content/60">{{ party.email || '—' }}</div>
                      </td>
                      <td class="text-right">
                        <span class="text-error font-medium tabular-nums">{{
                          currencyService.format(party.outstanding)
                        }}</span>
                      </td>
                      <td class="text-right font-medium tabular-nums">
                        {{ currencyService.format(party.limit) }}
                      </td>
                      <td class="text-right">
                        <span class="text-success font-medium tabular-nums">{{
                          currencyService.format(party.available)
                        }}</span>
                      </td>
                      <td>{{ party.duration }} days</td>
                      <td>
                        <span
                          class="badge badge-sm"
                          [class.badge-success]="party.approved"
                          [class.badge-warning]="!party.approved"
                        >
                          {{ party.approved ? 'On credit' : 'Pending' }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <app-pagination
            [currentPage]="currentPage()"
            [totalPages]="totalPages()"
            [totalItems]="filteredParties().length"
            [itemsPerPage]="pageSize"
            [itemLabel]="partyNoun() + 's'"
            (pageChange)="currentPage.set($event)"
          />
        }
      }
    </div>
  `,
})
export class CreditComponent implements OnInit {
  private readonly customerService = inject(CustomerService);
  private readonly supplierService = inject(SupplierService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly currencyService = inject(CurrencyService);

  readonly hasPermission = this.authService.hasCreditManagementPermission;

  readonly mode = signal<CreditMode>('receivables');
  readonly searchTerm = signal('');
  readonly approvedFilter = signal(false);
  readonly outstandingFilter = signal(false);

  // Client-side pagination
  readonly currentPage = signal(1);
  readonly pageSize = 20;

  // Receivables (customers)
  private readonly customers = signal<CreditCustomerSummary[]>([]);
  private readonly loadingReceivables = signal(false);
  private receivablesLoaded = false;
  // Payables (suppliers) — sourced from the shared SupplierService signals
  private readonly suppliers = this.supplierService.suppliers;
  private payablesLoaded = false;

  constructor() {
    // Any search change returns the list to page 1
    effect(() => {
      this.searchTerm();
      this.currentPage.set(1);
    });
  }

  readonly isLoading = computed(() =>
    this.mode() === 'receivables' ? this.loadingReceivables() : this.supplierService.isLoading(),
  );

  readonly partyNoun = computed(() => (this.mode() === 'receivables' ? 'customer' : 'supplier'));
  readonly partyPlural = computed(() =>
    this.mode() === 'receivables' ? 'Customers' : 'Suppliers',
  );
  readonly outstandingLabel = computed(() =>
    this.mode() === 'receivables' ? 'Owed to you' : 'You owe',
  );
  readonly subtitle = computed(() =>
    this.mode() === 'receivables'
      ? 'Approve customers for credit, set limits, and track what they owe you.'
      : 'Manage supplier credit, set limits, and track what you owe them.',
  );

  readonly parties = computed<CreditParty[]>(() =>
    this.mode() === 'receivables'
      ? this.customers().map((c) => this.mapCustomer(c))
      : this.suppliers().map((s) => this.mapSupplier(s)),
  );

  readonly filteredParties = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const approved = this.approvedFilter();
    const outstanding = this.outstandingFilter();
    let list = this.parties();
    if (approved) list = list.filter((p) => p.approved);
    if (outstanding) list = list.filter((p) => p.outstanding > 0);
    if (!term) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.phone ?? '').toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term),
    );
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredParties().length / this.pageSize)),
  );

  readonly pagedParties = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredParties().slice(start, start + this.pageSize);
  });

  readonly stats = computed(() => {
    const list = this.parties();
    return {
      total: list.length,
      approved: list.filter((p) => p.approved).length,
      totalOutstanding: list.reduce((sum, p) => sum + p.outstanding, 0),
      totalLimit: list.reduce((sum, p) => sum + p.limit, 0),
    };
  });

  readonly statItems = computed<StatItem[]>(() => {
    const s = this.stats();
    return [
      { label: this.partyPlural().toLowerCase(), value: s.total },
      { label: 'on credit', value: s.approved, filter: 'approved', active: this.approvedFilter() },
      {
        label: this.outstandingLabel().toLowerCase(),
        value: this.currencyService.format(s.totalOutstanding),
        tone: 'error',
        filter: 'outstanding',
        active: this.outstandingFilter(),
      },
      { label: 'total limit', value: this.currencyService.format(s.totalLimit) },
    ];
  });

  onStatSelect(key: string): void {
    if (key === 'approved') this.toggleApproved();
    else if (key === 'outstanding') this.toggleOutstanding();
  }

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'payables') this.mode.set('payables');
    if (this.hasPermission()) void this.ensureLoaded(this.mode());
  }

  setMode(mode: CreditMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.approvedFilter.set(false);
    this.outstandingFilter.set(false);
    this.searchTerm.set('');
    this.currentPage.set(1);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: mode === 'payables' ? 'payables' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    void this.ensureLoaded(mode);
  }

  toggleApproved(): void {
    this.approvedFilter.update((v) => !v);
    this.currentPage.set(1);
  }

  toggleOutstanding(): void {
    this.outstandingFilter.update((v) => !v);
    this.currentPage.set(1);
  }

  goTo(party: CreditParty): void {
    void this.router.navigate(party.manageLink);
  }

  async reload(): Promise<void> {
    if (this.mode() === 'receivables') {
      this.receivablesLoaded = false;
      await this.loadReceivables();
    } else {
      this.payablesLoaded = false;
      await this.loadPayables();
    }
  }

  private async ensureLoaded(mode: CreditMode): Promise<void> {
    if (mode === 'receivables' && !this.receivablesLoaded) await this.loadReceivables();
    if (mode === 'payables' && !this.payablesLoaded) await this.loadPayables();
  }

  private async loadReceivables(): Promise<void> {
    this.loadingReceivables.set(true);
    try {
      this.customers.set(await this.customerService.listCreditCustomers());
      this.receivablesLoaded = true;
    } catch (error) {
      console.error('Failed to load credit customers', error);
    } finally {
      this.loadingReceivables.set(false);
    }
  }

  private async loadPayables(): Promise<void> {
    try {
      await this.supplierService.fetchSuppliers({ take: 200, skip: 0 });
      this.payablesLoaded = true;
    } catch (error) {
      console.error('Failed to load suppliers', error);
    }
  }

  private mapCustomer(c: CreditCustomerSummary): CreditParty {
    return {
      id: c.id,
      name: c.name || 'Unnamed customer',
      phone: c.phone,
      email: c.email,
      approved: c.isCreditApproved,
      outstanding: Math.abs(c.outstandingAmount ?? 0),
      limit: c.creditLimit ?? 0,
      available: c.availableCredit ?? 0,
      duration: c.creditDuration ?? 0,
      manageLink: ['/dashboard/customers/edit', c.id],
    };
  }

  private mapSupplier(s: any): CreditParty {
    const outstanding = Math.abs(Number(s.supplierOutstandingAmount ?? 0));
    const limit = Number(s.customFields?.supplierCreditLimit ?? 0);
    return {
      id: s.id,
      name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || 'Unnamed supplier',
      phone: s.phoneNumber,
      email: s.emailAddress,
      approved: Boolean(s.customFields?.isSupplierCreditApproved),
      outstanding,
      limit,
      available: Math.max(limit - outstanding, 0),
      duration: Number(s.customFields?.supplierCreditDuration ?? 0),
      manageLink: ['/dashboard/suppliers/edit', s.id],
    };
  }
}
