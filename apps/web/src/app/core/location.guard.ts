import { inject } from '@angular/core';
import { CanActivateChildFn } from '@angular/router';
import { LocationContextService } from './location-context.service';

/**
 * Resolves the working location before any shell child page activates.
 * Without this, a hard refresh races: child pages read
 * LocationContextService.activeId while the shell's async load is still in
 * flight and fail with "No accessible business location is configured."
 * load() is idempotent, so repeat navigations cost nothing.
 */
export const locationGuard: CanActivateChildFn = async () => {
  const load = inject(LocationContextService).load();
  // Location hydration improves offline routing, but must never leave the
  // authenticated shell stuck when the network or an old token is unhealthy.
  await Promise.race([
    load.catch(() => undefined),
    new Promise<void>(resolve => window.setTimeout(resolve, 10_000)),
  ]);
  return true;
};
