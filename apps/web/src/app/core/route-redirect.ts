import { inject } from '@angular/core';
import { Params, RedirectFunction, Router } from '@angular/router';

/** Build a compatibility redirect that retains deep-link filters and fragments. */
export function preserveQueryRedirect(
  target: string,
  extraQueryParams: Params = {}
): RedirectFunction {
  return route =>
    inject(Router).createUrlTree([target], {
      queryParams: { ...route.queryParams, ...extraQueryParams },
      fragment: route.fragment ?? undefined,
    });
}
