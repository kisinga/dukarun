import { inject } from '@angular/core';
import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import { StorefrontService } from './storefront.service';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'statement/:token', renderMode: RenderMode.Client },
  { path: 'document/:token', renderMode: RenderMode.Client },
  {
    path: ':slug',
    renderMode: RenderMode.Prerender,
    fallback: PrerenderFallback.Client,
    async getPrerenderParams() {
      const storefront = inject(StorefrontService);
      return (await storefront.prerenderSlugs()).map(slug => ({ slug }));
    },
  },
  { path: '**', renderMode: RenderMode.Client },
];
