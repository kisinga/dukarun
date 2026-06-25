import { isPlatformBrowser, Location } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';
import { PosDemoComponent } from '../../shared/marketing/pos-demo.component';
import { PublicPricingService } from '../../core/services/public-pricing.service';
import { SEOService } from '../../core/services/seo.service';

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

interface Testimonial {
  quote: string;
  author: string;
  title: string;
  metric?: string;
}

interface SocialProof {
  customerCount: number;
  recentSignups: number;
  timeSaved: string;
}

interface FeatureHighlight {
  icon: string;
  text: string;
}

interface CorePillar {
  icon: string;
  title: string;
  description: string;
  bullets: string[];
}

interface JourneyStage {
  number: string;
  title: string;
  summary: string;
  detail: string;
  screenshot?: { src: string; alt: string; placeholder: boolean };
}

interface FAQItem {
  question: string;
  answer: string;
  open: boolean;
}

interface BusinessExample {
  name: string;
  icon: string;
  // Internal metrics for knowledge (not displayed on page)
  marketShare: string;
  employeeRange: string;
}

interface EaseOfUseBenefit {
  icon: string;
  title: string;
  description: string;
}

function formatPrice(amount: number): string {
  if (amount <= 0) return 'Custom';
  return new Intl.NumberFormat('en-KE', { style: 'decimal', minimumFractionDigits: 0 }).format(
    amount,
  );
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, NavbarComponent, FooterComponent, PosDemoComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly seoService = inject(SEOService);
  private readonly publicPricingService = inject(PublicPricingService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private observers: IntersectionObserver[] = [];
  private isUpdatingHash = false;

  /** Pricing from API; empty until loaded. */
  protected readonly pricingPlans = signal<PricingPlan[]>([]);
  protected readonly pricingLoading = signal(true);
  protected readonly pricingError = signal(false);

  /** Trial length (days) from platform config; null when unavailable. */
  protected readonly trialDays = signal<number | null>(null);
  protected readonly activeScreenshotIndex = signal(0);

  private phoneSlideshowInterval?: number;
  private phoneSlideshowObserver?: IntersectionObserver;
  protected readonly trialCtaText = computed(() => {
    const days = this.trialDays();
    return typeof days === 'number' && days > 0
      ? `Start free ${days}-day trial`
      : 'Start free trial';
  });

  // Timing for the feature-phone slideshow.
  private readonly CAROUSEL_CONFIG = {
    scrollInterval: 3500, // ms between screenshots
    initDelay: 300, // ms before initializing the slideshow
  };

  protected readonly isYearly = signal(false);

  protected readonly socialProof: SocialProof = {
    customerCount: 500,
    recentSignups: 50,
    timeSaved: '2 hours daily',
  };

  protected readonly heroHighlights: FeatureHighlight[] = [
    { icon: '💻', text: 'Desktop & mobile' },
    { icon: '🎓', text: 'No training needed' },
    { icon: '🏪', text: 'Retail & services' },
    { icon: '🤝', text: 'Trust in every sale' },
  ];

  protected readonly allFeatureScreenshots = [
    {
      src: '/assets/screenshots/barcode_scanning_mobile.webp',
      alt: 'Barcode scanning interface showing product recognition',
    },
    {
      src: '/assets/screenshots/barcode_found_mobile.webp',
      alt: 'Product found after barcode scan with details and add to cart',
    },
    {
      src: '/assets/screenshots/inventory_mobile.webp',
      alt: 'Inventory management dashboard',
    },
    {
      src: '/assets/screenshots/credit_management_mobile.webp',
      alt: 'Cash flow and credit management',
    },
    {
      src: '/assets/screenshots/dashboard_mobile.webp',
      alt: 'Business intelligence dashboard',
    },
  ];

  protected readonly corePillars: CorePillar[] = [
    {
      icon: 'camera',
      title: 'Faster selling',
      description:
        'Sell fast on desktop or phone. Use camera label recognition, barcode scanning, or search.',
      bullets: [
        'Label-photo recognition',
        'Barcode scanning',
        '3-second checkout',
        'Offline-ready so you never miss a sale; syncs when you reconnect',
      ],
    },
    {
      icon: 'package',
      title: 'Clear inventory',
      description: 'Always know what is in stock across every shelf, stall, or warehouse.',
      bullets: [
        'Real-time counts',
        'Multi-location tracking',
        'Low-stock nudges',
        'Movement history and adjustments for full traceability',
      ],
    },
    {
      icon: 'currency',
      title: 'Healthy cash flow',
      description: 'Stay on top of customer and supplier balances without extra spreadsheets.',
      bullets: [
        'Credit limits & approvals',
        'Automatic reminders',
        'Ledger built in',
        'Customer and supplier statements without leaving the app',
      ],
    },
    {
      icon: 'chart',
      title: 'Decisions with data',
      description:
        'Pro-level business intelligence at your fingertips. Make data-driven decisions to grow.',
      bullets: [
        'Dashboards & reports',
        'Top product insights',
        'Performance alerts',
        'Audit log of sales, stock & settings changes',
      ],
    },
  ];

  protected readonly journeyStages: JourneyStage[] = [
    {
      number: '1',
      title: 'Capture your catalog',
      summary: 'Scan barcodes or take five quick photos of the product label.',
      detail: 'dukarun learns each item so that you can sell it in seconds.',
      screenshot: { src: '', alt: 'Product catalog capture interface', placeholder: true },
    },
    {
      number: '2',
      title: 'Sell from any device',
      summary: 'Use desktop or phone to ring up sales and accept cash or M-Pesa in seconds.',
      detail:
        'Accept cash and track M-Pesa payments automatically. No signal? Keep selling. Each sale syncs automatically when you reconnect.',
      screenshot: { src: '', alt: 'Point and sell checkout interface', placeholder: true },
    },
    {
      number: '3',
      title: 'Stay in control',
      summary: 'Stock, cash, and credit update automatically after every sale.',
      detail: 'Reminders and dashboards keep your whole team aligned and confident.',
      screenshot: { src: '', alt: 'Dashboard and control center', placeholder: true },
    },
  ];

  /** Default fallback plans when API fails (so section still has content). */
  private static get fallbackPricingPlans(): PricingPlan[] {
    return [
      {
        name: 'Pro',
        monthlyPrice: 'KES 1,500',
        yearlyPrice: 'KES 14,400',
        description:
          'Essential Shop Operations. Everything you need to sell fast, track stock, and stay organized.',
        features: [
          { text: 'Sell with camera, barcode, or search', included: true },
          { text: 'Offline-first POS with auto-sync', included: true },
          { text: 'Real-time inventory tracking', included: true },
          { text: 'Customer credit tracking', included: true },
          { text: 'Basic Sales Reports', included: true },
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
          'Financial Control & Growth. For shops that need rigorous accounting, FIFO profit tracking, and deeper insights.',
        features: [
          { text: 'Everything in Pro', included: true },
          { text: 'True Profit Tracking (FIFO)', included: true },
          { text: 'Daily & Randomized Reconciliation', included: true },
          { text: 'Full Double-Entry Ledger', included: true },
          { text: 'Multi-store Management', included: true },
          { text: 'Advanced Financial Reports', included: true },
        ],
        ctaText: 'Start free trial',
        ctaLink: '/signup?plan=business&trial=true',
        popular: true,
      },
      {
        name: 'Enterprise',
        monthlyPrice: 'Custom',
        yearlyPrice: 'Custom',
        description:
          'Scale & Customization. For larger retail chains needing custom integrations and dedicated support.',
        features: [
          { text: 'Everything in Business', included: true },
          { text: 'Unlimited users & locations', included: true },
          { text: 'Advanced API integrations', included: true },
          { text: 'Dedicated success manager', included: true },
          { text: 'Custom onboarding & training', included: true },
        ],
        ctaText: 'Contact Sales',
        ctaLink: '/contact',
      },
    ];
  }

  protected readonly testimonials: Testimonial[] = [
    {
      quote:
        'dukarun is so easy! Pointing my phone is faster than typing. Finally know my stock levels accurately.',
      author: 'Amina K.',
      title: 'Mini Mart Owner, Nairobi',
      metric: 'Saves 2 hours daily',
    },
    {
      quote:
        'The offline mode is a lifesaver during power cuts. Sales are recorded, and sync perfectly later. Highly recommend!',
      author: 'David M.',
      title: 'Agrovet Manager, Nakuru',
      metric: 'Never lost a sale again',
    },
    {
      quote:
        'We use it for our salon services with picture cards. Tracking popular services and sales is simple now.',
      author: 'Grace W.',
      title: 'Salon Owner, Mombasa',
      metric: '30% more organized',
    },
  ];

  // Business examples representing 80% of Kenyan MSMEs that can afford dukarun
  // Metrics stored for internal knowledge, only name and icon displayed on page
  protected readonly businessExamples: BusinessExample[] = [
    {
      name: 'Retail Shops & Dukas',
      icon: '🏪',
      marketShare: '38.3% of small enterprises',
      employeeRange: '1-9 employees',
    },
    {
      name: 'Agrovets & Pharmacies',
      icon: '💊',
      marketShare: 'Critical for agricultural economy',
      employeeRange: '1-9 employees',
    },
    {
      name: 'Kinyozi & Salons',
      icon: '✂️',
      marketShare: 'Growing service sector',
      employeeRange: '1-5 employees',
    },
    {
      name: 'Food & Beverage',
      icon: '🍽️',
      marketShare: 'Significant service sector',
      employeeRange: '1-9 employees',
    },
    {
      name: 'Hardware & Construction',
      icon: '🔨',
      marketShare: '14.5% of micro enterprises',
      employeeRange: '1-9 employees',
    },
  ];

  protected readonly faqItems = signal<FAQItem[]>([
    {
      question: 'What happens after my trial ends?',
      answer:
        'After your free trial, you can upgrade to a paid plan to keep using all features, or pause your account. You can upgrade anytime. No credit card needed to start.',
      open: false,
    },
    {
      question: 'How does the product recognition work?',
      answer:
        'Take a few photos of each product labels. When you sell, just point your camera at the label and it recognizes it in seconds. Works great for items without barcodes. Barcode scanning also works if available.',
      open: false,
    },
    {
      question: 'Does it work without internet?',
      answer:
        'Yes! Products, customers amd suppliers are cached on devicea allowing you to search, view, and you can even record a few sales without internet. When you reconnect, changes sync automatically. Perfect for areas with unreliable internet.',
      open: false,
    },
    {
      question: 'Is my data safe?',
      answer:
        'Yes. Your business data is encrypted and kept private. We never share your information. Security is a top priority.',
      open: false,
    },
    {
      question: 'How long does setup take?',
      answer:
        "Most businesses are set up in under an hour. Sign up, add products by scanning barcodes or taking photos, and you're ready to go. Simple and intuitive.",
      open: false,
    },
  ]);

  togglePricing(): void {
    this.isYearly.update((value) => !value);
  }

  toggleFAQ(index: number): void {
    this.faqItems.update((items) => {
      const updated = [...items];
      updated[index].open = !updated[index].open;
      return updated;
    });
  }

  protected readonly stars = [1, 2, 3, 4, 5];

  protected readonly easeOfUseBenefits: EaseOfUseBenefit[] = [
    {
      icon: 'phone',
      title: 'No complex hardware',
      description:
        'Works on desktop and smartphone. No barcode scanners, printers, or special equipment required to get started.',
    },
    {
      icon: 'graduation',
      title: 'No computer literacy required',
      description:
        'If you know how to use a smartphone, you can use Dukarun. No training needed — most things are intuitive.',
    },
    {
      icon: 'book',
      title: 'Simple tutorials available',
      description:
        'Step-by-step guides teach you how to use the system, but most features work naturally once you start.',
    },
    {
      icon: 'lightbulb',
      title: 'Intuitive interface',
      description:
        'Designed for speed and simplicity on both desktop and mobile. Everything you need is a click or tap away.',
    },
    {
      icon: 'chart',
      title: 'Professional accounting made accessible',
      description:
        'Lowers the barrier to professional accounting. Get enterprise-level financial tracking without the complexity.',
    },
    {
      icon: 'rocket',
      title: 'Powerful insights at your fingertips',
      description:
        'Pro-level business tool that gives you powerful information for gauging business status and making data-driven decisions to grow.',
    },
  ];

  ngOnInit(): void {
    // Set SEO meta tags for homepage
    this.seoService.updateTags({
      title:
        'Dukarun - POS for Retail & Services in Kenya | Desktop + Mobile, Offline, M-Pesa Ready',
      description:
        'A modern POS for retail and service businesses in Kenya. Use Dukarun on desktop or phone to sell faster with camera + barcode, track inventory, manage credit, and stay on top of cash flow. Works offline and supports M-Pesa. Start your free trial today.',
      keywords:
        'POS system Kenya, point of sale Kenya, retail software Kenya, duka management system, M-Pesa POS, offline POS Kenya, shop management Kenya, inventory management Kenya, barcode scanner Kenya, retail POS Nairobi, agrovet software Kenya, salon management Kenya, hardware store POS Kenya',
      url: 'https://dukarun.com',
    });
    // Data fetches run in the browser only — prerender ships the loading/fallback
    // state, then the client hydrates and loads live pricing.
    if (this.isBrowser) {
      this.loadPricingTiers();
      this.loadPublicPlatformConfig();
    }
  }

  private async loadPricingTiers(): Promise<void> {
    try {
      const tiers = await this.publicPricingService.getPublicTiers();
      if (tiers.length === 0) {
        this.pricingError.set(true);
        this.pricingPlans.set(HomeComponent.fallbackPricingPlans);
      } else {
        // API returns prices in cents; display in Sh (KES)
        const plans: PricingPlan[] = tiers.map((tier, index) => {
          const isCustom = tier.priceMonthly <= 0;
          const monthlySh = tier.priceMonthly / 100;
          const yearlySh = tier.priceYearly / 100;
          const monthlyStr = isCustom ? 'Custom' : `KES ${formatPrice(monthlySh)}`;
          const yearlyStr = isCustom ? 'Custom' : `KES ${formatPrice(yearlySh)}`;
          return {
            name: tier.name,
            monthlyPrice: monthlyStr,
            yearlyPrice: yearlyStr,
            description: tier.description ?? '',
            features: tier.features.map((text) => ({ text, included: true })),
            ctaText: isCustom ? 'Contact Sales' : 'Start free trial',
            ctaLink: isCustom ? '/contact' : `/signup?plan=${tier.code}&trial=true`,
            popular: index === 1 && tiers.length >= 2,
          };
        });
        this.pricingPlans.set(plans);
      }
    } catch {
      this.pricingError.set(true);
      this.pricingPlans.set(HomeComponent.fallbackPricingPlans);
    } finally {
      this.pricingLoading.set(false);
    }
  }

  private async loadPublicPlatformConfig(): Promise<void> {
    try {
      const cfg = await this.publicPricingService.getPublicPlatformConfig();
      if (cfg?.trialDays !== undefined && typeof cfg.trialDays === 'number') {
        this.trialDays.set(cfg.trialDays);
      }
    } catch {
      // no-op (fallback to generic wording)
    }
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.setupScrollSpy();
    this.handleInitialHash();
    this.setupFeatureCarousel();
  }

  ngOnDestroy(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];

    if (this.phoneSlideshowInterval) {
      clearInterval(this.phoneSlideshowInterval);
    }
    if (this.phoneSlideshowObserver) {
      this.phoneSlideshowObserver.disconnect();
    }
  }

  protected setActiveScreenshot(index: number): void {
    this.activeScreenshotIndex.set(index);
  }

  protected prevScreenshot(): void {
    this.activeScreenshotIndex.update(
      (i) => (i - 1 + this.allFeatureScreenshots.length) % this.allFeatureScreenshots.length,
    );
  }

  protected nextScreenshot(): void {
    this.activeScreenshotIndex.update((i) => (i + 1) % this.allFeatureScreenshots.length);
  }

  private setupFeatureCarousel(): void {
    this.setupPhoneSlideshow();
  }

  private setupPhoneSlideshow(): void {
    setTimeout(() => {
      const phoneElement = document.getElementById('feature-phone');
      if (!phoneElement) return;

      const startSlideshow = () => {
        if (this.phoneSlideshowInterval) return;
        this.phoneSlideshowInterval = window.setInterval(() => {
          this.activeScreenshotIndex.update((i) => (i + 1) % this.allFeatureScreenshots.length);
        }, this.CAROUSEL_CONFIG.scrollInterval);
      };

      const stopSlideshow = () => {
        if (this.phoneSlideshowInterval) {
          clearInterval(this.phoneSlideshowInterval);
          this.phoneSlideshowInterval = undefined;
        }
      };

      this.phoneSlideshowObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            startSlideshow();
          } else {
            stopSlideshow();
          }
        },
        { threshold: 0.1 },
      );
      this.phoneSlideshowObserver.observe(phoneElement);

      phoneElement.addEventListener('mouseenter', stopSlideshow);
      phoneElement.addEventListener('mouseleave', () => {
        const rect = phoneElement.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          startSlideshow();
        }
      });
    }, this.CAROUSEL_CONFIG.initDelay);
  }

  private setupScrollSpy(): void {
    const sectionIds = [
      'hero',
      'proof',
      'pillars',
      'ease-of-use',
      'journey',
      'pricing-preview',
      'faq',
      'testimonials',
      'cta',
    ];

    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: [0.1, 0.5],
    };

    const observer = new IntersectionObserver((entries) => {
      if (this.isUpdatingHash) return;

      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visibleEntries.length > 0) {
        const id = visibleEntries[0].target.id;
        if (id) {
          this.updateHash(id);
        }
      }
    }, options);

    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    this.observers.push(observer);
  }

  private updateHash(id: string): void {
    this.isUpdatingHash = true;
    const url = this.router.url.split('#')[0];
    this.location.replaceState(`${url}#${id}`);
    // Use setTimeout to reset flag after location update
    setTimeout(() => {
      this.isUpdatingHash = false;
    }, 0);
  }

  private handleInitialHash(): void {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const element = document.getElementById(hash);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }
}
