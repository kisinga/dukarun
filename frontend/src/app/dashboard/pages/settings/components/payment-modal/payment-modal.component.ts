import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SubscriptionService,
  type SubscriptionTier,
} from '../../../../../core/services/subscription.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { CompanyService } from '../../../../../core/services/company.service';

@Component({
  selector: 'app-payment-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentModalComponent implements OnInit {
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);

  isOpen = input<boolean>(false);
  tier = input<SubscriptionTier | null>(null);
  closed = output<void>();
  paymentInitiated = output<{ reference: string; authorizationUrl?: string }>();

  readonly billingCycle = signal<'monthly' | 'yearly'>('monthly');
  readonly phoneNumber = signal<string>('');
  readonly error = signal<string | null>(null);
  readonly isProcessingPayment = signal(false);
  readonly loadingMessage = signal<string>('');

  readonly selectedTier = computed(() => this.tier());
  readonly price = computed(() => {
    const tier = this.selectedTier();
    if (!tier) return 0;
    return this.billingCycle() === 'monthly' ? tier.priceMonthly / 100 : tier.priceYearly / 100;
  });

  readonly yearlyDiscount = computed(() => {
    const tier = this.selectedTier();
    if (!tier) return 0;
    const monthlyTotal = tier.priceMonthly * 12;
    const discount = ((monthlyTotal - tier.priceYearly) / monthlyTotal) * 100;
    return Math.round(discount);
  });

  async ngOnInit() {
    const user = this.authService.user();
    const identifier = user?.user?.identifier;
    if (identifier) {
      this.phoneNumber.set(identifier);
    }
  }

  private validateTier(): string | null {
    const tier = this.selectedTier();

    if (!tier) {
      this.error.set('Please select a valid subscription tier.');
      return null;
    }

    const tierId = tier.id;
    if (!tierId) {
      this.error.set('Invalid subscription tier. Please refresh and try again.');
      return null;
    }

    const tierIdStr = String(tierId).trim();
    if (tierIdStr === '-1') {
      this.error.set('Invalid subscription tier. Please refresh and try again.');
      return null;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tierIdStr)) {
      this.error.set('Invalid subscription tier ID format. Please refresh and try again.');
      return null;
    }

    return tierIdStr;
  }

  async initiateExpressPayment() {
    const tierIdStr = this.validateTier();
    if (!tierIdStr) return;

    const phone = this.phoneNumber();
    if (!phone) {
      this.error.set('Phone number is required for Mobile Money');
      return;
    }

    const user = this.authService.user();
    const email = user?.emailAddress || '';
    if (!email) {
      this.error.set('Email address is required');
      return;
    }

    const channelId = this.companyService.activeCompanyId();
    if (!channelId) {
      this.error.set('No active channel. Please refresh and try again.');
      return;
    }

    this.error.set(null);
    this.isProcessingPayment.set(true);
    this.loadingMessage.set('Initiating payment...');

    try {
      const tier = this.selectedTier();
      const result = await this.subscriptionService.initiatePurchase(
        tier!.id,
        this.billingCycle(),
        phone,
        email,
        'mobile_money',
      );

      if (result.success && result.reference) {
        this.paymentInitiated.emit({
          reference: result.reference,
          authorizationUrl: result.authorizationUrl,
        });

        if (result.authorizationUrl) {
          this.loadingMessage.set('Redirecting to payment...');
          window.location.href = result.authorizationUrl;
        } else {
          this.loadingMessage.set('Check your phone for payment request...');
          await this.pollPaymentStatus(result.reference);
        }
      } else {
        this.error.set(result.message || 'Failed to initiate payment');
        this.isProcessingPayment.set(false);
        this.loadingMessage.set('');
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to initiate payment');
      this.isProcessingPayment.set(false);
      this.loadingMessage.set('');
    }
  }

  async initiateCheckoutPayment() {
    const tierIdStr = this.validateTier();
    if (!tierIdStr) return;

    const user = this.authService.user();
    const email = user?.emailAddress || '';
    if (!email) {
      this.error.set('Email address is required');
      return;
    }

    const channelId = this.companyService.activeCompanyId();
    if (!channelId) {
      this.error.set('No active channel. Please refresh and try again.');
      return;
    }

    this.error.set(null);
    this.isProcessingPayment.set(true);
    this.loadingMessage.set('Initiating payment...');

    try {
      const tier = this.selectedTier();
      const phone = this.phoneNumber() || '+254700000000';

      const result = await this.subscriptionService.initiatePurchase(
        tier!.id,
        this.billingCycle(),
        phone,
        email,
        'checkout',
      );

      if (result.success && result.reference) {
        this.paymentInitiated.emit({
          reference: result.reference,
          authorizationUrl: result.authorizationUrl,
        });

        if (result.authorizationUrl) {
          this.loadingMessage.set('Redirecting to payment...');
          window.location.href = result.authorizationUrl;
        } else {
          this.error.set('Payment link not generated. Please try again.');
          this.isProcessingPayment.set(false);
          this.loadingMessage.set('');
        }
      } else {
        this.error.set(result.message || 'Failed to initiate payment');
        this.isProcessingPayment.set(false);
        this.loadingMessage.set('');
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to initiate payment');
      this.isProcessingPayment.set(false);
      this.loadingMessage.set('');
    }
  }

  private async pollPaymentStatus(reference: string, maxAttempts = 3) {
    try {
      for (let i = 0; i < maxAttempts; i++) {
        if (i > 0) {
          this.loadingMessage.set(`Verifying... (${i + 1}/${maxAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, 15000));
        } else {
          this.loadingMessage.set('Verifying payment...');
        }

        const verified = await this.subscriptionService.verifyPayment(reference);
        if (verified) {
          this.loadingMessage.set('Payment verified!');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          this.isProcessingPayment.set(false);
          this.loadingMessage.set('');
          this.close();
          return;
        }
      }

      this.error.set('Payment verification timeout. Please check your payment status.');
      this.isProcessingPayment.set(false);
      this.loadingMessage.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to verify payment');
      this.isProcessingPayment.set(false);
      this.loadingMessage.set('');
    }
  }

  close() {
    this.isProcessingPayment.set(false);
    this.loadingMessage.set('');
    this.error.set(null);
    this.closed.emit();
  }
}
