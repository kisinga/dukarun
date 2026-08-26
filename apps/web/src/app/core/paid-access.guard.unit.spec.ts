import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import {
  Router,
  convertToParamMap,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { hasPaidAccess, type PaidAccessState } from './paid-access';
import { paidAccessGuard } from './paid-access.guard';
import { SupabaseService } from './supabase.service';

const now = Date.parse('2026-08-20T12:00:00Z');

function state(overrides: Partial<PaidAccessState> = {}): PaidAccessState {
  return {
    subscription_status: null,
    subscription_expires_at: null,
    subscription_grace_period_end: null,
    subscription_exempt_until: null,
    ...overrides,
  };
}

describe('hasPaidAccess', () => {
  it('blocks an approved company before its first payment', () => {
    expect(hasPaidAccess(state(), now)).toBe(false);
  });

  it('allows only active subscriptions with a future expiry', () => {
    expect(
      hasPaidAccess(
        state({
          subscription_status: 'active',
          subscription_expires_at: '2026-08-21T12:00:00Z',
        }),
        now
      )
    ).toBe(true);
    expect(
      hasPaidAccess(
        state({
          subscription_status: 'active',
          subscription_expires_at: '2026-08-19T12:00:00Z',
        }),
        now
      )
    ).toBe(false);
  });

  it('honors a future grace period or explicit exemption', () => {
    expect(
      hasPaidAccess(
        state({
          subscription_status: 'expired',
          subscription_grace_period_end: '2026-08-21T12:00:00Z',
        }),
        now
      )
    ).toBe(true);
    expect(hasPaidAccess(state({ subscription_exempt_until: '2026-08-21T12:00:00Z' }), now)).toBe(
      true
    );
  });
});

describe('paidAccessGuard', () => {
  it('allows the embedded billing settings route without checking paid access', async () => {
    const supabase = {
      claims: vi.fn(),
      client: { from: vi.fn() },
    };
    const router = { createUrlTree: vi.fn() };
    const injector = Injector.create({
      providers: [
        { provide: SupabaseService, useValue: supabase },
        { provide: Router, useValue: router },
      ],
    });
    const route = {
      routeConfig: { path: 'settings' },
      queryParamMap: convertToParamMap({ tab: 'billing' }),
    } as unknown as ActivatedRouteSnapshot;

    try {
      const result = await runInInjectionContext(injector, () =>
        paidAccessGuard(route, {} as RouterStateSnapshot)
      );

      expect(result).toBe(true);
      expect(supabase.client.from).not.toHaveBeenCalled();
    } finally {
      injector.destroy();
    }
  });

  it('redirects an expired company to billing using the JWT company scope', async () => {
    const billingTree = { path: '/billing' };
    const maybeSingle = vi.fn().mockResolvedValue({
      data: state({
        subscription_status: 'expired',
        subscription_expires_at: '2026-08-19T12:00:00Z',
      }),
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = {
      claims: vi.fn().mockReturnValue({ company_id: 'wambui-company' }),
      client: { from },
    };
    const router = { createUrlTree: vi.fn().mockReturnValue(billingTree) };
    const injector = Injector.create({
      providers: [
        { provide: SupabaseService, useValue: supabase },
        { provide: Router, useValue: router },
      ],
    });
    const route = {
      routeConfig: { path: 'dashboard' },
      queryParamMap: convertToParamMap({}),
    } as unknown as ActivatedRouteSnapshot;

    try {
      const result = await runInInjectionContext(injector, () =>
        paidAccessGuard(route, {} as RouterStateSnapshot)
      );

      expect(eq).toHaveBeenCalledWith('id', 'wambui-company');
      expect(result).toBe(billingTree);
      expect(router.createUrlTree).toHaveBeenCalledWith(['/billing']);
    } finally {
      injector.destroy();
    }
  });
});
