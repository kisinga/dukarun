import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { CatalogCacheService } from './catalog-cache.service';
import { CatalogIdentityLookupService, type CatalogIdentity } from './identity-lookup.services';
import { LocationContextService } from './location-context.service';
import { SupabaseService } from './supabase.service';

describe('CatalogIdentityLookupService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('joins the cache bootstrap before resolving a cold active lookup', async () => {
    const loaded = signal(false);
    const revision = signal(0);
    const catalog = signal<CatalogIdentity[]>([]);
    const identity: CatalogIdentity = {
      variant_id: 'variant-1',
      company_id: 'company-1',
      product_id: 'product-1',
      product_name: 'Rice',
      variant_name: 'Default',
      kind: 'standard',
      sku: 'RICE-1',
      stock_unit: 'bag',
      variant_active: true,
      product_active: true,
      manufacturer_id: null,
      manufacturer_name: null,
    };
    const refresh = vi.fn(async () => {
      catalog.set([identity]);
      loaded.set(true);
      revision.update(value => value + 1);
      return true;
    });
    const rpc = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        CatalogIdentityLookupService,
        {
          provide: CatalogCacheService,
          useValue: {
            loaded,
            revision,
            catalogTruncated: signal(false),
            getCatalog: () => catalog(),
            ensureLoaded: vi.fn().mockResolvedValue(false),
            refresh,
          },
        },
        { provide: ConnectivityService, useValue: { online: signal(true) } },
        { provide: LocationContextService, useValue: { activeId: signal('location-1') } },
        {
          provide: SupabaseService,
          useValue: {
            offlineIdentity: signal({ companyId: 'company-1', userId: 'user-1' }),
            client: { rpc },
          },
        },
      ],
    });

    const result = await TestBed.inject(CatalogIdentityLookupService).resolve(['variant-1'], {
      coverage: 'active',
    });

    expect(refresh).toHaveBeenCalledOnce();
    expect(result.items.get('variant-1')).toBe(identity);
    expect(rpc).not.toHaveBeenCalled();
  });
});
