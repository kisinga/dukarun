import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { CompanyContextService } from './company-context.service';
import { guestGuard } from './auth.guard';
import { SupabaseService } from './supabase.service';

describe('guestGuard invitation reconciliation', () => {
  it('refreshes the token and company list before redirecting a signed-in invitee', async () => {
    const dashboardTree = { path: '/dashboard' };
    const refreshCompanies = vi.fn().mockResolvedValue(undefined);
    const refreshSession = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      initializeSession: vi.fn().mockResolvedValue({ user: { id: 'invitee' } }),
      claimTeamInvitations: vi.fn().mockResolvedValue({ claimed_count: 1, company_id: 'new-co' }),
      claims: vi.fn().mockReturnValue({ company_id: 'existing-co' }),
      client: { auth: { refreshSession } },
    };
    const router = {
      createUrlTree: vi.fn().mockReturnValue(dashboardTree),
    };
    const injector = Injector.create({
      providers: [
        { provide: SupabaseService, useValue: supabase },
        { provide: CompanyContextService, useValue: { refresh: refreshCompanies } },
        { provide: Router, useValue: router },
      ],
    });

    try {
      const result = await runInInjectionContext(injector, () =>
        guestGuard(
          { queryParamMap: { get: () => null } } as unknown as ActivatedRouteSnapshot,
          {} as RouterStateSnapshot
        )
      );

      expect(supabase.claimTeamInvitations).toHaveBeenCalledOnce();
      expect(refreshSession).toHaveBeenCalledOnce();
      expect(refreshCompanies).toHaveBeenCalledOnce();
      expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
      expect(result).toBe(dashboardTree);
    } finally {
      injector.destroy();
    }
  });
});
