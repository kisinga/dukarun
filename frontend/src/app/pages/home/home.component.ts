import { Location } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';
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
  screenshot?: { src: string; alt: string; placeholder: boolean };
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

@Component({
  selector: 'app-home',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly seoService = inject(SEOService);
  private observers: IntersectionObserver[] = [];
  private isUpdatingHash = false;

  // Single source of truth for carousel timing
  private readonly CAROUSEL_CONFIG = {
    scrollInterval: 3500, // 3.5 seconds between scrolls
    scrollDuration: 800, // Smooth scroll duration in ms
    initDelay: 300, // Delay before initializing carousels
    visibilityThreshold: 0.1, // IntersectionObserver threshold
  };

  // Carousel state management
  private carousels = new Map<
    string,
    {
      interval?: number;
      currentIndex: number;
      observer: IntersectionObserver | undefined;
      isVisible: boolean;
      isPaused: boolean;
    }
  >();

  protected readonly isYearly = signal(false);

  protected readonly socialProof: SocialProof = {
    customerCount: 500,
    recentSignups: 50,
    timeSaved: '2 hours daily',
  };

  protected readonly heroHighlights: FeatureHighlight[] = [
    { icon: '📱', text: 'Start on phone' },
    { icon: '🎓', text: 'No training needed' },
    { icon: '🖥️', text: 'Grow to any size' },
    { icon: '🤝', text: 'Trust in every sale' },
  ];

  protected readonly barcodeImages = [
    {
      src: '/assets/screenshots/barcode_scanning_mobile.png',
      alt: 'Barcode scanning interface showing product recognition',
    },
    {
      src: '/assets/screenshots/barcode_found_mobile.png',
      alt: 'Product found after barcode scan with details and add to cart',
    },
  ];

  protected readonly allFeatureScreenshots = [
    {
      src: '/assets/screenshots/barcode_scanning_mobile.png',
      alt: 'Barcode scanning interface showing product recognition',
    },
    {
      src: '/assets/screenshots/barcode_found_mobile.png',
      alt: 'Product found after barcode scan with details and add to cart',
    },
    {
      src: '/assets/screenshots/inventory_mobile.png',
      alt: 'Inventory management dashboard',
    },
    {
      src: '/assets/screenshots/credit_management_mobile.png',
      alt: 'Cash flow and credit management',
    },
    {
      src: '/assets/screenshots/dashboard_mobile.png',
      alt: 'Business intelligence dashboard',
    },
  ];

  protected readonly corePillars: CorePillar[] = [
    {
      icon: 'camera',
      title: 'Faster selling',
      description: 'Point your phone at price labels or barcodes and ring up a sale instantly.',
      bullets: ['Label-photo recognition', 'Barcode scanning', '3-second checkout'],
      screenshot: { src: '', alt: 'Point and sell interface', placeholder: true },
    },
    {
      icon: 'package',
      title: 'Clear inventory',
      description: 'Always know what is in stock across every shelf, stall, or warehouse.',
      bullets: ['Real-time counts', 'Multi-location tracking', 'Low-stock nudges'],
      screenshot: {
        src: '/assets/screenshots/inventory_mobile.png',
        alt: 'Inventory management dashboard',
        placeholder: false,
      },
    },
    {
      icon: 'currency',
      title: 'Healthy cash flow',
      description: 'Stay on top of customer and supplier balances without extra spreadsheets.',
      bullets: ['Credit limits & approvals', 'Automatic reminders', 'Ledger built in'],
      screenshot: {
        src: '/assets/screenshots/credit_management_mobile.png',
        alt: 'Cash flow and credit management',
        placeholder: false,
      },
    },
    {
      icon: 'chart',
      title: 'Decisions with data',
      description:
        'Pro-level business intelligence at your fingertips. Make data-driven decisions to grow.',
      bullets: ['Dashboards & reports', 'Top product insights', 'Performance alerts'],
      screenshot: {
        src: '/assets/screenshots/dashboard_mobile.png',
        alt: 'Business intelligence dashboard',
        placeholder: false,
      },
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
      summary: 'Point, confirm, and accept cash or M-Pesa in seconds.',
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

  protected readonly pricingPlans: PricingPlan[] = [
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
      ctaText: 'Start Free 30-Day Trial',
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
      ctaText: 'Start Free Business Trial',
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
      question: 'What happens after my 30-day trial ends?',
      answer:
        'After your free 30-day trial, you can upgrade to Pro (KES 1,500/month) to keep using all features, or pause your account. You can upgrade anytime. No credit card needed to start.',
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
        'Yes! You can record up to 30 sales without internet. Everything is stored safely on your device. When you reconnect, it syncs automatically. Perfect for areas with unreliable internet.',
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
        'Works on any smartphone. No barcode scanners, printers, or special equipment needed. Your phone is all you need.',
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
      title: 'Intuitive smartphone interface',
      description:
        'Designed for touch and simplicity. Everything you need is just a tap away, just like using any modern app.',
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
        'Dukarun - Point and Sell POS System for Kenyan Businesses | Fast, Offline, M-Pesa Ready',
      description:
        'Point your phone at products and sell in seconds. Join Dukarun the fastest POS system for shops, dukas, and retail. Works offline, accepts M-Pesa, requires no training. Start your free 30-day trial today.',
      keywords:
        'POS system Kenya, point of sale Kenya, retail software Kenya, duka management system, M-Pesa POS, offline POS Kenya, shop management Kenya, inventory management Kenya, barcode scanner Kenya, retail POS Nairobi, agrovet software Kenya, salon management Kenya, hardware store POS Kenya',
      url: 'https://dukarun.com',
    });
  }

  ngAfterViewInit(): void {
    this.setupScrollSpy();
    this.handleInitialHash();
    this.setupBarcodeCarousel();
    this.setupFeatureCarousel();
  }

  ngOnDestroy(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];

    // Clean up all carousels
    this.carousels.forEach((carousel, id) => {
      if (carousel.interval) {
        clearInterval(carousel.interval);
      }
      if (carousel.observer) {
        carousel.observer.disconnect();
      }
    });
    this.carousels.clear();
  }

  private setupBarcodeCarousel(): void {
    this.setupCarousel('barcode-carousel');
  }

  private setupFeatureCarousel(): void {
    this.setupCarousel('feature-carousel');
  }

  // Unified carousel setup - single source of truth
  private setupCarousel(carouselId: string): void {
    setTimeout(() => {
      const carouselElement = document.getElementById(carouselId);
      if (!carouselElement) {
        console.warn(`Carousel element not found: ${carouselId}`);
        return;
      }

      const items = carouselElement.querySelectorAll('.carousel-item');
      if (items.length <= 1) {
        console.warn(`Carousel ${carouselId} has ${items.length} items, need at least 2`);
        return;
      }

      // Clean up existing state if any
      const existingState = this.carousels.get(carouselId);
      if (existingState?.interval) {
        clearInterval(existingState.interval);
      }
      if (existingState?.observer) {
        existingState.observer.disconnect();
      }

      // Initialize carousel state
      const carouselState: {
        interval?: number;
        currentIndex: number;
        observer: IntersectionObserver | undefined;
        isVisible: boolean;
        isPaused: boolean;
      } = {
        interval: undefined,
        currentIndex: 0,
        observer: undefined,
        isVisible: false,
        isPaused: false,
      };
      this.carousels.set(carouselId, carouselState);

      // Check if carousel is already visible
      const checkInitialVisibility = (): boolean => {
        const rect = carouselElement.getBoundingClientRect();
        const isVisible =
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0;
        return isVisible;
      };

      // IntersectionObserver for visibility detection
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const state = this.carousels.get(carouselId);
            if (!state) return;

            state.isVisible = entry.isIntersecting;
            if (state.isVisible && !state.isPaused) {
              if (!state.interval) {
                this.startCarouselAutoscroll(carouselId, carouselElement, items);
              }
            } else {
              if (state.interval) {
                clearInterval(state.interval);
                state.interval = undefined;
              }
            }
          });
        },
        {
          root: null,
          rootMargin: '0px',
          threshold: [0, 0.1, 0.5],
        },
      );

      carouselState.observer = observer;
      observer.observe(carouselElement);

      // Start immediately if already visible
      if (checkInitialVisibility()) {
        setTimeout(() => {
          const state = this.carousels.get(carouselId);
          if (state && !state.interval && !state.isPaused) {
            this.startCarouselAutoscroll(carouselId, carouselElement, items);
          }
        }, this.CAROUSEL_CONFIG.initDelay + 100);
      }

      // Pause on hover
      const pauseOnHover = () => {
        const state = this.carousels.get(carouselId);
        if (!state) return;
        state.isPaused = true;
        if (state.interval) {
          clearInterval(state.interval);
          state.interval = undefined;
        }
      };

      const resumeOnLeave = () => {
        const state = this.carousels.get(carouselId);
        if (!state) return;
        state.isPaused = false;
        if (state.isVisible && !state.interval) {
          this.startCarouselAutoscroll(carouselId, carouselElement, items);
        }
      };

      carouselElement.addEventListener('mouseenter', pauseOnHover);
      carouselElement.addEventListener('mouseleave', resumeOnLeave);
    }, this.CAROUSEL_CONFIG.initDelay);
  }

  // Unified autoscroll function - single source of truth for timing
  private startCarouselAutoscroll(
    carouselId: string,
    carouselElement: HTMLElement,
    items: NodeListOf<Element>,
  ): void {
    const state = this.carousels.get(carouselId);
    if (!state) {
      console.warn(`State not found for carousel: ${carouselId}`);
      return;
    }

    // Clear any existing interval
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = undefined;
    }

    // Use CSS for smooth scrolling
    carouselElement.style.scrollBehavior = 'smooth';

    // Start autoscroll with consistent timing
    state.interval = window.setInterval(() => {
      const currentState = this.carousels.get(carouselId);
      if (!currentState || currentState.isPaused || !currentState.isVisible) {
        return;
      }

      // Move to next item
      currentState.currentIndex = (currentState.currentIndex + 1) % items.length;
      const targetItem = items[currentState.currentIndex] as HTMLElement;

      if (targetItem && carouselElement) {
        // Calculate precise scroll position - each item is full width
        const carouselWidth = carouselElement.clientWidth;
        const scrollPosition = currentState.currentIndex * carouselWidth;

        // Smooth scroll
        carouselElement.scrollTo({
          left: scrollPosition,
          behavior: 'smooth',
        });
      }
    }, this.CAROUSEL_CONFIG.scrollInterval);

    // Update state in map
    this.carousels.set(carouselId, state);
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
