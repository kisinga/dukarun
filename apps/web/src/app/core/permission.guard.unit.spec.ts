import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { permissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';

describe('company settings permission gate', () => {
  it('declares ManageCompanySettings on the settings route', () => {
    const shell = routes.find(route => route.path === '');
    const settings = shell?.children?.find(route => route.path === 'settings');

    expect(settings?.canActivate).toContain(permissionGuard);
    expect(settings?.data?.['permission']).toBe('ManageCompanySettings');
  });

  it('allows only users with ManageCompanySettings', async () => {
    const dashboardTree = { path: '/dashboard' };
    const permissions = {
      ensureLoaded: vi.fn().mockResolvedValue(true),
      has: vi.fn().mockReturnValue(false),
      canAccessWorkspace: vi.fn().mockReturnValue(false),
      landingRoute: vi.fn().mockReturnValue('/dashboard'),
    };
    const router = { createUrlTree: vi.fn().mockReturnValue(dashboardTree) };
    const injector = Injector.create({
      providers: [
        { provide: PermissionsService, useValue: permissions },
        { provide: Router, useValue: router },
      ],
    });
    const route = {
      data: { permission: 'ManageCompanySettings' },
    } as unknown as ActivatedRouteSnapshot;

    try {
      const denied = await runInInjectionContext(injector, () =>
        permissionGuard(route, {} as RouterStateSnapshot)
      );
      expect(denied).toBe(dashboardTree);
      expect(permissions.has).toHaveBeenCalledWith('ManageCompanySettings');

      permissions.has.mockReturnValue(true);
      const allowed = await runInInjectionContext(injector, () =>
        permissionGuard(route, {} as RouterStateSnapshot)
      );
      expect(allowed).toBe(true);
    } finally {
      injector.destroy();
    }
  });

  it('gates baseline operational routes and redirects fulfillment-only users', async () => {
    const shell = routes.find(route => route.path === '');
    for (const path of ['dashboard', 'pos/sell', 'customers', 'suppliers', 'sales']) {
      expect(shell?.children?.find(route => route.path === path)?.canActivate).toContain(
        permissionGuard
      );
    }

    const fulfillmentTree = { path: '/fulfillment' };
    const permissions = {
      ensureLoaded: vi.fn().mockResolvedValue(true),
      has: vi.fn().mockReturnValue(false),
      canAccessWorkspace: vi.fn().mockReturnValue(false),
      landingRoute: vi.fn().mockReturnValue('/fulfillment'),
    };
    const router = { createUrlTree: vi.fn().mockReturnValue(fulfillmentTree) };
    const injector = Injector.create({
      providers: [
        { provide: PermissionsService, useValue: permissions },
        { provide: Router, useValue: router },
      ],
    });
    const route = {
      data: { workspaceAccess: 'sales' },
    } as unknown as ActivatedRouteSnapshot;

    try {
      const denied = await runInInjectionContext(injector, () =>
        permissionGuard(route, {} as RouterStateSnapshot)
      );
      expect(denied).toBe(fulfillmentTree);
      expect(permissions.canAccessWorkspace).toHaveBeenCalledWith('sales');
      expect(router.createUrlTree).toHaveBeenCalledWith(['/fulfillment']);
    } finally {
      injector.destroy();
    }
  });
});
