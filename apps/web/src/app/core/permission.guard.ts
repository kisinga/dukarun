import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission } from './permissions.service';
import { SupabaseService } from './supabase.service';

/** Server-backed route gate. RLS remains the source of truth for the data itself. */
export const permissionGuard: CanActivateFn = async route => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const permission = route.data['permission'] as Permission | undefined;

  if (!permission) return router.createUrlTree(['/dashboard']);

  const { data, error } = await supabase.client.rpc('current_user_has_permission', {
    p_permission: permission,
  });
  return !error && data ? true : router.createUrlTree(['/dashboard']);
};
