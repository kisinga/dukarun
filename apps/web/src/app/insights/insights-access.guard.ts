import { inject } from '@angular/core';
import { type CanActivateFn, type RedirectFunction, Router } from '@angular/router';
import { PermissionsService } from '../core/permissions.service';

type InsightsSection = 'attention' | 'credit' | 'inventory' | 'sales';

function firstPermitted(permissions: PermissionsService): string {
  if (permissions.has('ViewFinancials') || permissions.canAccessWorkspace('inventory')) {
    return '/insights/attention';
  }
  return permissions.landingRoute();
}

function allowed(section: InsightsSection, permissions: PermissionsService): boolean {
  if (section === 'credit' || section === 'sales') return permissions.has('ViewFinancials');
  return permissions.has('ViewFinancials') || permissions.canAccessWorkspace('inventory');
}

export const insightsSectionGuard: CanActivateFn = async route => {
  const permissions = inject(PermissionsService);
  const router = inject(Router);
  await permissions.ensureLoaded();
  const section = route.data['insightsSection'] as InsightsSection;
  if (allowed(section, permissions)) return true;
  return router.createUrlTree([firstPermitted(permissions)], {
    queryParams: { notice: 'That Insights section is not available for your role.' },
  });
};

export const insightsLandingRedirect: RedirectFunction = async () => {
  const permissions = inject(PermissionsService);
  const router = inject(Router);
  await permissions.ensureLoaded();
  return router.parseUrl(firstPermitted(permissions));
};
