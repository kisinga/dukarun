import { inject } from '@angular/core';
import { RedirectFunction, Router } from '@angular/router';

/** Build a compatibility redirect that retains deep-link filters and fragments. */
export function preserveQueryRedirect(target: string): RedirectFunction {
  return route =>
    inject(Router).createUrlTree([target], {
      queryParams: route.queryParams,
      fragment: route.fragment ?? undefined,
    });
}
