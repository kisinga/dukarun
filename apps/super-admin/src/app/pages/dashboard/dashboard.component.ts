import { Component, OnInit, inject, signal } from '@angular/core';
import { formatKes } from '../../core/money';
import { PlatformService, PlatformStats } from '../../core/platform.service';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

/** `/` — platform overview from platform_stats(). */
@Component({
  selector: 'app-dashboard',
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Platform dashboard" subtitle="Live tenant and revenue totals" />

    @if (error()) {
      <div class="alert alert-error mb-4" role="alert">
        <span>{{ error() }}</span>
      </div>
    }

    @if (stats(); as s) {
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card bg-base-100">
          <div class="card-body p-4">
            <p class="type-caption">MRR estimate</p>
            <p class="type-hero mt-1 text-success">{{ fmt(s.mrr_estimate) }}</p>
          </div>
        </div>
        <div class="card bg-base-100">
          <div class="card-body p-4">
            <p class="type-caption">Revenue today</p>
            <p class="type-hero mt-1">{{ fmt(s.revenue_today) }}</p>
            <p class="mt-0.5 type-caption">{{ s.orders_today }} orders today</p>
          </div>
        </div>
        <div class="card bg-base-100">
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
        </div>
        <div class="card bg-base-100">
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
        </div>
      </div>
    } @else {
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading stats">
        @for (_ of [1, 2, 3, 4]; track $index) {
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

  protected readonly fmt = formatKes;
  protected readonly stats = signal<PlatformStats | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.stats.set(await this.platform.stats());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load stats');
    }
  }
}
