import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission, PermissionsService } from './permissions.service';

/** Server-backed route gate. RLS remains the source of truth for the data itself. */
export const permissionGuard: CanActivateFn = async route => {
  const permissions = inject(PermissionsService);
  const router = inject(Router);
  const permission = route.data['permission'] as Permission | undefined;
  const anyPermission = route.data['anyPermission'] as Permission[] | undefined;

  if (!permission && !anyPermission?.length) return router.createUrlTree(['/dashboard']);

  await permissions.ensureLoaded();
  const allowed = permission
    ? permissions.has(permission)
    : anyPermission!.some(item => permissions.has(item));
  return allowed ? true : router.createUrlTree(['/dashboard']);
};
