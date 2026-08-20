import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { hasRegistrationIntent } from './registration-intent';
import { CompanyContextService } from './company-context.service';

export const authGuard: CanActivateFn = async route => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  try {
    const session = await supabase.initializeSession();
    return session
      ? true
      : router.createUrlTree(['/login'], {
          queryParams: {
            register: route.routeConfig?.path === 'register' ? '1' : undefined,
            blog_ref: route.queryParamMap.get('blog_ref') ?? undefined,
            sales_code: route.queryParamMap.get('sales_code') ?? undefined,
          },
        });
  } catch {
    // A stale or unreachable persisted session must not freeze navigation.
    return router.createUrlTree(['/login'], {
      queryParams: {
        register: route.routeConfig?.path === 'register' ? '1' : undefined,
        blog_ref: route.queryParamMap.get('blog_ref') ?? undefined,
        sales_code: route.queryParamMap.get('sales_code') ?? undefined,
      },
    });
  }
};

export const guestGuard: CanActivateFn = async route => {
  const supabase = inject(SupabaseService);
  const companies = inject(CompanyContextService);
  const router = inject(Router);
  try {
    const session = await supabase.initializeSession();
    if (!session) return true;
    // Invitation messages intentionally point to /login. Existing members may
    // already have a valid company claim, so reconcile invitations before the
    // guest guard redirects them back into their current company.
    const invitationClaim = await supabase.claimTeamInvitations();
    if (invitationClaim.claimed_count > 0) {
      const { error } = await supabase.client.auth.refreshSession();
      if (error) throw error;
      await companies.refresh();
    }
    if (supabase.claims()?.company_id) return router.createUrlTree(['/dashboard']);
    return hasRegistrationIntent(route.queryParamMap)
      ? router.createUrlTree(['/register'], {
          queryParams: {
            blog_ref: route.queryParamMap.get('blog_ref') ?? undefined,
            sales_code: route.queryParamMap.get('sales_code') ?? undefined,
          },
        })
      : router.createUrlTree(['/access-required']);
  } catch {
    // Keep login available so the user can replace an unusable stored session.
    return true;
  }
};
