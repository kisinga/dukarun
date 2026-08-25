import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import {
  Company,
  CompanyLegalStatus,
  PlatformService,
  Tier,
  TrialAccessRequestRow,
} from '../../core/platform.service';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { ListSearchBarComponent } from '../../shared/ui/list-search-bar.component';
import { MoneyComponent } from '../../shared/ui/money.component';
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
  active: 'success',
  expired: 'error',
  cancelled: 'neutral',
};
const LEGAL_TYPE: Record<string, BadgeType> = {
  accepted: 'success',
  grace_period: 'warning',
  blocked: 'error',
  not_required: 'neutral',
};

@Component({
  selector: 'app-companies',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    PageHeaderComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    DataTableShellComponent,
    DrawerComponent,
    FormFieldComponent,
    ListSearchBarComponent,
    MoneyComponent,
  ],
  template: `
    <app-page-header title="Companies" subtitle="Manage tenant access and subscriptions">
      <button
        actions
        class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11"
        title="Refresh companies"
        aria-label="Refresh companies"
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

    <app-list-search-bar [control]="search" placeholder="Search name or company code">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span class="inline-flex items-baseline gap-1.5 border-r border-base-300 pr-4">
          <strong class="tabular-nums">{{ companies().length }}</strong>
          <span class="type-caption">shown</span>
        </span>
        <span class="inline-flex items-baseline gap-1.5">
          <strong class="tabular-nums text-warning">{{ pendingCount() }}</strong>
          <span class="type-caption">pending approval</span>
        </span>
      </div>
    </app-list-search-bar>

    @if (trialRequests().length > 0) {
      <section class="mb-4 rounded-box border border-base-300 bg-base-100 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="section-title">Trial requests</h2>
            <p class="type-caption mt-1">Approve temporary access with a required expiry date.</p>
          </div>
          <span class="badge badge-warning">{{ trialRequests().length }} pending</span>
        </div>
        <div class="mt-4 grid gap-3 lg:grid-cols-2">
          @for (request of trialRequests(); track request.id) {
            <article class="rounded-box border border-base-300 p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-semibold">{{ request.company_name }}</p>
                  <p class="type-caption font-mono">{{ request.company_code }}</p>
                </div>
                <app-status-badge type="warning" label="pending" size="sm" />
              </div>
              <p class="mt-3 text-sm">{{ request.reason }}</p>
              <p class="type-caption mt-2">
                Requested {{ request.requested_days }} days · {{ date(request.created_at) }}
              </p>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <app-form-field label="Tier">
                  <select
                    class="select select-bordered select-sm w-full"
                    [value]="trialDraft(request).tierId"
                    (change)="setTrialDraft(request.id, 'tierId', inputValue($event))"
                  >
                    @for (tier of activeTiers(); track tier.id) {
                      <option [value]="tier.id">{{ tier.name }}</option>
                    }
                  </select>
                </app-form-field>
                <app-form-field label="Grant until">
                  <input
                    type="date"
                    class="input input-bordered input-sm w-full"
                    [value]="trialDraft(request).grantedUntil"
                    (input)="setTrialDraft(request.id, 'grantedUntil', inputValue($event))"
                  />
                </app-form-field>
              </div>
              <app-form-field label="Decision note" class="mt-2 block">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  placeholder="Optional internal/customer note"
                  [value]="trialDraft(request).note"
                  (input)="setTrialDraft(request.id, 'note', inputValue($event))"
                />
              </app-form-field>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn btn-primary btn-sm min-h-11"
                  [disabled]="
                    busy() || !trialDraft(request).tierId || !trialDraft(request).grantedUntil
                  "
                  (click)="reviewTrialRequest(request, 'approved')"
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="btn btn-outline btn-sm min-h-11"
                  [disabled]="busy()"
                  (click)="reviewTrialRequest(request, 'rejected')"
                >
                  Reject
                </button>
              </div>
            </article>
          }
        </div>
      </section>
    }

    @if (!loading() && companies().length === 0) {
      <app-empty-state
        title="No companies found"
        description="Try a different search, or check back after new signups."
      />
    } @else {
      <div class="hidden md:block">
        <app-data-table-shell>
          <table class="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Subscription</th>
                <th>Terms</th>
                <th>Created</th>
                <th class="w-12"><span class="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              @for (company of companies(); track company.id) {
                <tr
                  role="button"
                  tabindex="0"
                  [class.table-row-active]="selected()?.id === company.id"
                  (click)="openCompany(company)"
                  (keydown.enter)="openCompany(company)"
                >
                  <td>
                    <p class="table-primary">{{ company.name }}</p>
                    <p class="table-secondary font-mono">{{ company.code }}</p>
                  </td>
                  <td>
                    <app-status-badge
                      [type]="statusType(company.status)"
                      [label]="company.status"
                      size="sm"
                    />
                  </td>
                  <td>
                    <div class="flex items-center gap-2">
                      <app-status-badge
                        [type]="subType(company.subscription_status)"
                        [label]="company.subscription_status ?? 'none'"
                        size="sm"
                      />
                      <span class="type-caption">{{ company.subscription_tiers?.name }}</span>
                    </div>
                  </td>
                  <td>
                    <app-status-badge
                      [type]="legalType(legalStatus(company.id)?.legal_status)"
                      [label]="legalLabel(legalStatus(company.id))"
                      size="sm"
                    />
                  </td>
                  <td class="type-caption">{{ date(company.created_at) }}</td>
                  <td class="text-right text-base-content/40">
                    <ng-icon name="heroChevronRight" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </app-data-table-shell>
      </div>

      <div class="space-y-3 md:hidden">
        @for (company of companies(); track company.id) {
          <button
            type="button"
            class="card w-full bg-base-100 p-4 text-left"
            (click)="openCompany(company)"
          >
            <span class="flex items-start gap-3">
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-sm">{{ company.name }}</strong>
                <span class="type-caption mt-0.5 block font-mono">{{ company.code }}</span>
              </span>
              <ng-icon name="heroChevronRight" class="mt-1 text-base-content/40" />
            </span>
            <span class="mt-3 flex flex-wrap items-center gap-2">
              <app-status-badge
                [type]="statusType(company.status)"
                [label]="company.status"
                size="sm"
              />
              <app-status-badge
                [type]="subType(company.subscription_status)"
                [label]="company.subscription_status ?? 'none'"
                size="sm"
              />
              @if (company.subscription_tiers?.name) {
                <span class="type-caption">{{ company.subscription_tiers?.name }}</span>
              }
              <app-status-badge
                [type]="legalType(legalStatus(company.id)?.legal_status)"
                [label]="legalLabel(legalStatus(company.id))"
                size="sm"
              />
            </span>
          </button>
        }
      </div>
    }

    @if (selected(); as company) {
      <app-drawer
        [open]="drawerOpen()"
        (openChange)="drawerOpen.set($event)"
        [title]="company.name"
        [subtitle]="company.code"
        (closed)="clearSelected()"
      >
        @if (company.status === 'unapproved' || company.status === 'disabled') {
          <button
            actions
            type="button"
            class="btn btn-primary btn-sm min-h-11"
            [disabled]="busy()"
            (click)="setStatus(company, 'approved')"
          >
            {{ company.status === 'disabled' ? 'Enable' : 'Approve' }}
          </button>
        }

        <div class="space-y-6">
          <section>
            <div class="flex flex-wrap items-center gap-2">
              <app-status-badge
                [type]="statusType(company.status)"
                [label]="company.status"
                size="sm"
              />
              <app-status-badge
                [type]="subType(company.subscription_status)"
                [label]="company.subscription_status ?? 'no subscription'"
                size="sm"
              />
              @if (company.subscription_tiers?.name) {
                <span class="type-caption">{{ company.subscription_tiers?.name }} tier</span>
              }
              <app-status-badge
                [type]="legalType(legalStatus(company.id)?.legal_status)"
                [label]="legalLabel(legalStatus(company.id))"
                size="sm"
              />
            </div>

            <div class="mt-4 grid grid-cols-2 gap-3">
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Members</p>
                @if (counts(); as totals) {
                  <p class="type-hero mt-1">{{ totals.members }}</p>
                } @else {
                  <div class="skeleton mt-2 h-7 w-12"></div>
                }
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Sales</p>
                @if (counts(); as totals) {
                  <p class="type-hero mt-1">{{ totals.orders }}</p>
                } @else {
                  <div class="skeleton mt-2 h-7 w-12"></div>
                }
              </div>
            </div>
          </section>

          <section class="border-t border-base-300/60 pt-5">
            <h3 class="section-title">Subscription details</h3>
            <dl class="mt-3 divide-y divide-base-200">
              <div class="flex items-center justify-between gap-4 py-2.5">
                <dt class="type-caption">Subscription expires</dt>
                <dd class="text-sm tabular-nums">{{ date(company.subscription_expires_at) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5">
                <dt class="type-caption">Exempt until</dt>
                <dd class="text-sm tabular-nums">{{ date(company.subscription_exempt_until) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5">
                <dt class="type-caption">Last payment</dt>
                <dd class="text-right text-sm">
                  @if (company.last_payment_date) {
                    <app-money [amount]="company.last_payment_amount ?? 0" [showCurrency]="true" />
                    <span class="type-caption mt-0.5 block">{{
                      date(company.last_payment_date)
                    }}</span>
                  } @else {
                    Not set
                  }
                </dd>
              </div>
            </dl>
          </section>

          <section class="border-t border-base-300/60 pt-5">
            <h3 class="section-title">Subscription override</h3>
            <p class="type-caption mt-1">Changes apply immediately to this tenant.</p>
            <form
              class="mt-4 space-y-3"
              (submit)="$event.preventDefault(); saveSubscription(company)"
            >
              <app-form-field label="Tier">
                <select class="select select-bordered w-full" [formControl]="subTier">
                  @for (tier of tiers(); track tier.id) {
                    <option [value]="tier.id">{{ tier.code }}: {{ tier.name }}</option>
                  }
                </select>
              </app-form-field>
              @if (tierImpact(company); as impact) {
                @if (impact.length > 0) {
                  <div class="alert alert-warning text-sm">
                    <span>
                      This change removes {{ impact.join(', ') }}.
                      @if (impact.includes('storefront')) {
                        The full catalogue remains available for seven days, then becomes
                        contact-only.
                      }
                    </span>
                  </div>
                }
              }
              <div class="rounded-box bg-base-200 p-3 text-sm">
                <p class="font-medium">Communication usage</p>
                <p class="type-caption mt-1">
                  SMS: {{ company.sms_used_this_period }} used,
                  {{ company.sms_reserved_this_period }} reserved · WhatsApp:
                  {{ company.whatsapp_used_this_period }} used,
                  {{ company.whatsapp_reserved_this_period }} reserved
                </p>
              </div>
              <app-form-field label="Status">
                <select class="select select-bordered w-full" [formControl]="subStatus">
                  <option value="">Leave unchanged</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </app-form-field>
              <div class="grid gap-3 sm:grid-cols-2">
                <app-form-field label="Exempt until">
                  <input
                    type="date"
                    class="input input-bordered w-full"
                    [formControl]="subExemptUntil"
                  />
                </app-form-field>
                <app-form-field label="Expires at">
                  <input
                    type="date"
                    class="input input-bordered w-full"
                    [formControl]="subExpiresAt"
                  />
                </app-form-field>
              </div>
              <app-form-field label="Exemption reason">
                <input
                  type="text"
                  class="input input-bordered w-full"
                  [formControl]="subExemptReason"
                />
              </app-form-field>
              <button type="submit" class="btn btn-primary min-h-11" [disabled]="busy()">
                @if (busy()) {
                  <span class="loading loading-spinner loading-sm"></span>
                }
                {{ busy() ? 'Applying…' : 'Apply override' }}
              </button>
            </form>
          </section>

          <section class="border-t border-base-300/60 pt-5">
            <h3 class="section-title">Customer automation</h3>
            <p class="type-caption mt-1">
              Override this company’s own automated-notification preference. Manual document sends
              are controlled by the platform master switch instead.
            </p>
            <div class="mt-3 rounded-box bg-base-200 p-3 text-sm">
              Company preference:
              <strong>{{
                company.automated_customer_notifications_enabled ? 'Enabled' : 'Paused'
              }}</strong>
            </div>
            <div class="mt-3 flex flex-wrap items-end gap-3">
              <app-form-field label="Superadmin override" class="min-w-56 flex-1">
                <select class="select select-bordered w-full" [formControl]="automationOverride">
                  <option value="inherit">Use company setting</option>
                  <option value="force_enabled">Force enabled</option>
                  <option value="force_disabled">Force paused</option>
                </select>
              </app-form-field>
              <button
                class="btn btn-primary min-h-11"
                type="button"
                [disabled]="busy()"
                (click)="saveAutomationOverride(company)"
              >
                Save automation
              </button>
            </div>
          </section>

          @if (company.status !== 'banned') {
            <section class="border-t border-base-300/60 pt-5">
              <h3 class="section-title">Access controls</h3>
              <p class="type-caption mt-1">Restrict access without changing subscription data.</p>
              <div class="mt-3 flex flex-wrap gap-2">
                @if (company.status === 'approved') {
                  <button
                    type="button"
                    class="btn btn-outline btn-sm min-h-11"
                    [disabled]="busy()"
                    (click)="setStatus(company, 'disabled')"
                  >
                    Disable company
                  </button>
                }
                <button
                  type="button"
                  class="btn btn-error btn-outline btn-sm min-h-11"
                  [disabled]="busy()"
                  (click)="setStatus(company, 'banned')"
                >
                  Ban company
                </button>
              </div>
            </section>
          }
        </div>
      </app-drawer>
    }
  `,
})
export class CompaniesComponent implements OnInit {
  private readonly platform = inject(PlatformService);

  protected readonly companies = signal<CompanyRow[]>([]);
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly activeTiers = signal<Tier[]>([]);
  protected readonly trialRequests = signal<TrialAccessRequestRow[]>([]);
  protected readonly legalStatuses = signal<Map<string, CompanyLegalStatus>>(new Map());
  protected readonly legalStatusesAvailable = signal(true);
  protected readonly selected = signal<CompanyRow | null>(null);
  protected readonly drawerOpen = signal(false);
  protected readonly counts = signal<{ members: number; orders: number } | null>(null);
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly debouncedSearch = toSignal(
    this.search.valueChanges.pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: undefined }
  );

  protected readonly subTier = new FormControl('', { nonNullable: true });
  protected readonly subStatus = new FormControl('', { nonNullable: true });
  protected readonly subExemptUntil = new FormControl('', { nonNullable: true });
  protected readonly subExpiresAt = new FormControl('', { nonNullable: true });
  protected readonly subExemptReason = new FormControl('', { nonNullable: true });
  protected readonly trialDrafts = signal<
    Record<string, { tierId: string; grantedUntil: string; note: string }>
  >({});
  protected readonly automationOverride = new FormControl<
    'inherit' | 'force_enabled' | 'force_disabled'
  >('inherit', { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.debouncedSearch() === undefined) return;
      untracked(() => void this.load());
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const tiers = await this.platform.tiers();
      this.tiers.set(tiers);
      this.activeTiers.set(tiers.filter(tier => tier.is_active));
    } catch {
      // The company list remains useful when tiers fail to load.
    }
    await this.load();
  }

  protected pendingCount(): number {
    return this.companies().filter(company => company.status === 'unapproved').length;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      let legalStatusesAvailable = true;
      const [companies, legalStatuses, trialRequests] = await Promise.all([
        this.platform.companies(this.search.value) as Promise<CompanyRow[]>,
        this.platform.companyLegalStatuses().catch(() => {
          legalStatusesAvailable = false;
          return [];
        }),
        this.platform.trialAccessRequests().catch(() => []),
      ]);
      this.companies.set(companies);
      this.trialRequests.set(trialRequests);
      this.syncTrialDrafts(trialRequests);
      this.legalStatuses.set(new Map(legalStatuses.map(status => [status.company_id, status])));
      this.legalStatusesAvailable.set(legalStatusesAvailable);
      const selectedId = this.selected()?.id;
      if (selectedId)
        this.selected.set(companies.find(company => company.id === selectedId) ?? null);
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load companies');
    } finally {
      this.loading.set(false);
    }
  }

  protected async openCompany(company: CompanyRow): Promise<void> {
    this.selected.set(company);
    this.drawerOpen.set(true);
    this.counts.set(null);
    this.subTier.setValue(company.subscription_tier_id ?? this.tiers()[0]?.id ?? '');
    this.subStatus.setValue('');
    this.subExemptUntil.setValue('');
    this.subExpiresAt.setValue('');
    this.subExemptReason.setValue('');
    this.automationOverride.setValue(
      company.automated_customer_notifications_override === null
        ? 'inherit'
        : company.automated_customer_notifications_override
          ? 'force_enabled'
          : 'force_disabled'
    );
    try {
      this.counts.set(await this.platform.companyCounts(company.id));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load company details');
    }
  }

  protected tierImpact(company: CompanyRow): string[] {
    const current = this.tiers().find(tier => tier.id === company.subscription_tier_id);
    const target = this.tiers().find(tier => tier.id === this.subTier.value);
    if (!current || !target || current.id === target.id) return [];
    return [
      current.storefront_available && !target.storefront_available ? 'storefront' : null,
      current.payment_reminders_available && !target.payment_reminders_available
        ? 'payment reminders'
        : null,
    ].filter((value): value is string => value !== null);
  }

  protected clearSelected(): void {
    this.selected.set(null);
    this.counts.set(null);
  }

  protected trialDraft(request: TrialAccessRequestRow): {
    tierId: string;
    grantedUntil: string;
    note: string;
  } {
    return (
      this.trialDrafts()[request.id] ?? {
        tierId: this.defaultTrialTierId(),
        grantedUntil: this.dateInputFromDays(request.requested_days),
        note: '',
      }
    );
  }

  protected setTrialDraft(
    requestId: string,
    key: 'tierId' | 'grantedUntil' | 'note',
    value: string
  ): void {
    this.trialDrafts.update(drafts => ({
      ...drafts,
      [requestId]: {
        ...(drafts[requestId] ?? {
          tierId: this.defaultTrialTierId(),
          grantedUntil: this.dateInputFromDays(14),
          note: '',
        }),
        [key]: value,
      },
    }));
  }

  protected inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
      ? event.target.value
      : '';
  }

  protected async setStatus(company: CompanyRow, status: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.setCompanyStatus(company.id, status);
      this.notice.set(`${company.name} is now ${status}`);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async reviewTrialRequest(
    request: TrialAccessRequestRow,
    decision: 'approved' | 'rejected'
  ): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const draft = this.trialDraft(request);
      await this.platform.reviewTrialAccessRequest({
        requestId: request.id,
        decision,
        ...(decision === 'approved'
          ? { tierId: draft.tierId, grantedUntil: draft.grantedUntil }
          : {}),
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      });
      this.notice.set(
        decision === 'approved'
          ? `Trial access granted for ${request.company_name}`
          : `Trial request rejected for ${request.company_name}`
      );
      this.trialDrafts.update(drafts => {
        const { [request.id]: _removed, ...rest } = drafts;
        return rest;
      });
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Trial review failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveSubscription(company: CompanyRow): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.updateSubscription(company.id, {
        ...(this.subTier.value ? { tier_id: this.subTier.value } : {}),
        ...(this.subStatus.value ? { subscription_status: this.subStatus.value } : {}),
        ...(this.subExemptUntil.value ? { exempt_until: this.subExemptUntil.value } : {}),
        ...(this.subExemptReason.value.trim()
          ? { exempt_reason: this.subExemptReason.value.trim() }
          : {}),
        ...(this.subExpiresAt.value ? { expires_at: this.subExpiresAt.value } : {}),
      });
      this.notice.set(`Subscription updated for ${company.name}`);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveAutomationOverride(company: CompanyRow): Promise<void> {
    const override =
      this.automationOverride.value === 'inherit'
        ? null
        : this.automationOverride.value === 'force_enabled';
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const cancelled = await this.platform.setCompanyAutomationOverride(company.id, override);
      this.notice.set(
        `Automation policy updated for ${company.name}` +
          (cancelled ? `; ${cancelled} pending message(s) cancelled` : '')
      );
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Update failed');
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

  protected legalStatus(companyId: string): CompanyLegalStatus | undefined {
    return this.legalStatuses().get(companyId);
  }

  protected legalType(status?: string): BadgeType {
    if (!this.legalStatusesAvailable()) return 'neutral';
    return LEGAL_TYPE[status ?? 'not_required'] ?? 'neutral';
  }

  protected legalLabel(status?: CompanyLegalStatus): string {
    if (!this.legalStatusesAvailable()) return 'unavailable';
    if (!status || status.legal_status === 'not_required') return 'not required';
    return status.terms_version
      ? `${status.legal_status.replace('_', ' ')} · ${status.terms_version}`
      : status.legal_status.replace('_', ' ');
  }

  protected date(iso: string | null): string {
    if (!iso) return 'Not set';
    return new Date(iso).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private dateInputFromDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private defaultTrialTierId(): string {
    return this.activeTiers()[0]?.id ?? this.tiers()[0]?.id ?? '';
  }

  private syncTrialDrafts(requests: TrialAccessRequestRow[]): void {
    this.trialDrafts.update(current => {
      const next: Record<string, { tierId: string; grantedUntil: string; note: string }> = {};
      for (const request of requests) {
        next[request.id] = current[request.id] ?? {
          tierId: this.defaultTrialTierId(),
          grantedUntil: this.dateInputFromDays(request.requested_days),
          note: '',
        };
      }
      return next;
    });
  }
}
