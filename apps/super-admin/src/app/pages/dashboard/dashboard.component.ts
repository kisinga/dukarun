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
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div class="card bg-base-100">
          <div class="card-body p-4">
            <p class="type-caption">MRR estimate</p>
            <p class="type-hero mt-1 text-success">
              <app-money [amount]="s.mrr_estimate" [showCurrency]="true" />
            </p>
          </div>
        </div>
        <div class="card bg-base-100">
          <div class="card-body p-4">
            <p class="type-caption">Revenue today</p>
            <p class="type-hero mt-1">
              <app-money [amount]="s.revenue_today" [showCurrency]="true" />
            </p>
            <p class="mt-0.5 type-caption">{{ s.orders_today }} orders today</p>
          </div>
        </div>
        <a
          routerLink="/companies"
          class="card bg-base-100 transition-colors hover:border-primary/40"
        >
          <div class="card-body p-4">
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
          class="card bg-base-100 transition-colors hover:border-primary/40"
        >
          <div class="card-body p-4">
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
        <div class="card bg-base-100">
          <div class="card-body p-4">
            <p class="type-caption">Monthly active users</p>
            <p class="type-hero mt-1 text-primary">{{ s.monthly_active_users }}</p>
            <p class="mt-0.5 type-caption">of {{ s.users_total }} users · signed in this month</p>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <section class="card bg-base-100 p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="section-title">Tenant administration</h2>
              <p class="type-caption mt-1">Review signups, access and subscription overrides.</p>
            </div>
            <a routerLink="/companies" class="btn btn-outline btn-sm min-h-11">View companies</a>
          </div>
        </section>
        <section class="card bg-base-100 p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="section-title">Platform health</h2>
              <p class="type-caption mt-1">Check registration, accounting and delivery issues.</p>
            </div>
            <a routerLink="/operations" class="btn btn-outline btn-sm min-h-11">Open operations</a>
          </div>
        </section>
      </div>
    } @else {
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Loading stats">
        @for (_ of [1, 2, 3, 4, 5]; track $index) {
          <div class="card bg-base-100">
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
