import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CompanyService } from '../../../../core/services/company.service';
import {
  SubscriptionService,
  type SubscriptionTier,
} from '../../../../core/services/subscription.service';
import { PaymentModalComponent } from './payment-modal.component';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-subscription-status',
  imports: [CommonModule, PaymentModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body space-y-6">
        <!-- Subscription Status Header -->
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold">Subscription Status</h2>
            <p class="text-sm text-base-content/60 mt-1">Manage your subscription and billing</p>
          </div>
          @if (subscriptionService.isExpired()) {
            <button class="btn btn-primary" (click)="openPaymentModal()">Renew Now</button>
          }
        </div>

        <!-- Status Badge -->
        <div class="flex items-center gap-3">
          @if (subscriptionService.isTrialActive()) {
            <div class="badge badge-info badge-lg gap-2">
              <span class="w-2 h-2 bg-info-content rounded-full animate-pulse"></span>
              Trial Active
            </div>
            @if (daysRemaining() !== null) {
              <span class="text-sm text-base-content/70">
                {{ daysRemaining() }} days remaining
              </span>
            }
          } @else if (subscriptionService.isSubscriptionActive()) {
            <div class="badge badge-success badge-lg gap-2">
              <span class="w-2 h-2 bg-success-content rounded-full"></span>
              Active Subscription
            </div>
            @if (subscriptionService.subscriptionStatus()?.daysRemaining) {
              <span class="text-sm text-base-content/70">
                Renews in {{ subscriptionService.subscriptionStatus()?.daysRemaining }} days
              </span>
            }
          } @else if (subscriptionService.isExpired()) {
            <div class="badge badge-error badge-lg gap-2">
              <span class="w-2 h-2 bg-error-content rounded-full"></span>
              Subscription Expired
            </div>
            <span class="text-sm text-error">Please renew to continue using all features</span>
          }
        </div>

        <!-- Trial Information -->
        @if (subscriptionService.isTrialActive()) {
          <div class="alert alert-info">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="stroke-current shrink-0 w-6 h-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <div>
              <h3 class="font-bold">Trial Period</h3>
              <div class="text-xs">Your trial ends on {{ trialEndsAt() | date: 'medium' }}</div>
              <div class="text-xs mt-1">
                Subscribe now to continue using all features after your trial ends.
              </div>
            </div>
          </div>
        }

        <!-- Expired Warning -->
        @if (subscriptionService.isExpired()) {
          <div class="alert alert-error">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h3 class="font-bold">Subscription Expired</h3>
              <div class="text-xs">
                Your subscription has expired. You can view data but cannot create or edit.
              </div>
              <div class="text-xs mt-1">Renew your subscription to regain full access.</div>
            </div>
          </div>
        }

        <!-- Active Subscription Details -->
        @if (
          subscriptionService.isSubscriptionActive() && subscriptionService.subscriptionStatus()
        ) {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="card bg-base-200">
              <div class="card-body p-4">
                <h3 class="font-semibold text-sm">Current Plan</h3>
                @if (currentTierName()) {
                  <p class="text-2xl font-bold mt-1">{{ currentTierName() }}</p>
                }
                @if (billingCycle()) {
                  <p class="text-xs text-base-content/60 mt-1">{{ billingCycle() }}</p>
                }
              </div>
            </div>
            <div class="card bg-base-200">
              <div class="card-body p-4">
                <h3 class="font-semibold text-sm">Next Billing Date</h3>
                <p class="text-lg font-semibold mt-1">
                  {{ subscriptionExpiresAt() | date: 'mediumDate' }}
                </p>
                <p class="text-xs text-base-content/60 mt-1">
                  @if (subscriptionService.subscriptionStatus()?.daysRemaining) {
                    {{ subscriptionService.subscriptionStatus()?.daysRemaining }} days remaining
                  }
                </p>
              </div>
            </div>
          </div>
        }

        <!-- Action Buttons -->
        <div class="flex gap-3">
          @if (!subscriptionService.isExpired()) {
            <button class="btn btn-outline" (click)="openPaymentModal()">Upgrade Plan</button>
            <button class="btn btn-ghost" (click)="cancelSubscription()">
              Cancel Subscription
            </button>
          } @else {
            <button class="btn btn-primary" (click)="openPaymentModal()">Renew Subscription</button>
          }
        </div>
      </div>
    </div>

    <!-- Payment Modal -->
    <app-payment-modal
      [isOpen]="isPaymentModalOpen()"
      [tier]="selectedTier()"
      (closed)="closePaymentModal()"
      (paymentInitiated)="onPaymentInitiated($event)"
    />
  `,
})
export class SubscriptionStatusComponent implements OnInit {
  protected readonly companyService = inject(CompanyService);
  protected readonly subscriptionService = inject(SubscriptionService);
  protected readonly toastService = inject(ToastService);

  private readonly selectedTierIdSignal = signal<string | null>(null);
  private readonly isPaymentModalOpenSignal = signal(false);
  private readonly channelSubscriptionSignal = signal<any>(null);

  protected readonly isPaymentModalOpen = this.isPaymentModalOpenSignal.asReadonly();
  protected readonly channelSubscription = this.channelSubscriptionSignal.asReadonly();

  /**
   * Helper function to validate tier ID
   * Checks: not null/undefined, not "-1", matches UUID format
   */
  private isValidTierId(id: string | null | undefined): boolean {
    if (!id || id === '-1') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Helper function to get valid tiers from the tiers array
   */
  private getValidTiers(): SubscriptionTier[] {
    return this.subscriptionService.tiers().filter((tier) => tier && this.isValidTierId(tier.id));
  }

  protected readonly daysRemaining = computed(() => {
    const status = this.subscriptionService.subscriptionStatus();
    return status?.daysRemaining ?? null;
  });

  protected readonly trialEndsAt = computed(() => {
    return this.companyService.trialEndsAt();
  });

  protected readonly subscriptionExpiresAt = computed(() => {
    return this.companyService.subscriptionExpiresAt();
  });

  protected readonly currentTierName = computed(() => {
    const subscription = this.channelSubscription();
    // Only show tier name when subscription is active (not trial)
    if (this.subscriptionService.isSubscriptionActive() && subscription?.tier?.name) {
      return subscription.tier.name;
    }
    return null;
  });

  protected readonly billingCycle = computed(() => {
    const subscription = this.channelSubscription();
    if (subscription?.billingCycle) {
      // Capitalize first letter: "monthly" -> "Monthly", "yearly" -> "Yearly"
      return subscription.billingCycle.charAt(0).toUpperCase() + subscription.billingCycle.slice(1);
    }
    return null;
  });

  protected readonly selectedTier = computed(() => {
    const tierId = this.selectedTierIdSignal();
    const validTiers = this.getValidTiers();

    // If selectedTierIdSignal contains "-1", reset it and return first valid tier
    if (tierId === '-1') {
      return validTiers.length > 0 ? validTiers[0] : null;
    }

    if (!tierId) {
      // If no tier selected, use first available valid tier
      return validTiers.length > 0 ? validTiers[0] : null;
    }

    // Validate the selected tier ID
    if (!this.isValidTierId(tierId)) {
      // Invalid tier ID, return first valid tier or null
      return validTiers.length > 0 ? validTiers[0] : null;
    }

    // Find the tier by ID, but only if it's valid
    const tier = validTiers.find((t) => t.id === tierId);
    const result = tier || (validTiers.length > 0 ? validTiers[0] : null);

    // Final defensive check: ensure returned tier doesn't have id "-1"
    if (result && (result.id === '-1' || !this.isValidTierId(result.id))) {
      return validTiers.length > 0 ? validTiers[0] : null;
    }

    return result;
  });

  async ngOnInit() {
    await this.subscriptionService.checkSubscriptionStatus();
    await this.subscriptionService.getSubscriptionTiers();
    const subscription = await this.subscriptionService.getChannelSubscription();
    this.channelSubscriptionSignal.set(subscription);
  }

  openPaymentModal() {
    const validTiers = this.getValidTiers();
    if (validTiers.length === 0) {
      this.toastService.show(
        'No Plans Available',
        'Please try again later. Subscription tiers are being loaded.',
        'warning',
        3000,
      );
      return;
    }

    // Reset invalid tier ID if it contains "-1"
    const currentTierId = this.selectedTierIdSignal();
    if (currentTierId === '-1' || (currentTierId && !this.isValidTierId(currentTierId))) {
      this.selectedTierIdSignal.set(null);
    }

    // Select first valid tier by default if none selected or if current is invalid
    if (!this.selectedTierIdSignal()) {
      const firstTier = validTiers[0];
      if (!firstTier || !this.isValidTierId(firstTier.id)) {
        this.toastService.show(
          'Invalid Tier',
          'Please select a valid subscription tier.',
          'error',
          3000,
        );
        return;
      }
      this.selectedTierIdSignal.set(firstTier.id);
    }

    // Validate selected tier exists and is valid
    const selectedTier = this.selectedTier();
    if (!selectedTier) {
      this.toastService.show(
        'Invalid Tier',
        'Please select a valid subscription tier.',
        'error',
        3000,
      );
      return;
    }

    // Final defensive check: ensure tier doesn't have id "-1"
    if (selectedTier.id === '-1' || !this.isValidTierId(selectedTier.id)) {
      this.toastService.show(
        'Invalid Tier',
        'The selected tier is invalid. Please refresh the page and try again.',
        'error',
        3000,
      );
      // Reset to first valid tier
      const firstTier = validTiers[0];
      if (firstTier && this.isValidTierId(firstTier.id)) {
        this.selectedTierIdSignal.set(firstTier.id);
      } else {
        this.selectedTierIdSignal.set(null);
      }
      return;
    }

    this.isPaymentModalOpenSignal.set(true);
  }

  closePaymentModal() {
    this.isPaymentModalOpenSignal.set(false);
  }

  onPaymentInitiated(event: { reference: string; authorizationUrl?: string }) {
    this.toastService.show(
      'Payment Initiated',
      'Please complete the payment on your phone. We will notify you when payment is confirmed.',
      'info',
      5000,
    );

    // Refresh subscription status after payment is initiated
    // The payment modal will handle polling and verification
    this.subscriptionService.checkSubscriptionStatus();
  }

  async cancelSubscription() {
    if (
      confirm('Are you sure you want to cancel your subscription? This will disable auto-renewal.')
    ) {
      const success = await this.subscriptionService.cancelSubscription();
      if (success) {
        await this.subscriptionService.checkSubscriptionStatus();
        this.toastService.show(
          'Subscription Cancelled',
          'Your subscription will not auto-renew. You can still use the service until the current period ends.',
          'success',
          5000,
        );
      } else {
        this.toastService.show(
          'Error',
          'Failed to cancel subscription. Please try again.',
          'error',
          3000,
        );
      }
    }
  }
}
