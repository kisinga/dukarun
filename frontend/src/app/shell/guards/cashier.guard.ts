import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@dukarun/auth';

/**
 * Guard for the cashier settlement queue — requires the `SettleOrder` permission
 * (admin / cashier) or SuperAdmin. Sales / stock / accountant roles, which do not
 * take payment at the counter, are redirected to the dashboard.
 */
export const cashierGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.canSettleOrders()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
