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
import { SEOService } from '../../core/services/seo.service';

interface Testimonial {
  quote: string;
  author: string;
  title: string;
  metric?: string;
}

interface FeatureHighlight {
  icon: string;
  text: string;
}

interface WalkthroughStep {
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
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private observers: IntersectionObserver[] = [];
  private isUpdatingHash = false;

  /** Trial length (days) from platform config; null when unavailable. */
  protected readonly trialDays = signal<number | null>(null);

  protected readonly trialCtaText = computed(() => {
    const days = this.trialDays();
    return typeof days === 'number' && days > 0
      ? `Start free ${days}-day trial`
      : 'Start free trial';
  });

  protected readonly heroHighlights: FeatureHighlight[] = [
    { icon: '🤝', text: 'Guided setup' },
    { icon: '📱', text: 'Works on phone or desktop' },
    { icon: '🏪', text: 'Built for Kenyan shops' },
    { icon: '🔒', text: 'Your data stays safe' },
  ];

  protected readonly walkthroughSteps: WalkthroughStep[] = [
    {
      icon: '🛠️',
      title: 'We set you up',
      description:
        'Our team helps you get started. We guide you through adding products, payment methods, and users so you are ready to sell.',
    },
    {
      icon: '🛒',
      title: 'You sell calmly',
      description:
        'Use your phone or computer to check out customers. Sell with camera, barcode, or search. Keep selling even when internet is slow.',
    },
    {
      icon: '📒',
      title: 'We keep your books right',
      description:
        'Every sale and purchase posts to your ledger automatically. Your balances, reports, and reconciliations all read from one place.',
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

  ngOnInit(): void {
    this.seoService.updateTags({
      title: 'Dukarun - Calm POS for Kenyan Retail & Services',
      description:
        'Dukarun guides Kenyan shops through daily sales, stock, and books. Works on phone or desktop, even with slow internet. Start your free trial.',
      keywords:
        'POS system Kenya, point of sale Kenya, retail software Kenya, duka management system, M-Pesa POS, offline POS Kenya, shop management Kenya',
      url: 'https://dukarun.com',
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
    const sectionIds = ['hero', 'walkthrough', 'testimonials'];

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
