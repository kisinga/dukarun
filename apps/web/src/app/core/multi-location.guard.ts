import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LocationContextService } from './location-context.service';

/** Transfers are meaningful only after the company has more than one accessible location. */
export const multiLocationGuard: CanActivateFn = () => {
  const locations = inject(LocationContextService);
  const router = inject(Router);
  return locations.isMultiLocation() || router.createUrlTree(['/inventory/products']);
};
