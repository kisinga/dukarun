import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatKes } from '../../core/money';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../../shared/ui/entity-avatar.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import {
  CreditHealthAgingBucket,
  CreditHealthDashboard,
  CreditHealthSide,
  CreditHealthTrendPoint,
  CreditHealthUtilizationBucket,
  MoneyService,
} from '../money.service';

const EMPTY_METRICS: CreditHealthDashboard['metrics'] = {
  receivables: 0,
  payables: 0,
  overdue_receivables: 0,
  severe_receivables: 0,
  payables_due_soon: 0,
  over_limit_parties: 0,
  top_five_concentration: 0,
};

@Component({
  selector: 'app-money-credit',
  imports: [
    DatePipe,
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    EntityAvatarComponent,
    IconComponent,
    MoneyComponent,
    StatCardComponent,
  ],
  template: `
    <section class="space-y-4">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="section-title">Credit health</h2>
          <p class="type-caption mt-1">
            Collection risk, upcoming supplier obligations, and credit exposure.
            @if (dashboard(); as data) {
              <span>Updated {{ data.generated_at | date: 'MMM d, h:mm a' }}.</span>
            }
          </p>
        </div>
        <button
          appButton
          variant="ghost"
          [iconOnly]="true"
          type="button"
          title="Refresh credit health"
          aria-label="Refresh credit health"
          [loading]="loading()"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
      </div>

      @if (error()) {
        <div role="alert" class="alert alert-error text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span class="flex-1">{{ error() }}</span>
          <button appButton size="sm" variant="ghost" type="button" (click)="load()">
            Try again
          </button>
        </div>
      }

      @if (loading() && !dashboard()) {
        <div
          role="status"
          class="flex min-h-64 items-center justify-center gap-2 text-sm text-base-content/60"
        >
          <span class="loading loading-spinner loading-md"></span>
          Loading credit health
        </div>
      } @else if (dashboard(); as data) {
        <section
          aria-label="Credit health summary"
          class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <a
            class="block rounded-box focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            [routerLink]="[]"
            fragment="credit-aging"
            aria-label="View receivables aging"
          >
            <app-stat-card
              label="Net receivables"
              [value]="fmt(metrics().receivables)"
              [sub]="fmt(metrics().overdue_receivables) + ' in overdue invoices'"
              action="View aging"
            />
          </a>
          <a
            class="block rounded-box focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            [routerLink]="[]"
            fragment="credit-aging"
            aria-label="View invoices over 60 days"
          >
            <app-stat-card
              label="Over 60 days"
              [value]="fmt(metrics().severe_receivables)"
              [sub]="severeSummary()"
              [tone]="metrics().severe_receivables > 0 ? 'error' : 'neutral'"
              action="View aging"
            />
          </a>
          <a
            class="block rounded-box focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            [routerLink]="[]"
            fragment="credit-actions"
            aria-label="View supplier bills requiring attention"
          >
            <app-stat-card
              label="Supplier bills due by 7d"
              [value]="fmt(metrics().payables_due_soon)"
              [sub]="fmt(metrics().payables) + ' total payables'"
              [tone]="metrics().payables_due_soon > 0 ? 'warning' : 'neutral'"
              action="Review suppliers"
            />
          </a>
          <a
            class="block rounded-box focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            [routerLink]="[]"
            fragment="credit-risk"
            aria-label="View customer credit-limit risk"
          >
            <app-stat-card
              label="Accounts over limit"
              [value]="countLabel(metrics().over_limit_parties)"
              [sub]="overLimitSummary()"
              [tone]="metrics().over_limit_parties > 0 ? 'error' : 'neutral'"
              action="View limit usage"
            />
          </a>
        </section>

        @if (!hasExposure()) {
          <article class="card overflow-hidden bg-base-100">
            <app-empty-state
              [embedded]="true"
              icon="heroCheckCircle"
              title="No outstanding credit"
              description="There are no customer receivables or supplier payables to review."
            />
          </article>
        } @else {
          <section
            aria-label="Credit exposure insights"
            class="grid items-start gap-4 xl:grid-cols-12"
          >
            <article
              id="credit-aging"
              class="card scroll-mt-4 overflow-hidden bg-base-100 xl:col-span-7"
            >
              <div class="border-b border-base-300/60 px-4 py-3">
                <h3 class="section-title">Exposure by due status</h3>
                <p class="type-caption mt-1">Open invoice balances grouped by days past due.</p>
              </div>
              <div class="divide-y divide-base-200 px-4">
                @for (side of creditSides; track side) {
                  @if (agingTotal(side) > 0) {
                    <div class="py-4">
                      <div class="flex items-baseline justify-between gap-3">
                        <div>
                          <p class="text-sm font-semibold">{{ sideLabel(side) }}</p>
                          @if (agingAdjustment(side) !== 0) {
                            <p class="type-caption mt-0.5">
                              Net after account credits and adjustments:
                              <app-money [amount]="sideNetTotal(side)" />
                            </p>
                          }
                        </div>
                        <p class="shrink-0 text-sm font-semibold">
                          <app-money [amount]="agingTotal(side)" />
                        </p>
                      </div>
                      <div
                        class="mt-2 flex h-3 overflow-hidden rounded-full bg-base-200"
                        role="img"
                        [attr.aria-label]="sideLabel(side) + ' aging exposure'"
                      >
                        @for (bucket of activeAgingRows(side); track bucket.bucket) {
                          <span
                            [class]="agingTone(bucket.bucket)"
                            [style.width.%]="agingWidth(bucket, side)"
                            [attr.title]="agingTitle(bucket)"
                          ></span>
                        }
                      </div>
                      <div class="mt-3 grid gap-2 sm:grid-cols-2">
                        @for (bucket of activeAgingRows(side); track bucket.bucket) {
                          <button
                            type="button"
                            class="rounded-field border border-base-300/70 px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
                            [class.border-primary]="agingSelected(side, bucket.bucket)"
                            [class.bg-base-200]="agingSelected(side, bucket.bucket)"
                            [attr.aria-pressed]="agingSelected(side, bucket.bucket)"
                            (click)="toggleAging(side, bucket.bucket)"
                          >
                            <span class="flex items-center gap-2">
                              <span
                                class="h-2.5 w-2.5 shrink-0 rounded-sm"
                                [class]="agingTone(bucket.bucket)"
                              ></span>
                              <span class="min-w-0 flex-1 text-base-content/70">
                                {{ agingLabel(bucket.bucket) }}
                              </span>
                              <span class="shrink-0 font-semibold tabular-nums">
                                <app-money [amount]="bucket.amount" />
                              </span>
                            </span>
                            <span class="mt-1 block pl-4 text-base-content/50">
                              {{ documentCountLabel(bucket.documents) }} ·
                              {{ agingShare(bucket, side) }}% of open {{ sideNoun(side) }}
                            </span>
                          </button>
                        }
                      </div>
                      @if (selectedAgingRow(side); as selected) {
                        <div
                          class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-field bg-primary/5 px-3 py-2 text-xs"
                          aria-live="polite"
                        >
                          <p>
                            <span class="font-semibold">{{ agingLabel(selected.bucket) }}</span>
                            contains {{ documentCountLabel(selected.documents) }} worth
                            <app-money [amount]="selected.amount" />.
                          </p>
                          <a
                            appButton
                            variant="ghost"
                            size="sm"
                            [routerLink]="side === 'receivables' ? '/customers' : '/suppliers'"
                          >
                            Review {{ side === 'receivables' ? 'customers' : 'suppliers' }}
                          </a>
                        </div>
                      }
                    </div>
                  } @else {
                    <app-empty-state
                      [embedded]="true"
                      [compact]="true"
                      [icon]="side === 'receivables' ? 'heroUsers' : 'heroTruck'"
                      [title]="side === 'receivables' ? 'No receivables' : 'No supplier payables'"
                    />
                  }
                }
              </div>
            </article>

            <article class="card overflow-hidden bg-base-100 xl:col-span-5">
              <div
                class="flex flex-wrap items-start justify-between gap-2 border-b border-base-300/60 px-4 py-3"
              >
                <div>
                  <h3 class="section-title">Balance trend</h3>
                  <p class="type-caption mt-1">Closing receivables and payables by day.</p>
                </div>
                <div class="flex items-center gap-1 rounded-field bg-base-200 p-1">
                  @for (days of trendRanges; track days) {
                    <button
                      appButton
                      size="sm"
                      type="button"
                      [variant]="trendDays() === days ? 'soft' : 'ghost'"
                      [attr.aria-pressed]="trendDays() === days"
                      (click)="setTrendDays(days)"
                    >
                      {{ days }}d
                    </button>
                  }
                </div>
              </div>
              <div class="p-4">
                @if (!trendHasExposure()) {
                  <app-empty-state
                    [embedded]="true"
                    [compact]="true"
                    icon="heroChartBar"
                    title="No credit movement"
                    description="The trend appears after credit sales or purchases are posted."
                  />
                } @else {
                  <div class="mb-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div class="flex items-start gap-2 rounded-field bg-error/5 px-2.5 py-2">
                      <span class="mt-1.5 h-0.5 w-5 shrink-0 bg-error"></span>
                      <div>
                        <p class="font-semibold">
                          Receivables <app-money [amount]="trendCurrent('receivables')" />
                        </p>
                        <p class="text-base-content/60">
                          {{ trendDeltaLabel('receivables') }} over {{ trendDays() }} days
                        </p>
                      </div>
                    </div>
                    <div class="flex items-start gap-2 rounded-field bg-warning/5 px-2.5 py-2">
                      <span class="mt-1.5 h-0.5 w-5 shrink-0 bg-warning"></span>
                      <div>
                        <p class="font-semibold">
                          Payables <app-money [amount]="trendCurrent('payables')" />
                        </p>
                        <p class="text-base-content/60">
                          {{ trendDeltaLabel('payables') }} over {{ trendDays() }} days
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    class="relative h-44 overflow-hidden rounded-field bg-base-200/40 px-3 pb-2 pt-5"
                  >
                    <span class="absolute right-2 top-1 text-xs text-base-content/45">
                      Scale {{ fmt(trendScale()) }}
                    </span>
                    <span class="absolute inset-x-0 top-1/4 border-t border-base-300/60"></span>
                    <span class="absolute inset-x-0 top-1/2 border-t border-base-300/60"></span>
                    <span class="absolute inset-x-0 top-3/4 border-t border-base-300/60"></span>
                    <div
                      class="relative flex h-full items-end gap-1"
                      role="img"
                      [attr.aria-label]="
                        'Receivables and payables trend over ' + trendDays() + ' days'
                      "
                    >
                      @for (point of trendChartPoints(); track point.day) {
                        <div
                          class="flex h-full min-w-0 flex-1 items-end gap-px"
                          [attr.title]="trendTitle(point)"
                        >
                          <span
                            class="min-w-0 flex-1 rounded-t-sm bg-error/80"
                            [style.height.%]="trendBarHeight(point, 'receivables')"
                          ></span>
                          <span
                            class="min-w-0 flex-1 rounded-t-sm bg-warning/85"
                            [style.height.%]="trendBarHeight(point, 'payables')"
                          ></span>
                        </div>
                      }
                    </div>
                  </div>
                  <div class="mt-2 flex justify-between text-xs text-base-content/50">
                    <span>{{ firstTrendDay() | date: 'mediumDate' }}</span>
                    <span>{{ lastTrendDay() | date: 'mediumDate' }}</span>
                  </div>
                }
              </div>
            </article>
          </section>

          @if (hasRiskAnalysis()) {
            <article
              id="credit-risk"
              aria-label="Customer credit risk"
              class="card scroll-mt-4 overflow-hidden bg-base-100"
            >
              <div class="border-b border-base-300/60 px-4 py-3">
                <h3 class="section-title">Customer credit risk</h3>
                <p class="type-caption mt-1">
                  Limit usage and the customers holding the largest balances.
                </p>
              </div>
              <div class="grid lg:grid-cols-2 lg:divide-x lg:divide-base-200">
                @if (utilizationParties() > 0) {
                  <section class="p-4" aria-labelledby="limit-utilization-heading">
                    <div class="mb-3 flex items-baseline justify-between gap-3">
                      <h4 id="limit-utilization-heading" class="text-sm font-semibold">
                        Limit utilization
                      </h4>
                      <span class="type-caption">
                        {{ partyCountLabel(utilizationParties()) }}
                      </span>
                    </div>
                    <div
                      class="flex h-3 overflow-hidden rounded-full bg-base-200"
                      role="img"
                      aria-label="Distribution of customer credit-limit utilization"
                    >
                      @for (bucket of activeUtilizationRows(); track bucket.bucket) {
                        <span
                          [class]="utilizationTone(bucket.bucket)"
                          [style.width.%]="utilizationShare(bucket)"
                        ></span>
                      }
                    </div>
                    <div class="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-1">
                      @for (bucket of activeUtilizationRows(); track bucket.bucket) {
                        <button
                          type="button"
                          class="flex w-full items-start gap-2 rounded-field p-2 text-left transition-colors hover:bg-primary/5"
                          [class.bg-base-200]="utilizationSelected(bucket.bucket)"
                          [attr.aria-pressed]="utilizationSelected(bucket.bucket)"
                          (click)="toggleUtilization(bucket.bucket)"
                        >
                          <span
                            class="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                            [class]="utilizationTone(bucket.bucket)"
                          ></span>
                          <div class="min-w-0 flex-1">
                            <div class="flex justify-between gap-3 text-sm">
                              <span>{{ utilizationLabel(bucket.bucket) }}</span>
                              <span class="font-semibold tabular-nums">
                                {{ partyCountLabel(bucket.parties) }}
                              </span>
                            </div>
                            <p class="type-caption mt-0.5">
                              <app-money [amount]="bucket.amount" /> outstanding
                            </p>
                          </div>
                        </button>
                      }
                    </div>
                    @if (selectedUtilizationRow(); as selected) {
                      <div class="mt-3 rounded-field bg-primary/5 p-3 text-xs" aria-live="polite">
                        <p class="font-semibold">{{ utilizationLabel(selected.bucket) }}</p>
                        <p class="mt-1 text-base-content/70">
                          {{ utilizationGuidance(selected.bucket) }}
                          {{ utilizationShare(selected) }}% of accounts with limits are in this
                          category.
                        </p>
                        <a appButton variant="ghost" size="sm" class="mt-2" routerLink="/customers">
                          Review customer accounts
                        </a>
                      </div>
                    }
                  </section>
                }

                @if (data.concentration.length > 0) {
                  <section class="p-4" aria-labelledby="concentration-heading">
                    <div class="mb-1 flex items-baseline justify-between gap-3">
                      <h4 id="concentration-heading" class="text-sm font-semibold">
                        Largest balances
                      </h4>
                      <span class="type-caption">
                        Top 5 · {{ metrics().top_five_concentration }}%
                      </span>
                    </div>
                    <div class="divide-y divide-base-200">
                      @for (party of data.concentration; track party.party_id) {
                        <a
                          class="flex min-h-14 items-center gap-3 py-2 hover:text-primary"
                          [routerLink]="['/customers']"
                          [queryParams]="{ customer: party.party_id }"
                        >
                          <app-entity-avatar size="sm" [firstName]="party.party_name" />
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-3">
                              <p class="truncate text-sm font-semibold">{{ party.party_name }}</p>
                              <p class="shrink-0 text-sm font-semibold">
                                <app-money [amount]="party.amount" />
                              </p>
                            </div>
                            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-200">
                              <div
                                class="h-full rounded-full bg-primary"
                                [style.width.%]="party.share"
                              ></div>
                            </div>
                            <p class="type-caption mt-1">{{ party.share }}% of receivables</p>
                          </div>
                        </a>
                      }
                    </div>
                  </section>
                }
              </div>
            </article>
          }

          <section
            id="credit-actions"
            aria-labelledby="credit-actions-heading"
            class="scroll-mt-4 space-y-3"
          >
            <div>
              <h3 id="credit-actions-heading" class="section-title">Needs attention</h3>
              <p class="type-caption mt-1">Prioritized collection and supplier-payment work.</p>
            </div>

            @if (!hasActions()) {
              <article class="card overflow-hidden bg-base-100">
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroCheckCircle"
                  title="No urgent credit actions"
                  description="Current balances are within limits and payment windows."
                />
              </article>
            } @else {
              <div class="grid items-start gap-4 lg:grid-cols-2">
                @if (data.collect_now.length > 0) {
                  <article class="card overflow-hidden bg-base-100">
                    <div
                      class="flex items-start justify-between gap-3 border-b border-base-300/60 px-4 py-3"
                    >
                      <div>
                        <h4 class="section-title">Collect now</h4>
                        <p class="type-caption mt-1">Highest-risk customer accounts first.</p>
                      </div>
                      <a appButton variant="ghost" size="sm" routerLink="/customers">
                        All customers
                      </a>
                    </div>
                    <div class="divide-y divide-base-200">
                      @for (party of data.collect_now; track party.party_id) {
                        <a
                          class="flex min-h-20 items-center gap-3 px-4 py-3 hover:bg-base-200/40"
                          [routerLink]="['/customers']"
                          [queryParams]="{ customer: party.party_id }"
                        >
                          <app-entity-avatar size="sm" [firstName]="party.party_name" />
                          <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                              <p class="truncate text-sm font-semibold">{{ party.party_name }}</p>
                              <span class="badge badge-error badge-outline badge-xs">
                                {{ party.reason }}
                              </span>
                            </div>
                            <p class="type-caption mt-1">
                              @if (party.days_overdue > 0) {
                                {{ party.days_overdue }} days overdue ·
                              }
                              <app-money [amount]="party.overdue_amount" /> overdue
                            </p>
                          </div>
                          <div class="shrink-0 text-right">
                            <p class="text-sm font-bold text-error">
                              <app-money [amount]="party.outstanding" />
                            </p>
                            <p class="type-caption">outstanding</p>
                          </div>
                        </a>
                      }
                    </div>
                  </article>
                }

                @if (data.pay_soon.length > 0) {
                  <article class="card overflow-hidden bg-base-100">
                    <div
                      class="flex items-start justify-between gap-3 border-b border-base-300/60 px-4 py-3"
                    >
                      <div>
                        <h4 class="section-title">Pay soon</h4>
                        <p class="type-caption mt-1">Supplier obligations due within 30 days.</p>
                      </div>
                      <a appButton variant="ghost" size="sm" routerLink="/suppliers">
                        All suppliers
                      </a>
                    </div>
                    <div class="divide-y divide-base-200">
                      @for (party of data.pay_soon; track party.party_id) {
                        <a
                          class="flex min-h-20 items-center gap-3 px-4 py-3 hover:bg-base-200/40"
                          [routerLink]="['/suppliers']"
                          [queryParams]="{ supplier: party.party_id }"
                        >
                          <app-entity-avatar size="sm" [firstName]="party.party_name" />
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-semibold">{{ party.party_name }}</p>
                            <p class="type-caption mt-1">
                              @if (party.next_due_date) {
                                {{ party.days_overdue > 0 ? 'Overdue since' : 'Next due' }}
                                {{ party.next_due_date | date: 'mediumDate' }}
                              } @else {
                                Due date unavailable
                              }
                            </p>
                          </div>
                          <div class="shrink-0 text-right">
                            <p class="text-sm font-bold text-warning">
                              <app-money [amount]="party.due_amount || party.outstanding" />
                            </p>
                            <p class="type-caption">due within 30d</p>
                          </div>
                        </a>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          </section>
        }
      }
    </section>
  `,
})
export class MoneyCreditComponent implements OnInit {
  private readonly money = inject(MoneyService);

  protected readonly dashboard = signal<CreditHealthDashboard | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly trendDays = signal(90);
  protected readonly agingDrill = signal<{
    side: CreditHealthSide;
    bucket: CreditHealthAgingBucket['bucket'];
  } | null>(null);
  protected readonly utilizationDrill = signal<CreditHealthUtilizationBucket['bucket'] | null>(
    null
  );
  protected readonly trendRanges = [30, 90] as const;
  protected readonly creditSides: CreditHealthSide[] = ['receivables', 'payables'];
  protected readonly fmt = formatKes;

  protected readonly metrics = computed(() => this.dashboard()?.metrics ?? EMPTY_METRICS);
  protected readonly hasExposure = computed(
    () => this.metrics().receivables > 0 || this.metrics().payables > 0
  );
  protected readonly utilizationParties = computed(() =>
    (this.dashboard()?.utilization ?? []).reduce((sum, bucket) => sum + bucket.parties, 0)
  );
  protected readonly hasRiskAnalysis = computed(
    () => this.utilizationParties() > 0 || (this.dashboard()?.concentration.length ?? 0) > 0
  );
  protected readonly hasActions = computed(
    () =>
      (this.dashboard()?.collect_now.length ?? 0) > 0 ||
      (this.dashboard()?.pay_soon.length ?? 0) > 0
  );
  protected readonly trendHasExposure = computed(() =>
    (this.dashboard()?.trend ?? []).some(point => point.receivables > 0 || point.payables > 0)
  );
  protected readonly trendChartPoints = computed(() => {
    const trend = this.dashboard()?.trend ?? [];
    const stride = Math.max(1, Math.ceil(trend.length / 24));
    return trend.filter((_, index) => index % stride === 0 || index === trend.length - 1);
  });
  protected readonly trendScale = computed(() =>
    Math.max(...(this.dashboard()?.trend ?? []).flatMap(row => [row.receivables, row.payables]), 0)
  );

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.dashboard.set(await this.money.creditHealthDashboard(this.trendDays()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load credit health');
    } finally {
      this.loading.set(false);
    }
  }

  protected setTrendDays(days: number): void {
    if (this.trendDays() === days) return;
    this.trendDays.set(days);
    void this.load();
  }

  protected agingRows(side: CreditHealthSide): CreditHealthAgingBucket[] {
    return (this.dashboard()?.aging ?? []).filter(bucket => bucket.side === side);
  }

  protected activeAgingRows(side: CreditHealthSide): CreditHealthAgingBucket[] {
    return this.agingRows(side).filter(bucket => bucket.amount > 0);
  }

  protected agingTotal(side: CreditHealthSide): number {
    return this.agingRows(side).reduce((sum, bucket) => sum + bucket.amount, 0);
  }

  protected agingWidth(bucket: CreditHealthAgingBucket, side: CreditHealthSide): number {
    const total = this.agingTotal(side);
    return total > 0 ? (bucket.amount / total) * 100 : 0;
  }

  protected agingShare(bucket: CreditHealthAgingBucket, side: CreditHealthSide): number {
    return Math.round(this.agingWidth(bucket, side));
  }

  protected toggleAging(side: CreditHealthSide, bucket: CreditHealthAgingBucket['bucket']): void {
    this.agingDrill.update(selected =>
      selected?.side === side && selected.bucket === bucket ? null : { side, bucket }
    );
  }

  protected agingSelected(
    side: CreditHealthSide,
    bucket: CreditHealthAgingBucket['bucket']
  ): boolean {
    const selected = this.agingDrill();
    return selected?.side === side && selected.bucket === bucket;
  }

  protected selectedAgingRow(side: CreditHealthSide): CreditHealthAgingBucket | null {
    const selected = this.agingDrill();
    if (!selected || selected.side !== side) return null;
    return this.agingRows(side).find(bucket => bucket.bucket === selected.bucket) ?? null;
  }

  protected agingLabel(bucket: CreditHealthAgingBucket['bucket']): string {
    switch (bucket) {
      case 'current':
        return 'Not overdue';
      case 'unscheduled':
        return 'Unscheduled';
      default:
        return `${bucket} days`;
    }
  }

  protected agingTitle(bucket: CreditHealthAgingBucket): string {
    return `${this.agingLabel(bucket.bucket)}: ${formatKes(bucket.amount)}`;
  }

  protected agingTone(bucket: CreditHealthAgingBucket['bucket']): string {
    switch (bucket) {
      case 'current':
        return 'bg-success';
      case '1-30':
        return 'bg-warning';
      case '31-60':
        return 'bg-error/65';
      case '60+':
        return 'bg-error';
      default:
        return 'bg-base-content/25';
    }
  }

  protected sideLabel(side: CreditHealthSide): string {
    return side === 'receivables' ? 'Open customer invoices' : 'Open supplier bills';
  }

  protected sideNoun(side: CreditHealthSide): string {
    return side === 'receivables' ? 'invoices' : 'bills';
  }

  protected documentCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'document' : 'documents'}`;
  }

  protected sideNetTotal(side: CreditHealthSide): number {
    return side === 'receivables' ? this.metrics().receivables : this.metrics().payables;
  }

  protected agingAdjustment(side: CreditHealthSide): number {
    return this.sideNetTotal(side) - this.agingTotal(side);
  }

  protected activeUtilizationRows(): CreditHealthUtilizationBucket[] {
    return (this.dashboard()?.utilization ?? []).filter(bucket => bucket.parties > 0);
  }

  protected utilizationLabel(bucket: CreditHealthUtilizationBucket['bucket']): string {
    switch (bucket) {
      case 'under_50':
        return 'Under 50% used';
      case '50_80':
        return '50–80% used';
      case '80_100':
        return '80–100% used';
      default:
        return 'Over limit';
    }
  }

  protected utilizationTone(bucket: CreditHealthUtilizationBucket['bucket']): string {
    switch (bucket) {
      case 'under_50':
        return 'bg-success';
      case '50_80':
        return 'bg-primary';
      case '80_100':
        return 'bg-warning';
      default:
        return 'bg-error';
    }
  }

  protected utilizationShare(bucket: CreditHealthUtilizationBucket): number {
    return this.utilizationParties() > 0
      ? Math.round((bucket.parties / this.utilizationParties()) * 100)
      : 0;
  }

  protected toggleUtilization(bucket: CreditHealthUtilizationBucket['bucket']): void {
    this.utilizationDrill.update(selected => (selected === bucket ? null : bucket));
  }

  protected utilizationSelected(bucket: CreditHealthUtilizationBucket['bucket']): boolean {
    return this.utilizationDrill() === bucket;
  }

  protected selectedUtilizationRow(): CreditHealthUtilizationBucket | null {
    const selected = this.utilizationDrill();
    return (this.dashboard()?.utilization ?? []).find(bucket => bucket.bucket === selected) ?? null;
  }

  protected utilizationGuidance(bucket: CreditHealthUtilizationBucket['bucket']): string {
    switch (bucket) {
      case 'under_50':
        return 'These accounts have comfortable credit headroom.';
      case '50_80':
        return 'These accounts should be monitored before further credit sales.';
      case '80_100':
        return 'These accounts are close to their approved limit.';
      default:
        return 'These accounts require review before receiving more credit.';
    }
  }

  protected partyCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'account' : 'accounts'}`;
  }

  protected countLabel(count: number): string {
    return count.toLocaleString('en-KE');
  }

  protected overLimitSummary(): string {
    return this.metrics().over_limit_parties > 0
      ? `${this.metrics().top_five_concentration}% of receivables held by the top 5`
      : 'No customer is above their credit limit';
  }

  protected severeSummary(): string {
    const severe = this.metrics().severe_receivables;
    const net = this.metrics().receivables;
    if (severe <= 0) return 'No invoices are over 60 days old';
    if (net > 0 && severe <= net) return `${Math.round((severe / net) * 100)}% of net receivables`;
    return 'Gross exposure before account credits and adjustments';
  }

  protected trendBarHeight(point: CreditHealthTrendPoint, side: CreditHealthSide): number {
    const trend = this.dashboard()?.trend ?? [];
    const max = Math.max(...trend.flatMap(row => [row.receivables, row.payables]), 1);
    const value = this.trendValue(point, side);
    return value > 0 ? Math.max((value / max) * 100, 1.5) : 0;
  }

  protected trendTitle(point: CreditHealthTrendPoint): string {
    return `${point.day}: AR ${formatKes(point.receivables)}, AP ${formatKes(point.payables)}`;
  }

  protected trendDeltaLabel(side: CreditHealthSide): string {
    const trend = this.dashboard()?.trend ?? [];
    if (trend.length < 2) return '—';
    const start = this.trendValue(trend[0], side);
    const end = this.trendValue(trend.at(-1)!, side);
    const delta = end - start;
    if (delta === 0) return 'flat';
    return `${delta > 0 ? '↑' : '↓'} ${formatKes(Math.abs(delta))}`;
  }

  protected trendCurrent(side: CreditHealthSide): number {
    const latest = this.dashboard()?.trend.at(-1);
    return latest ? this.trendValue(latest, side) : 0;
  }

  protected firstTrendDay(): string | null {
    return this.dashboard()?.trend[0]?.day ?? null;
  }

  protected lastTrendDay(): string | null {
    return this.dashboard()?.trend.at(-1)?.day ?? null;
  }

  private trendValue(point: CreditHealthTrendPoint, side: CreditHealthSide): number {
    return side === 'receivables' ? point.receivables : point.payables;
  }
}
