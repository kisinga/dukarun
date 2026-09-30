import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogCacheService } from './catalog-cache.service';
import { CacheJournalService } from './cache-journal.service';
import { LocationContextService } from './location-context.service';
import { SupabaseService } from './supabase.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { PosService } from '../pos/pos.service';

const storage = vi.hoisted(() => ({ get: vi.fn(), getAllFromIndex: vi.fn() }));
vi.mock('idb', () => ({ openDB: async () => storage }));

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

function setup(hasEvidence: boolean, connected: boolean) {
  const online = signal(connected);
  storage.get.mockResolvedValue({
    company_id: 'company',
    user_id: 'user',
    location_id: 'location',
    families: [],
    manufacturers: [],
    categories: [],
    product_categories: [],
    category_memberships_complete: true,
    catalog_complete: true,
    fetched_at: '2026-09-29',
  });
  storage.getAllFromIndex.mockResolvedValue([
    {
      variant_id: 'variant',
      stock_value: 0,
      variant: {
        variant_id: 'variant',
        product_name: 'Tea',
        packs: [],
        catalogue_version: hasEvidence
          ? { product: 'version', variant: 'version', pack: null }
          : undefined,
      },
    },
  ]);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          offlineIdentity: signal({ companyId: 'company', userId: 'user' }),
          client: {},
        },
      },
      { provide: LocationContextService, useValue: { activeId: signal('location') } },
      { provide: ConnectivityService, useValue: { online, resumeTick: signal(0) } },
      { provide: PosService, useValue: {} },
      { provide: CacheJournalService, useValue: { subscribe: vi.fn(), reconcile: vi.fn() } },
    ],
  });
  const service = TestBed.inject(CatalogCacheService);
  const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(true);
  return { service, refresh, online };
}

describe('Retained catalogue after the hard cutover', () => {
  it('awaits capture evidence hydration even with a complete warm catalogue', async () => {
    const { service, refresh } = setup(false, true);
    TestBed.tick();
    await service.ensureLoaded();
    refresh.mockClear();
    let release!: (value: boolean) => void;
    refresh.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    let loaded = false;
    const loading = service.ensureLoaded().then(() => {
      loaded = true;
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(loaded).toBe(false);
    release(true);
    await loading;
    expect(loaded).toBe(true);
  });

  it('hydrates when an offline-started device reconnects with an unchanged journal', async () => {
    const { service, refresh, online } = setup(false, false);
    TestBed.tick();
    await service.ensureLoaded();
    expect(refresh).not.toHaveBeenCalled();
    online.set(true);
    TestBed.tick();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('keeps normal warm-cache loading incremental once evidence is present', async () => {
    const { service, refresh } = setup(true, true);
    TestBed.tick();
    await service.ensureLoaded();
    expect(service.loaded()).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });
});
