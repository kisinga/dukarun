import { Controller, Get, Header, Headers, Query } from '@nestjs/common';

import { env } from '../../infrastructure/config/environment.config';
import { RESERVED_STOREFRONT_SLUGS } from '../../utils/storefront-slug.util';
import { StorefrontService } from './storefront.service';

/**
 * Serves per-merchant robots.txt and sitemap.xml at the backend root. The storefront's nginx
 * proxies /robots.txt and /sitemap.xml here, forwarding the original Host so we can tell which
 * merchant subdomain is asking. In dev (no subdomain) a ?slug= query param is honoured.
 *
 * When the store is missing/disabled or its subscription has lapsed we emit a noindex robots.txt
 * and an empty sitemap, so lapsed stores drop out of search results.
 */
@Controller()
export class StorefrontSitemapController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async robots(
    @Headers('host') host: string,
    @Headers('x-forwarded-proto') proto: string,
    @Query('slug') slugParam?: string
  ): Promise<string> {
    const slug = slugParam || this.slugFromHost(host);
    const store = slug ? await this.storefrontService.resolveStorefrontBySlug(slug) : null;
    if (!store || !store.catalogueVisible) {
      return 'User-agent: *\nDisallow: /\n';
    }
    const base = this.baseUrl(host, proto);
    return `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async sitemap(
    @Headers('host') host: string,
    @Headers('x-forwarded-proto') proto: string,
    @Query('slug') slugParam?: string
  ): Promise<string> {
    const slug = slugParam || this.slugFromHost(host);
    const store = slug ? await this.storefrontService.resolveStorefrontBySlug(slug) : null;
    const base = this.baseUrl(host, proto);

    const urls: string[] = [];
    if (store && store.catalogueVisible) {
      urls.push(this.urlXml(`${base}/`, null));
      const entries = await this.storefrontService.getSitemapEntries(store.channel);
      for (const e of entries) {
        urls.push(this.urlXml(`${base}${e.loc}`, e.lastmod));
      }
    }

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') +
      (urls.length ? '\n' : '') +
      '</urlset>\n'
    );
  }

  /** Extract the single-label subdomain from a host, rejecting the apex + reserved labels. */
  private slugFromHost(host?: string): string | null {
    if (!host) return null;
    const h = host.split(':')[0].toLowerCase();
    const base = env.app.storefrontBaseDomain;
    if (!base || h === base || !h.endsWith('.' + base)) return null;
    const label = h.slice(0, h.length - base.length - 1);
    if (!label || label.includes('.')) return null;
    if (RESERVED_STOREFRONT_SLUGS.includes(label)) return null;
    return label;
  }

  private baseUrl(host: string | undefined, proto: string | undefined): string {
    const scheme = (proto || 'https').split(',')[0].trim();
    return `${scheme}://${host || env.app.storefrontBaseDomain}`;
  }

  private urlXml(loc: string, lastmod: string | null): string {
    const safe = this.escapeXml(loc);
    return lastmod
      ? `  <url><loc>${safe}</loc><lastmod>${lastmod}</lastmod></url>`
      : `  <url><loc>${safe}</loc></url>`;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
