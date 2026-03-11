import { Injectable } from '@angular/core';
import type { PreviewComponentLoader, PreviewRouteMatch } from './link-preview.types';

/**
 * Path patterns for dashboard detail routes. First match wins.
 * Order: more specific first (e.g. statement before customers/:id).
 */
const PREVIEW_PATH_PATTERNS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^\/?dashboard\/customers\/([^/]+)\/statement\/?$/, key: 'customer' },
  { pattern: /^\/?dashboard\/customers\/([^/]+)\/?$/, key: 'customer' },
  { pattern: /^\/?dashboard\/suppliers\/([^/]+)\/?$/, key: 'supplier' },
  { pattern: /^\/?dashboard\/orders\/([^/]+)\/?$/, key: 'order' },
  { pattern: /^\/?dashboard\/products\/([^/]+)\/?$/, key: 'product' },
  { pattern: /^\/?dashboard\/payments\/([^/]+)\/?$/, key: 'payment' },
];

/**
 * Registry for optional hover previews. Each detail page/feature can register
 * a lazy-loaded preview component under a key. The host resolves key + id and
 * loads the component.
 */
@Injectable({
  providedIn: 'root',
})
export class LinkPreviewRegistryService {
  private readonly loaders = new Map<string, PreviewComponentLoader>();

  /**
   * Register a preview component loader for an entity key.
   * Key is used when resolving from URL (e.g. 'customer', 'order') or when
   * the host is given explicit previewKey + entityId.
   */
  register(key: string, loader: PreviewComponentLoader): void {
    this.loaders.set(key, loader);
  }

  /**
   * Get the loader for a key, if registered.
   */
  getLoader(key: string): PreviewComponentLoader | undefined {
    return this.loaders.get(key);
  }

  /**
   * Check if a key has a registered preview.
   */
  has(key: string): boolean {
    return this.loaders.has(key);
  }

  /**
   * Parse a path (e.g. /dashboard/customers/123) into preview key and entity id.
   * Path can be full pathname or pathname + search (hash is ignored for matching).
   */
  parsePath(path: string): PreviewRouteMatch | null {
    const pathname = path.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
    for (const { pattern, key } of PREVIEW_PATH_PATTERNS) {
      const match = pathname.match(pattern);
      if (match?.[1]) {
        return { key, id: match[1] };
      }
    }
    return null;
  }

  /**
   * Resolve key and id from path; return loader if registered.
   */
  getLoaderForPath(
    path: string,
  ): { key: string; id: string; loader: PreviewComponentLoader } | null {
    const match = this.parsePath(path);
    if (!match) return null;
    const loader = this.getLoader(match.key);
    if (!loader) return null;
    return { key: match.key, id: match.id, loader };
  }
}
