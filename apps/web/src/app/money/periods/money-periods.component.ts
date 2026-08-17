import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PermissionsService } from '../../core/permissions.service';
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

    <!-- Close period -->
    @if (perms.has('CloseAccountingPeriod')) {
      <div class="card mb-4 bg-base-100">
        <div class="card-body p-4">
          <h2 class="section-title mb-2">Close accounting period</h2>
          <p class="text-xs text-base-content/60">
            Closing locks all posting through the end date. The backend gates this on
            reconciliations and open sessions — its messages are shown verbatim.
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
              <button appButton variant="outline" type="submit">Close period</button>
            }
          </form>
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
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class MoneyPeriodsComponent implements OnInit {
  private readonly money = inject(MoneyService);
  protected readonly perms = inject(PermissionsService);

  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly lock = signal<PeriodLock | null>(null);
  protected readonly endDate = new FormControl(this.yesterday(), { nonNullable: true });
  protected readonly confirmClose = signal(false);
  protected readonly busy = signal(false);
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
        run: async () => this.periods.set(await this.money.periods()),
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
      this.confirmClose.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.closeAccountingPeriod(this.endDate.value);
      this.notice.set(`Period closed through ${this.endDate.value}`);
      this.confirmClose.set(false);
      await this.load();
    } catch (err) {
      // Gate errors (reconciliation_required, open_sessions_exist, …) are
      // informative — show them verbatim.
      this.error.set(err instanceof Error ? err.message : 'Close failed');
    } finally {
      this.busy.set(false);
    }
  }

  private yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}
