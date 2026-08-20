import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { hasPaidAccess } from './paid-access';

/** Keep approved-but-unpaid companies on Billing until their first purchase. */
export const paidAccessGuard: CanActivateChildFn = async route => {
  if (route.routeConfig?.path === 'billing') return true;

  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const { data, error } = await supabase.client
    .from('companies')
    .select(
      'subscription_status, subscription_expires_at, subscription_grace_period_end, subscription_exempt_until'
    )
    .limit(1)
    .maybeSingle();

  if (error || !data) return router.createUrlTree(['/billing']);
  return hasPaidAccess(data) ? true : router.createUrlTree(['/billing']);
};
