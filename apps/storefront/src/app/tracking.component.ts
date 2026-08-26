import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { PoweredByDukarunComponent } from './powered-by-dukarun.component';
import { StorefrontService, type PublicFulfillmentTracking } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';

@Component({
  selector: 'app-tracking',
  imports: [PoweredByDukarunComponent],
  template: `
    <main class="min-h-screen bg-base-200 px-4 py-8 sm:py-12">
      <div class="mx-auto max-w-xl">
        @if (loading()) {
          <div class="flex min-h-72 items-center justify-center" aria-label="Loading order">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        } @else if (tracking(); as order) {
          <header class="border-b border-base-300 pb-5">
            <p class="text-sm font-medium text-base-content/60">{{ order.order_code }}</p>
            <h1 class="mt-1 text-2xl font-bold">{{ order.merchant_name }}</h1>
            <div class="mt-4 flex flex-wrap items-center gap-2">
              <span class="badge badge-lg" [class]="statusClass(order.status)">
                {{ statusLabel(order.status) }}
              </span>
              <span class="text-sm text-base-content/60">{{
                typeLabel(order.fulfillment_type)
              }}</span>
            </div>
            @if (order.promised_at && !terminal(order.status)) {
              <p class="mt-3 text-sm">
                Expected <strong>{{ dateTime(order.promised_at) }}</strong>
              </p>
            }
          </header>

          <section class="py-6" aria-labelledby="progress-heading">
            <h2 id="progress-heading" class="font-semibold">Progress</h2>
            @if (order.status === 'failed') {
              <p class="alert alert-warning mt-3 text-sm">
                The delivery could not be completed. The merchant will arrange the next step.
              </p>
            } @else if (order.status === 'cancelled') {
              <p class="alert alert-error mt-3 text-sm">This order was cancelled.</p>
            }
            <ol class="mt-4 space-y-0">
              @for (step of steps(order); track step.status; let last = $last) {
                <li class="grid grid-cols-[1.25rem_1fr] gap-3">
                  <div class="flex flex-col items-center">
                    <span
                      class="mt-0.5 h-3 w-3 rounded-full border-2"
                      [class.border-primary]="step.reached"
                      [class.bg-primary]="step.reached"
                      [class.border-base-300]="!step.reached"
                    ></span>
                    @if (!last) {
                      <span
                        class="min-h-10 w-px flex-1"
                        [class.bg-primary]="step.reached"
                        [class.bg-base-300]="!step.reached"
                      ></span>
                    }
                  </div>
                  <div class="pb-5">
                    <p class="text-sm font-medium" [class.text-base-content/45]="!step.reached">
                      {{ statusLabel(step.status) }}
                    </p>
                    @if (step.at) {
                      <p class="text-xs text-base-content/55">{{ dateTime(step.at) }}</p>
                    }
                  </div>
                </li>
              }
            </ol>
          </section>

          <section class="border-y border-base-300 py-5" aria-labelledby="items-heading">
            <h2 id="items-heading" class="font-semibold">Order items</h2>
            <ul class="mt-3 divide-y divide-base-300/70">
              @for (item of order.items; track item.name) {
                <li class="flex items-start gap-3 py-2.5 text-sm">
                  <span class="w-10 shrink-0 text-right font-medium tabular-nums"
                    >{{ item.quantity }}x</span
                  >
                  <span>{{ item.name }}</span>
                </li>
              }
            </ul>
          </section>

          <footer class="pt-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-base-content/50">Updated {{ dateTime(order.updated_at) }}</p>
              @if (order.merchant_phone) {
                <a
                  class="btn btn-outline btn-sm"
                  [href]="contactLink(order.merchant_phone)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contact merchant
                </a>
              }
            </div>
            <p class="mt-8 text-center text-xs text-base-content/50">
              <app-powered-by-dukarun />
            </p>
          </footer>
        } @else {
          <section class="py-20 text-center">
            <h1 class="text-xl font-bold">Tracking unavailable</h1>
            <p class="mx-auto mt-2 max-w-sm text-sm text-base-content/60">
              This link expired or was replaced. Ask the merchant for a new tracking link.
            </p>
          </section>
        }
      </div>
    </main>
  `,
})
export class TrackingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly storefront = inject(StorefrontService);
  private readonly seo = inject(StorefrontSeoService);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  protected readonly tracking = signal<PublicFulfillmentTracking | null>(null);
  protected readonly loading = signal(true);
  private token = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly visibilityHandler = () => this.visibilityChanged();

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.seo.set('Track order', 'Private pickup and delivery tracking.', '/track', true);
    this.meta.updateTag({ name: 'referrer', content: 'no-referrer' });
    this.document.addEventListener('visibilitychange', this.visibilityHandler);
    await this.refresh();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.meta.removeTag('name="referrer"');
  }

  private async refresh(): Promise<void> {
    try {
      this.tracking.set(this.token ? await this.storefront.fulfillmentTracking(this.token) : null);
    } catch {
      if (this.loading()) this.tracking.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private visibilityChanged(): void {
    if (this.document.visibilityState === 'visible') {
      void this.refresh();
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  private startPolling(): void {
    if (this.pollTimer || this.document.visibilityState !== 'visible') return;
    this.pollTimer = setInterval(() => void this.refresh(), 20_000);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  protected steps(order: PublicFulfillmentTracking): Array<{
    status: string;
    reached: boolean;
    at: string | null;
  }> {
    const statuses =
      order.fulfillment_type === 'pickup'
        ? ['pending', 'processing', 'ready', 'fulfilled']
        : ['pending', 'processing', 'ready', 'in_transit', 'fulfilled'];
    const reachedStatuses = new Set(order.milestones.map(milestone => milestone.status));
    return statuses.map(status => ({
      status,
      reached: reachedStatuses.has(status) || order.status === 'fulfilled',
      at: this.latestMilestone(order.milestones, status),
    }));
  }

  private latestMilestone(
    milestones: PublicFulfillmentTracking['milestones'],
    status: string
  ): string | null {
    for (let index = milestones.length - 1; index >= 0; index--) {
      if (milestones[index].status === status) return milestones[index].at;
    }
    return status === 'pending' ? (milestones[0]?.at ?? null) : null;
  }

  protected statusLabel(status: string): string {
    return status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  protected typeLabel(type: 'pickup' | 'delivery'): string {
    return type === 'pickup' ? 'Pickup order' : 'Delivery order';
  }

  protected statusClass(status: string): string {
    if (status === 'fulfilled') return 'badge-success';
    if (status === 'failed') return 'badge-warning';
    if (status === 'cancelled') return 'badge-error';
    return 'badge-info';
  }

  protected terminal(status: string): boolean {
    return status === 'fulfilled' || status === 'cancelled';
  }

  protected dateTime(value: string): string {
    return new Date(value).toLocaleString('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  protected contactLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `https://wa.me/${digits}`;
  }
}
