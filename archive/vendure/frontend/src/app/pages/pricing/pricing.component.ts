import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import {
  PublicPricingService,
  PublicSubscriptionTier,
} from '../../shared/services/public-pricing.service';
import { SEOService } from '../../shared/services/seo.service';

interface PricingPlan {
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  /** "KES 1,200": monthly equivalent when billed yearly; null for Custom plans */
  monthlyEquivalent: string | null;
  /** Whole-percent saving of yearly vs monthly billing; null when not applicable */
  savingsPercent: number | null;
  description: string;
  features: { text: string; included: boolean }[];
  ctaText: string;
  ctaRoute: string;
  /** Plan code for signup query params; null for contact-sales CTAs */
  ctaPlanCode: string | null;
  popular?: boolean;
}

function formatKes(amount: number): string {
  return new Intl.NumberFormat('en-KE', { style: 'decimal', minimumFractionDigits: 0 }).format(
    amount,
  );
}

@Component({
  selector: 'app-pricing',
  imports: [RouterLink, NavbarComponent, FooterComponent, NgIcon],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss',
})
export class PricingComponent implements OnInit {
  private readonly publicPricingService = inject(PublicPricingService);
  private readonly seoService = inject(SEOService);

  protected readonly pricingPlans = signal<PricingPlan[]>([]);
  protected readonly pricingLoading = signal(true);
  protected readonly pricingError = signal(false);
  protected readonly trialDays = signal<number | null>(null);
  protected readonly isYearly = signal(false);

  protected readonly trialDaysText = computed(() => {
    const days = this.trialDays();
    return typeof days === 'number' && days > 0 ? `${days}` : '30';
  });

  ngOnInit(): void {
    this.seoService.updateTags({
      title: 'Pricing: The Honest Deal | Dukarun',
      description:
        'One honest price for the till that keeps your books. Free trial, no credit card, no hardware, no hidden fees. Pause or cancel anytime.',
      url: 'https://dukarun.com/pricing',
    });
    this.loadPricing();
  }

  toggleBilling(): void {
    this.isYearly.update((value) => !value);
  }

  async loadPricing(): Promise<void> {
    this.pricingLoading.set(true);
    this.pricingError.set(false);
    try {
      const [tiers, config] = await Promise.all([
        this.publicPricingService.getPublicTiers(),
        this.publicPricingService.getPublicPlatformConfig(),
      ]);

      this.trialDays.set(config?.trialDays ?? null);

      // No hardcoded price fallbacks: either the API's real figures or an
      // honest error state. Feature *descriptions* may fall back (no figures).
      if (tiers.length > 0) {
        this.pricingPlans.set(tiers.map((tier) => this.mapTierToPlan(tier)));
      } else {
        this.pricingError.set(true);
      }
    } catch {
      this.pricingError.set(true);
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

    const hasPrices = monthly > 0 && yearly > 0;
    const monthlyEquivalent = hasPrices ? yearly / 12 : null;
    const savingsPercent =
      hasPrices && yearly < monthly * 12 ? Math.round((1 - yearly / (monthly * 12)) * 100) : null;

    const isEnterprise = tier.code === 'enterprise';

    return {
      name: tier.name,
      monthlyPrice: monthly > 0 ? `KES ${formatKes(monthly)}` : 'Custom',
      yearlyPrice: yearly > 0 ? `KES ${formatKes(yearly)}` : 'Custom',
      monthlyEquivalent: monthlyEquivalent !== null ? `KES ${formatKes(monthlyEquivalent)}` : null,
      savingsPercent,
      description: tier.description ?? '',
      features,
      ctaText: isEnterprise ? 'Talk to us' : 'Start free trial',
      ctaRoute: isEnterprise ? '/contact' : '/signup',
      ctaPlanCode: isEnterprise ? null : tier.code,
      popular: tier.code === 'business',
    };
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
