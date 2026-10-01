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

describe('Catalogue refresh after a mutation', () => {
  async function readyCache() {
    const { service, refresh } = setup(true, true);
    TestBed.tick();
    await service.ensureLoaded();
    refresh.mockRestore();
    return service;
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(yes => {
      resolve = yes;
    });
    return { promise, resolve };
  }

  it('keeps ordinary refreshes deduplicated', async () => {
    const service = await readyCache();
    const response = deferred<boolean>();
    const fetch = vi
      .spyOn(
        service as unknown as { fetchSnapshot(scope: string): Promise<boolean> },
        'fetchSnapshot'
      )
      .mockReturnValue(response.promise);
    const first = service.refresh();
    expect(service.refresh()).toBe(first);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    response.resolve(true);
    expect(await first).toBe(true);
  });

  it('queues a new read after an older refresh and returns the committed state', async () => {
    const service = await readyCache();
    const oldResponse = deferred<void>();
    let serverActive = true;
    let cachedActive = true;
    const fetch = vi
      .spyOn(
        service as unknown as { fetchSnapshot(scope: string): Promise<boolean> },
        'fetchSnapshot'
      )
      .mockImplementationOnce(async () => {
        const beforeSave = serverActive;
        await oldResponse.promise;
        cachedActive = beforeSave;
        return true;
      })
      .mockImplementationOnce(async () => {
        cachedActive = serverActive;
        return true;
      });
    const older = service.refresh();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    serverActive = false;
    const reconciliation = service.refreshAfterMutation();
    expect(fetch).toHaveBeenCalledOnce();
    oldResponse.resolve();
    expect(await older).toBe(true);
    expect(await reconciliation).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cachedActive).toBe(false);
  });

  it('reports failure of the new read even when the older refresh succeeds', async () => {
    const service = await readyCache();
    const oldResponse = deferred<boolean>();
    const fetch = vi
      .spyOn(
        service as unknown as { fetchSnapshot(scope: string): Promise<boolean> },
        'fetchSnapshot'
      )
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce(false);
    const older = service.refresh();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const reconciliation = service.refreshAfterMutation();
    oldResponse.resolve(true);
    expect(await older).toBe(true);
    expect(await reconciliation).toBe(false);
  });

  it('does not read the new workspace when a queued refresh outlives its scope', async () => {
    const service = await readyCache();
    const oldResponse = deferred<boolean>();
    const fetch = vi
      .spyOn(
        service as unknown as { fetchSnapshot(scope: string): Promise<boolean> },
        'fetchSnapshot'
      )
      .mockReturnValueOnce(oldResponse.promise);
    const older = service.refresh();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const oldScope = fetch.mock.calls[0][0];
    const reconciliation = service.refreshAfterMutation();
    (TestBed.inject(LocationContextService).activeId as ReturnType<typeof signal<string>>).set(
      'other-location'
    );
    TestBed.tick();
    oldResponse.resolve(true);
    await older;
    expect(await reconciliation).toBe(false);
    expect(fetch).toHaveBeenNthCalledWith(2, oldScope);
  });
});
