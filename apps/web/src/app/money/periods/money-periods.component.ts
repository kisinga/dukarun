import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { DailyCloseStatus, PeriodClosingPack } from '@dukarun/tax-types';
import { formatKes } from '../../core/money';
import { PermissionsService } from '../../core/permissions.service';
import { TaxService, type PeriodReadiness } from '../../core/tax.service';
import { runIndependentLoads } from '../../core/independent-load';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MobileListComponent } from '../../shared/ui/mobile-list.component';
import { AccountingPeriod, MoneyService, PeriodLock } from '../money.service';

@Component({
  selector: 'app-money-periods',
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    IconComponent,
    MobileListComponent,
  ],
  template: `
    <div class="mb-3 flex items-start gap-3">
      <div>
        <h2 class="section-title">Accounting periods</h2>
        <p class="type-caption mt-1">Review period locks and close completed accounting periods.</p>
      </div>
      <button
        appButton
        variant="ghost"
        [iconOnly]="true"
        class="ml-auto"
        [loading]="loading()"
        type="button"
        title="Refresh accounting periods"
        aria-label="Refresh accounting periods"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
    </div>

    @if (error()) {
      <div role="alert" class="alert alert-error mb-3 text-sm">
        <app-icon name="heroExclamationTriangle" />
        <span>{{ error() }}</span>
      </div>
    }
    @if (notice()) {
      <div role="status" class="alert alert-success mb-3 text-sm">
        <app-icon name="heroCheckCircle" />
        <span>{{ notice() }}</span>
      </div>
    }

    @if (lock(); as l) {
      <div class="alert alert-warning mb-4">
        <app-icon name="heroLockClosed" />
        <span
          >Books are locked through <strong>{{ l.lock_end_date }}</strong
          >.</span
        >
      </div>
    }

    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="section-title">Daily preparation</h2>
            <p class="type-caption mt-1">
              Check the tills, payments, VAT, and offline devices before signing off a business day.
            </p>
          </div>
          <app-form-field label="Business date">
            <input
              type="date"
              class="input input-bordered input-sm"
              [formControl]="businessDate"
              (change)="loadDailyStatus()"
            />
          </app-form-field>
        </div>
        @if (dailyStatus(); as day) {
          <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Gross sales</p>
              <p class="font-semibold">{{ fmt(day.sales.gross) }}</p>
            </div>
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Net revenue</p>
              <p class="font-semibold">{{ fmt(day.sales.net) }}</p>
            </div>
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Output VAT</p>
              <p class="font-semibold">{{ fmt(day.sales.vat) }}</p>
            </div>
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Transactions</p>
              <p class="font-semibold">{{ day.sales.count }}</p>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span class="badge" [class.badge-success]="day.open_sessions === 0"
              >{{ day.open_sessions }} open till(s)</span
            >
            <span class="badge" [class.badge-success]="day.pending_offline === 0"
              >{{ day.pending_offline }} offline pending</span
            >
            <span class="badge" [class.badge-success]="day.pending_late_sales === 0"
              >{{ day.pending_late_sales }} late review(s)</span
            >
            @if (day.signoff?.status === 'signed_off') {
              <span class="badge badge-success">Signed off</span>
            } @else if (day.signoff?.status === 'invalidated') {
              <span class="badge badge-warning">Sign-off invalidated by a later posting</span>
            }
            @if (perms.has('ManageReconciliation') || perms.has('CloseAccountingPeriod')) {
              <button
                appButton
                size="sm"
                class="ml-auto"
                type="button"
                [loading]="dailyBusy()"
                (click)="signOffDay()"
              >
                {{ day.signoff?.status === 'signed_off' ? 'Sign off again' : 'Sign off day' }}
              </button>
            }
          </div>
        }
      </div>
    </div>

    <!-- Close period -->
    @if (perms.has('CloseAccountingPeriod')) {
      <div class="card mb-4 bg-base-100">
        <div class="card-body p-4">
          <h2 class="section-title mb-2">Monthly accounting close</h2>
          <p class="text-xs text-base-content/60">
            Close after the month has ended and every active business day is signed off. Closing
            freezes the ledger and inventory valuation, preserves a final reporting pack, and sends
            later corrections to a subsequent period. Closed periods cannot be reopened in v1.
          </p>
          <form
            (submit)="$event.preventDefault(); askClose()"
            class="mt-2 flex flex-wrap items-end gap-2"
          >
            <app-form-field label="Period end date">
              <input
                type="date"
                class="input input-bordered input-sm w-full"
                [formControl]="endDate"
              />
            </app-form-field>
            @if (confirmClose()) {
              <button appButton variant="error" type="submit" [loading]="busy()">
                Confirm close
              </button>
              <button appButton variant="ghost" type="button" (click)="confirmClose.set(false)">
                Cancel
              </button>
            } @else {
              <button appButton variant="outline" type="submit">Preview close</button>
            }
          </form>
          @if (readiness(); as preview) {
            <div class="mt-4 rounded-box border border-base-300 p-3">
              <div class="flex items-center justify-between gap-3">
                <p class="font-semibold">{{ preview.start_date }} – {{ preview.end_date }}</p>
                <span
                  class="badge"
                  [class.badge-success]="blockerEntries().length === 0"
                  [class.badge-warning]="blockerEntries().length > 0"
                >
                  {{ blockerEntries().length === 0 ? 'Ready to close' : 'Action required' }}
                </span>
              </div>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <p class="type-caption">Gross sales</p>
                  <p class="font-semibold">{{ fmt(preview.vat.sales.gross) }}</p>
                </div>
                <div>
                  <p class="type-caption">Output VAT</p>
                  <p class="font-semibold">{{ fmt(preview.vat.sales.output_vat) }}</p>
                </div>
                <div>
                  <p class="type-caption">Net VAT payable</p>
                  <p class="font-semibold">{{ fmt(preview.vat.net_vat_payable) }}</p>
                </div>
              </div>
              @if (blockerEntries().length > 0) {
                <ul class="mt-3 list-disc pl-5 text-sm text-warning">
                  @for (item of blockerEntries(); track item[0]) {
                    <li>{{ blockerLabel(item[0]) }}: {{ item[1] }}</li>
                  }
                </ul>
              }
              @if (warningEntries().length > 0) {
                <ul class="mt-2 list-disc pl-5 text-sm text-base-content/70">
                  @for (item of warningEntries(); track item[0]) {
                    <li>{{ blockerLabel(item[0]) }}: {{ item[1] }}</li>
                  }
                </ul>
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- Periods list -->
    <h2 class="section-title mb-2">Periods</h2>
    @if (periods().length === 0) {
      <app-empty-state
        icon="heroClipboardDocumentList"
        title="No periods yet"
        description="Reconcile, then close your first accounting period below."
      />
    } @else {
      <app-mobile-list>
        @for (p of periods(); track p.id) {
          <div mobileListRow>
            <div class="flex min-h-16 items-center justify-between gap-3 p-3">
              <div class="min-w-0">
                <p class="font-semibold">{{ p.start_date }} – {{ p.end_date }}</p>
                <p class="type-caption mt-0.5">Accounting period</p>
              </div>
              <app-status-badge type="neutral" [label]="p.status" />
            </div>
          </div>
        }
      </app-mobile-list>
      <div class="hidden lg:block">
        <table class="table table-sm rounded-box border border-base-300 bg-base-100">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (p of periods(); track p.id) {
              <tr>
                <td>{{ p.start_date }}</td>
                <td>{{ p.end_date }}</td>
                <td>
                  <app-status-badge type="neutral" [label]="p.status" />
                  @if (p.status === 'closed') {
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs ml-2"
                      (click)="viewPack(p.id)"
                    >
                      View pack
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
    @if (closingPack(); as pack) {
      <div class="card mt-4 bg-base-100">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="section-title">Final closing pack</h2>
              <p class="type-caption">
                {{ pack.start_date }} – {{ pack.end_date }} · immutable snapshot
              </p>
            </div>
            <div class="flex gap-2">
              <button
                appButton
                size="sm"
                variant="outline"
                type="button"
                (click)="exportPackCsv(pack)"
              >
                Export CSV</button
              ><button appButton size="sm" variant="ghost" type="button" (click)="printPack()">
                Print / PDF
              </button>
            </div>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Income</p>
              <p class="font-semibold">{{ fmt(pack.profit_and_loss.income) }}</p>
            </div>
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Expenses</p>
              <p class="font-semibold">{{ fmt(pack.profit_and_loss.expenses) }}</p>
            </div>
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Receivables</p>
              <p class="font-semibold">{{ fmt(pack.receivables) }}</p>
            </div>
            <div class="rounded-field border border-base-300 p-3">
              <p class="type-caption">Inventory value</p>
              <p class="font-semibold">{{ fmt(pack.inventory.value) }}</p>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class MoneyPeriodsComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly tax = inject(TaxService);
  protected readonly perms = inject(PermissionsService);
  protected readonly fmt = formatKes;

  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly lock = signal<PeriodLock | null>(null);
  protected readonly endDate = new FormControl(this.yesterday(), { nonNullable: true });
  protected readonly businessDate = new FormControl(this.yesterday(), { nonNullable: true });
  protected readonly dailyStatus = signal<DailyCloseStatus | null>(null);
  protected readonly readiness = signal<PeriodReadiness | null>(null);
  protected readonly closingPack = signal<PeriodClosingPack | null>(null);
  protected readonly confirmClose = signal(false);
  protected readonly busy = signal(false);
  protected readonly dailyBusy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load accounting periods',
        run: async () => {
          const periods = await this.money.periods();
          this.periods.set(periods);
          const open = periods.find(period => period.status === 'open');
          if (open) this.endDate.setValue(open.end_date);
        },
      },
      {
        fallback: 'Failed to load daily close status',
        run: async () => this.dailyStatus.set(await this.tax.dailyStatus(this.businessDate.value)),
      },
      {
        fallback: 'Failed to load the period lock',
        run: async () => this.lock.set(await this.money.periodLock()),
      },
    ]);
    this.error.set(errors.length > 0 ? errors.join('. ') : null);
    this.loading.set(false);
  }

  protected async askClose(): Promise<void> {
    if (!this.confirmClose()) {
      try {
        const readiness = await this.tax.periodReadiness(this.endDate.value);
        this.readiness.set(readiness);
        this.confirmClose.set(Object.keys(readiness.blockers).length === 0);
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'Could not preview period close');
      }
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.closeAccountingPeriod(this.endDate.value);
      this.notice.set(`Period closed through ${this.endDate.value}`);
      this.confirmClose.set(false);
      this.readiness.set(null);
      await this.load();
    } catch (err) {
      // Gate errors (reconciliation_required, open_sessions_exist, …) are
      // informative — show them verbatim.
      this.error.set(err instanceof Error ? err.message : 'Close failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async loadDailyStatus(): Promise<void> {
    try {
      this.dailyStatus.set(await this.tax.dailyStatus(this.businessDate.value));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load daily status');
    }
  }

  protected async signOffDay(): Promise<void> {
    this.dailyBusy.set(true);
    this.error.set(null);
    try {
      await this.tax.signOffDay(this.businessDate.value);
      this.notice.set(`${this.businessDate.value} signed off. A later posting will invalidate it.`);
      await this.loadDailyStatus();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not sign off the day');
    } finally {
      this.dailyBusy.set(false);
    }
  }

  protected blockerEntries(): Array<[string, number]> {
    return Object.entries(this.readiness()?.blockers ?? {});
  }

  protected warningEntries(): Array<[string, number]> {
    return Object.entries(this.readiness()?.warnings ?? {}).filter(([, count]) => count > 0);
  }

  protected blockerLabel(key: string): string {
    return key.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  }

  protected async viewPack(periodId: string): Promise<void> {
    try {
      this.closingPack.set(await this.tax.closedPeriodPack(periodId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load closing pack');
    }
  }

  protected exportPackCsv(pack: PeriodClosingPack): void {
    const vat = pack.vat as Record<string, unknown>;
    const rows: Array<[string, string | number]> = [
      ['Period start', pack.start_date],
      ['Period end', pack.end_date],
      ['Income', pack.profit_and_loss.income],
      ['Expenses', pack.profit_and_loss.expenses],
      ['Receivables', pack.receivables],
      ['Payables', pack.payables],
      ['Inventory quantity', pack.inventory.quantity],
      ['Inventory value', pack.inventory.value],
      ['Net VAT payable', Number(vat['net_vat_payable'] ?? 0)],
    ];
    const csv = ['Metric,Value', ...rows.map(([label, value]) => `"${label}","${value}"`)].join(
      '\n'
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `closing-pack-${pack.end_date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected printPack(): void {
    window.print();
  }

  private yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}
