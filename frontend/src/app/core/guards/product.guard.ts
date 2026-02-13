import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard for product create/edit routes.
 * Only users with UpdateProduct permission can access.
 */
export const productGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasUpdateProductPermission()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
