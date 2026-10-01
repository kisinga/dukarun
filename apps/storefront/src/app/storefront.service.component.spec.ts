import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorefrontService } from './storefront.service';
import { environment } from '../environments/environment';

describe('Live storefront reads', () => {
  const initial = { ...environment };
  beforeEach(() => {
    environment.publicDataMode = 'live';
    environment.production = true;
    TestBed.configureTestingModule({});
  });
  afterEach(() => {
    Object.assign(environment, initial);
    vi.unstubAllGlobals();
  });

  it('treats a product 404 as unavailable and bypasses browser caching', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    expect(await TestBed.inject(StorefrontService).product('shop', 'hidden')).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/api/v1/storefronts/shop/products/hidden' }),
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('retains error handling for actual service failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(TestBed.inject(StorefrontService).product('shop', 'product')).rejects.toThrow(
      'storefront_product_failed:503'
    );
  });

  it('fetches catalogue pages without caching', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            storefront: { id: 'shop', name: 'Shop', slug: 'shop', catalogue_visible: true },
            categories: [],
            products: [],
          },
          pagination: { offset: 0, has_more: false },
        })
      )
    );
    vi.stubGlobal('fetch', fetch);
    const result = await TestBed.inject(StorefrontService).catalogPage('shop');
    expect(result.rows).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
