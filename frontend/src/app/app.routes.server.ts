import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Render strategy per route. The public marketing pages are prerendered to static
 * HTML at build time so search engines and link-preview bots (WhatsApp, Facebook,
 * X) get the full content and per-page meta without running JS. Everything else —
 * auth and the dashboard — stays a client-rendered SPA.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'features', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  { path: 'support', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
