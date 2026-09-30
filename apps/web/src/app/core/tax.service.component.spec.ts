import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheJournalService } from './cache-journal.service';
import { SupabaseService } from './supabase.service';
import { TaxService } from './tax.service';

describe('VAT settings refresh', () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });
  function setup() {
    const settings = {
      activation: { server_time: '2026-09-29T20:59:59.000Z' },
      active_profile: { vat_registered: false },
      scheduled_profiles: [{ effective_from_at: '2026-09-29T21:00:00.000Z' }],
    };
    const rpc = vi.fn().mockResolvedValue({ data: settings, error: null });
    const journal = { subscribe: vi.fn().mockReturnValue({}), unsubscribe: vi.fn() };
    const removed = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        TaxService,
        {
          provide: SupabaseService,
          useValue: {
            offlineIdentity: signal({ companyId: 'shop', userId: 'cashier' }),
            client: { rpc, removeChannel: removed },
          },
        },
        { provide: CacheJournalService, useValue: journal },
      ],
    });
    const next = vi.fn();
    const failed = vi.fn();
    stop = TestBed.inject(TaxService).watchSettings('test-vat', next, failed);
    TestBed.tick();
    return { rpc, journal, next, failed, settings, removed };
  }
  it('refreshes at the server boundary even if the device clock is wrong', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01'));
    const { rpc, settings, next } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledWith(settings);
    rpc.mockResolvedValue({
      data: { ...settings, active_profile: { vat_registered: true }, scheduled_profiles: [] },
      error: null,
    });
    await vi.advanceTimersByTimeAsync(1100);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ active_profile: { vat_registered: true } })
    );
  });
  it('refreshes after another device changes settings and stops all work on teardown', async () => {
    vi.useFakeTimers();
    const { rpc, journal, next, settings, removed } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const handler = journal.subscribe.mock.calls[0][3];
    rpc.mockResolvedValue({
      data: { ...settings, scheduled_profiles: [], show_vat_breakdown_on_prints: true },
      error: null,
    });
    await handler.apply([{ entityType: 'company' }]);
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ show_vat_breakdown_on_prints: true })
    );
    stop!();
    stop = undefined;
    expect(journal.unsubscribe).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    const count = rpc.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rpc).toHaveBeenCalledTimes(count);
  });
});
