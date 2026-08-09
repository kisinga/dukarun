import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class StorefrontSeoService {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  set(title: string, description: string, path: string, noindex = false): void {
    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: noindex ? 'noindex, nofollow' : 'index, follow',
    });
    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = new URL(
      path,
      `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`
    ).toString();
    this.document.getElementById('storefront-structured-data')?.remove();
  }

  setStructuredData(value: object): void {
    const script = this.document.createElement('script');
    script.id = 'storefront-structured-data';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(value).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }
}
