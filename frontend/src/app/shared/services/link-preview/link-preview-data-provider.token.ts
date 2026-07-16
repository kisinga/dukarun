import { InjectionToken } from '@angular/core';
import type { LinkPreviewData } from './link-preview.types';

/** Result from a link-preview cache lookup. */
export interface CachedPreviewPayload {
  data: LinkPreviewData;
  stale?: boolean;
}

/** Domain-agnostic contract for the service that resolves hover-preview data by entity key/id. */
export interface LinkPreviewDataProvider {
  getCachedPreviewData(key: string, id: string): CachedPreviewPayload | null;
}

class NoOpLinkPreviewDataProvider implements LinkPreviewDataProvider {
  getCachedPreviewData(): CachedPreviewPayload | null {
    return null;
  }
}

/**
 * Token bridged in the shell app config to the real implementation.
 * Shared code and pages inject this token instead of importing domain caches.
 */
export const LINK_PREVIEW_DATA_PROVIDER = new InjectionToken<LinkPreviewDataProvider>(
  'LINK_PREVIEW_DATA_PROVIDER',
  {
    providedIn: 'root',
    factory: () => new NoOpLinkPreviewDataProvider(),
  },
);
