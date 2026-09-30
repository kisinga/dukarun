import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/supabase.service';
import { LocationContextService } from '../../core/location-context.service';
import { CatalogCacheService } from '../../core/catalog-cache.service';
import { CatalogSearchService } from '../../core/catalog-search.service';
import { CacheJournalService } from '../../core/cache-journal.service';
import { PosService } from '../pos.service';
import { ConnectivityService } from './connectivity.service';
import { SyncService } from './sync.service';
import type { OutboxEntry } from './offline-db';

const memory = vi.hoisted(() => ({ rows: [] as OutboxEntry[] }));
vi.mock('idb', () => ({
  openDB: async () => ({
    getAllFromIndex: async () => structuredClone(memory.rows),
    delete: async (_store: string, key: string) => {
      memory.rows = memory.rows.filter(row => row.client_ref !== key);
    },
    put: async (_store: string, value: OutboxEntry) => {
      memory.rows = memory.rows.map(row =>
        row.client_ref === value.client_ref ? structuredClone(value) : row
      );
    },
  }),
}));

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
describe('Sync delivery outcomes', () => {
  async function run(result: unknown) {
    vi.spyOn(globalThis, 'setInterval').mockReturnValue(
      0 as unknown as ReturnType<typeof setInterval>
    );
    const request = {
      protocol_version: 2,
      client_ref: 'sale-ref',
      location_id: 'location',
      originating_session_id: 'session',
      offline_context_id: 'context',
      occurred_at: '2026-09-29T08:00:00Z',
      device_key: 'device',
      customer_id: null,
      lines: [],
      payments: [{ method: 'cash', amount: 116 }],
    } as const;
    memory.rows = [
      {
        ...request,
        request,
        company_id: 'company',
        user_id: 'cashier',
        queued_at: '2026-09-29T08:00:00Z',
        status: 'queued',
      } as unknown as OutboxEntry,
    ];
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data: name === 'submit_offline_sale' ? result : [],
    }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            offlineIdentity: signal({ companyId: 'company', userId: 'cashier' }),
            client: { rpc },
          },
        },
        {
          provide: LocationContextService,
          useValue: { activeId: signal('location'), requireActiveId: () => 'location' },
        },
        { provide: ConnectivityService, useValue: { online: signal(true), resumeTick: signal(0) } },
        { provide: CatalogCacheService, useValue: { fetchedAt: signal(null) } },
        { provide: CatalogSearchService, useValue: {} },
        { provide: CacheJournalService, useValue: { subscribe: vi.fn(), reconcile: vi.fn() } },
        {
          provide: PosService,
          useValue: { heartbeatPosDevice: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    });
    const service = TestBed.inject(SyncService);
    await service.sync();
    return { service, rpc, request };
  }

  it('keeps the entire immutable request when the outcome is unknown', async () => {
    const { service, request } = await run({ status: 'success' });
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0].request).toEqual(request);
    expect(memory.rows[0].status).toBe('queued');
    expect(service.lastPostedCount()).toBe(0);
  });

  it('keeps a held payment visible and retries the exact original request', async () => {
    const result = {
      status: 'review',
      review_id: 'review',
      durable_custody: true,
      order_id: null,
      blockers: [{ code: 'item_price_changed' }],
    };
    const { service, rpc, request } = await run(result);
    expect(memory.rows[0].status).toBe('review');
    expect(memory.rows[0].request).toEqual(request);
    await service.sync();
    const submits = rpc.mock.calls.filter(call => call[0] === 'submit_offline_sale');
    expect(submits).toHaveLength(2);
    expect(submits[1]).toEqual(submits[0]);
    expect(service.lastPostedCount()).toBe(0);
  });

  it('removes the local request only after a confirmed completed result', async () => {
    const { service } = await run({
      status: 'completed',
      review_id: 'review',
      durable_custody: true,
      order_id: 'order',
      blockers: [],
    });
    expect(memory.rows).toHaveLength(0);
    expect(service.lastPostedCount()).toBe(1);
  });
});
