import { RenderMode, ServerRoute } from '@angular/ssr';
import { environment } from '../environments/environment';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  { path: 'docs', renderMode: RenderMode.Prerender },
  { path: 'blog', renderMode: RenderMode.Prerender },
  {
    path: 'blog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      if (environment.publicDataMode === 'live') {
        const response = await fetch(`${environment.supabaseUrl}/rest/v1/rpc/public_blog_sitemap`, {
          method: 'POST',
          headers: { apikey: environment.supabaseAnonKey, 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!response.ok) throw new Error(`Blog prerender query failed: ${response.status}`);
        const posts = (await response.json()) as { slug: string }[];
        return posts.map(post => ({ slug: post.slug }));
      }
      return [{ slug: 'keep-stock-and-cash-in-step' }];
    },
  },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'dpa', renderMode: RenderMode.Prerender },
  { path: 'subprocessors', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
