import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { environment } from '../../environments/environment';

const SOCIAL_IMAGE_PATH = '/media/video/product-overview/product-overview-full-wide.png';

const FAQ_ENTITIES = [
  {
    '@type': 'Question',
    name: 'What happens when my internet drops?',
    acceptedAnswer: {
      '@type': 'Answer',
      text: 'Nothing changes at the counter. The POS keeps selling and queues every sale on the device, then syncs when the network returns. Safeguards make sure no sale is ever posted twice.',
    },
  },
  {
    '@type': 'Question',
    name: 'Do I need special hardware?',
    acceptedAnswer: {
      '@type': 'Answer',
      text: 'No. Dukarun runs on the Android phone you already have, and on any desktop browser for the back office. Any Bluetooth or USB receipt printer works if you want paper.',
    },
  },
  {
    '@type': 'Question',
    name: 'How do my customers pay?',
    acceptedAnswer: {
      '@type': 'Answer',
      text: 'Cash or M-Pesa, recorded at the till. You can also sell on credit to customers you trust, with balances and limits tracked per person.',
    },
  },
  {
    '@type': 'Question',
    name: 'Can customers pay straight into dukarun by M-Pesa?',
    acceptedAnswer: {
      '@type': 'Answer',
      text: 'Not yet. Customer-initiated M-Pesa (an STK push from the buyer) is still in the works. Today you record M-Pesa payments from your existing till, and they post to the books like any other sale.',
    },
  },
  {
    '@type': 'Question',
    name: 'Can my staff use it without seeing everything?',
    acceptedAnswer: {
      '@type': 'Answer',
      text: 'Yes. Cashiers sell; managers approve; owners see the books. Roles decide what each person can do, and sensitive actions like price overrides or stock adjustments can require approval.',
    },
  },
  {
    '@type': 'Question',
    name: 'How is the subscription billed?',
    acceptedAnswer: {
      '@type': 'Answer',
      text: 'Monthly or yearly, through M-Pesa. You get a prompt on your phone, approve it, and you are done.',
    },
  },
] as const;

@Injectable({ providedIn: 'root' })
export class SiteSeoService {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        startWith(null)
      )
      .subscribe(() => this.update());
  }

  private update(): void {
    let leaf = this.route;
    while (leaf.firstChild) leaf = leaf.firstChild;
    const description =
      (leaf.snapshot.data['description'] as string | undefined) ??
      'Point of sale and books for Kenyan businesses.';
    const title =
      typeof leaf.snapshot.title === 'string' ? leaf.snapshot.title : this.title.getTitle();
    const url = new URL(
      this.router.url.split('?')[0].split('#')[0] || '/',
      environment.sitePublicUrl
    );
    const image = new URL(SOCIAL_IMAGE_PATH, environment.sitePublicUrl).toString();

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.updateProperty('og:title', title);
    this.updateProperty('og:description', description);
    this.updateProperty('og:url', url.toString());
    this.updateProperty('og:type', 'website');
    this.updateProperty('og:site_name', 'Dukarun');
    this.updateProperty('og:locale', 'en_KE');
    this.updateProperty('og:image', image);
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = url.toString();
    this.setStructuredData(url.pathname === '/');
  }

  private updateProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property="${property}"`);
  }

  private setStructuredData(includeFaq: boolean): void {
    const siteUrl = new URL('/', environment.sitePublicUrl).toString();
    const organizationId = `${siteUrl}#organization`;
    const graph: object[] = [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'Dukarun',
        url: siteUrl,
        logo: new URL('/assets/logo/dukarun-icon-dark.svg', siteUrl).toString(),
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}#website`,
        name: 'Dukarun',
        url: siteUrl,
        publisher: { '@id': organizationId },
        inLanguage: 'en-KE',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Dukarun',
        url: siteUrl,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, Android',
        description:
          'Point of sale, stock management, customer credit and books for Kenyan businesses.',
        publisher: { '@id': organizationId },
      },
    ];
    if (includeFaq) graph.push({ '@type': 'FAQPage', mainEntity: FAQ_ENTITIES });

    this.document.getElementById('site-structured-data')?.remove();
    const script = this.document.createElement('script');
    script.id = 'site-structured-data';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': graph,
    }).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }
}
