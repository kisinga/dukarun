import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SeoPage {
  title: string;
  description?: string;
  image?: string | null;
  /** Path (e.g. /products/rice) used for canonical + og:url. Defaults to the current URL. */
  canonicalPath?: string;
  noindex?: boolean;
}

/**
 * Per-page SEO for the storefront: title, meta description, Open Graph / Twitter tags, canonical,
 * and JSON-LD. Canonical/og:url are built from the current origin, so each merchant subdomain is
 * self-canonical. (Note: because the app is client-rendered, social scrapers won't execute this —
 * an accepted Phase-1 limitation documented in docs/PUBLIC_STOREFRONT_PLAN.md.)
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  setPage(page: SeoPage): void {
    const url = this.absoluteUrl(page.canonicalPath);
    this.title.setTitle(page.title);
    this.meta.updateTag({ name: 'description', content: page.description ?? '' });
    this.meta.updateTag({ name: 'robots', content: page.noindex ? 'noindex, nofollow' : 'index, follow' });

    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:description', content: page.description ?? '' });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ name: 'twitter:card', content: page.image ? 'summary_large_image' : 'summary' });
    if (page.image) {
      this.meta.updateTag({ property: 'og:image', content: page.image });
      this.meta.updateTag({ name: 'twitter:image', content: page.image });
    } else {
      // Angular Meta.removeTag wraps the arg as `meta[<attrSelector>]`, so NO surrounding brackets.
      this.meta.removeTag("property='og:image'");
      this.meta.removeTag("name='twitter:image'");
    }
    this.setCanonical(url);
  }

  setJsonLd(id: string, data: unknown): void {
    let el = this.doc.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = this.doc.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      this.doc.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }

  clearJsonLd(id: string): void {
    this.doc.getElementById(id)?.remove();
  }

  /** Point the browser favicon at the store's logo, so the tab feels owned by the merchant. */
  setFavicon(url: string | null): void {
    if (!url) return;
    let link = this.doc.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'icon');
      this.doc.head.appendChild(link);
    }
    link.removeAttribute('type'); // logo may be png/webp/svg — let the browser sniff it
    link.setAttribute('href', url);
  }

  private absoluteUrl(path?: string): string {
    const origin = this.doc.defaultView?.location.origin ?? '';
    if (!path) {
      const href = this.doc.defaultView?.location.href ?? origin;
      return href.split('?')[0].split('#')[0];
    }
    return origin + (path.startsWith('/') ? path : `/${path}`);
  }

  private setCanonical(url: string): void {
    let link = this.doc.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}
