import { Injectable, inject, signal } from '@angular/core';

import { STOREFRONT } from '@dukarun-st/storefront';
import { isLocalHost, slugFromHost } from '../utils/storefront-host.util';
import { ApolloService } from './apollo.service';
import { ChannelTokenHolder } from './channel-token.holder';

export interface StoreIdentity {
  name: string;
  slug: string;
  channelToken: string;
  whatsappNumber: string | null;
  logoUrl: string | null;
  catalogueVisible: boolean;
}

export type StorefrontStatus = 'loading' | 'ready' | 'lapsed' | 'not-found' | 'directory';

/**
 * Resolves which merchant this page is for (from the subdomain, or `?store=<slug>` in local dev),
 * looks up its public identity via the shop-api `storefront` query, and exposes the result as
 * signals. Also stashes the channel token so subsequent shop-api calls are channel-scoped.
 */
@Injectable({ providedIn: 'root' })
export class StorefrontStateService {
  private readonly apollo = inject(ApolloService);
  private readonly tokenHolder = inject(ChannelTokenHolder);

  readonly status = signal<StorefrontStatus>('loading');
  readonly store = signal<StoreIdentity | null>(null);

  private resolvePromise: Promise<void> | null = null;

  /** Resolve once per app load; safe to call from multiple components. */
  resolve(): Promise<void> {
    if (!this.resolvePromise) {
      this.resolvePromise = this.doResolve();
    }
    return this.resolvePromise;
  }

  private async doResolve(): Promise<void> {
    const slug = this.currentSlug();
    if (!slug) {
      // No merchant subdomain (e.g. localhost, or the apex) -> show the discovery directory.
      this.status.set('directory');
      return;
    }
    try {
      const res = await this.apollo.getClient().query({
        query: STOREFRONT,
        variables: { slug },
        fetchPolicy: 'network-only',
      });
      const sf = res.data?.storefront;
      if (!sf) {
        this.status.set('not-found');
        return;
      }
      this.tokenHolder.token = sf.channelToken;
      this.store.set({
        name: sf.name,
        slug: sf.slug,
        channelToken: sf.channelToken,
        whatsappNumber: sf.whatsappNumber ?? null,
        logoUrl: sf.logo?.preview ?? null,
        catalogueVisible: sf.catalogueVisible,
      });
      this.status.set(sf.catalogueVisible ? 'ready' : 'lapsed');
    } catch {
      this.status.set('not-found');
    }
  }

  private currentSlug(): string | null {
    if (typeof window === 'undefined') return null;
    const host = window.location.hostname;

    // Dev-only override: ?store=<slug> (localhost has no real subdomains). Ignored in production so
    // a query param can never render another merchant's catalogue under the wrong subdomain.
    if (isLocalHost(host)) {
      const override = new URLSearchParams(window.location.search).get('store');
      return override ? override.trim().toLowerCase() : null;
    }
    return slugFromHost(host);
  }
}
