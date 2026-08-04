import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EntitlementsService, FeatureKey } from './entitlements.service';

/** Navigation affordance only; protected RPCs repeat the entitlement check. */
export const featureGuard: CanActivateFn = async route => {
  const entitlements = inject(EntitlementsService);
  const router = inject(Router);
  const feature = route.data['feature'] as FeatureKey | undefined;
  if (!feature) return router.createUrlTree(['/dashboard']);
  try {
    await entitlements.refresh();
  } catch {
    return router.createUrlTree(['/dashboard']);
  }
  if (!entitlements.enabled(feature)) return router.createUrlTree(['/billing']);
  if (route.data['requiresCommissionOptIn'] && !entitlements.commissionsVisible()) {
    return router.createUrlTree(['/settings']);
  }
  return true;
};
