import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@dukarun/auth';

/**
 * Guard to protect settings page - only users with UpdateSettings permission can access
 */
export const settingsGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check if user has UpdateSettings permission
  if (authService.hasUpdateSettingsPermission()) {
    return true;
  }

  // Redirect to dashboard if no permission
  console.warn('🚫 Access denied: User does not have UpdateSettings permission');
  router.navigate(['/dashboard']);
  return false;
};
