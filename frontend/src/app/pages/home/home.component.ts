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
import { NgIcon } from '@ng-icons/core';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import { PublicPricingService } from '../../shared/services/public-pricing.service';
import { SEOService } from '../../shared/services/seo.service';

interface TillProduct {
  id: string;
  initials: string;
  name: string;
  price: number;
  /** Tailwind classes for the tile's initials badge. Used instead of photos to keep the demo lightweight and rights-free. */
  tone: string;
}

interface CartLine {
  product: TillProduct;
  qty: number;
  amount: number;
}

interface Scene {
  time: string;
  icon: string;
  title: string;
  copy: string;
}

interface ClosingQuestion {
  icon: string;
  question: string;
  answer: string;
}

interface Testimonial {
  quote: string;
  author: string;
  title: string;
  metric: string;
}

interface Faq {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, NavbarComponent, FooterComponent, NgIcon],
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

  /** Trial length (days) from platform config; null when unavailable. */
  protected readonly trialDays = signal<number | null>(null);

  /** Lowest monthly tier price in KES; null when the API is unreachable. */
  protected readonly startingPrice = signal<number | null>(null);

  /** e.g. "KES 1,500/month"; null when the price isn't known (never hardcode one). */
  protected readonly startingPriceText = computed(() => {
    const price = this.startingPrice();
    return price !== null ? `KES ${price.toLocaleString('en-KE')}/month` : null;
  });

  protected readonly trialCtaText = computed(() => {
    const days = this.trialDays();
    return typeof days === 'number' && days > 0
      ? `Start free ${days}-day trial`
      : 'Start free trial';
  });

  // ── Interactive till (hero demo) ─────────────────────────────────────────
  // Fully client-side: tap a product to add it, charge to "print" the receipt.

  // Demo prices kept roughly in line with Kenyan supermarket shelf prices as of mid-2025.
  // Photos are intentionally omitted: the repo has no product images, and real pack shots
  // would add rights and consistency work without improving conversion in a toy till demo.
  protected readonly tillProducts: TillProduct[] = [
    {
      id: 'kimbo',
      initials: 'Ki',
      name: 'Kimbo 2L',
      price: 680,
      tone: 'bg-amber-500/20 text-amber-300',
    },
    {
      id: 'unga',
      initials: 'Ug',
      name: 'Unga 2kg',
      price: 170,
      tone: 'bg-stone-200/20 text-stone-200',
    },
    {
      id: 'sugar',
      initials: 'Su',
      name: 'Sugar 1kg',
      price: 160,
      tone: 'bg-slate-200/20 text-slate-200',
    },
    {
      id: 'milk',
      initials: 'Mi',
      name: 'Milk 500ml',
      price: 60,
      tone: 'bg-sky-500/20 text-sky-300',
    },
    {
      id: 'bread',
      initials: 'Br',
      name: 'Bread',
      price: 60,
      tone: 'bg-orange-500/20 text-orange-300',
    },
    {
      id: 'soda',
      initials: 'So',
      name: 'Soda 500ml',
      price: 90,
      tone: 'bg-rose-500/20 text-rose-300',
    },
  ];

  /** product id → quantity */
  protected readonly cart = signal<ReadonlyMap<string, number>>(new Map());

  /** Set once "charged"; holds a snapshot of the sale for the receipt. */
  protected readonly paid = signal<{ lines: CartLine[]; total: number } | null>(null);

  protected readonly cartLines = computed<CartLine[]>(() => {
    const items = this.cart();
    return this.tillProducts
      .filter((p) => items.has(p.id))
      .map((product) => {
        const qty = items.get(product.id) ?? 0;
        return { product, qty, amount: qty * product.price };
      });
  });

  protected readonly cartCount = computed(() =>
    this.cartLines().reduce((sum, line) => sum + line.qty, 0),
  );

  protected readonly cartTotal = computed(() =>
    this.cartLines().reduce((sum, line) => sum + line.amount, 0),
  );

  protected addToTill(productId: string): void {
    if (this.paid()) return;
    this.cart.update((items) => {
      const next = new Map(items);
      next.set(productId, (next.get(productId) ?? 0) + 1);
      return next;
    });
  }

  protected clearTill(): void {
    this.cart.set(new Map());
  }

  protected chargeTill(): void {
    const total = this.cartTotal();
    if (total <= 0) return;
    this.paid.set({ lines: this.cartLines(), total });
  }

  protected resetTill(): void {
    this.paid.set(null);
    this.cart.set(new Map());
  }

  protected kes(amount: number): string {
    return `KES ${amount.toLocaleString('en-KE')}`;
  }

  protected qtyOf(productId: string): number {
    return this.cart().get(productId) ?? 0;
  }

  // ── Price ticker ─────────────────────────────────────────────────────────

  protected readonly tickerItems: string[] = [
    ...this.tillProducts.map((p) => `${p.name} · ${p.price}`),
    'Airtime · 100',
    'Eggs (tray) · 420',
  ];

  // ── The three closing-time questions ─────────────────────────────────────
  // Positioning core: not features; the questions a shopkeeper actually asks.

  protected readonly closingQuestions: ClosingQuestion[] = [
    {
      icon: 'heroChartBar',
      question: 'What did we sell?',
      answer: 'Today’s sales, best sellers, and busiest hours. No receipt counting required.',
    },
    {
      icon: 'heroCube',
      question: 'What’s left on the shelf?',
      answer: 'Stock that drops with every sale, so you reorder before the shelf is empty.',
    },
    {
      icon: 'heroUsers',
      question: 'Who owes what?',
      answer:
        'Customer credit with limits and payment reminders. No more names in the back of a notebook.',
    },
  ];

  // ── A day at the duka ────────────────────────────────────────────────────

  protected readonly scenes: Scene[] = [
    {
      time: '06:58',
      icon: 'heroBuildingStorefront',
      title: 'Doors open',
      copy: 'Open a shift and you’re selling. Yesterday’s stock, prices, and balances are exactly where you left them.',
    },
    {
      time: '14:20',
      icon: 'heroSignalSlash',
      title: 'Power cut',
      copy: 'Keep selling. Up to 30 sales save on your device and sync when the power comes back.',
    },
    {
      time: '18:03',
      icon: 'heroScale',
      title: 'Closing time',
      copy: 'Cash, M-Pesa, and credit already agree with the ledger. You count the money once, and it matches.',
    },
  ];

  // ── Receipt voices ───────────────────────────────────────────────────────

  protected readonly testimonials: Testimonial[] = [
    {
      quote: 'Pointing my phone is faster than typing. I finally know my stock levels accurately.',
      author: 'Amina K.',
      title: 'Mini Mart · Nairobi',
      metric: 'Saves 2 hrs daily',
    },
    {
      quote: 'Offline mode is a lifesaver during power cuts. Sales sync perfectly later.',
      author: 'David M.',
      title: 'Agrovet · Nakuru',
      metric: 'Zero lost sales',
    },
    {
      quote: 'We run salon services on picture cards. Tracking sales is simple now.',
      author: 'Grace W.',
      title: 'Salon · Mombasa',
      metric: '30% more organized',
    },
  ];

  // ── FAQ ──────────────────────────────────────────────────────────────────

  protected readonly faqs = computed<Faq[]>(() => [
    {
      question: 'Do I need special hardware?',
      answer:
        'No. dukarun runs on the phone or computer you already have. Your camera recognises products. No barcode scanner, no extra till hardware.',
    },
    {
      question: 'What happens when the internet drops?',
      answer:
        'Nothing changes at the counter. You keep selling, every sale saves on your device, and everything syncs automatically when the connection returns.',
    },
    {
      question: 'Does dukarun work with M-Pesa?',
      answer:
        'Yes. Take M-Pesa alongside cash and card, and every payment posts to your books automatically.',
    },
    {
      question: 'Will someone help me get started?',
      answer:
        'Yes, setup is guided. We help you add your products, payment methods, and team before your first sale, and support stays a WhatsApp message away.',
    },
    {
      question: 'What does it cost after the trial?',
      answer: this.startingPriceText()
        ? `Plans start at ${this.startingPriceText()}. See the pricing page for the full breakdown. No hardware costs, no hidden fees.`
        : 'One simple monthly price. See the pricing page for the current figure. No hardware costs, no hidden fees.',
    },
  ]);

  ngOnInit(): void {
    this.seoService.updateTags({
      title: 'Dukarun: Every Shilling, Accounted For | POS for Kenyan Shops',
      description:
        'Point at a product to sell it. Every payment and stock change posts itself to your books. Cash or M-Pesa, online or offline. Free trial, no hardware, no credit card.',
      keywords:
        'POS system Kenya, point of sale Kenya, retail software Kenya, duka management system, M-Pesa POS, offline POS Kenya, shop management Kenya',
      url: 'https://dukarun.com',
    });
    this.loadPlatformData();
  }

  private async loadPlatformData(): Promise<void> {
    const [config, price] = await Promise.all([
      this.publicPricingService.getPublicPlatformConfig(),
      this.publicPricingService.getStartingMonthlyPrice(),
    ]);
    this.trialDays.set(config?.trialDays ?? null);
    this.startingPrice.set(price);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.setupScrollSpy();
    this.handleInitialHash();
  }

  ngOnDestroy(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  private setupScrollSpy(): void {
    const sectionIds = ['hero', 'questions', 'journey', 'voices', 'faq'];

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
