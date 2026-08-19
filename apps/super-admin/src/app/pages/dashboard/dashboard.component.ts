import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { PlatformService, PlatformStats } from '../../core/platform.service';
import { MoneyComponent } from '../../shared/ui/money.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

/** `/` — platform overview from platform_stats(). */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgIcon, PageHeaderComponent, MoneyComponent],
  template: `
    <app-page-header
      title="Platform dashboard"
      subtitle="Live tenant, revenue and subscription health"
    >
      <button
        actions
        class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11"
        title="Refresh dashboard"
        aria-label="Refresh dashboard"
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

    @if (stats(); as s) {
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div
          class="card relative overflow-hidden border-primary/15 bg-gradient-to-br from-primary/12 via-base-100 to-base-100 sm:col-span-2 xl:col-span-2"
        >
          <div class="absolute -top-12 -right-10 size-36 rounded-full bg-primary/8"></div>
          <div class="card-body relative justify-between p-5">
            <p class="text-xs font-semibold text-base-content/55">Monthly recurring revenue</p>
            <p class="mt-4 text-[1.75rem] leading-none font-bold tracking-tight text-base-content">
              <app-money [amount]="s.mrr_estimate" [showCurrency]="true" />
            </p>
            <p class="mt-2 text-xs text-base-content/50">Estimated from active subscriptions</p>
          </div>
        </div>
        <div class="card bg-base-100 xl:col-span-1">
          <div class="card-body p-5">
            <p class="type-caption">Revenue today</p>
            <p class="type-hero mt-1">
              <app-money [amount]="s.revenue_today" [showCurrency]="true" />
            </p>
            <p class="mt-0.5 type-caption">{{ s.orders_today }} orders today</p>
          </div>
        </div>
        <a
          routerLink="/companies"
          class="card bg-base-100 transition-all hover:-translate-y-0.5 hover:border-primary/35"
        >
          <div class="card-body p-5">
            <p class="type-caption">Companies</p>
            <p class="type-hero mt-1">{{ s.companies_total }}</p>
            <p class="mt-0.5 type-caption">
              {{ s.companies_approved }} approved ·
              <span [class.text-warning]="s.companies_pending > 0"
                >{{ s.companies_pending }} pending</span
              >
            </p>
          </div>
        </a>
        <a
          routerLink="/companies"
          class="card bg-base-100 transition-all hover:-translate-y-0.5 hover:border-primary/35"
        >
          <div class="card-body p-5">
            <p class="type-caption">Subscriptions</p>
            <p class="type-hero mt-1 text-success">{{ s.subscriptions_active }}</p>
            <p class="mt-0.5 type-caption">
              {{ s.subscriptions_trial }} trial ·
              <span [class.text-error]="s.subscriptions_expired > 0"
                >{{ s.subscriptions_expired }} expired</span
              >
            </p>
          </div>
        </a>
        <div class="card bg-base-100 xl:col-span-1">
          <div class="card-body p-5">
            <p class="type-caption">Monthly active users</p>
            <p class="type-hero mt-1 text-primary">{{ s.monthly_active_users }}</p>
            <p class="mt-0.5 type-caption">of {{ s.users_total }} users · signed in this month</p>
          </div>
        </div>
      </div>

      <section class="mt-4">
        <div class="mb-2 flex items-end justify-between gap-3">
          <div>
            <h2 class="section-title">POS health</h2>
            <p class="type-caption mt-0.5">Browser devices reporting offline-sale status</p>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="card bg-base-100">
            <div class="card-body p-5">
              <p class="type-caption">Active devices</p>
              <p class="type-hero mt-1 text-success">{{ s.pos_devices_active_24h }}</p>
              <p class="mt-0.5 type-caption">
                of {{ s.pos_devices_recent_30d }} seen in 30d ·
                {{ s.companies_with_active_pos_30d }} companies
              </p>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body p-5">
              <p class="type-caption">Last-reported pending sales</p>
              <p
                class="type-hero mt-1"
                [class.text-warning]="s.offline_sales_last_reported_pending > 0"
              >
                {{ s.offline_sales_last_reported_pending }}
              </p>
              <p class="mt-0.5 type-caption">
                across {{ s.pos_devices_with_last_reported_pending }} devices · excludes unreported
                offline queues
              </p>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body p-5">
              <p class="type-caption">Stale devices</p>
              <p class="type-hero mt-1" [class.text-warning]="s.pos_devices_stale_30d > 0">
                {{ s.pos_devices_stale_30d }}
              </p>
              <p class="mt-0.5 type-caption">
                No heartbeat for 24h–30d · {{ s.pos_devices_dormant_30d }} dormant
              </p>
            </div>
          </div>
        </div>
      </section>

      <div class="mt-7 grid gap-4 lg:grid-cols-3">
        <section class="card bg-base-100 p-5">
          <div class="flex h-full flex-col items-start gap-5">
            <div>
              <h2 class="section-title">Tenant administration</h2>
              <p class="type-caption mt-1">Review signups, access and subscription overrides.</p>
            </div>
            <a
              routerLink="/companies"
              class="btn btn-ghost btn-sm mt-auto -ml-3 min-h-11 text-primary"
              >View companies <ng-icon name="heroChevronRight"
            /></a>
          </div>
        </section>
        <section class="card bg-base-100 p-5">
          <div class="flex h-full flex-col items-start gap-5">
            <div>
              <h2 class="section-title">Platform health</h2>
              <p class="type-caption mt-1">Check registration, accounting and delivery issues.</p>
            </div>
            <a
              routerLink="/operations"
              class="btn btn-ghost btn-sm mt-auto -ml-3 min-h-11 text-primary"
              >Open operations <ng-icon name="heroChevronRight"
            /></a>
          </div>
        </section>
        <section class="card bg-base-100 p-5">
          <div class="flex h-full flex-col items-start gap-5">
            <div>
              <h2 class="section-title">Editorial studio</h2>
              <p class="type-caption mt-1">Write, schedule, publish and measure journal stories.</p>
            </div>
            <a routerLink="/blog" class="btn btn-ghost btn-sm mt-auto -ml-3 min-h-11 text-primary"
              >Open editorial <ng-icon name="heroChevronRight"
            /></a>
          </div>
        </section>
      </div>
    } @else {
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6" aria-label="Loading stats">
        @for (_ of [1, 2, 3, 4, 5]; track $index) {
          <div class="card bg-base-100 first:sm:col-span-2">
            <div class="card-body gap-3 p-4">
              <div class="skeleton h-3 w-24"></div>
              <div class="skeleton h-8 w-32"></div>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly platform = inject(PlatformService);

  protected readonly stats = signal<PlatformStats | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.stats.set(await this.platform.stats());
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load stats');
    } finally {
      this.loading.set(false);
    }
  }
}
