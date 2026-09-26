import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyCreditComponent } from '../money/credit/money-credit.component';
import { InsightsService } from './insights.service';
import { insightCopy, type PartyCreditProfile } from './insights.models';
import { ScoreBadgeComponent } from './score-badge.component';

@Component({
  selector: 'app-credit-insights',
  imports: [
    DatePipe,
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    MoneyCreditComponent,
    ScoreBadgeComponent,
  ],
  template: `
    <section class="space-y-6">
      <section class="card bg-base-100">
        <div class="card-body gap-4 p-4 sm:p-5">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="section-title">Credit portfolio</h2>
              <p class="type-caption mt-1">
                Review exposure, repayment evidence, and the next decision for each party.
              </p>
            </div>
            <button
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Refresh credit profiles"
              aria-label="Refresh credit profiles"
              [loading]="loading()"
              (click)="load()"
            >
              <app-icon name="heroArrowPath" />
            </button>
          </header>

          <div role="tablist" aria-label="Credit portfolio side" class="section-tabs">
            <button
              role="tab"
              type="button"
              class="section-tab"
              [class.section-tab-active]="side() === 'customer'"
              [attr.aria-selected]="side() === 'customer'"
              (click)="setSide('customer')"
            >
              Customers
            </button>
            <button
              role="tab"
              type="button"
              class="section-tab"
              [class.section-tab-active]="side() === 'supplier'"
              [attr.aria-selected]="side() === 'supplier'"
              (click)="setSide('supplier')"
            >
              Our supplier standing
            </button>
          </div>

          <div
            class="grid items-end gap-3 md:grid-cols-[minmax(10rem,14rem)_auto_minmax(16rem,1fr)]"
          >
            <label class="form-control min-w-40">
              <span class="label-text text-xs">Band</span>
              <select
                class="select select-bordered select-sm min-h-11"
                [value]="band()"
                (change)="setBand($event)"
              >
                <option value="">All bands</option>
                <option value="strong">Strong</option>
                <option value="good">Good</option>
                <option value="watch">Watch</option>
                <option value="restricted">Restricted</option>
                <option value="high_risk">High risk</option>
                <option value="unrated">Unrated</option>
              </select>
            </label>
            <label
              class="label min-h-11 cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3"
            >
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                [checked]="overdueOnly()"
                (change)="toggleOverdue($event)"
              />
              <span class="label-text">Overdue only</span>
            </label>
            <label class="input input-bordered flex min-h-11 min-w-52 items-center gap-2">
              <app-icon name="heroMagnifyingGlass" />
              <input
                class="grow"
                type="search"
                placeholder="Search a party"
                [value]="search()"
                (input)="updateSearch($event)"
                (keyup.enter)="load()"
              />
            </label>
          </div>
          <p class="border-t border-base-200 pt-3 text-xs text-base-content/60">
            Scores use settled activity from the latest 365 days plus every open document. Advice
            never changes a limit automatically.
          </p>
        </div>
      </section>

      @if (error()) {
        <div role="alert" class="alert alert-error text-sm">
          <app-icon name="heroExclamationTriangle" />{{ error() }}
        </div>
      } @else if (loading() && profiles().length === 0) {
        <div class="flex min-h-56 items-center justify-center gap-2 text-sm text-base-content/60">
          <span class="loading loading-spinner"></span>Loading credit profiles
        </div>
      } @else if (profiles().length === 0) {
        <app-empty-state
          icon="heroCreditCard"
          title="No profiles match"
          description="Try a different band or allow up to two minutes after the first credit activity."
        />
      } @else {
        <div class="card overflow-hidden bg-base-100">
          <div class="hidden overflow-x-auto lg:block">
            <table class="table">
              <thead>
                <tr>
                  <th>{{ side() === 'customer' ? 'Customer' : 'Supplier' }}</th>
                  <th>Score</th>
                  <th>Evidence</th>
                  <th class="text-right">{{ side() === 'customer' ? 'Owes us' : 'We owe' }}</th>
                  <th class="text-right">Overdue</th>
                  <th>Recommendation</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (profile of profiles(); track profile.party_id) {
                  <tr>
                    <td>
                      <p class="font-semibold">{{ profile.party_name }}</p>
                      <p class="type-caption">
                        Updated {{ profile.refreshed_at | date: 'MMM d, h:mm a' }}
                      </p>
                    </td>
                    <td>
                      <app-score-badge
                        [score]="profile.score"
                        [band]="profile.band"
                        [confidence]="profile.confidence"
                      />
                    </td>
                    <td>
                      <p class="text-sm">{{ copy(profile.reason_codes[0]) }}</p>
                      <p class="type-caption">
                        {{ profile.confidence }} · {{ profile.settled_documents }} settled
                      </p>
                    </td>
                    <td class="text-right font-semibold tabular-nums">
                      {{ fmt(profile.balance) }}
                    </td>
                    <td
                      class="text-right tabular-nums"
                      [class.text-error]="profile.overdue_amount > 0"
                    >
                      {{ fmt(profile.overdue_amount) }}
                    </td>
                    <td class="max-w-64 text-sm">{{ copy(profile.recommendation_code) }}</td>
                    <td>
                      <a
                        class="btn btn-ghost btn-sm min-h-11"
                        [routerLink]="['/insights/credit', side(), profile.party_id]"
                        >Profile</a
                      >
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="divide-y divide-base-200 lg:hidden">
            @for (profile of profiles(); track profile.party_id) {
              <article class="space-y-3 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate font-semibold">{{ profile.party_name }}</p>
                    <p class="type-caption">
                      Updated {{ profile.refreshed_at | date: 'MMM d, h:mm a' }}
                    </p>
                  </div>
                  <app-score-badge
                    [score]="profile.score"
                    [band]="profile.band"
                    [confidence]="profile.confidence"
                  />
                </div>
                <p class="text-sm">{{ copy(profile.reason_codes[0]) }}</p>
                <dl class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt class="type-caption">{{ side() === 'customer' ? 'Owes us' : 'We owe' }}</dt>
                    <dd class="font-semibold tabular-nums">{{ fmt(profile.balance) }}</dd>
                  </div>
                  <div>
                    <dt class="type-caption">Overdue</dt>
                    <dd
                      class="font-semibold tabular-nums"
                      [class.text-error]="profile.overdue_amount > 0"
                    >
                      {{ fmt(profile.overdue_amount) }}
                    </dd>
                  </div>
                </dl>
                <div class="flex items-end justify-between gap-3">
                  <p class="type-caption max-w-64">{{ copy(profile.recommendation_code) }}</p>
                  <a
                    class="btn btn-ghost btn-sm min-h-11 shrink-0"
                    [routerLink]="['/insights/credit', side(), profile.party_id]"
                    >Profile</a
                  >
                </div>
              </article>
            }
          </div>
        </div>
        @if (nextCursor() !== null) {
          <div class="flex justify-center">
            <button
              appButton
              variant="outline"
              type="button"
              [loading]="loading()"
              (click)="loadMore()"
            >
              Load more
            </button>
          </div>
        }
      }

      <details class="collapse collapse-arrow border border-base-300 bg-base-100">
        <summary class="collapse-title font-semibold">Portfolio exposure and aging</summary>
        <div class="collapse-content"><app-money-credit /></div>
      </details>
    </section>
  `,
})
export class CreditInsightsComponent implements OnInit {
  private readonly insights = inject(InsightsService);
  protected readonly side = signal<'customer' | 'supplier'>('customer');
  protected readonly band = signal('');
  protected readonly overdueOnly = signal(false);
  protected readonly search = signal('');
  protected readonly profiles = signal<PartyCreditProfile[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly totalExposure = computed(() =>
    this.profiles().reduce((sum, item) => sum + item.balance, 0)
  );
  protected readonly copy = insightCopy;
  protected readonly fmt = formatKes;
  private loadRequest = 0;

  ngOnInit(): void {
    void this.load();
  }

  protected setSide(side: 'customer' | 'supplier'): void {
    this.side.set(side);
    void this.load();
  }
  protected setBand(event: Event): void {
    this.band.set((event.target as HTMLSelectElement).value);
    void this.load();
  }
  protected toggleOverdue(event: Event): void {
    this.overdueOnly.set((event.target as HTMLInputElement).checked);
    void this.load();
  }
  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected loadMore(): void {
    if (this.nextCursor() !== null) void this.load(true);
  }

  protected async load(append = false): Promise<void> {
    const cursor = append ? this.nextCursor() : null;
    if (append && cursor === null) return;
    const request = ++this.loadRequest;
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.insights.creditProfiles({
        side: this.side(),
        band: this.band() || null,
        overdueOnly: this.overdueOnly(),
        search: this.search().trim() || null,
        cursor,
      });
      if (request !== this.loadRequest) return;
      this.profiles.update(items => (append ? [...items, ...data.items] : data.items));
      this.nextCursor.set(data.nextCursor);
    } catch (error) {
      if (request !== this.loadRequest) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load credit profiles.');
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }
}
