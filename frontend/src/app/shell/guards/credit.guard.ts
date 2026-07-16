import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@dukarun/auth';

export const creditGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasCreditManagementPermission()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
