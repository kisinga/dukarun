import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Client },
  { path: 'track/:token', renderMode: RenderMode.Client },
  { path: 'statement/:token', renderMode: RenderMode.Client },
  { path: 'document/:token', renderMode: RenderMode.Client },
  { path: ':slug/products/:productId', renderMode: RenderMode.Client },
  { path: ':slug', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
