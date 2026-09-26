import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { BusinessClockService } from './business-clock.service';
import { SupabaseService } from './supabase.service';

function setup(data: unknown = '2026-09-25') {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  const injector = Injector.create({
    providers: [
      BusinessClockService,
      {
        provide: SupabaseService,
        useValue: {
          claims: vi.fn().mockReturnValue({ company_id: 'company-1' }),
          client: { rpc },
        },
      },
    ],
  });
  return { clock: injector.get(BusinessClockService), injector, rpc };
}

describe('BusinessClockService', () => {
  it('reads each business date from the server', async () => {
    const { clock, injector, rpc } = setup();
    try {
      await expect(clock.today()).resolves.toBe('2026-09-25');
      await expect(clock.today()).resolves.toBe('2026-09-25');
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(rpc).toHaveBeenCalledWith('current_business_date');
    } finally {
      injector.destroy();
    }
  });

  it('rejects malformed dates instead of falling back to the device clock', async () => {
    const { clock, injector } = setup('09/25/2026');
    try {
      await expect(clock.today()).rejects.toThrow('invalid business date');
    } finally {
      injector.destroy();
    }
  });
});
