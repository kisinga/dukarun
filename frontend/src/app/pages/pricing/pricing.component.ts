import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';
import {
  PublicPricingService,
  PublicSubscriptionTier,
  PublicPlatformConfig,
} from '../../core/services/public-pricing.service';

interface PricingPlan {
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  description: string;
  features: { text: string; included: boolean }[];
  ctaText: string;
  ctaLink: string;
  popular?: boolean;
}

function formatPrice(amount: number): string {
  if (amount <= 0) return 'Custom';
  return new Intl.NumberFormat('en-KE', { style: 'decimal', minimumFractionDigits: 0 }).format(
    amount,
  );
}

@Component({
  selector: 'app-pricing',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss',
})
export class PricingComponent implements OnInit {
  private readonly publicPricingService = inject(PublicPricingService);

  protected readonly pricingPlans = signal<PricingPlan[]>([]);
  protected readonly pricingLoading = signal(true);
  protected readonly pricingError = signal(false);
  protected readonly trialDays = signal<number | null>(null);
  protected readonly isYearly = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadPricing();
  }

  toggleBilling(): void {
    this.isYearly.update((value) => !value);
  }

  private async loadPricing(): Promise<void> {
    try {
      const [tiers, config] = await Promise.all([
        this.publicPricingService.getPublicTiers(),
        this.publicPricingService.getPublicPlatformConfig(),
      ]);

      this.trialDays.set(config?.trialDays ?? null);

      if (tiers.length > 0) {
        this.pricingPlans.set(tiers.map((tier) => this.mapTierToPlan(tier)));
      } else {
        this.pricingPlans.set(this.fallbackPlans());
      }
    } catch {
      this.pricingError.set(true);
      this.pricingPlans.set(this.fallbackPlans());
    } finally {
      this.pricingLoading.set(false);
    }
  }

  private mapTierToPlan(tier: PublicSubscriptionTier): PricingPlan {
    const monthly = tier.priceMonthly / 100;
    const yearly = tier.priceYearly / 100;
    const features = tier.features?.length
      ? tier.features.map((text) => ({ text, included: true }))
      : this.defaultFeaturesForTier(tier.code);

    return {
      name: tier.name,
      monthlyPrice: monthly > 0 ? `KES ${formatPrice(monthly)}` : 'Custom',
      yearlyPrice: yearly > 0 ? `KES ${formatPrice(yearly)}` : 'Custom',
      description: tier.description ?? '',
      features,
      ctaText: tier.code === 'enterprise' ? 'Contact Sales' : 'Start free trial',
      ctaLink: tier.code === 'enterprise' ? '/contact' : `/signup?plan=${tier.code}&trial=true`,
      popular: tier.code === 'business',
    };
  }

  private fallbackPlans(): PricingPlan[] {
    return [
      {
        name: 'Pro',
        monthlyPrice: 'KES 1,500',
        yearlyPrice: 'KES 14,400',
        description: 'Everything you need to sell fast, track stock, and stay organized.',
        features: [
          { text: 'Sell with camera, barcode, or search', included: true },
          { text: 'Offline-first POS with auto-sync', included: true },
          { text: 'Real-time inventory tracking', included: true },
          { text: 'Customer credit tracking', included: true },
          { text: 'Basic sales reports', included: true },
          { text: 'Unlimited products', included: true },
        ],
        ctaText: 'Start free trial',
        ctaLink: '/signup?plan=pro&trial=true',
      },
      {
        name: 'Business',
        monthlyPrice: 'KES 2,500',
        yearlyPrice: 'KES 24,000',
        description:
          'For shops that need rigorous accounting, FIFO profit tracking, and deeper insights.',
        features: [
          { text: 'Everything in Pro', included: true },
          { text: 'True profit tracking (FIFO)', included: true },
          { text: 'Daily and randomized reconciliation', included: true },
          { text: 'Full double-entry ledger as single source of truth', included: true },
          { text: 'WhatsApp and SMS alerts for shifts and customer balances', included: true },
          { text: 'Multi-store management', included: true },
          { text: 'Advanced financial reports', included: true },
        ],
        ctaText: 'Start free trial',
        ctaLink: '/signup?plan=business&trial=true',
        popular: true,
      },
      {
        name: 'Enterprise',
        monthlyPrice: 'Custom',
        yearlyPrice: 'Custom',
        description: 'For larger retail chains needing custom integrations and dedicated support.',
        features: [
          { text: 'Everything in Business', included: true },
          { text: 'Unlimited users and locations', included: true },
          { text: 'Advanced API integrations', included: true },
          { text: 'Dedicated success manager', included: true },
          { text: 'Custom onboarding and training', included: true },
        ],
        ctaText: 'Contact Sales',
        ctaLink: '/contact',
      },
    ];
  }

  private defaultFeaturesForTier(code: string): { text: string; included: boolean }[] {
    const map: Record<string, string[]> = {
      pro: [
        'Sell with camera, barcode, or search',
        'Offline-first POS with auto-sync',
        'Real-time inventory tracking',
        'Customer credit tracking',
        'Basic sales reports',
        'Unlimited products',
      ],
      business: [
        'Everything in Pro',
        'True profit tracking (FIFO)',
        'Daily and randomized reconciliation',
        'Full double-entry ledger',
        'Multi-store management',
        'Advanced financial reports',
      ],
      enterprise: [
        'Everything in Business',
        'Unlimited users and locations',
        'Advanced API integrations',
        'Dedicated success manager',
        'Custom onboarding and training',
      ],
    };
    return (map[code] ?? []).map((text) => ({ text, included: true }));
  }
}
