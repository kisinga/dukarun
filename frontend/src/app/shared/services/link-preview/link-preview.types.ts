import type { Type } from '@angular/core';

/** Unified payload for preview card (line1 = title/name, line2/3 = detail, optional badge e.g. order state). */
export interface LinkPreviewData {
  line1: string;
  line2?: string | null;
  line3?: string | null;
  badge?: string | null;
}

/** Result from cache when provider returns customer data; stale = transaction fields may be outdated. */
export interface CachedPreviewResult {
  data: LinkPreviewData;
  stale?: boolean;
}

/**
 * Contract for entity preview components used in hover previews.
 * Each page/feature can provide a component that accepts entityId and optionally entityKey,
 * loads its own data, and renders a compact summary.
 */
export interface EntityPreviewComponent {
  /** Entity id (e.g. customer id, order id). Required input. */
  entityId: string;
  /** Entity key (e.g. 'customer', 'order') for context. Optional. */
  entityKey?: string;
}

/**
 * Result of parsing a dashboard detail URL into a preview key and entity id.
 */
export interface PreviewRouteMatch {
  key: string;
  id: string;
}

/**
 * Lazy loader for a preview component (dynamic import).
 */
export type PreviewComponentLoader = () => Promise<Type<unknown>>;
