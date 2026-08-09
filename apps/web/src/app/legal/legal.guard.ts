import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LegalService } from './legal.service';

export const legalAcceptanceGuard: CanActivateFn = async (_route, state) => {
  const legal = inject(LegalService);
  const router = inject(Router);
  try {
    const status = await legal.ensureVerified();
    if (status.company_status === 'unapproved') {
      return router.createUrlTree(['/company/pending']);
    }
    if (!status.required || status.accepted || !status.enforcement_started) return true;
    const path = status.can_accept ? '/legal/accept' : '/legal/pending';
    return router.createUrlTree([path], { queryParams: { returnUrl: state.url } });
  } catch {
    return router.createUrlTree(['/legal/pending'], {
      queryParams: { returnUrl: state.url, offline: !navigator.onLine || undefined },
    });
  }
};
