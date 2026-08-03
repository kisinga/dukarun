import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatKes } from '../../core/money';
import { Company, PlatformService, Tier } from '../../core/platform.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

type BadgeType = 'success' | 'info' | 'warning' | 'error' | 'neutral';

type CompanyRow = Company & { subscription_tiers: { name: string; code: string } | null };

const STATUS_TYPE: Record<string, BadgeType> = {
  approved: 'success',
  unapproved: 'warning',
  disabled: 'neutral',
  banned: 'error',
};
const SUB_TYPE: Record<string, BadgeType> = {
  trial: 'info',
  active: 'success',
  expired: 'error',
  cancelled: 'neutral',
};

@Component({
  selector: 'app-companies',
  imports: [ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <app-page-header title="Companies" [subtitle]="companies().length + ' shown'">
      <button actions class="btn btn-ghost btn-sm" (click)="load()">Refresh</button>
    </app-page-header>

    <input
      type="text"
      class="input input-bordered input-sm mb-3 w-full max-w-sm"
      placeholder="Search name or code…"
      [formControl]="search"
    />

    @if (error()) {
      <p class="mb-2 text-sm text-error">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="mb-2 text-sm text-success">{{ notice() }}</p>
    }

    @if (companies().length === 0) {
      <app-empty-state
        title="No companies found"
        description="Clear the search or check back after new signups."
      />
    } @else {
      <div class="card bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Status</th>
              <th>Subscription</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (c of companies(); track c.id) {
              <tr>
                <td>
                  <button class="link font-medium" (click)="toggle(c)">{{ c.name }}</button>
                </td>
                <td class="font-mono text-xs">{{ c.code }}</td>
                <td>
                  <app-status-badge [type]="statusType(c.status)" [label]="c.status" size="xs" />
                </td>
                <td>
                  <div class="flex items-center gap-1">
                    <app-status-badge
                      [type]="subType(c.subscription_status)"
                      [label]="c.subscription_status ?? '—'"
                      size="xs"
                    />
                    <span class="text-xs text-base-content/60">
                      {{ c.subscription_tiers?.name ?? '' }}
                    </span>
                  </div>
                </td>
                <td class="type-caption">{{ date(c.created_at) }}</td>
                <td class="whitespace-nowrap text-right">
                  @if (c.status === 'unapproved') {
                    <button
                      class="btn btn-success btn-outline btn-xs"
                      [disabled]="busy()"
                      (click)="setStatus(c, 'approved')"
                    >
                      Approve
                    </button>
                  }
                  @if (c.status === 'disabled') {
                    <button
                      class="btn btn-success btn-outline btn-xs"
                      [disabled]="busy()"
                      (click)="setStatus(c, 'approved')"
                    >
                      Enable
                    </button>
                  } @else if (c.status === 'approved') {
                    <button
                      class="btn btn-warning btn-outline btn-xs"
                      [disabled]="busy()"
                      (click)="setStatus(c, 'disabled')"
                    >
                      Disable
                    </button>
                  }
                  @if (c.status !== 'banned') {
                    <button
                      class="btn btn-error btn-outline btn-xs"
                      [disabled]="busy()"
                      (click)="setStatus(c, 'banned')"
                    >
                      Ban
                    </button>
                  }
                </td>
              </tr>
              @if (expandedFor() === c.id) {
                <tr class="row-detail">
                  <td colspan="6">
                    <div class="grid gap-4 lg:grid-cols-2">
                      <div class="text-sm">
                        <h3 class="type-heading mb-1">Details</h3>
                        <dl class="space-y-1">
                          <div class="flex justify-between">
                            <dt class="text-base-content/60">Members</dt>
                            <dd class="tabular-nums">{{ counts()?.members ?? '…' }}</dd>
                          </div>
                          <div class="flex justify-between">
                            <dt class="text-base-content/60">Sales</dt>
                            <dd class="tabular-nums">{{ counts()?.orders ?? '…' }}</dd>
                          </div>
                          <div class="flex justify-between">
                            <dt class="text-base-content/60">Trial ends</dt>
                            <dd class="tabular-nums">{{ date(c.trial_ends_at) }}</dd>
                          </div>
                          <div class="flex justify-between">
                            <dt class="text-base-content/60">Sub expires</dt>
                            <dd class="tabular-nums">{{ date(c.subscription_expires_at) }}</dd>
                          </div>
                          <div class="flex justify-between">
                            <dt class="text-base-content/60">Exempt until</dt>
                            <dd class="tabular-nums">{{ date(c.subscription_exempt_until) }}</dd>
                          </div>
                          <div class="flex justify-between">
                            <dt class="text-base-content/60">Last payment</dt>
                            <dd class="tabular-nums">
                              {{
                                c.last_payment_date
                                  ? date(c.last_payment_date) +
                                    ' · ' +
                                    fmt(c.last_payment_amount ?? 0)
                                  : '—'
                              }}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div>
                        <h3 class="type-heading mb-1">Subscription override</h3>
                        <form
                          (submit)="$event.preventDefault(); saveSubscription(c)"
                          class="flex flex-col gap-2"
                        >
                          <label class="form-control">
                            <span class="label-text text-xs">Tier</span>
                            <select
                              class="select select-bordered select-sm"
                              [formControl]="subTier"
                            >
                              @for (t of tiers(); track t.id) {
                                <option [value]="t.id">{{ t.name }}</option>
                              }
                            </select>
                          </label>
                          <label class="form-control">
                            <span class="label-text text-xs">Status</span>
                            <select
                              class="select select-bordered select-sm"
                              [formControl]="subStatus"
                            >
                              <option value="">(unchanged)</option>
                              <option value="trial">trial</option>
                              <option value="active">active</option>
                              <option value="expired">expired</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                          </label>
                          <div class="flex gap-2">
                            <label class="form-control flex-1">
                              <span class="label-text text-xs">Exempt until</span>
                              <input
                                type="date"
                                class="input input-bordered input-sm"
                                [formControl]="subExemptUntil"
                              />
                            </label>
                            <label class="form-control flex-1">
                              <span class="label-text text-xs">Expires at</span>
                              <input
                                type="date"
                                class="input input-bordered input-sm"
                                [formControl]="subExpiresAt"
                              />
                            </label>
                          </div>
                          <label class="form-control">
                            <span class="label-text text-xs">Exemption reason</span>
                            <input
                              type="text"
                              class="input input-bordered input-sm"
                              [formControl]="subExemptReason"
                            />
                          </label>
                          <button
                            type="submit"
                            class="btn btn-primary btn-sm min-h-11 self-start"
                            [disabled]="busy()"
                          >
                            {{ busy() ? 'Saving…' : 'Apply override' }}
                          </button>
                        </form>
                      </div>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class CompaniesComponent implements OnInit {
  private readonly platform = inject(PlatformService);

  protected readonly fmt = formatKes;
  protected readonly companies = signal<CompanyRow[]>([]);
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly counts = signal<{ members: number; orders: number } | null>(null);
  protected readonly search = new FormControl('', { nonNullable: true });

  protected readonly subTier = new FormControl('', { nonNullable: true });
  protected readonly subStatus = new FormControl('', { nonNullable: true });
  protected readonly subExemptUntil = new FormControl('', { nonNullable: true });
  protected readonly subExpiresAt = new FormControl('', { nonNullable: true });
  protected readonly subExemptReason = new FormControl('', { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => void this.load());
  }

  async ngOnInit(): Promise<void> {
    try {
      this.tiers.set(await this.platform.tiers());
    } catch {
      // tier select just stays empty
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.companies.set((await this.platform.companies(this.search.value)) as CompanyRow[]);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load companies');
    }
  }

  protected async toggle(c: CompanyRow): Promise<void> {
    if (this.expandedFor() === c.id) {
      this.expandedFor.set(null);
      return;
    }
    this.expandedFor.set(c.id);
    this.counts.set(null);
    this.subTier.setValue(c.subscription_tier_id ?? this.tiers()[0]?.id ?? '');
    this.subStatus.setValue('');
    this.subExemptUntil.setValue('');
    this.subExpiresAt.setValue('');
    this.subExemptReason.setValue('');
    try {
      this.counts.set(await this.platform.companyCounts(c.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load details');
    }
  }

  protected async setStatus(c: CompanyRow, status: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.setCompanyStatus(c.id, status);
      this.notice.set(`${c.name} → ${status}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveSubscription(c: CompanyRow): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.updateSubscription(c.id, {
        ...(this.subTier.value ? { tier_id: this.subTier.value } : {}),
        ...(this.subStatus.value ? { subscription_status: this.subStatus.value } : {}),
        ...(this.subExemptUntil.value ? { exempt_until: this.subExemptUntil.value } : {}),
        ...(this.subExemptReason.value.trim()
          ? { exempt_reason: this.subExemptReason.value.trim() }
          : {}),
        ...(this.subExpiresAt.value ? { expires_at: this.subExpiresAt.value } : {}),
      });
      this.notice.set(`Subscription updated for ${c.name}`);
      this.expandedFor.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected statusType(status: string): BadgeType {
    return STATUS_TYPE[status] ?? 'neutral';
  }

  protected subType(status: string | null): BadgeType {
    return SUB_TYPE[status ?? ''] ?? 'neutral';
  }

  protected date(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
