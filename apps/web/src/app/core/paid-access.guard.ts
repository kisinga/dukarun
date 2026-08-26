import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { hasPaidAccess } from './paid-access';

/** Keep approved-but-unpaid companies on Billing until their first purchase. */
export const paidAccessGuard: CanActivateChildFn = async route => {
  const path = route.routeConfig?.path;
  if (path === 'billing' || (path === 'settings' && route.queryParamMap.get('tab') === 'billing')) {
    return true;
  }

  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const companyId = supabase.claims()?.company_id;
  if (!companyId) return router.createUrlTree(['/billing']);

  const { data, error } = await supabase.client
    .from('companies')
    .select(
      'subscription_status, subscription_expires_at, subscription_grace_period_end, subscription_exempt_until'
    )
    .eq('id', companyId)
    .maybeSingle();

  if (error || !data) return router.createUrlTree(['/billing']);
  return hasPaidAccess(data) ? true : router.createUrlTree(['/billing']);
};
