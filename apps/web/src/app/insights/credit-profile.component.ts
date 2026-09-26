import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { InsightsService } from './insights.service';
import { insightCopy, type PartyCreditProfile } from './insights.models';
import { ScoreBadgeComponent } from './score-badge.component';

@Component({
  selector: 'app-credit-profile',
  imports: [DatePipe, RouterLink, EmptyStateComponent, IconComponent, ScoreBadgeComponent],
  template: `
    @if (loading()) {
      <div class="flex min-h-64 items-center justify-center gap-2 text-sm text-base-content/60">
        <span class="loading loading-spinner"></span>Loading profile
      </div>
    } @else if (error()) {
      <div role="alert" class="alert alert-error">
        <app-icon name="heroExclamationTriangle" />{{ error() }}
      </div>
    } @else if (profile(); as item) {
      <section class="space-y-4">
        <a routerLink="/insights/credit" class="btn btn-ghost btn-sm min-h-11"
          ><app-icon name="heroChevronLeft" />Credit portfolio</a
        >
        <article class="card bg-base-100">
          <div class="card-body p-4 sm:p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="type-caption">
                  {{
                    item.side === 'supplier'
                      ? 'Our payment standing with'
                      : 'Customer credit profile'
                  }}
                </p>
                <h2 class="text-xl font-bold">{{ item.party_name }}</h2>
              </div>
              <div class="text-right">
                <app-score-badge
                  [score]="item.score"
                  [band]="item.band"
                  [confidence]="item.confidence"
                />
                <p class="type-caption mt-1">
                  Updated {{ item.refreshed_at | date: 'MMM d, h:mm a' }}
                </p>
              </div>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Live balance</p>
                <p class="text-lg font-bold">{{ fmt(item.balance) }}</p>
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Credit limit</p>
                <p class="text-lg font-bold">
                  {{ item.credit_limit > 0 ? fmt(item.credit_limit) : 'Not set' }}
                </p>
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Available</p>
                <p class="text-lg font-bold">
                  {{ item.available_credit === null ? 'No limit' : fmt(item.available_credit) }}
                </p>
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Overdue</p>
                <p class="text-lg font-bold" [class.text-error]="item.overdue_amount > 0">
                  {{ fmt(item.overdue_amount) }}
                </p>
              </div>
            </div>
            <div class="mt-4 rounded-box border border-base-300 p-4">
              <h3 class="font-semibold">What is driving this</h3>
              <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
                @for (reason of item.reason_codes; track reason) {
                  <li>{{ copy(reason) }}</li>
                }
              </ul>
              <p class="mt-3 text-sm font-medium">{{ copy(item.recommendation_code) }}</p>
              <p class="type-caption mt-1">
                Advice is not applied automatically. Applying it only prefills the existing
                credit-policy workflow.
              </p>
            </div>
          </div>
        </article>

        <div class="grid items-start gap-4 xl:grid-cols-3">
          <article class="card bg-base-100 xl:col-span-2">
            <div class="card-body p-0">
              <header class="border-b border-base-200 p-4">
                <h3 class="section-title">Payment history</h3>
                <p class="type-caption mt-1">
                  Document evidence; adjustments reduce exposure but do not count as repayment
                  performance.
                </p>
              </header>
              @if (!item.documents?.length) {
                <app-empty-state
                  [compact]="true"
                  icon="heroDocumentText"
                  title="No document evidence yet"
                />
              }
              @for (document of item.documents ?? []; track document.document_id) {
                <div
                  class="grid gap-2 border-b border-base-200 p-4 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <div>
                    <a
                      class="font-semibold link link-hover"
                      [routerLink]="item.side === 'supplier' ? '/purchases' : '/orders'"
                      [queryParams]="
                        item.side === 'supplier'
                          ? { purchase: document.document_id }
                          : {
                              order: document.document_id,
                              customer: item.party_id,
                              range: 'all',
                            }
                      "
                      >{{ document.document_code }}</a
                    >
                    <p class="type-caption">
                      Issued {{ document.issued_on | date: 'mediumDate' }} · due
                      {{ document.due_on | date: 'mediumDate' }}
                    </p>
                  </div>
                  <div class="sm:text-right">
                    <p class="type-caption">Outstanding</p>
                    <p class="font-semibold">{{ fmt(document.outstanding_amount) }}</p>
                  </div>
                  <span
                    class="badge"
                    [class.badge-error]="document.overdue_days > 30"
                    [class.badge-warning]="document.overdue_days > 0 && document.overdue_days <= 30"
                    [class.badge-success]="document.overdue_days === 0"
                    >{{
                      document.outstanding_amount > 0
                        ? document.overdue_days > 0
                          ? document.overdue_days + 'd overdue'
                          : 'Current'
                        : paymentLabel(document.settled_days_late)
                    }}</span
                  >
                </div>
              }
            </div>
          </article>
          <div class="space-y-4">
            <article class="card bg-base-100">
              <div class="card-body p-4">
                <h3 class="section-title">Score history</h3>
                <p class="type-caption">
                  Recorded only when the displayed score, band, or confidence changes.
                </p>
                <ol class="mt-3 space-y-3">
                  @for (event of item.events ?? []; track event.created_at) {
                    <li class="flex items-center justify-between gap-2">
                      <div>
                        <app-score-badge
                          [score]="event.score"
                          [band]="event.band"
                          [confidence]="event.confidence"
                        />
                        <p class="type-caption mt-1">{{ event.created_at | date: 'medium' }}</p>
                      </div>
                    </li>
                  }
                </ol>
              </div>
            </article>
            <article class="card border border-warning/30 bg-warning/5">
              <div class="card-body p-4">
                <h3 class="section-title">Illustrative opportunity cost</h3>
                <p class="text-xl font-bold">{{ fmt(item.opportunity_cost) }}</p>
                <p class="type-caption">
                  At the company’s annual illustration rate. Internal only—never added to balances,
                  statements, messages, or the ledger.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
    } @else {
      <app-empty-state
        icon="heroCreditCard"
        title="Profile is updating"
        description="The first profile normally appears within two minutes of credit activity."
      />
    }
  `,
})
export class CreditProfileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly insights = inject(InsightsService);
  protected readonly profile = signal<PartyCreditProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly copy = insightCopy;
  protected readonly fmt = formatKes;

  async ngOnInit(): Promise<void> {
    const partyId = this.route.snapshot.paramMap.get('partyId');
    const side = this.route.snapshot.paramMap.get('side');
    if (!partyId || (side !== 'customer' && side !== 'supplier')) {
      this.error.set('Invalid credit profile.');
      this.loading.set(false);
      return;
    }
    try {
      this.profile.set(await this.insights.creditProfile(partyId, side));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load this profile.');
    } finally {
      this.loading.set(false);
    }
  }

  protected paymentLabel(days: number | null): string {
    if (days === null) return 'Settled';
    if (days <= 0) return 'On time';
    return `${days}d late`;
  }
}
