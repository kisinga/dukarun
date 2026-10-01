import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../core/supabase.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { ActionExecutorService } from '../core/action-executor.service';
import { PosService } from './pos.service';

function setup() {
  const pages = [
    { data: [{ variant_id: 'v1' }, { variant_id: 'v2' }], error: null },
    { data: [{ variant_id: 'v3' }], error: null },
    { data: [], error: null },
  ];
  const reads: Array<Record<string, unknown>> = [];
  const from = vi.fn(() => {
    const read: Record<string, unknown> = {};
    reads.push(read);
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((column, value) => {
        read[column] = value;
        return query;
      }),
      in: vi.fn((column, value) => {
        read[column] = value;
        return query;
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      gt: vi.fn((_column, value) => {
        read['after'] = value;
        return query;
      }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(pages.shift()).then(resolve),
    };
    return query;
  });
  const rpc = vi.fn(async (name: string, args: { p_variant_ids?: string[] }) => ({
    data:
      name === 'offline_catalog_definitions'
        ? args.p_variant_ids!.map(id => ({
            variant_id: id,
            stock_unit: 'piece',
            packs: [{ id: `pack-${id}`, active: true, sale_price: 100 }],
          }))
        : { product_count: 2, changed_count: 1 },
    error: null,
  }));
  TestBed.configureTestingModule({
    providers: [
      PosService,
      {
        provide: SupabaseService,
        useValue: {
          client: { from, rpc },
          offlineIdentity: signal({ userId: 'user', companyId: 'company' }),
        },
      },
      { provide: LocationContextService, useValue: {} },
      { provide: PartyCacheService, useValue: {} },
      { provide: ActionExecutorService, useValue: {} },
    ],
  });
  return { service: TestBed.inject(PosService), pages, reads, rpc, from };
}

describe('Product bulk service', () => {
  it('reads complete tenant-scoped pages even below the server limit and loads all packs', async () => {
    const page = setup();
    const rows = await page.service.variantsForSelectedProducts(
      ['p1', 'p2'],
      new AbortController().signal
    );
    expect(rows.map(row => row.variant_id)).toEqual(['v1', 'v2', 'v3']);
    expect(rows.every(row => row.packs?.length === 1)).toBe(true);
    expect(page.reads).toEqual([
      { company_id: 'company', product_id: ['p1', 'p2'] },
      { company_id: 'company', product_id: ['p1', 'p2'], after: 'v2' },
      { company_id: 'company', product_id: ['p1', 'p2'], after: 'v3' },
    ]);
    expect(page.rpc).toHaveBeenCalledWith('offline_catalog_definitions', {
      p_variant_ids: ['v1', 'v2', 'v3'],
    });
  });

  it('rejects loading errors without returning the preceding partial pages', async () => {
    const page = setup();
    page.pages[1] = { data: null, error: { message: 'Connection lost' } } as never;
    await expect(
      page.service.variantsForSelectedProducts(['p1'], new AbortController().signal)
    ).rejects.toThrow('Connection lost');
    expect(page.rpc).not.toHaveBeenCalled();
  });

  it('rejects incomplete pack hydration instead of showing a partial label list', async () => {
    const page = setup();
    page.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      page.service.variantsForSelectedProducts(['p1'], new AbortController().signal)
    ).rejects.toThrow('Could not load complete pack definitions');
  });

  it('honors cancellation before loading', async () => {
    const page = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      page.service.variantsForSelectedProducts(['p1'], controller.signal)
    ).rejects.toThrow();
    expect(page.from).not.toHaveBeenCalled();
  });

  it('uses explicit target states and returns saved batch counts', async () => {
    const page = setup();
    expect(await page.service.setProductsActive(['p1', 'p2'], false)).toEqual({
      product_count: 2,
      changed_count: 1,
    });
    expect(await page.service.setProductsStorefrontPublished(['p1', 'p2'], true)).toEqual({
      product_count: 2,
      changed_count: 1,
    });
    expect(page.rpc).toHaveBeenCalledWith('set_products_active', {
      p_product_ids: ['p1', 'p2'],
      p_active: false,
    });
    expect(page.rpc).toHaveBeenCalledWith('set_products_storefront_published', {
      p_product_ids: ['p1', 'p2'],
      p_published: true,
    });
  });
});
