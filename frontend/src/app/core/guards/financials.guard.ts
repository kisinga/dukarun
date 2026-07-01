import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard for the Finances / accounting section — requires the `ViewFinancials`
 * permission (admin / accountant) or SuperAdmin. Operational roles
 * (cashier / salesperson / stockkeeper) are redirected to the dashboard.
 *
 * Note: cashiers still reach their shift-close reconciliation flow, which is
 * gated by ManageReconciliation elsewhere — not by this guard.
 */
export const financialsGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.canViewFinancials()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
