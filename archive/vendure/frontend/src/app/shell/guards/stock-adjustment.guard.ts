import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@dukarun/auth';

/**
 * Guard to protect stock adjustments page - only users with ManageStockAdjustmentsPermission can access
 */
export const stockAdjustmentGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check if user has ManageStockAdjustmentsPermission
  if (authService.hasManageStockAdjustmentsPermission()) {
    return true;
  }

  // Redirect to dashboard if no permission
  console.warn('🚫 Access denied: User does not have ManageStockAdjustmentsPermission');
  router.navigate(['/dashboard']);
  return false;
};
