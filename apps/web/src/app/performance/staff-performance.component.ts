import { bindListQuery, listQueryField, listFormQueryField } from '../shared/list/list-query';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import {
  DataTableShellComponent,
  TableRowsDirective,
  type TableColumn,
} from '../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PerformanceService, StaffDailyPerformance, StaffPerformance } from './performance.service';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { WorkspaceNavigationComponent } from '../shared/ui/workspace-navigation.component';

@Component({
  selector: 'app-staff-performance',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    DataTableShellComponent,
    TableRowsDirective,
    DrawerComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    PageLayoutComponent,
    StatCardComponent,
    StatusBadgeComponent,
    ListSearchBarComponent,
    MobileListComponent,
    StatBarComponent,
    PageActionsComponent,
    WorkspaceNavigationComponent,
  ],
  template: `
    <app-page
      title="Team"
      subtitle="Sales value, volume, collections, refunds, voids, margin, and held (unpaid) sales by salesperson."
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
          title="Refresh performance"
          aria-label="Refresh performance"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
      </app-page-actions>

      <app-workspace-navigation workspace="team" label="Team" />

      <app-list-search-bar
        searchLabel="Search staff performance"
        placeholder="Search name, role, or status…"
        [searchQuery]="searchQuery()"
        (searchQueryChange)="searchQuery.set($event)"
        [filtersEnabled]="false"
        filterSheetTitle="Performance period"
      >
        <div summary>
          <p class="type-caption mb-1">All staff in the selected period</p>
          <app-stat-bar [stats]="performanceStats()" />
        </div>
        <div filters class="grid grid-cols-2 gap-3 md:flex md:items-end"></div>
        <div scope class="flex flex-wrap items-end gap-3">
          @if (performanceFilterCount() > 0) {
            <button
              type="button"
              class="btn btn-ghost btn-sm min-h-11"
              (click)="clearPerformanceFilters()"
            >
              Reset dates
            </button>
          }

          <app-form-field label="From">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [formControl]="from"
              (change)="load()"
            /> </app-form-field
          ><app-form-field label="To">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [formControl]="to"
              (change)="load()"
            />
          </app-form-field></div
      ></app-list-search-bar>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-4 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
          <button appButton variant="ghost" size="sm" type="button" (click)="load()">Retry</button>
        </div>
      }

      @if (!loading() && !error() && filteredRows().length === 0) {
        <app-empty-state
          [compact]="true"
          icon="heroChartBar"
          [title]="searchQuery() ? 'No matching staff' : 'No staff sales in this range'"
          [description]="
            searchQuery()
              ? 'Try another name, role, or status, or clear the search.'
              : 'Try a wider date range or complete the first sale.'
          "
        />
      } @else {
        <app-mobile-list>
          @for (row of filteredRows(); track row.staff_user_id ?? row.display_name) {
            <button
              [attr.data-list-record]="row.staff_user_id"
              mobileListRow
              type="button"
              class="flex min-h-20 w-full items-center gap-3 p-3 text-left"
              [class.bg-base-200/50]="selected()?.staff_user_id === row.staff_user_id"
              (click)="selectStaff(row)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="whitespace-normal break-words font-semibold">{{
                    row.display_name
                  }}</span>
                  <app-status-badge
                    size="xs"
                    [type]="row.authorization_status === 'approved' ? 'neutral' : 'warning'"
                    [label]="row.authorization_status"
                  />
                </div>
                <p class="type-caption mt-1">
                  {{ row.role_name || 'No current role' }} · {{ row.transactions }} transactions
                </p>
                @if (row.refunds + row.voided_sales !== 0) {
                  <p class="mt-1 text-xs text-warning">
                    Refunds / voids: <app-money [amount]="row.refunds + row.voided_sales" />
                  </p>
                }
                @if (row.held_count !== 0 || row.held_value !== 0) {
                  <p class="mt-1 text-xs text-warning">
                    {{ row.held_count }} held · <app-money [amount]="row.held_value" /> unpaid
                  </p>
                }
              </div>
              <div class="shrink-0 text-right">
                <p class="font-semibold tabular-nums"><app-money [amount]="row.net_sales" /></p>
                <p class="type-caption">collected <app-money [amount]="row.collected" /></p>
                <p
                  class="type-caption"
                  [class.text-error]="row.margin < 0"
                  [class.text-success]="row.margin > 0"
                >
                  margin <app-money [amount]="row.margin" />
                </p>
                <p class="type-caption">
                  {{ comparisonLabel(row.net_sales, previousFor(row)?.net_sales ?? 0) }} vs previous
                </p>
              </div>
            </button>
          }
        </app-mobile-list>
        <div class="hidden lg:block">
          <app-data-table-shell
            [columns]="tableColumns1"
            tableClass="table-sm"
            heading="Salesperson leaderboard"
            [description]="filteredRows().length + ' staff records · click a row for daily detail'"
          >
            <ng-template tableRows>
              @for (row of filteredRows(); track row.staff_user_id ?? row.display_name) {
                <tr
                  [attr.data-list-record]="row.staff_user_id"
                  tabindex="0"
                  class="cursor-pointer"
                  [class.table-row-active]="selected()?.staff_user_id === row.staff_user_id"
                  (click)="selectStaff(row)"
                  (keydown.enter)="selectStaff(row)"
                >
                  <td>
                    <span class="font-semibold">{{ row.display_name }}</span>
                    <div class="mt-1 flex items-center gap-2">
                      <span class="type-caption">{{ row.role_name || 'No current role' }}</span>
                      <app-status-badge
                        size="xs"
                        [type]="row.authorization_status === 'approved' ? 'neutral' : 'warning'"
                        [label]="row.authorization_status"
                      />
                    </div>
                    @if (row.refunds + row.voided_sales !== 0) {
                      <p class="mt-1 text-xs text-warning">
                        Refunds / voids: <app-money [amount]="row.refunds + row.voided_sales" />
                      </p>
                    }
                    @if (row.held_count !== 0 || row.held_value !== 0) {
                      <p class="mt-1 text-xs text-warning">
                        {{ row.held_count }} held · <app-money [amount]="row.held_value" /> unpaid
                      </p>
                    }
                    <details
                      class="mt-2"
                      (click)="$event.stopPropagation()"
                      (keydown.enter)="$event.stopPropagation()"
                    >
                      <summary class="cursor-pointer text-xs">
                        Gross, refunds &amp; held sales
                      </summary>
                      <dl class="grid grid-cols-2 gap-2 mt-2 text-xs">
                        <div>
                          <dt>Quantity</dt>
                          <dd>{{ quantity(row.quantity) }}</dd>
                        </div>
                        <div>
                          <dt>Gross sales</dt>
                          <dd><app-money [amount]="row.gross_sales" /></dd>
                        </div>
                        <div>
                          <dt>Refunds / voids</dt>
                          <dd><app-money [amount]="row.refunds + row.voided_sales" /></dd>
                        </div>
                        <div>
                          <dt>Average</dt>
                          <dd><app-money [amount]="row.average_sale" /></dd>
                        </div>
                        <div>
                          <dt>Held sales</dt>
                          <dd [class.text-warning]="row.held_count > 0">{{ row.held_count }}</dd>
                        </div>
                        <div>
                          <dt>Held value</dt>
                          <dd [class.text-warning]="row.held_value > 0">
                            <app-money [amount]="row.held_value" />
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </td>
                  <td class="text-right font-semibold"><app-money [amount]="row.net_sales" /></td>
                  <td class="text-right"><app-money [amount]="row.collected" /></td>
                  <td
                    class="text-right"
                    [class.text-success]="staffComparison(row) > 0"
                    [class.text-error]="staffComparison(row) < 0"
                  >
                    {{ comparisonLabel(row.net_sales, previousFor(row)?.net_sales ?? 0) }}
                  </td>
                  <td class="text-right">{{ row.transactions }}</td>
                  <td
                    class="text-right"
                    [class.text-success]="row.margin > 0"
                    [class.text-error]="row.margin < 0"
                  >
                    <app-money [amount]="row.margin" />
                  </td>
                </tr>
              }
            </ng-template>
          </app-data-table-shell>
        </div>
      }

      @if (selected(); as staff) {
        <app-drawer
          [open]="true"
          (closed)="closeDetail()"
          [title]="staff.display_name"
          [subtitle]="
            (staff.role_name || 'No current role') + ' · ' + from.value + ' to ' + to.value
          "
        >
          <div class="grid grid-cols-2 gap-2">
            <app-stat-card
              label="Net sales"
              [value]="fmt(staff.net_sales)"
              [sub]="
                comparisonLabel(staff.net_sales, previousFor(staff)?.net_sales ?? 0) +
                ' vs previous period'
              "
            />
            <app-stat-card
              label="Collected"
              [value]="fmt(staff.collected)"
              [sub]="staff.transactions + ' completed checkout(s)'"
            />
          </div>

          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt class="type-caption">Gross sales</dt>
              <dd><app-money [amount]="staff.gross_sales" /></dd>
            </div>
            <div>
              <dt class="type-caption">Margin</dt>
              <dd><app-money [amount]="staff.margin" /></dd>
            </div>
            <div>
              <dt class="type-caption">Refunds / voids</dt>
              <dd><app-money [amount]="staff.refunds + staff.voided_sales" /></dd>
            </div>
            <div>
              <dt class="type-caption">Average sale</dt>
              <dd><app-money [amount]="staff.average_sale" /></dd>
            </div>
            <div>
              <dt class="type-caption">Quantity</dt>
              <dd>{{ quantity(staff.quantity) }}</dd>
            </div>
            <div>
              <dt class="type-caption">Held sales</dt>
              <dd>{{ staff.held_count }} · <app-money [amount]="staff.held_value" /> unpaid</dd>
            </div>
          </dl>

          <div class="mt-4">
            <h3 class="section-title mb-2">Daily movement</h3>
            @if (detailLoading()) {
              <div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
                <span class="loading loading-spinner loading-md"></span>
                <span class="text-sm">Loading daily performance…</span>
              </div>
            } @else if (daily().length === 0) {
              <app-empty-state
                [compact]="true"
                icon="heroChartBar"
                title="No sales in this range"
              />
            } @else {
              <ul class="divide-y divide-base-200">
                @for (day of daily(); track day.day) {
                  <li class="flex items-center gap-3 py-2">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium">{{ day.day }}</p>
                      <p class="type-caption">
                        {{ day.transactions }} sale(s) · qty {{ quantity(day.quantity) }}
                        @if (day.refunds + day.voided_sales > 0) {
                          ·
                          <span class="text-warning">
                            refunds/voids
                            <app-money [amount]="day.refunds + day.voided_sales" />
                          </span>
                        }
                      </p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="text-sm font-semibold tabular-nums">
                        <app-money [amount]="day.net_sales" />
                      </p>
                      <p class="type-caption">collected <app-money [amount]="day.collected" /></p>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        </app-drawer>
      }
    </app-page>
  `,
})
export class StaffPerformanceComponent implements OnInit {
  protected readonly tableColumns1: TableColumn[] = [
    { key: 'staff', label: 'Staff member', pinned: true },
    { key: 'net', label: 'Net sales', align: 'right' },
    { key: 'collected', label: 'Collected', align: 'right' },
    { key: 'change', label: 'Vs previous', align: 'right' },
    { key: 'transactions', label: 'Transactions', align: 'right' },
    { key: 'margin', label: 'Margin', align: 'right' },
  ];
  private readonly performance = inject(PerformanceService);

  protected readonly fmt = formatKes;
  protected readonly String = String;
  protected readonly from = new FormControl(this.daysAgoIso(29), { nonNullable: true });
  protected readonly to = new FormControl(this.todayIso(), { nonNullable: true });
  protected readonly searchQuery = signal('');
  protected readonly rows = signal<StaffPerformance[]>([]);
  protected readonly previousRows = signal<StaffPerformance[]>([]);
  protected readonly daily = signal<StaffDailyPerformance[]>([]);
  protected readonly selected = signal<StaffPerformance | null>(null);
  protected readonly loading = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly filteredRows = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.rows();
    return this.rows().filter(row =>
      [row.display_name, row.role_name, row.authorization_status]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  });

  protected readonly totals = computed(() =>
    this.rows().reduce(
      (total, row) => ({
        transactions: total.transactions + row.transactions,
        grossSales: total.grossSales + row.gross_sales,
        refunds: total.refunds + row.refunds,
        voided: total.voided + row.voided_sales,
        netSales: total.netSales + row.net_sales,
        quantity: total.quantity + Number(row.quantity),
        collected: total.collected + row.collected,
        margin: total.margin + row.margin,
      }),
      {
        transactions: 0,
        grossSales: 0,
        refunds: 0,
        voided: 0,
        netSales: 0,
        quantity: 0,
        collected: 0,
        margin: 0,
      }
    )
  );
  protected readonly previousTotals = computed(() =>
    this.previousRows().reduce(
      (total, row) => ({ ...total, netSales: total.netSales + row.net_sales }),
      { netSales: 0 }
    )
  );
  protected readonly performanceStats = computed(() => [
    {
      label: 'Net sales',
      value: this.fmt(this.totals().netSales),
      mobilePriority: 'primary' as const,
    },
    {
      label: 'Collected',
      value: this.fmt(this.totals().collected),
      mobilePriority: 'primary' as const,
    },
    {
      label: 'Gross sales',
      value: this.fmt(this.totals().grossSales),
      mobilePriority: 'secondary' as const,
    },
    {
      label: 'Transactions',
      value: this.totals().transactions,
      mobilePriority: 'secondary' as const,
    },
    {
      label: 'Quantity',
      value: this.quantity(this.totals().quantity),
      mobilePriority: 'secondary' as const,
    },
    {
      label: 'Margin',
      value: this.fmt(this.totals().margin),
      tone:
        this.totals().margin < 0
          ? ('error' as const)
          : this.totals().margin > 0
            ? ('success' as const)
            : ('neutral' as const),
      mobilePriority: 'secondary' as const,
    },
    {
      label: 'Refunds + voids',
      value: this.fmt(this.totals().refunds + this.totals().voided),
      tone:
        this.totals().refunds + this.totals().voided > 0
          ? ('warning' as const)
          : ('neutral' as const),
      mobilePriority: 'secondary' as const,
    },
  ]);

  protected performanceFilterCount(): number {
    return Number(this.from.value !== this.daysAgoIso(29) || this.to.value !== this.todayIso());
  }

  protected clearPerformanceFilters(): void {
    this.from.setValue(this.daysAgoIso(29));
    this.to.setValue(this.todayIso());
    void this.load();
  }

  constructor() {
    bindListQuery({
      from: listFormQueryField(this.from),
      to: listFormQueryField(this.to),

      search: listQueryField(this.searchQuery),
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private listRequest = 0;
  protected async load(): Promise<void> {
    if (!this.from.value || !this.to.value) {
      this.error.set('Choose both dates. Showing the last applied period.');
      return;
    }
    if (this.from.value > this.to.value) {
      this.error.set('The From date must be before the To date');
      return;
    }
    const request = ++this.listRequest;
    this.loading.set(true);
    this.error.set(null);
    try {
      const previous = this.previousRange(this.from.value, this.to.value);
      const [currentRows, previousRows] = await Promise.all([
        this.performance.staff(this.from.value, this.to.value),
        this.performance.staff(previous.from, previous.to),
      ]);
      if (request !== this.listRequest) return;
      this.rows.set(currentRows);
      this.previousRows.set(previousRows);
    } catch (err) {
      if (request !== this.listRequest) return;
      this.error.set(err instanceof Error ? err.message : 'Failed to load staff performance');
    } finally {
      if (request === this.listRequest) this.loading.set(false);
    }
  }

  protected async selectStaff(staff: StaffPerformance): Promise<void> {
    if (!staff.staff_user_id) return;
    this.selected.set(staff);
    this.daily.set([]);
    this.detailLoading.set(true);
    try {
      const daily = await this.performance.daily(
        this.from.value,
        this.to.value,
        staff.staff_user_id
      );
      // Ignore stale results when the drawer was closed (or reopened) meanwhile.
      if (this.selected()?.staff_user_id !== staff.staff_user_id) return;
      this.daily.set(daily);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load daily performance');
      this.closeDetail();
    } finally {
      if (this.selected()?.staff_user_id === staff.staff_user_id) this.detailLoading.set(false);
    }
  }

  protected closeDetail(): void {
    this.selected.set(null);
    this.daily.set([]);
    this.detailLoading.set(false);
  }

  protected quantity(value: number): string {
    return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 3 });
  }

  protected previousFor(row: StaffPerformance): StaffPerformance | undefined {
    return this.previousRows().find(item => item.staff_user_id === row.staff_user_id);
  }

  protected staffComparison(row: StaffPerformance): number {
    return row.net_sales - (this.previousFor(row)?.net_sales ?? 0);
  }

  protected comparisonLabel(current: number, previous: number): string {
    if (previous === 0) return current === 0 ? '0%' : 'New';
    const value = ((current - previous) / Math.abs(previous)) * 100;
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }

  private previousRange(from: string, to: string): { from: string; to: string } {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const previousTo = new Date(start.getTime() - 86_400_000);
    const previousFrom = new Date(previousTo.getTime() - (days - 1) * 86_400_000);
    return {
      from: previousFrom.toISOString().slice(0, 10),
      to: previousTo.toISOString().slice(0, 10),
    };
  }

  private todayIso(): string {
    return this.nairobiDate(new Date());
  }

  private daysAgoIso(days: number): string {
    return this.nairobiDate(new Date(Date.now() - days * 86_400_000));
  }

  private nairobiDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
}
