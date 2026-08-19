import { inject } from '@angular/core';
import { RedirectFunction, Router } from '@angular/router';
import { EntitlementsService } from './entitlements.service';
import { PermissionsService } from './permissions.service';
import { WorkspaceKey, WorkspaceNavigationService } from './workspace-navigation.service';

export const workspaceLandingRedirect: RedirectFunction = async route => {
  const permissions = inject(PermissionsService);
  const entitlements = inject(EntitlementsService);
  const navigation = inject(WorkspaceNavigationService);
  const router = inject(Router);
  const workspace = route.data['workspace'] as WorkspaceKey | undefined;

  if (!workspace || !(await permissions.ensureLoaded())) {
    return router.createUrlTree(['/dashboard']);
  }

  if (workspace === 'team' && !permissions.has('ManageTeam') && !entitlements.snapshot()) {
    try {
      await entitlements.refresh();
    } catch {
      return router.createUrlTree(['/dashboard']);
    }
  }

  const target = navigation.landingRoute(workspace, route.queryParams['tab']);

  if (!target) return router.createUrlTree(['/dashboard']);

  const queryParams = { ...route.queryParams };
  delete queryParams['tab'];
  return router.createUrlTree([target], { queryParams });
};
