import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PerformanceService, StaffDailyPerformance, StaffPerformance } from './performance.service';

@Component({
  selector: 'app-staff-performance',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    DataTableShellComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    PageLayoutComponent,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  template: `
    <app-page
      title="Staff performance"
      subtitle="Sales value, volume, collections, refunds, voids, and margin by salesperson."
      [wide]="true"
    >
      <button
        actions
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

      <div class="card mb-4 bg-base-100">
        <div class="card-body flex-row flex-wrap items-end gap-3 p-4">
          <app-form-field label="From">
            <input type="date" class="input input-bordered input-sm" [formControl]="from" />
          </app-form-field>
          <app-form-field label="To">
            <input type="date" class="input input-bordered input-sm" [formControl]="to" />
          </app-form-field>
          <app-form-field label="Find staff" class="min-w-56 flex-1">
            <input
              type="search"
              class="input input-bordered input-sm w-full"
              placeholder="Name, role, or status…"
              [formControl]="search"
            />
          </app-form-field>
          <button appButton type="button" [loading]="loading()" (click)="load()">Apply</button>
        </div>
      </div>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-4 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }

      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <app-stat-card
          label="Net sales"
          [value]="fmt(totals().netSales)"
          [sub]="
            comparisonLabel(totals().netSales, previousTotals().netSales) + ' vs previous period'
          "
        />
        <app-stat-card
          label="Gross sales"
          [value]="fmt(totals().grossSales)"
          sub="Completed checkouts"
        />
        <app-stat-card
          label="Transactions"
          [value]="String(totals().transactions)"
          sub="Completed checkouts"
        />
        <app-stat-card
          label="Quantity"
          [value]="quantity(totals().quantity)"
          sub="Net sold line quantity"
        />
        <app-stat-card
          label="Collected"
          [value]="fmt(totals().collected)"
          sub="Net payment events"
        />
        <app-stat-card
          label="Margin"
          [value]="fmt(totals().margin)"
          sub="Net sales less COGS"
          [tone]="totals().margin < 0 ? 'error' : 'success'"
        />
        <app-stat-card
          label="Refunds + voids"
          [value]="fmt(totals().refunds + totals().voided)"
          sub="Reversed value"
          tone="warning"
        />
      </div>

      @if (!loading() && filteredRows().length === 0) {
        <app-empty-state
          [compact]="true"
          icon="heroChartBar"
          title="No staff sales in this range"
          description="Try a wider date range or complete the first sale."
        />
      } @else {
        <app-data-table-shell
          title="Salesperson leaderboard"
          [description]="filteredRows().length + ' staff records · click a name for daily detail'"
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
              </tr>
            </thead>
            <tbody>
              @for (row of filteredRows(); track row.staff_user_id ?? row.display_name) {
                <tr>
                  <td>
                    <button
                      type="button"
                      class="link text-left font-semibold"
                      [disabled]="!row.staff_user_id"
                      (click)="selectStaff(row)"
                    >
                      {{ row.display_name }}
                    </button>
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
                </tr>
              }
            </tbody>
          </table>
        </app-data-table-shell>
      }

      @if (selected(); as staff) {
        <div
          class="modal modal-open"
          role="dialog"
          aria-modal="true"
          aria-label="Staff daily performance"
        >
          <div class="modal-box max-w-4xl">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="section-title">{{ staff.display_name }}</h2>
                <p class="type-caption mt-1">
                  Daily sales movement from {{ from.value }} to {{ to.value }}
                </p>
              </div>
              <button
                appButton
                variant="ghost"
                [iconOnly]="true"
                aria-label="Close"
                (click)="closeDetail()"
              >
                <app-icon name="heroXMark" />
              </button>
            </div>

            @if (detailLoading()) {
              <div class="flex min-h-36 items-center justify-center">
                <span class="loading loading-spinner loading-md"></span>
              </div>
            } @else {
              <div class="table-scroll mt-4">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th class="text-right">Transactions</th>
                      <th class="text-right">Quantity</th>
                      <th class="text-right">Gross</th>
                      <th class="text-right">Refunds / voids</th>
                      <th class="text-right">Net sales</th>
                      <th class="text-right">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (day of daily(); track day.day) {
                      <tr>
                        <td>{{ day.day }}</td>
                        <td class="text-right">{{ day.transactions }}</td>
                        <td class="text-right">{{ quantity(day.quantity) }}</td>
                        <td class="text-right"><app-money [amount]="day.gross_sales" /></td>
                        <td class="text-right">
                          <app-money [amount]="day.refunds + day.voided_sales" />
                        </td>
                        <td class="text-right font-semibold">
                          <app-money [amount]="day.net_sales" />
                        </td>
                        <td class="text-right"><app-money [amount]="day.collected" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
          <button
            class="modal-backdrop"
            type="button"
            aria-label="Close"
            (click)="closeDetail()"
          ></button>
        </div>
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
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly rows = signal<StaffPerformance[]>([]);
  protected readonly previousRows = signal<StaffPerformance[]>([]);
  protected readonly daily = signal<StaffDailyPerformance[]>([]);
  protected readonly selected = signal<StaffPerformance | null>(null);
  protected readonly loading = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly filteredRows = computed(() => {
    const query = this.search.value.trim().toLowerCase();
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
    this.detailLoading.set(true);
    try {
      this.daily.set(
        await this.performance.daily(this.from.value, this.to.value, staff.staff_user_id)
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load daily performance');
      this.closeDetail();
    } finally {
      this.detailLoading.set(false);
    }
  }

  protected closeDetail(): void {
    this.selected.set(null);
    this.daily.set([]);
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
