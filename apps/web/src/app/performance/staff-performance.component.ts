import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
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

@Component({
  selector: 'app-staff-performance',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    DataTableShellComponent,
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
  ],
  template: `
    <app-page
      title="Staff performance"
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

      <app-list-search-bar
        placeholder="Search name, role, or status…"
        [searchQuery]="searchQuery()"
        (searchQueryChange)="searchQuery.set($event)"
        [filtersEnabled]="true"
        [activeFilterCount]="performanceFilterCount()"
        (clearFilters)="clearPerformanceFilters()"
        filterSheetTitle="Performance period"
      >
        <app-stat-bar summary [stats]="performanceStats()" />
        <div filters class="grid grid-cols-2 gap-3 md:flex md:items-end">
          <app-form-field label="From">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [formControl]="from"
              (change)="load()"
            />
          </app-form-field>
          <app-form-field label="To">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [formControl]="to"
              (change)="load()"
            />
          </app-form-field>
        </div>
      </app-list-search-bar>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-4 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }

      @if (!loading() && filteredRows().length === 0) {
        <app-empty-state
          [compact]="true"
          icon="heroChartBar"
          title="No staff sales in this range"
          description="Try a wider date range or complete the first sale."
        />
      } @else {
        <app-mobile-list>
          @for (row of filteredRows(); track row.staff_user_id ?? row.display_name) {
            <button
              mobileListRow
              type="button"
              class="flex min-h-20 w-full items-center gap-3 p-3 text-left"
              [class.bg-base-200/50]="selected()?.staff_user_id === row.staff_user_id"
              (click)="selectStaff(row)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate font-semibold">{{ row.display_name }}</span>
                  <app-status-badge
                    size="xs"
                    [type]="row.authorization_status === 'approved' ? 'neutral' : 'warning'"
                    [label]="row.authorization_status"
                  />
                </div>
                <p class="type-caption mt-1 truncate">
                  {{ row.role_name || 'No current role' }} · {{ row.transactions }} transactions
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-semibold tabular-nums"><app-money [amount]="row.net_sales" /></p>
                <p class="type-caption">collected <app-money [amount]="row.collected" /></p>
              </div>
            </button>
          }
        </app-mobile-list>
        <div class="hidden lg:block">
          <app-data-table-shell
            heading="Salesperson leaderboard"
            [description]="filteredRows().length + ' staff records · click a row for daily detail'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th class="text-right">Transactions</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Gross sales</th>
                  <th class="text-right">Refunds / voids</th>
                  <th class="text-right">Net sales</th>
                  <th class="text-right">Vs previous</th>
                  <th class="text-right">Collected</th>
                  <th class="text-right">Margin</th>
                  <th class="text-right">Average</th>
                  <th class="text-right">Held (unpaid)</th>
                  <th class="text-right">Held value</th>
                </tr>
              </thead>
              <tbody>
                @for (row of filteredRows(); track row.staff_user_id ?? row.display_name) {
                  <tr
                    role="button"
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
                    </td>
                    <td class="text-right">{{ row.transactions }}</td>
                    <td class="text-right">{{ quantity(row.quantity) }}</td>
                    <td class="text-right"><app-money [amount]="row.gross_sales" /></td>
                    <td class="text-right text-warning">
                      <app-money [amount]="row.refunds + row.voided_sales" />
                    </td>
                    <td class="text-right font-semibold"><app-money [amount]="row.net_sales" /></td>
                    <td
                      class="text-right"
                      [class.text-success]="staffComparison(row) >= 0"
                      [class.text-error]="staffComparison(row) < 0"
                    >
                      {{ comparisonLabel(row.net_sales, previousFor(row)?.net_sales ?? 0) }}
                    </td>
                    <td class="text-right"><app-money [amount]="row.collected" /></td>
                    <td
                      class="text-right"
                      [class.text-success]="row.margin > 0"
                      [class.text-error]="row.margin < 0"
                    >
                      <app-money [amount]="row.margin" />
                    </td>
                    <td class="text-right"><app-money [amount]="row.average_sale" /></td>
                    <td class="text-right" [class.text-warning]="row.held_count > 0">
                      {{ row.held_count }}
                    </td>
                    <td class="text-right" [class.text-warning]="row.held_value > 0">
                      <app-money [amount]="row.held_value" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
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
      tone: this.totals().margin < 0 ? ('error' as const) : ('success' as const),
      mobilePriority: 'secondary' as const,
    },
    {
      label: 'Refunds + voids',
      value: this.fmt(this.totals().refunds + this.totals().voided),
      tone: 'warning' as const,
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

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    if (this.from.value > this.to.value) {
      this.error.set('The From date must be before the To date');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const previous = this.previousRange(this.from.value, this.to.value);
      const [currentRows, previousRows] = await Promise.all([
        this.performance.staff(this.from.value, this.to.value),
        this.performance.staff(previous.from, previous.to),
      ]);
      this.rows.set(currentRows);
      this.previousRows.set(previousRows);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load staff performance');
    } finally {
      this.loading.set(false);
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
