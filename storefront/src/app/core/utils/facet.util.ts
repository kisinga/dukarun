/** Vendure facet code for the manufacturer facet (matches the dashboard's FACET_CODE_MANUFACTURER). */
export const MANUFACTURER_FACET_CODE = 'manufacturer';

interface AggFacetValue {
  facetValue: { id: string; name: string; facet: { code: string } };
}

/** Map of manufacturer facet-value id -> name, from a search response's aggregated facetValues. */
export function buildManufacturerMap(
  facetValues: readonly AggFacetValue[] | null | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  for (const fv of facetValues ?? []) {
    if (fv.facetValue?.facet?.code === MANUFACTURER_FACET_CODE) {
      map.set(fv.facetValue.id, fv.facetValue.name);
    }
  }
  return map;
}

/** First manufacturer name among a search item's facet-value ids, or null. */
export function manufacturerOf(
  facetValueIds: readonly string[] | null | undefined,
  map: Map<string, string>
): string | null {
  for (const id of facetValueIds ?? []) {
    const name = map.get(id);
    if (name) return name;
  }
  return null;
}

/** Manufacturer name from a product's facetValues (detail query), or null. */
export function manufacturerFromFacets(
  facetValues: readonly { name: string; facet: { code: string } }[] | null | undefined
): string | null {
  return (facetValues ?? []).find(f => f.facet?.code === MANUFACTURER_FACET_CODE)?.name ?? null;
}
