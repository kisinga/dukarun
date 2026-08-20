import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  Company,
  FailedOutboxRow,
  OperationsSnapshot,
  PlatformService,
  RegistrationAlert,
  RegistrationConfig,
} from '../../core/platform.service';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';

@Component({
  selector: 'app-operations',
  imports: [RouterLink, NgIcon, PageHeaderComponent, EmptyStateComponent, DataTableShellComponent],
  template: `
    <app-page-header title="Operations" subtitle="Registration, accounting and delivery health">
      <button
        actions
        class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11"
        title="Refresh operations"
        aria-label="Refresh operations"
        [disabled]="loading()"
        (click)="load()"
      >
        <ng-icon name="heroArrowPath" [class.animate-spin]="loading()" />
      </button>
    </app-page-header>
    @if (error()) {
      <div class="alert alert-error mb-4" role="alert">
        <span>{{ error() }}</span>
      </div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-4" role="status">
        <span>{{ notice() }}</span>
      </div>
    }
    @if (snapshot(); as stats) {
      <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        @for (stat of cards(stats); track stat.label) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <span class="type-caption">{{ stat.label }}</span
              ><strong class="type-hero" [class.text-error]="stat.danger && stat.value > 0">{{
                stat.value
              }}</strong>
            </div>
          </div>
        }
      </div>
    }
    @if (registration(); as config) {
      <section class="card mb-4 border border-warning/30 bg-base-100">
        <div class="card-body gap-4 p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="type-heading">Automatic registration approval</h2>
                <span
                  class="badge"
                  [class.badge-success]="config.automatic_company_approval_enabled"
                  [class.badge-ghost]="!config.automatic_company_approval_enabled"
                >
                  {{ config.automatic_company_approval_enabled ? 'On' : 'Manual' }}
                </span>
              </div>
              <p class="type-caption mt-1 max-w-2xl">
                When enabled, every newly created company is approved immediately and proceeds to
                the required first payment. Existing pending registrations stay in review.
              </p>
            </div>
            <input
              type="checkbox"
              class="toggle toggle-success"
              [checked]="config.automatic_company_approval_enabled"
              [disabled]="registrationSaving()"
              (change)="toggleAutomatic($any($event.target).checked)"
              aria-label="Automatic registration approval"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="form-control">
              <span class="label-text text-xs">Hourly warning</span>
              <input
                type="number"
                min="1"
                class="input input-bordered input-sm"
                [value]="config.hourly_alert_threshold"
                (change)="setRegistrationThreshold('hourly', $any($event.target).value)"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Daily warning</span>
              <input
                type="number"
                min="1"
                class="input input-bordered input-sm"
                [value]="config.daily_alert_threshold"
                (change)="setRegistrationThreshold('daily', $any($event.target).value)"
              />
            </label>
            <div class="rounded-field bg-base-200 p-3">
              <p class="type-caption">Automatic · last hour</p>
              <strong class="text-xl">{{ config.automatic_last_hour }}</strong>
            </div>
            <div class="rounded-field bg-base-200 p-3">
              <p class="type-caption">Automatic · last 24 hours</p>
              <strong class="text-xl">{{ config.automatic_last_day }}</strong>
            </div>
          </div>
          @if (
            config.automatic_last_hour >= config.hourly_alert_threshold ||
            config.automatic_last_day >= config.daily_alert_threshold
          ) {
            <div class="alert alert-warning py-2 text-sm">
              Registration volume is above its configured warning threshold.
            </div>
          }
        </div>
      </section>
    }
    @if (unacknowledgedAlerts().length) {
      <section class="card mb-4 border border-warning bg-warning/10">
        <div class="card-body gap-3 p-4">
          <h2 class="type-heading">Registration volume alerts</h2>
          @for (alert of unacknowledgedAlerts(); track alert.id) {
            <div
              class="flex flex-wrap items-center justify-between gap-3 rounded-field bg-base-100 p-3"
            >
              <div>
                <strong>{{ alert.approval_count }} automatic approvals</strong>
                <p class="type-caption">
                  {{ alert.alert_window }} window · threshold {{ alert.threshold }} ·
                  {{ date(alert.window_started_at) }}
                </p>
              </div>
              <button class="btn btn-ghost btn-sm" (click)="acknowledgeAlert(alert)">
                Acknowledge
              </button>
            </div>
          }
        </div>
      </section>
    }
    <div class="grid gap-4 xl:grid-cols-2">
      <section class="card bg-base-100">
        <div class="card-body p-4">
          <h2 class="type-heading">Pending registrations</h2>
          <div class="mt-2 divide-y divide-base-200">
            @for (company of pending(); track company.id) {
              <div class="flex items-center gap-2 py-2">
                <span class="min-w-0 flex-1">
                  <strong class="block truncate">{{ company.name }}</strong>
                  <span class="type-caption">
                    {{ company.code }} · {{ date(company.created_at) }}
                  </span>
                </span>
                <button
                  class="btn btn-outline btn-sm min-h-11"
                  [disabled]="approvingId() !== null"
                  (click)="approve(company)"
                >
                  @if (approvingId() === company.id) {
                    <span class="loading loading-spinner loading-sm"></span>
                  }
                  {{ approvingId() === company.id ? 'Approving…' : 'Approve' }}
                </button>
              </div>
            } @empty {
              <app-empty-state
                [embedded]="true"
                title="All caught up"
                description="No registrations are waiting for approval."
              />
            }
          </div>
        </div>
      </section>
      <section class="card bg-base-100">
        <div class="card-body p-4">
          <h2 class="type-heading">Platform broadcast</h2>
          <p class="type-caption">
            Draft, review, schedule, and measure merchant-admin campaigns in one place.
          </p>
          <a routerLink="/communications" class="btn btn-primary btn-sm min-h-11 self-start"
            >Open communications</a
          >
        </div>
      </section>
      <section class="xl:col-span-2">
        <div class="hidden md:block">
          <app-data-table-shell
            title="Failed outbound messages"
            description="Delivery attempts that need investigation"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Company</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Error</th>
                  <th class="text-right">Attempts</th>
                </tr>
              </thead>
              <tbody>
                @for (row of failures(); track row.id) {
                  <tr>
                    <td>{{ date(row.created_at) }}</td>
                    <td>{{ row.companies?.name || row.company_id }}</td>
                    <td>{{ row.channel }}</td>
                    <td>{{ row.recipient }}</td>
                    <td class="max-w-md truncate text-error">{{ row.error }}</td>
                    <td class="text-right">{{ row.attempts }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="py-8 text-center text-base-content/60">
                      No failed messages. Delivery is healthy.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>
        <div class="space-y-3 md:hidden">
          <h2 class="section-title">Failed outbound messages</h2>
          @for (row of failures(); track row.id) {
            <article class="card bg-base-100 p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold">
                    {{ row.companies?.name || row.company_id }}
                  </p>
                  <p class="type-caption mt-0.5">{{ row.channel }} · {{ date(row.created_at) }}</p>
                </div>
                <span class="badge badge-error badge-sm">{{ row.attempts }} attempts</span>
              </div>
              <p class="mt-3 text-sm text-error">{{ row.error }}</p>
              <p class="type-caption mt-2 truncate">{{ row.recipient }}</p>
            </article>
          } @empty {
            <app-empty-state
              [embedded]="true"
              title="Delivery is healthy"
              description="There are no failed outbound messages."
            />
          }
        </div>
      </section>
    </div>
  `,
})
export class OperationsComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly snapshot = signal<OperationsSnapshot | null>(null);
  protected readonly pending = signal<Company[]>([]);
  protected readonly failures = signal<FailedOutboxRow[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly approvingId = signal<string | null>(null);
  protected readonly registration = signal<RegistrationConfig | null>(null);
  protected readonly registrationAlerts = signal<RegistrationAlert[]>([]);
  protected readonly unacknowledgedAlerts = () =>
    this.registrationAlerts().filter(alert => !alert.acknowledged_at);
  protected readonly registrationSaving = signal(false);
  async ngOnInit(): Promise<void> {
    await this.load();
  }
  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [snapshot, pending, failures, registration, alerts] = await Promise.all([
        this.platform.operationsSnapshot(),
        this.platform.pendingCompanies(),
        this.platform.failedOutbox(),
        this.platform.registrationConfig(),
        this.platform.registrationAlerts(),
      ]);
      this.snapshot.set(snapshot);
      this.pending.set(pending);
      this.failures.set(failures);
      this.registration.set(registration);
      this.registrationAlerts.set(alerts);
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Load failed');
    } finally {
      this.loading.set(false);
    }
  }
  protected cards(s: OperationsSnapshot) {
    return [
      { label: 'Pending companies', value: s.pending_companies, danger: false },
      { label: 'Active memberships', value: s.active_memberships, danger: false },
      { label: 'Failed messages', value: s.failed_outbox, danger: true },
      { label: 'Unbalanced journals', value: s.unbalanced_journals, danger: true },
    ];
  }
  protected async approve(company: Company): Promise<void> {
    this.approvingId.set(company.id);
    this.error.set(null);
    try {
      await this.platform.setCompanyStatus(company.id, 'approved');
      this.notice.set(company.name + ' approved');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Approval failed');
    } finally {
      this.approvingId.set(null);
    }
  }
  protected async toggleAutomatic(enabled: boolean): Promise<void> {
    const current = this.registration();
    if (!current) return;
    if (
      enabled &&
      !confirm(
        'Enable immediate approval for every future company registration? Existing pending registrations will not change.'
      )
    ) {
      this.registration.set({ ...current });
      return;
    }
    await this.saveRegistration(
      enabled,
      current.hourly_alert_threshold,
      current.daily_alert_threshold
    );
  }
  protected async setRegistrationThreshold(kind: 'hourly' | 'daily', raw: string): Promise<void> {
    const current = this.registration();
    const value = Math.max(1, Math.trunc(Number(raw)));
    if (!current || !Number.isFinite(value)) return;
    await this.saveRegistration(
      current.automatic_company_approval_enabled,
      kind === 'hourly' ? value : current.hourly_alert_threshold,
      kind === 'daily' ? value : current.daily_alert_threshold
    );
  }
  protected async acknowledgeAlert(alert: RegistrationAlert): Promise<void> {
    try {
      await this.platform.acknowledgeRegistrationAlert(alert.id);
      this.registrationAlerts.update(alerts =>
        alerts.map(item =>
          item.id === alert.id ? { ...item, acknowledged_at: new Date().toISOString() } : item
        )
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Alert could not be acknowledged');
    }
  }
  private async saveRegistration(
    automatic: boolean,
    hourlyThreshold: number,
    dailyThreshold: number
  ): Promise<void> {
    this.registrationSaving.set(true);
    this.error.set(null);
    try {
      this.registration.set(
        await this.platform.updateRegistrationConfig({ automatic, hourlyThreshold, dailyThreshold })
      );
      this.notice.set(
        automatic
          ? 'Automatic registration approval enabled'
          : 'Registrations now require manual approval'
      );
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Registration settings could not be saved'
      );
      await this.load();
    } finally {
      this.registrationSaving.set(false);
    }
  }
  protected date(value: string): string {
    return new Date(value).toLocaleString('en-KE');
  }
}
