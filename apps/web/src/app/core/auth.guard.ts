import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const { data } = await supabase.client.auth.getSession();
  // Keep identity-scoped offline services deterministic before routed
  // components restore their browser state.
  supabase.session.set(data.session);
  return data.session ? true : router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const { data } = await supabase.client.auth.getSession();
  supabase.session.set(data.session);
  return data.session ? router.createUrlTree(['/dashboard']) : true;
};
