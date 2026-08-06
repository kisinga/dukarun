import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { normalizeKenyanPhone } from '../core/phone';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { BillingCycle, BillingService, CompanyBilling, Tier } from './billing.service';
import { EntitlementsService } from '../core/entitlements.service';

type BadgeType = 'success' | 'info' | 'warning' | 'error' | 'neutral';

const STATUS_TYPE: Record<string, BadgeType> = {
  trial: 'info',
  active: 'success',
  expired: 'error',
  cancelled: 'neutral',
};

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 60_000;

@Component({
  selector: 'app-billing',
  imports: [ReactiveFormsModule, PageLayoutComponent, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <app-page title="Billing" backLink="/settings" backLabel="Settings">
      @if (loadError()) {
        <p class="mb-2 text-sm text-error">{{ loadError() }}</p>
      }

      <!-- Current plan -->
      @if (billing(); as b) {
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <div class="flex flex-wrap items-center gap-3">
              <h2 class="type-title">{{ b.subscription_tiers?.name ?? 'No plan' }}</h2>
              <app-status-badge
                [type]="statusType(b.subscription_status)"
                [label]="b.subscription_status ?? 'unknown'"
              />
              @if (b.billing_cycle) {
                <span class="type-caption">{{ b.billing_cycle }}</span>
              }
            </div>

            <dl class="mt-2 space-y-1 text-sm">
              @if (b.subscription_status === 'trial' && b.trial_ends_at) {
                <div class="flex justify-between">
                  <dt class="text-base-content/60">Trial ends</dt>
                  <dd class="tabular-nums">{{ date(b.trial_ends_at) }}</dd>
                </div>
              }
              @if (b.subscription_expires_at) {
                <div class="flex justify-between">
                  <dt class="text-base-content/60">
                    {{ b.subscription_status === 'expired' ? 'Expired' : 'Renews / expires' }}
                  </dt>
                  <dd class="tabular-nums">{{ date(b.subscription_expires_at) }}</dd>
                </div>
              }
              @if (b.last_payment_date) {
                <div class="flex justify-between">
                  <dt class="text-base-content/60">Last payment</dt>
                  <dd class="tabular-nums">
                    {{ date(b.last_payment_date) }} · {{ fmt(b.last_payment_amount ?? 0) }}
                  </dd>
                </div>
              }
            </dl>

            @if (inGrace(b)) {
              <div class="alert alert-warning mt-3">
                <span class="text-sm">
                  Your subscription has expired but you're in the grace period (until
                  {{ date(b.subscription_grace_period_end) }}). After that the workspace goes
                  read-only — renew now.
                </span>
              </div>
            }
            @if (exempt(b)) {
              <p class="mt-3 text-sm text-base-content/60">
                Billing exempt until {{ date(b.subscription_exempt_until) }}.
              </p>
            }
          </div>
        </div>
      }

      <!-- Pending payment state -->
      @if (pending(); as p) {
        <div class="card mb-4 border-warning/40 bg-base-100">
          <div class="card-body p-4">
            <h3 class="type-heading">Waiting for payment</h3>
            <p class="mt-1 text-sm">{{ p.displayText }}</p>
            <p class="type-caption mt-1">
              Activation happens when Paystack confirms — usually seconds. Reference:
              <span class="font-mono">{{ p.reference }}</span>
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button
                class="btn btn-primary btn-sm min-h-11"
                [disabled]="busy()"
                (click)="checkStatus()"
              >
                {{ busy() ? 'Checking…' : "I've paid — check status" }}
              </button>
              <button class="btn btn-ghost btn-sm" (click)="cancelPending()">Cancel</button>
              @if (pollTimedOut()) {
                <span class="type-caption">
                  Still pending — it will activate automatically once confirmed.
                </span>
              }
            </div>
          </div>
        </div>
      }

      <!-- Subscription plans -->
      <div class="mb-3 flex items-center justify-between">
        <h2 class="type-heading">Subscription plans</h2>
        <div role="tablist" class="tabs tabs-boxed">
          <a
            role="tab"
            class="tab min-h-11"
            [class.tab-active]="cycle() === 'monthly'"
            (click)="cycle.set('monthly')"
            >Monthly</a
          >
          <a
            role="tab"
            class="tab min-h-11"
            [class.tab-active]="cycle() === 'yearly'"
            (click)="cycle.set('yearly')"
            >Yearly</a
          >
        </div>
      </div>

      @if (tiers().length === 0) {
        <app-empty-state
          icon="heroBanknotes"
          title="No plans available"
          description="Subscription plans aren't configured for this environment."
        />
      } @else {
        <div class="grid gap-3 sm:grid-cols-2">
          @for (tier of tiers(); track tier.id) {
            <div
              class="card bg-base-100"
              [class.border-primary]="isCurrent(tier)"
              [class.border-2]="isCurrent(tier)"
            >
              <div class="card-body p-4">
                <div class="flex items-center gap-2">
                  <h3 class="type-heading">{{ tier.name }}</h3>
                  @if (isCurrent(tier)) {
                    <app-status-badge
                      [type]="billing()?.subscription_status === 'active' ? 'success' : 'info'"
                      [label]="
                        billing()?.subscription_status === 'active' ? 'current' : 'your plan'
                      "
                      size="xs"
                    />
                  }
                </div>
                <p class="type-hero mt-1">{{ fmt(priceFor(tier)) }}</p>
                <p class="type-caption">per {{ cycle() === 'monthly' ? 'month' : 'year' }}</p>
                <ul class="mt-2 space-y-0.5 text-sm">
                  @for (line of limitLines(tier); track line) {
                    <li>{{ line }}</li>
                  }
                </ul>

                @if (canPurchase(tier)) {
                  @if (choosing() === tier.id) {
                    <form
                      (submit)="$event.preventDefault(); pay(tier)"
                      class="mt-3 flex flex-col gap-2 border-t border-base-300/60 pt-3"
                    >
                      <label class="form-control">
                        <span class="label-text text-xs">M-Pesa phone number</span>
                        <input
                          type="tel"
                          class="input input-bordered input-sm"
                          placeholder="0712 345 678"
                          [formControl]="phone"
                        />
                      </label>
                      <button
                        type="submit"
                        class="btn btn-primary btn-sm min-h-11"
                        [disabled]="busy()"
                      >
                        {{ busy() ? 'Sending…' : 'Pay with M-Pesa' }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        (click)="choosing.set(null)"
                      >
                        Cancel
                      </button>
                    </form>
                  } @else {
                    <button
                      class="btn btn-primary btn-outline btn-sm mt-3 min-h-11"
                      [disabled]="busy() || pending() !== null"
                      (click)="choose(tier)"
                    >
                      {{ purchaseLabel(tier) }}
                    </button>
                  }
                }
              </div>
            </div>
          }
        </div>
      }

      @if (error()) {
        <p class="mt-3 text-sm text-error">{{ error() }}</p>
      }
    </app-page>
  `,
})
export class BillingComponent implements OnInit, OnDestroy {
  private readonly billingService = inject(BillingService);
  private readonly entitlements = inject(EntitlementsService);

  protected readonly fmt = formatKes;
  protected readonly billing = signal<CompanyBilling | null>(null);
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly cycle = signal<BillingCycle>('monthly');
  protected readonly choosing = signal<string | null>(null);
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly pending = signal<{ reference: string; displayText: string } | null>(null);
  protected readonly pollTimedOut = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollDeadline = 0;

  async ngOnInit(): Promise<void> {
    try {
      const [billing, tiers] = await Promise.all([
        this.billingService.companyBilling(),
        this.billingService.tiers(),
      ]);
      this.billing.set(billing);
      this.tiers.set(tiers);
      if (billing.billing_cycle === 'yearly') this.cycle.set('yearly');
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load billing');
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  protected statusType(status: string | null): BadgeType {
    return STATUS_TYPE[status ?? ''] ?? 'neutral';
  }

  protected date(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  protected inGrace(b: CompanyBilling): boolean {
    if (b.subscription_status !== 'expired' || !b.subscription_grace_period_end) return false;
    return new Date(b.subscription_grace_period_end) > new Date();
  }

  protected exempt(b: CompanyBilling): boolean {
    return !!b.subscription_exempt_until && new Date(b.subscription_exempt_until) > new Date();
  }

  protected isCurrent(tier: Tier): boolean {
    return this.billing()?.subscription_tier_id === tier.id;
  }

  protected canPurchase(tier: Tier): boolean {
    const billing = this.billing();
    return billing?.subscription_tier_id !== tier.id || billing.subscription_status !== 'active';
  }

  protected purchaseLabel(tier: Tier): string {
    const status = this.billing()?.subscription_status;
    if (this.isCurrent(tier) && (status === 'expired' || status === 'cancelled')) {
      return `Renew ${tier.name}`;
    }
    return `Subscribe to ${tier.name}`;
  }

  protected priceFor(tier: Tier): number {
    return this.cycle() === 'monthly' ? tier.price_monthly : tier.price_yearly;
  }

  /** Human-readable tier limits: "500 sales/mo", "5 team members", "50 SMS/mo". */
  protected limitLines(tier: Tier): string[] {
    const lines: string[] = [];
    if (tier.max_orders_per_month !== null)
      lines.push(`${tier.max_orders_per_month.toLocaleString('en-KE')} sales/mo`);
    if (tier.max_team_members !== null) lines.push(`${tier.max_team_members} team members`);
    if (tier.max_products !== null)
      lines.push(`${tier.max_products.toLocaleString('en-KE')} products`);
    if (tier.max_stock_locations !== null)
      lines.push(`${tier.max_stock_locations} stock location(s)`);
    if (tier.sms_per_period !== null)
      lines.push(`${tier.sms_per_period.toLocaleString('en-KE')} SMS/mo`);
    if (tier.multiple_locations_enabled) lines.push('Multiple stock locations');
    if (tier.staff_performance_enabled) lines.push('Staff performance');
    if (tier.commissions_available) lines.push('Sales commissions');
    return lines;
  }

  protected choose(tier: Tier): void {
    this.choosing.set(tier.id);
    this.phone.setValue('');
    this.error.set(null);
  }

  protected async pay(tier: Tier): Promise<void> {
    const normalized = normalizeKenyanPhone(this.phone.value);
    if (!normalized) {
      this.error.set('Enter a valid Kenyan number, e.g. 0712345678 or +254712345678');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.billingService.charge(tier.id, this.cycle(), normalized);
      this.choosing.set(null);
      this.pending.set({ reference: result.reference, displayText: result.display_text });
      this.startPolling();
    } catch (err) {
      // Local stack: paystack-charge 502s against real Paystack with the mock
      // key — the message is shown verbatim.
      this.error.set(err instanceof Error ? err.message : 'Payment request failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async checkStatus(): Promise<void> {
    this.busy.set(true);
    try {
      const billing = await this.billingService.companyBilling();
      this.billing.set(billing);
      if (billing.subscription_status === 'active') {
        this.cancelPending();
        // Plan gates read entitlements loaded at app start — refresh so a
        // just-paid upgrade unlocks immediately, without a full reload.
        void this.entitlements.refresh();
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Status check failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected cancelPending(): void {
    this.pending.set(null);
    this.stopPolling();
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimedOut.set(false);
    this.pollDeadline = Date.now() + POLL_TIMEOUT_MS;
    this.pollTimer = setInterval(() => {
      if (Date.now() > this.pollDeadline) {
        this.stopPolling();
        this.pollTimedOut.set(true);
        return;
      }
      void this.checkStatusQuietly();
    }, POLL_INTERVAL_MS);
  }

  private async checkStatusQuietly(): Promise<void> {
    try {
      const billing = await this.billingService.companyBilling();
      this.billing.set(billing);
      if (billing.subscription_status === 'active') {
        this.cancelPending();
        void this.entitlements.refresh();
      }
    } catch {
      // silent — the manual button reports errors
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
