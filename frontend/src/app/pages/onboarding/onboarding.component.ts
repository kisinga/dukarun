import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SEOService } from '../../core/services/seo.service';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';

export interface OnboardingSection {
  id: string;
  label: string;
}

const ONBOARDING_SECTIONS: OnboardingSection[] = [
  { id: 'prerequisites', label: 'Prerequisites and flow' },
  { id: 'creating-product', label: 'Creating a product' },
  { id: 'types-of-products', label: 'Types of products' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'opening-stock', label: 'Opening stock' },
  { id: 'opening-shift', label: 'Opening a shift' },
  { id: 'selling', label: 'Selling the product' },
  { id: 'purchasing', label: 'Purchasing (supplier management)' },
  { id: 'credit', label: 'Selling on credit (customer management)' },
  { id: 'accounting', label: 'Accounting and reconciliation' },
  { id: 'transfers', label: 'Inter-account transfers' },
  { id: 'admin', label: 'Admin features' },
  { id: 'audit-logs', label: 'Audit logs' },
  { id: 'pitfalls', label: 'Common pitfalls and troubleshooting' },
];

@Component({
  selector: 'app-onboarding',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly seo = inject(SEOService);
  private readonly document = inject(DOCUMENT);
  private jsonLdScript: HTMLScriptElement | null = null;

  readonly sections = ONBOARDING_SECTIONS;

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Getting started guide – Dukarun POS',
      description:
        'Step-by-step guide: create products, set pricing and opening stock, open a shift, sell, purchase from suppliers, sell on credit, and use accounting and admin features. Reference for customer care and self-onboarding.',
      url: 'https://dukarun.com/onboarding',
      type: 'article',
      keywords:
        'dukarun guide, POS setup Kenya, open shift, create product, supplier management, credit sales, reconciliation, audit trail',
    });
    this.injectJsonLd();
  }

  ngOnDestroy(): void {
    if (this.jsonLdScript?.parentNode) {
      this.jsonLdScript.parentNode.removeChild(this.jsonLdScript);
      this.jsonLdScript = null;
    }
  }

  private injectJsonLd(): void {
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Getting started guide – Dukarun POS',
      description: this.jsonLdDescription,
      url: this.canonicalUrl,
      mainEntityOfPage: { '@type': 'WebPage', '@id': this.canonicalUrl },
      author: { '@type': 'Organization', name: 'Dukarun', url: 'https://dukarun.com' },
      publisher: { '@type': 'Organization', name: 'Dukarun', url: 'https://dukarun.com' },
      datePublished: '2025-01-01',
      dateModified: '2025-01-01',
      articleSection: 'Getting started',
      keywords: 'dukarun, POS, Kenya, setup guide, open shift, products, credit, accounting',
    });
    this.document.head.appendChild(script);
    this.jsonLdScript = script;
  }

  ngAfterViewInit(): void {
    this.scrollToFragmentFromUrl();
  }

  /**
   * Scroll to section from TOC. Prevents default, scrolls target into view (respecting
   * scroll-margin-top for sticky header), and updates URL hash.
   */
  scrollToSection(sectionId: string, event: Event): void {
    event.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const url = new URL(window.location.href);
      url.hash = sectionId;
      window.history.replaceState(null, '', url.toString());
    }
  }

  /**
   * On load, if URL has a fragment that matches a section, scroll to it after view is ready.
   */
  private scrollToFragmentFromUrl(): void {
    const hash = window.location.hash.slice(1);
    if (hash && this.sections.some((s) => s.id === hash)) {
      const el = document.getElementById(hash);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }

  scrollToTop(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('onboarding-main');
    if (main) {
      main.focus({ preventScroll: true });
      main.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /** Base URL for JSON-LD (canonical). */
  readonly canonicalUrl = 'https://dukarun.com/onboarding';
  readonly jsonLdDescription =
    'How to set up products, stock, shifts, selling, purchasing, credit, accounting, and admin in Dukarun — in the order a business runs.';
  readonly jsonLdSteps = this.sections.map((s) => ({ name: s.label }));
}
