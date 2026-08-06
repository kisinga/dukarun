import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Platform guard: signed in AND is_platform_admin claim. Signed-in but
 * non-platform users are bounced with a clear flag the login page reads.
 */
export const platformGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const { data } = await auth.client.auth.getSession();
  if (!data.session) return router.createUrlTree(['/login']);
  if (!auth.isPlatformAdmin()) {
    return router.createUrlTree(['/login'], { queryParams: { denied: '1' } });
  }
  return true;
};
