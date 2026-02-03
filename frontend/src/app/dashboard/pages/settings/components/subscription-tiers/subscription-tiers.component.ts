import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  SubscriptionService,
  type SubscriptionTier,
} from '../../../../../core/services/subscription.service';
import { PaymentModalComponent } from '../payment-modal/payment-modal.component';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-subscription-tiers',
  imports: [CommonModule, PaymentModalComponent],
  templateUrl: './subscription-tiers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionTiersComponent implements OnInit {
  readonly subscriptionService = inject(SubscriptionService);
  private readonly toastService = inject(ToastService);

  private readonly selectedTierIdSignal = signal<string | null>(null);
  private readonly isPaymentModalOpenSignal = signal(false);

  readonly selectedTierId = this.selectedTierIdSignal.asReadonly();
  readonly isPaymentModalOpen = this.isPaymentModalOpenSignal.asReadonly();
  readonly tiers = this.subscriptionService.tiers;

  private isValidTierId(id: string | null | undefined): boolean {
    if (!id || id === '-1') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  readonly validTiers = computed(() => {
    return this.tiers().filter((tier) => tier && this.isValidTierId(tier.id));
  });

  readonly selectedTier = computed(() => {
    const tierId = this.selectedTierIdSignal();
    if (!tierId || !this.isValidTierId(tierId)) return null;
    return this.validTiers().find((t) => t.id === tierId) || null;
  });

  async ngOnInit() {
    await this.subscriptionService.getSubscriptionTiers();
  }

  isSelectedTier(tierId: string): boolean {
    return this.selectedTierIdSignal() === tierId;
  }

  getFeaturesList(tier: SubscriptionTier): string[] {
    if (!tier.features) return [];
    if (Array.isArray(tier.features)) return tier.features;
    if (tier.features.features && Array.isArray(tier.features.features)) {
      return tier.features.features;
    }
    return [];
  }

  selectTier(tier: SubscriptionTier) {
    if (!tier || !tier.id || tier.id === '-1' || !this.isValidTierId(tier.id)) {
      this.toastService.show('Invalid Tier', 'Please refresh and try again.', 'error', 3000);
      return;
    }

    const validTiers = this.validTiers();
    if (!validTiers.find((t) => t.id === tier.id)) {
      this.toastService.show('Invalid Tier', 'Tier not available. Please refresh.', 'error', 3000);
      return;
    }

    this.selectedTierIdSignal.set(tier.id);
    this.isPaymentModalOpenSignal.set(true);
  }

  closePaymentModal() {
    this.isPaymentModalOpenSignal.set(false);
    this.selectedTierIdSignal.set(null);
  }

  onPaymentInitiated(_event: { reference: string; authorizationUrl?: string }) {
    this.toastService.show('Payment Initiated', 'Complete payment on your phone.', 'info', 5000);
  }
}
