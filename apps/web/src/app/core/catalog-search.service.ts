import { Injectable, inject } from '@angular/core';
import { matchesCatalogQuery } from '../pos/catalog-search';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { PosService, type Variant } from '../pos/pos.service';
import { CatalogCacheService } from './catalog-cache.service';

export interface CatalogSearchResult {
  variants: Variant[];
  source: 'cache' | 'server';
  /** True when cached results represent only the offline catalog prefix. */
  incomplete: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogSearchService {
  private readonly cache = inject(CatalogCacheService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly pos = inject(PosService);

  /** Active rows currently available from the bounded, location-aware catalog cache. */
  async activeCatalog(): Promise<Variant[]> {
    await this.ensureCatalog();
    return this.active(this.cache.getCatalog());
  }

  /**
   * Search locally while the complete catalog is cached. Oversized online
   * catalogs route to the indexed server search and fall back safely offline.
   */
  async search(query: string, limit = 20): Promise<CatalogSearchResult> {
    await this.ensureCatalog();
    const normalizedQuery = query.trim();
    const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

    if (normalizedQuery && this.cache.catalogTruncated() && this.connectivity.online()) {
      try {
        return {
          variants: await this.pos.searchVariants(normalizedQuery, cappedLimit),
          source: 'server',
          incomplete: false,
        };
      } catch {
        // The bounded cache remains usable during a transient search failure.
      }
    }

    return this.cachedResult(normalizedQuery, cappedLimit);
  }

  /** Force bounded-cache search for explicitly offline workflows. */
  async searchCached(query: string, limit = 20): Promise<CatalogSearchResult> {
    await this.ensureCatalog();
    return this.cachedResult(query.trim(), Math.min(Math.max(Math.trunc(limit), 1), 100));
  }

  private cachedResult(query: string, limit: number): CatalogSearchResult {
    const variants = this.active(this.cache.getCatalog())
      .filter(variant => matchesCatalogQuery(variant, query))
      .slice(0, limit);
    return {
      variants,
      source: 'cache',
      incomplete: this.cache.catalogTruncated(),
    };
  }

  private async ensureCatalog(): Promise<void> {
    await this.cache.ensureLoaded();
    if (this.cache.getCatalog().length === 0 && this.connectivity.online()) {
      await this.cache.refresh();
    }
  }

  private active(variants: Variant[]): Variant[] {
    return variants.filter(variant => variant.variant_active && variant.product_active);
  }
}
