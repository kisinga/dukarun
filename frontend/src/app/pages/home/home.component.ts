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
      screenshot: { src: '', alt: 'Inventory management dashboard', placeholder: true },
    },
    {
      icon: 'currency',
      title: 'Healthy cash flow',
      description: 'Stay on top of customer and supplier balances without extra spreadsheets.',
      bullets: ['Credit limits & approvals', 'Automatic reminders', 'Ledger built in'],
      screenshot: { src: '', alt: 'Cash flow and credit management', placeholder: true },
    },
    {
      icon: 'chart',
      title: 'Decisions with data',
      description:
        'Pro-level business intelligence at your fingertips. See daily trends, best sellers, and make data-driven decisions to grow.',
      bullets: [
        'Dashboards & reports',
        'Top product insights',
        'Performance alerts',
        'Data-driven growth decisions',
      ],
      screenshot: { src: '', alt: 'Business intelligence dashboard', placeholder: true },
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

  // Screenshot/carousel data
  protected readonly heroScreenshots = [
    { src: '', alt: 'Dukarun point and sell interface', placeholder: true },
    { src: '', alt: 'Dukarun inventory management', placeholder: true },
    { src: '', alt: 'Dukarun sales dashboard', placeholder: true },
  ];

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
        'Point your phone at products and sell in seconds. Join 500+ Kenyan businesses using Dukarun - the fastest POS system for shops, dukas, and retail. Works offline, accepts M-Pesa, requires no training. Start your free 30-day trial today.',
      keywords:
        'POS system Kenya, point of sale Kenya, retail software Kenya, duka management system, M-Pesa POS, offline POS Kenya, shop management Kenya, inventory management Kenya, barcode scanner Kenya, retail POS Nairobi, agrovet software Kenya, salon management Kenya, hardware store POS Kenya',
      url: 'https://dukarun.com',
    });
  }

  ngAfterViewInit(): void {
    this.setupScrollSpy();
    this.handleInitialHash();
  }

  ngOnDestroy(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
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
