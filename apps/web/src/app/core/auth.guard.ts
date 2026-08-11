import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = async route => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  try {
    const session = await supabase.initializeSession();
    return session
      ? true
      : router.createUrlTree(['/login'], {
          queryParams: {
            plan: route.queryParamMap.get('plan') ?? undefined,
            blog_ref: route.queryParamMap.get('blog_ref') ?? undefined,
          },
        });
  } catch {
    // A stale or unreachable persisted session must not freeze navigation.
    return router.createUrlTree(['/login'], {
      queryParams: {
        plan: route.queryParamMap.get('plan') ?? undefined,
        blog_ref: route.queryParamMap.get('blog_ref') ?? undefined,
      },
    });
  }
};

export const guestGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  try {
    const session = await supabase.initializeSession();
    return session ? router.createUrlTree(['/dashboard']) : true;
  } catch {
    // Keep login available so the user can replace an unusable stored session.
    return true;
  }
};
