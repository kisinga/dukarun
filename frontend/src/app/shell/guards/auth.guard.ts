import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@dukarun/auth';

/**
 * Guard to protect routes that require authentication
 * Waits for initial auth check to complete before making decision
 */
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for initial session verification to complete
  await authService.waitForInitialization();

  if (authService.isAuthenticated()) {
    return true;
  }

  // Redirect to login page
  return router.createUrlTree(['/login']);
};

/**
 * Guard to redirect authenticated users away from auth pages
 * Waits for initial auth check to complete before making decision
 */
export const noAuthGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for initial session verification to complete
  await authService.waitForInitialization();

  if (!authService.isAuthenticated()) {
    return true;
  }

  // Redirect authenticated users to dashboard
  return router.createUrlTree(['/dashboard']);
};
