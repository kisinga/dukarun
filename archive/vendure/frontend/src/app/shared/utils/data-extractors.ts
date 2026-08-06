/**
 * Shared data extractors for API-to-domain transformation.
 * Pure functions reused across domain mappers (Product, Customer, Order).
 */

/**
 * Extract cents from Vendure Money object or direct number.
 * Handles { value: number } or raw number.
 */
export function extractCents(money: unknown): number {
  if (money == null) return 0;
  if (typeof money === 'object' && money !== null && 'value' in money) {
    return Number((money as { value: unknown }).value) || 0;
  }
  return Number(money) || 0;
}

/**
 * Extract asset preview object from GraphQL asset.
 * Returns undefined if no preview URL.
 */
export function extractAssetPreview(asset: unknown): { preview: string } | undefined {
  const url =
    asset && typeof asset === 'object' && 'preview' in asset
      ? (asset as { preview: unknown }).preview
      : undefined;
  return typeof url === 'string' ? { preview: url } : undefined;
}

/**
 * Build display name from name parts (e.g. firstName, lastName).
 * Filters empty values and joins with space.
 */
export function extractDisplayName(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').trim();
}
