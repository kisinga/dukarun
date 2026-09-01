import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  { path: 'docs', renderMode: RenderMode.Prerender },
  { path: 'docs/hardware', renderMode: RenderMode.Prerender },
  { path: 'developers/storefront', renderMode: RenderMode.Prerender },
  { path: 'blog', renderMode: RenderMode.Client },
  { path: 'blog/:slug', renderMode: RenderMode.Client },
  { path: 'tools/daily-shop-cash-up', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'dpa', renderMode: RenderMode.Prerender },
  { path: 'subprocessors', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
