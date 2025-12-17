import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CompanyService } from '../../../../../core/services/company.service';
import {
  SubscriptionService,
  type SubscriptionTier,
} from '../../../../../core/services/subscription.service';
import { PaymentModalComponent } from '../payment-modal/payment-modal.component';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-subscription-status',
  imports: [CommonModule, PaymentModalComponent],
  templateUrl: './subscription-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionStatusComponent implements OnInit {
  readonly companyService = inject(CompanyService);
  readonly subscriptionService = inject(SubscriptionService);
  private readonly toastService = inject(ToastService);

  private readonly selectedTierIdSignal = signal<string | null>(null);
  private readonly isPaymentModalOpenSignal = signal(false);
  private readonly channelSubscriptionSignal = signal<any>(null);

  readonly isPaymentModalOpen = this.isPaymentModalOpenSignal.asReadonly();
  readonly channelSubscription = this.channelSubscriptionSignal.asReadonly();

  private isValidTierId(id: string | null | undefined): boolean {
    if (!id || id === '-1') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private getValidTiers(): SubscriptionTier[] {
    return this.subscriptionService.tiers().filter((tier) => tier && this.isValidTierId(tier.id));
  }

  readonly daysRemaining = computed(() => {
    return this.subscriptionService.subscriptionStatus()?.daysRemaining ?? null;
  });

  readonly trialEndsAt = computed(() => this.companyService.trialEndsAt());
  readonly subscriptionExpiresAt = computed(() => this.companyService.subscriptionExpiresAt());

  readonly currentTierName = computed(() => {
    const subscription = this.channelSubscription();
    if (this.subscriptionService.isSubscriptionActive() && subscription?.tier?.name) {
      return subscription.tier.name;
    }
    return null;
  });

  readonly billingCycle = computed(() => {
    const subscription = this.channelSubscription();
    if (subscription?.billingCycle) {
      return subscription.billingCycle.charAt(0).toUpperCase() + subscription.billingCycle.slice(1);
    }
    return null;
  });

  readonly selectedTier = computed(() => {
    const tierId = this.selectedTierIdSignal();
    const validTiers = this.getValidTiers();

    if (tierId === '-1') return validTiers[0] || null;
    if (!tierId) return validTiers[0] || null;
    if (!this.isValidTierId(tierId)) return validTiers[0] || null;

    const tier = validTiers.find((t) => t.id === tierId);
    const result = tier || validTiers[0] || null;

    if (result && (result.id === '-1' || !this.isValidTierId(result.id))) {
      return validTiers[0] || null;
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
      this.toastService.show('No Plans Available', 'Please try again later.', 'warning', 3000);
      return;
    }

    const currentTierId = this.selectedTierIdSignal();
    if (currentTierId === '-1' || (currentTierId && !this.isValidTierId(currentTierId))) {
      this.selectedTierIdSignal.set(null);
    }

    if (!this.selectedTierIdSignal()) {
      const firstTier = validTiers[0];
      if (!firstTier || !this.isValidTierId(firstTier.id)) {
        this.toastService.show('Invalid Tier', 'Please select a valid tier.', 'error', 3000);
        return;
      }
      this.selectedTierIdSignal.set(firstTier.id);
    }

    const selectedTier = this.selectedTier();
    if (!selectedTier || selectedTier.id === '-1' || !this.isValidTierId(selectedTier.id)) {
      this.toastService.show('Invalid Tier', 'Please refresh and try again.', 'error', 3000);
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

  onPaymentInitiated(_event: { reference: string; authorizationUrl?: string }) {
    this.toastService.show(
      'Payment Initiated',
      'Please complete payment on your phone.',
      'info',
      5000,
    );
    this.subscriptionService.checkSubscriptionStatus();
  }

  async cancelSubscription() {
    if (confirm('Cancel subscription? Auto-renewal will be disabled.')) {
      const success = await this.subscriptionService.cancelSubscription();
      if (success) {
        await this.subscriptionService.checkSubscriptionStatus();
        this.toastService.show('Cancelled', 'Subscription will not auto-renew.', 'success', 5000);
      } else {
        this.toastService.show('Error', 'Failed to cancel. Please try again.', 'error', 3000);
      }
    }
  }
}
