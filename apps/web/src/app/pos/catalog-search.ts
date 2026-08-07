/** Fields that identify a sellable catalog row to a user. */
export interface CatalogSearchFields {
  product_name?: string | null;
  variant_name?: string | null;
  manufacturer_name?: string | null;
  sku?: string | null;
  barcode?: string | null;
}

/**
 * Matches every query token across all catalog identity fields.
 *
 * This lets a query such as "milk brookside" match when "milk" is the
 * product name and "brookside" is the manufacturer.
 */
export function matchesCatalogQuery(item: CatalogSearchFields, query: string): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const searchableText = normalize(
    [item.product_name, item.variant_name, item.manufacturer_name, item.sku, item.barcode]
      .filter((value): value is string => !!value)
      .join(' ')
  );

  return tokens.every(token => searchableText.includes(token));
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}
