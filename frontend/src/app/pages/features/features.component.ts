import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import { SEOService } from '../../shared/services/seo.service';

interface Feature {
  title: string;
  description: string;
  /** Registered APP_ICONS key, e.g. 'heroCamera' */
  icon: string;
}

interface FeatureCategory {
  name: string;
  description: string;
  features: Feature[];
}

interface ComingSoonFeature {
  icon: string;
  title: string;
  description: string;
  category: string;
}

@Component({
  selector: 'app-features',
  imports: [RouterLink, NavbarComponent, FooterComponent, NgIcon],
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturesComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly seo = inject(SEOService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private observers: IntersectionObserver[] = [];
  private isUpdatingHash = false;

  protected readonly categories: FeatureCategory[] = [
    {
      name: 'At the counter',
      description: 'Selling, at the speed your customers expect',
      features: [
        {
          title: 'Point Your Phone, Sell Instantly',
          description:
            'Point your phone camera at a price label or product. dukarun recognizes it instantly and adds it to your cart. No typing, no barcode scanner needed. Perfect for fresh produce, services, and items without barcodes.',
          icon: 'heroCamera',
        },
        {
          title: 'Barcode Scanning',
          description:
            'Scan barcodes to quickly add packaged goods to your cart or create new products. Fast and accurate for items with barcodes.',
          icon: 'heroQrCode',
        },
        {
          title: 'Sell Services Too',
          description:
            'Create visual cards for services like haircuts or repairs. Track service sales just like products. No need for separate systems.',
          icon: 'heroTag',
        },
        {
          title: 'Accept Cash and M-Pesa',
          description:
            'Take payments via cash and M-Pesa in one system. Track M-Pesa payments automatically in your books with full ledger integration. Customer-initiated M-Pesa payments (STK Push) coming soon.',
          icon: 'heroBanknotes',
        },
        {
          title: 'Sells With No Internet At All',
          description:
            'Your catalog lives on your device. Record up to 30 sales with zero connection and everything syncs automatically when you reconnect. Power cut? Keep selling.',
          icon: 'heroSignalSlash',
        },
      ],
    },
    {
      name: 'Your stock, always counted',
      description: 'Know exactly what you have, where it is, and when to reorder',
      features: [
        {
          title: 'Real-time Stock Tracking',
          description:
            'See exactly how much stock you have at any moment. Every sale updates your inventory instantly. No more guessing or manual counting.',
          icon: 'heroCube',
        },
        {
          title: 'Multiple Stock Locations',
          description:
            "Track inventory across multiple shops or warehouses. See what's where at a glance. Perfect for businesses with multiple locations.",
          icon: 'heroBuildingStorefront',
        },
        {
          title: 'Stock Adjustments',
          description:
            'Easily adjust stock levels when needed. Record damages, losses, or corrections. Everything is tracked with a clear audit trail.',
          icon: 'heroPencilSquare',
        },
        {
          title: 'Low Stock Alerts',
          description:
            'Get notified when items are running low. Never run out of popular items. Make better decisions about what to order.',
          icon: 'heroBell',
        },
      ],
    },
    {
      name: 'Customers, suppliers, and credit',
      description: 'Manage everyone you do business with in one place',
      features: [
        {
          title: 'One System for Customers and Suppliers',
          description:
            'Track customers and suppliers in the same system. No need for separate lists. See everything in one place.',
          icon: 'heroUsers',
        },
        {
          title: 'Track Credit and Limits',
          description:
            'Set credit limits for customers. The system automatically checks limits before allowing credit sales. Prevent bad debt.',
          icon: 'heroCreditCard',
        },
        {
          title: 'Automatic Payment Reminders',
          description:
            'The system sends friendly reminders to customers about payments due. You also get notified to follow up. Improve cash flow.',
          icon: 'heroEnvelope',
        },
        {
          title: "See What's Owed",
          description:
            'Instantly see how much each customer owes you and how much you owe each supplier. Everything calculated automatically from your sales and purchases.',
          icon: 'heroCurrencyDollar',
        },
        {
          title: 'Customer Balance Alerts',
          description:
            'Automatically notify customers via WhatsApp or SMS when their balance changes. Reduce follow-up and keep credit customers informed.',
          icon: 'heroBell',
        },
      ],
    },
    {
      name: 'Your money, always accounted for',
      description: 'Make better decisions with real data, not guesswork',
      features: [
        {
          title: 'Built-in Accounting',
          description:
            'Every sale, payment, and purchase is automatically recorded in a double-entry ledger that acts as the single source of truth. Reconcile operational records with the ledger when needed. No separate accounting software required.',
          icon: 'heroScale',
        },
        {
          title: 'Sales Reports & Insights',
          description:
            "See what's selling, what's not, and trends over time. Make decisions based on real data, not guesswork.",
          icon: 'heroChartBar',
        },
        {
          title: 'Top Products Analysis',
          description:
            'Quickly see your best-selling items. Know what to stock more of. Identify opportunities to grow.',
          icon: 'heroStar',
        },
        {
          title: 'Performance Dashboards',
          description:
            'See key metrics at a glance. Sales, inventory, and cash flow all in one place. Pro-level insight, designed for small businesses, not complex BI tools.',
          icon: 'heroArrowTrendingUp',
        },
        {
          title: 'WhatsApp Business Alerts',
          description:
            'Get WhatsApp notifications for shift changes, balance updates, and other important events. Stay informed even when you are away from the dashboard.',
          icon: 'heroDevicePhoneMobile',
        },
      ],
    },
    {
      name: 'Your team, your rules',
      description: 'Work together, securely',
      features: [
        {
          title: 'Multi-user Support',
          description:
            'Add team members to your account. Everyone can work together while you control who can do what.',
          icon: 'heroUsers',
        },
        {
          title: 'Control Who Can Do What',
          description:
            'Set different permission levels for different roles. Owners see everything, cashiers can only sell, managers can adjust prices. Keep your business secure.',
          icon: 'heroLockClosed',
        },
        {
          title: 'Run Multiple Shops',
          description:
            'Manage multiple shops or businesses from one account. Each shop has its own inventory and sales, but you control everything from one place.',
          icon: 'heroBuildingStorefront',
        },
        {
          title: 'Your Data is Secure',
          description:
            'Industry-standard security protects your business data. Your information stays private and is never shared.',
          icon: 'heroShieldCheck',
        },
        {
          title: 'API Access',
          description:
            'Connect dukarun to other systems you use. Build custom integrations. For technical users who need more.',
          icon: 'heroCpuChip',
        },
      ],
    },
    {
      name: 'Nothing extra to buy or learn',
      description: 'Professional tools, zero barriers',
      features: [
        {
          title: 'Your Phone Is the Hardware',
          description:
            'No barcode scanners, printers, or special equipment. dukarun runs on the phone you already have, with an interface that works like the apps you already know.',
          icon: 'heroDevicePhoneMobile',
        },
        {
          title: 'If You Can Use a Smartphone, You Can Use dukarun',
          description:
            'No training required. Most things are intuitive, and clear step-by-step guides are there whenever you need them.',
          icon: 'heroSparkles',
        },
      ],
    },
  ];

  /** The three differentiators nobody else gives a Kenyan shopkeeper. */
  protected readonly headlineFeatures = [
    {
      icon: 'heroCamera',
      title: 'Point. Sell.',
      copy: 'Your camera recognises the product. The sale starts before you type a single letter.',
    },
    {
      icon: 'heroSignalSlash',
      title: 'Power cut? Keep selling.',
      copy: 'Up to 30 sales save on your device and sync themselves when you are back online.',
    },
    {
      icon: 'heroScale',
      title: 'Books that keep themselves',
      copy: 'Every sale posts to a double-entry ledger. Closing time means counting cash once, not rebuilding the day.',
    },
  ];

  protected readonly comparisonData = {
    dukarun: [
      'Point phone to sell (no barcode needed)',
      'Works without internet',
      'Built-in accounting with ledger as single source of truth',
      'Track customers and suppliers together',
      'M-Pesa integration',
      'WhatsApp and SMS alerts for shifts and customer balances',
      'Multi-shop support',
    ],
    manual: [
      'Write everything by hand',
      'Count stock manually',
      'Chase payments yourself',
      'No insights or reports',
      'Prone to errors',
      'Time-consuming',
    ],
    genericPOS: [
      'Requires barcode scanner',
      'Needs constant internet',
      'Separate accounting software',
      'Basic customer tracking only',
      'No M-Pesa integration',
      'Limited reporting',
    ],
  };

  protected readonly comingSoonFeatures: ComingSoonFeature[] = [
    {
      icon: 'heroEye',
      title: 'Spot leaks instantly',
      description:
        'Daily & Randomized Reconciliation. Catch cash or stock leaks the moment they happen with surprise audit tools.',
      category: 'Financial Control',
    },
    {
      icon: 'heroArrowTrendingUp',
      title: 'Protect your margins',
      description:
        'True Profit Tracking (FIFO). Know exactly how much you made on every single item, even when supplier prices change.',
      category: 'Profitability',
    },
    {
      icon: 'heroScale',
      title: 'Audit-proof records',
      description:
        'Financial Integrity. A full double-entry ledger that works in the background to keep your accountant happy and your tax compliant.',
      category: 'Accounting',
    },
    {
      icon: 'heroArrowUturnLeft',
      title: 'Seamless Returns',
      description:
        'Handle customer returns and exchanges without messing up your inventory counts or cash balance.',
      category: 'Operations',
    },
  ];

  /**
   * Convert category name to URL-friendly ID
   */
  getCategoryId(categoryName: string): string {
    return categoryName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Features: Everything Between Pointing and Getting Paid | Dukarun',
      description:
        'Everything dukarun does: sell with camera or barcode, work offline, accept cash and M-Pesa, track inventory and credit, and run built-in accounting, for Kenyan shops and service businesses.',
      url: 'https://dukarun.com/features',
    });
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
    // Static sections
    const staticIds = ['hero', 'features', 'compare', 'coming-soon', 'cta'];

    // Dynamic category sections
    const categoryIds = this.categories.map((cat) => this.getCategoryId(cat.name));

    const allIds = [...staticIds, ...categoryIds];

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

    allIds.forEach((id) => {
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
        // If it's an accordion (collapse div), open it by checking the checkbox
        const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement;
        if (checkbox) {
          checkbox.checked = true;
        }
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }
}
