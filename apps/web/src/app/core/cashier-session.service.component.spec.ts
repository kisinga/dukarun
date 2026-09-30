import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from './cashier-session.service';
import { SupabaseService } from './supabase.service';
import { LocationContextService } from './location-context.service';
import { CompanyPreferencesService } from './company-preferences.service';
import { CacheJournalService } from './cache-journal.service';
import { ServerClockService } from './server-clock.service';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('idb', () => ({ openDB: async () => storage }));

afterEach(() => {
  TestBed.resetTestingModule();
  vi.resetAllMocks();
});

function setup(withContext: boolean) {
  const now = signal(Date.parse('2026-09-30T08:00:00Z'));
  const session = { id: 'session', company_id: 'company', location_id: 'location', status: 'open' };
  const context = {
    id: 'context',
    session_id: session.id,
    location_id: 'location',
    device_key: 'device',
    issued_at: new Date(now()).toISOString(),
    expires_at: new Date(now() + 86_400_000).toISOString(),
  };
  const rpc = vi.fn().mockResolvedValue({
    data: { session, context: withContext ? context : null, server_time: context.issued_at },
    error: null,
  });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          offlineIdentity: signal({ companyId: 'company', userId: 'user' }),
          client: { rpc },
        },
      },
      {
        provide: LocationContextService,
        useValue: {
          activeId: signal('location'),
          requireActiveId: () => 'location',
        },
      },
      {
        provide: CompanyPreferencesService,
        useValue: {
          loaded: signal(true),
          cashControlEnabled: signal(true),
          cashierFlowEnabled: signal(true),
        },
      },
      { provide: CacheJournalService, useValue: {} },
      {
        provide: ServerClockService,
        useValue: {
          now,
          observe: vi.fn(),
          restore: vi.fn(),
          snapshot: () => ({ serverTime: now(), observedAt: now() }),
        },
      },
    ],
  });
  return { service: TestBed.inject(CashierSessionService), rpc, now };
}

describe('Shared cashier session visibility', () => {
  it('allows a live financial-action session read without granting offline capture', async () => {
    const { service } = setup(false);
    await expect(service.assertOpen('recording an expense')).resolves.toBeUndefined();
    expect(service.canTakePayment()).toBe(true);
    expect(service.isOpen()).toBe(true);
    expect(() => service.captureOfflineSale()).toThrow('Connect to confirm');
    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('cashier', 'company:user:location');
  });

  it('cannot reuse a read-only session after the server becomes unreachable', async () => {
    const { service, rpc } = setup(false);
    await service.refresh();
    rpc.mockRejectedValue(new Error('Offline'));
    await expect(service.assertOpen('recording an expense')).rejects.toThrow(
      'Open a cashier session'
    );
    expect(service.canTakePayment()).toBe(false);
  });

  it('keeps offline capture within its original 24-hour confirmation', async () => {
    const { service, rpc, now } = setup(true);
    await service.refresh();
    rpc.mockRejectedValue(new Error('Offline'));
    await service.assertOpen('completing a sale');
    expect(service.usingCachedState()).toBe(true);
    expect(service.captureOfflineSale().originating_session_id).toBe('session');
    now.update(value => value + 86_400_000);
    expect(service.canTakePayment()).toBe(false);
    expect(() => service.captureOfflineSale()).toThrow('Connect to confirm');
    await expect(service.assertOpen('completing a sale')).rejects.toThrow();
  });
});
