/**
 * Shared types and constants for product facets (manufacturer, category, tags).
 * Single source of truth for facet codes and display names.
 */

export interface FacetValueSummary {
  id: string;
  name: string;
  code: string;
}

export const FACET_CODE_MANUFACTURER = 'manufacturer';
export const FACET_CODE_CATEGORY = 'category';
export const FACET_CODE_TAGS = 'tags';

export const FACET_CODES = [FACET_CODE_MANUFACTURER, FACET_CODE_CATEGORY, FACET_CODE_TAGS] as const;

export type FacetCode = (typeof FACET_CODES)[number];

export const FACET_DISPLAY_NAMES: Record<FacetCode, string> = {
  [FACET_CODE_MANUFACTURER]: 'Manufacturer',
  [FACET_CODE_CATEGORY]: 'Category',
  [FACET_CODE_TAGS]: 'Tags',
};
