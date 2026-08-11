import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class StorefrontSeoService {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  set(
    title: string,
    description: string,
    path: string,
    noindex = false,
    image?: string | null,
    type: 'website' | 'product' = 'website'
  ): void {
    const canonicalUrl = new URL(
      path,
      `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`
    ).toString();
    const socialImage =
      image ??
      new URL(
        '/media/video/product-overview/product-overview-full-wide.png',
        environment.sitePublicUrl
      ).toString();

    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: noindex ? 'noindex, nofollow' : 'index, follow',
    });
    this.updateProperty('og:title', title);
    this.updateProperty('og:description', description);
    this.updateProperty('og:url', canonicalUrl);
    this.updateProperty('og:type', type);
    this.updateProperty('og:site_name', 'Dukarun shops');
    this.updateProperty('og:locale', 'en_KE');
    this.updateProperty('og:image', socialImage);
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: socialImage });
    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    this.document.getElementById('storefront-structured-data')?.remove();
  }

  private updateProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property="${property}"`);
  }

  setStructuredData(value: object): void {
    const script = this.document.createElement('script');
    script.id = 'storefront-structured-data';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(value).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }
}
