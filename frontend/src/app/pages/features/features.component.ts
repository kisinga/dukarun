import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
} from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';

type IconType =
  | 'phone'
  | 'graduation'
  | 'lightbulb'
  | 'book'
  | 'chart'
  | 'rocket'
  | 'camera'
  | 'barcode'
  | 'wifi'
  | 'currency'
  | 'scissors'
  | 'package'
  | 'store'
  | 'edit'
  | 'bell'
  | 'users'
  | 'credit-card'
  | 'mail'
  | 'dollar'
  | 'star'
  | 'lock'
  | 'building'
  | 'shield'
  | 'plug'
  | 'mobile'
  | 'key'
  | 'trending-up'
  | 'bank'
  | 'handshake';

interface Feature {
  title: string;
  description: string;
  icon: IconType;
  origin: 'dukarun-Exclusive' | 'dukarun-Enhanced' | 'Standard';
  useCase?: string;
  visualPlaceholder?: string;
}

interface FeatureCategory {
  name: string;
  description: string;
  features: Feature[];
}

interface ComingSoonFeature {
  icon: IconType;
  title: string;
  description: string;
  category: string;
}

@Component({
  selector: 'app-features',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturesComponent implements AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private observers: IntersectionObserver[] = [];
  private isUpdatingHash = false;

  protected readonly categories: FeatureCategory[] = [
    {
      name: 'Getting Started',
      description: 'Designed for everyone — no barriers to professional accounting',
      features: [
        {
          title: 'No Complex Hardware Required',
          description:
            'Works on any smartphone. No barcode scanners, printers, or special equipment needed. Your phone is all you need to run a professional business system.',
          icon: 'phone',
          origin: 'dukarun-Exclusive',
          useCase:
            'Perfect for businesses that want to start immediately without investing in hardware',
        },
        {
          title: 'No Computer Literacy Needed',
          description:
            'If you know how to use a smartphone, you can use Dukarun. No training required — most things are intuitive. The system is designed to be as simple as using any modern app.',
          icon: 'graduation',
          origin: 'dukarun-Exclusive',
          useCase:
            'Ideal for business owners who want professional tools without the learning curve',
        },
        {
          title: 'Intuitive Smartphone Interface',
          description:
            'Designed for touch and simplicity. Everything you need is just a tap away. The interface works naturally, just like using any smartphone app you already know.',
          icon: 'lightbulb',
          origin: 'dukarun-Exclusive',
          useCase: 'Perfect for teams that want to get started quickly without extensive training',
        },
        {
          title: 'Simple Step-by-Step Tutorials',
          description:
            'Clear, easy-to-follow tutorials teach you how to use the system. Most features work intuitively, but helpful guides are available whenever you need them.',
          icon: 'book',
          origin: 'dukarun-Exclusive',
          useCase: 'Great for new users who want guidance while learning the system',
        },
        {
          title: 'Professional Accounting Made Accessible',
          description:
            'Lowers the barrier to professional accounting. Get enterprise-level financial tracking, double-entry ledger, and comprehensive reporting without the complexity.',
          icon: 'chart',
          origin: 'dukarun-Exclusive',
          useCase:
            'Essential for businesses that want professional accounting without hiring accountants',
        },
        {
          title: 'Powerful Insights Without Complexity',
          description:
            'Pro-level business tool that gives you powerful information for gauging business status and making data-driven decisions to grow your business to the next stage.',
          icon: 'rocket',
          origin: 'dukarun-Exclusive',
          useCase:
            'Perfect for business owners who want actionable insights without complex dashboards',
        },
      ],
    },
    {
      name: 'Selling & Checkout',
      description: 'Everything you need to sell quickly and accurately',
      features: [
        {
          title: 'Point Your Phone, Sell Instantly',
          description:
            'Point your phone camera at a price label or product. dukarun recognizes it instantly and adds it to your cart. No typing, no barcode scanner needed. Perfect for fresh produce, services, and items without barcodes.',
          icon: 'camera',
          origin: 'dukarun-Exclusive',
          useCase: 'Perfect for markets, salons, and shops selling items without barcodes',
        },
        {
          title: 'Barcode Scanning',
          description:
            'Scan barcodes to quickly add packaged goods to your cart or create new products. Fast and accurate for items with barcodes.',
          icon: 'barcode',
          origin: 'dukarun-Enhanced',
          useCase: 'Ideal for packaged goods and products with barcodes',
        },
        {
          title: 'Works Without Internet',
          description:
            'Continue selling even when internet is down. Record up to 30 sales offline. Everything syncs automatically when you reconnect. Never lose a sale.',
          icon: 'wifi',
          origin: 'dukarun-Exclusive',
          useCase: 'Essential for areas with unreliable internet or during power cuts',
        },
        {
          title: 'Accept Cash and M-Pesa',
          description:
            'Take payments via cash and M-Pesa in one system. Track M-Pesa payments automatically in your books with full ledger integration. Customer-initiated M-Pesa payments (STK Push) coming soon.',
          icon: 'currency',
          origin: 'dukarun-Exclusive',
          useCase: 'Perfect for Kenyan businesses accepting both cash and mobile money',
        },
        {
          title: 'Sell Services Too',
          description:
            'Create visual cards for services like haircuts or repairs. Track service sales just like products. No need for separate systems.',
          icon: 'scissors',
          origin: 'Standard',
          useCase: 'Ideal for salons, barbers, repair shops, and service businesses',
        },
      ],
    },
    {
      name: 'Inventory & Stock',
      description: 'Know exactly what you have, where it is, and when to reorder',
      features: [
        {
          title: 'Real-time Stock Tracking',
          description:
            'See exactly how much stock you have at any moment. Every sale updates your inventory instantly. No more guessing or manual counting.',
          icon: 'package',
          origin: 'dukarun-Enhanced',
          useCase: 'Essential for any business that manages inventory',
        },
        {
          title: 'Multiple Stock Locations',
          description:
            "Track inventory across multiple shops or warehouses. See what's where at a glance. Perfect for businesses with multiple locations.",
          icon: 'store',
          origin: 'Standard',
          useCase: 'Perfect for businesses with multiple shops or warehouses',
        },
        {
          title: 'Stock Adjustments',
          description:
            'Easily adjust stock levels when needed. Record damages, losses, or corrections. Everything is tracked with a clear audit trail.',
          icon: 'edit',
          origin: 'dukarun-Enhanced',
          useCase: 'Ideal when you need to correct stock counts or record losses',
        },
        {
          title: 'Low Stock Alerts',
          description:
            'Get notified when items are running low. Never run out of popular items. Make better decisions about what to order.',
          icon: 'bell',
          origin: 'dukarun-Exclusive',
          useCase: 'Perfect for preventing stockouts and reducing waste',
        },
      ],
    },
    {
      name: 'Customers & Suppliers',
      description: 'Manage everyone you do business with in one place',
      features: [
        {
          title: 'One System for Customers and Suppliers',
          description:
            'Track customers and suppliers in the same system. No need for separate lists. See everything in one place.',
          icon: 'users',
          origin: 'dukarun-Exclusive',
          useCase: 'Simplifies operations for businesses dealing with both customers and suppliers',
        },
        {
          title: 'Track Credit and Limits',
          description:
            'Set credit limits for customers. The system automatically checks limits before allowing credit sales. Prevent bad debt.',
          icon: 'credit-card',
          origin: 'dukarun-Exclusive',
          useCase: 'Essential for businesses that sell on credit',
        },
        {
          title: 'Automatic Payment Reminders',
          description:
            'The system sends friendly reminders to customers about payments due. You also get notified to follow up. Improve cash flow.',
          icon: 'mail',
          origin: 'dukarun-Exclusive',
          useCase: 'Perfect for reducing time spent chasing payments',
        },
        {
          title: "See What's Owed",
          description:
            'Instantly see how much each customer owes you and how much you owe each supplier. Everything calculated automatically from your sales and purchases.',
          icon: 'dollar',
          origin: 'dukarun-Exclusive',
          useCase: 'Essential for managing cash flow and collections',
        },
      ],
    },
    {
      name: 'Business Intelligence',
      description: 'Make better decisions with real data',
      features: [
        {
          title: 'Sales Reports & Insights',
          description:
            "See what's selling, what's not, and trends over time. Make decisions based on real data, not guesswork.",
          icon: 'chart',
          origin: 'dukarun-Enhanced',
          useCase: 'Perfect for understanding your business performance',
        },
        {
          title: 'Top Products Analysis',
          description:
            'Quickly see your best-selling items. Know what to stock more of. Identify opportunities to grow.',
          icon: 'star',
          origin: 'dukarun-Enhanced',
          useCase: 'Ideal for optimizing your product mix',
        },
        {
          title: 'Built-in Accounting',
          description:
            'Every sale, payment, and purchase is automatically recorded in a double-entry ledger. No need for separate accounting software.',
          icon: 'book',
          origin: 'dukarun-Exclusive',
          useCase: 'Perfect for businesses that want integrated accounting',
        },
        {
          title: 'Performance Dashboards',
          description:
            'See key metrics at a glance. Sales, inventory, and cash flow all in one place. Designed for small businesses, not complex BI tools.',
          icon: 'trending-up',
          origin: 'dukarun-Enhanced',
          useCase: 'Essential for owners who want quick insights',
        },
      ],
    },
    {
      name: 'Team & Access',
      description: 'Work together securely',
      features: [
        {
          title: 'Multi-user Support',
          description:
            'Add team members to your account. Everyone can work together while you control who can do what.',
          icon: 'users',
          origin: 'Standard',
          useCase: 'Perfect for businesses with multiple staff members',
        },
        {
          title: 'Control Who Can Do What',
          description:
            'Set different permission levels for different roles. Owners see everything, cashiers can only sell, managers can adjust prices. Keep your business secure.',
          icon: 'lock',
          origin: 'dukarun-Enhanced',
          useCase: 'Essential for businesses with multiple staff and different roles',
        },
        {
          title: 'Run Multiple Shops',
          description:
            'Manage multiple shops or businesses from one account. Each shop has its own inventory and sales, but you control everything from one place.',
          icon: 'building',
          origin: 'dukarun-Enhanced',
          useCase: 'Perfect for business owners with multiple locations',
        },
      ],
    },
    {
      name: 'Reliability & Integration',
      description: 'Built to work when you need it',
      features: [
        {
          title: 'Designed for Offline Use',
          description:
            'Built from the ground up to work without internet. Your catalog is stored on your device. Sales continue even when connectivity is poor.',
          icon: 'wifi',
          origin: 'dukarun-Exclusive',
          useCase: 'Critical for areas with unreliable internet',
        },
        {
          title: 'M-Pesa Integration',
          description:
            'Track M-Pesa payments automatically in your ledger. Record M-Pesa receipts from your existing Till number with full accounting integration. Customer-initiated payments (STK Push) coming soon.',
          icon: 'mobile',
          origin: 'dukarun-Exclusive',
          useCase: 'Essential for Kenyan businesses accepting mobile money',
        },
        {
          title: 'API Access',
          description:
            'Connect dukarun to other systems you use. Build custom integrations. For technical users who need more.',
          icon: 'plug',
          origin: 'Standard',
          useCase: 'For businesses that need custom integrations',
        },
        {
          title: 'Your Data is Secure',
          description:
            'Industry-standard security protects your business data. Your information stays private and is never shared.',
          icon: 'shield',
          origin: 'dukarun-Exclusive',
          useCase: 'Essential for protecting your business information',
        },
      ],
    },
  ];

  protected readonly comparisonData = {
    dukarun: [
      'Point phone to sell (no barcode needed)',
      'Works without internet',
      'Built-in accounting',
      'Track customers and suppliers together',
      'M-Pesa integration',
      'Automatic payment reminders',
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
      icon: 'key',
      title: 'Spot leaks instantly',
      description:
        'Daily & Randomized Reconciliation. Catch cash or stock leaks the moment they happen with surprise audit tools.',
      category: 'Financial Control',
    },
    {
      icon: 'trending-up',
      title: 'Protect your margins',
      description:
        'True Profit Tracking (FIFO). Know exactly how much you made on every single item, even when supplier prices change.',
      category: 'Profitability',
    },
    {
      icon: 'bank',
      title: 'Audit-proof records',
      description:
        'Financial Integrity. A full double-entry ledger that works in the background to keep your accountant happy and your tax compliant.',
      category: 'Accounting',
    },
    {
      icon: 'handshake',
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

  /**
   * Get SVG icon path based on icon type
   */
  getIconPath(icon: IconType): string {
    const iconMap: Record<IconType, string> = {
      phone:
        'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
      graduation:
        'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z M12 14v7M5 12h14',
      lightbulb:
        'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
      book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
      chart:
        'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
      rocket: 'M13 10V3L4 14h7v7l9-11h-7z',
      camera:
        'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
      barcode: 'M4 4h16M4 8h16M4 12h16M4 16h16',
      wifi: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0',
      currency:
        'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      scissors:
        'M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z',
      package: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
      store:
        'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
      edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
      bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
      users:
        'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      'credit-card':
        'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
      mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      dollar:
        'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
      lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
      building:
        'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
      shield:
        'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      plug: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      mobile: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
      key: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
      'trending-up': 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
      bank: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
      handshake:
        'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
    };
    return iconMap[icon] || iconMap.phone;
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
