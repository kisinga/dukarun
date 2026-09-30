import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { ServerClockService } from './server-clock.service';
import { TaxSettingsSourceService } from './tax-settings-source.service';

afterEach(() => TestBed.resetTestingModule());
it('coalesces simultaneous settings reads and calibrates the one shared clock', async () => {
  let resolve!: (value: unknown) => void;
  const rpc = vi.fn(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          offlineIdentity: signal({ companyId: 'shop', userId: 'cashier' }),
          client: { rpc },
        },
      },
    ],
  });
  const source = TestBed.inject(TaxSettingsSourceService);
  const clock = TestBed.inject(ServerClockService);
  const designer = source.read();
  const printer = source.read();
  const vatSettings = source.read();
  expect(designer).toBe(printer);
  expect(printer).toBe(vatSettings);
  expect(rpc).toHaveBeenCalledOnce();
  resolve({ data: { activation: { server_time: '2026-09-29T20:00:00Z' } }, error: null });
  await Promise.all([designer, printer, vatSettings]);
  expect(clock.now()).toBeGreaterThanOrEqual(Date.parse('2026-09-29T20:00:00Z'));
  expect(clock.now()).toBeLessThan(Date.parse('2026-09-29T20:00:05Z'));
});
