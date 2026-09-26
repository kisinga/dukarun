import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { LocationContextService } from '../core/location-context.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { InsightsService } from './insights.service';
import { insightCopy, type InsightSignal } from './insights.models';

@Component({
  selector: 'app-attention-insights',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
  ],
  template: `
    <section class="space-y-4">
      <section class="card bg-base-100" aria-labelledby="attention-workspace-title">
        <div class="card-body gap-4 p-4 sm:p-5">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 id="attention-workspace-title" class="section-title">Decision queue</h2>
              <p class="type-caption mt-1">
                Start with urgent cash-flow and stock issues, or narrow the queue by area.
              </p>
            </div>
            <button
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Refresh attention"
              aria-label="Refresh attention"
              [loading]="loading()"
              (click)="load()"
            >
              <app-icon name="heroArrowPath" />
            </button>
          </header>
          <div class="section-tabs" role="tablist" aria-label="Attention area">
            @for (item of domains; track item.value) {
              <button
                role="tab"
                type="button"
                class="section-tab"
                [class.section-tab-active]="domain() === item.value"
                [attr.aria-selected]="domain() === item.value"
                (click)="setDomain(item.value)"
              >
                {{ item.label }}
              </button>
            }
          </div>
        </div>
      </section>

      @if (error()) {
        <div role="alert" class="alert alert-error text-sm">
          <app-icon name="heroExclamationTriangle" />{{ error() }}
        </div>
      } @else if (loading() && items().length === 0) {
        <div class="flex min-h-56 items-center justify-center gap-2 text-sm text-base-content/60">
          <span class="loading loading-spinner"></span> Loading attention
        </div>
      } @else if (items().length === 0) {
        <app-empty-state
          icon="heroCheckCircle"
          title="Nothing needs attention"
          description="Resolved items leave this list automatically. New credit and stock signals usually appear within two minutes."
        />
      } @else {
        <div class="grid items-start gap-4 xl:grid-cols-2">
          <section class="card bg-base-100" aria-labelledby="critical-title">
            <div class="card-body gap-0 p-0">
              <header class="border-b border-base-200 p-4">
                <div class="flex items-center gap-2">
                  <span class="status status-error"></span>
                  <h2 id="critical-title" class="section-title">Critical now</h2>
                </div>
                <p class="type-caption mt-1">
                  Decisions that protect cash flow or prevent missed sales.
                </p>
              </header>
              @if (critical().length === 0) {
                <app-empty-state
                  [compact]="true"
                  icon="heroCheckCircle"
                  title="No critical issues"
                />
              }
              @for (item of critical(); track item.domain + item.entity_id) {
                <ng-container *ngTemplateOutlet="attentionRow; context: { $implicit: item }" />
              }
            </div>
          </section>
          <section class="card bg-base-100" aria-labelledby="plan-title">
            <div class="card-body gap-0 p-0">
              <header class="border-b border-base-200 p-4">
                <div class="flex items-center gap-2">
                  <span class="status status-warning"></span>
                  <h2 id="plan-title" class="section-title">Plan next</h2>
                </div>
                <p class="type-caption mt-1">
                  Watch-list items worth addressing before they become urgent.
                </p>
              </header>
              @if (plan().length === 0) {
                <app-empty-state
                  [compact]="true"
                  icon="heroCheckCircle"
                  title="Nothing queued to plan"
                />
              }
              @for (item of plan(); track item.domain + item.entity_id) {
                <ng-container *ngTemplateOutlet="attentionRow; context: { $implicit: item }" />
              }
            </div>
          </section>
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
    </section>

    <ng-template #attentionRow let-item>
      <article class="border-b border-base-200 p-4 last:border-b-0">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ item.title }}</h3>
              <span
                class="badge badge-sm"
                [class.badge-error]="item.urgency === 'critical'"
                [class.badge-warning]="item.urgency === 'plan'"
                >{{ signalLabel(item.signal) }}</span
              >
            </div>
            <p class="mt-1 text-sm">{{ copy(item.reason_code) }}</p>
            <p class="type-caption mt-1">{{ copy(item.consequence_code) }}</p>
            <p class="type-caption mt-2">Updated {{ item.refreshed_at | date: 'MMM d, h:mm a' }}</p>
          </div>
          <div class="shrink-0 text-right">
            @if (item.amount !== null) {
              <p class="font-semibold tabular-nums">{{ fmt(item.amount) }}</p>
            }
            @if (item.stock !== null) {
              <p class="font-semibold tabular-nums">{{ item.stock }} in stock</p>
            }
            <a class="btn btn-ghost btn-sm mt-2 min-h-11" [routerLink]="item.href">Review</a>
          </div>
        </div>
      </article>
    </ng-template>
  `,
})
export class AttentionInsightsComponent implements OnInit {
  private readonly insights = inject(InsightsService);
  private readonly locations = inject(LocationContextService);
  protected readonly domain = signal<'all' | 'credit' | 'products'>('all');
  protected readonly items = signal<InsightSignal[]>([]);
  protected readonly nextCursor = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly critical = computed(() =>
    this.items().filter(item => item.urgency === 'critical')
  );
  protected readonly plan = computed(() => this.items().filter(item => item.urgency === 'plan'));
  protected readonly domains = [
    { value: 'all' as const, label: 'All' },
    { value: 'credit' as const, label: 'Credit' },
    { value: 'products' as const, label: 'Inventory' },
  ];
  protected readonly copy = insightCopy;
  protected readonly fmt = formatKes;
  private loadRequest = 0;

  async ngOnInit(): Promise<void> {
    await this.locations.load();
    await this.load();
  }

  protected setDomain(value: 'all' | 'credit' | 'products'): void {
    this.domain.set(value);
    void this.load();
  }

  protected loadMore(): void {
    if (this.nextCursor() !== null) void this.load(true);
  }

  protected async load(append = false): Promise<void> {
    const cursor = append ? this.nextCursor() : 0;
    if (append && cursor === null) return;
    const request = ++this.loadRequest;
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.insights.attention(
        this.domain(),
        this.locations.activeId(),
        cursor ?? 0
      );
      if (request !== this.loadRequest) return;
      this.items.update(items => (append ? [...items, ...data.items] : data.items));
      this.nextCursor.set(data.nextCursor);
    } catch (error) {
      if (request !== this.loadRequest) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load attention items.');
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }

  protected signalLabel(signal: string): string {
    return signal.replaceAll('_', ' ');
  }
}
