import { CatalogPageRow, CatalogRow } from './storefront.service';

export interface CatalogProduct {
  id: string;
  name: string;
  manufacturer: string | null;
  imagePath: string | null;
  variants: CatalogRow[];
  variantCount: number;
  minPrice: number;
  maxPrice: number;
  available: boolean;
}

export function groupCatalog(rows: CatalogRow[]): CatalogProduct[] {
  const products = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    if (!row.product_id || !row.product_name) continue;
    const variants = products.get(row.product_id) ?? [];
    variants.push(row);
    products.set(row.product_id, variants);
  }

  return [...products.entries()]
    .map(([id, variants]) => {
      const first = variants[0];
      const prices = variants.map(variant => Number(variant.price));
      return {
        id,
        name: first.product_name ?? '',
        manufacturer: first.manufacturer_name,
        imagePath: first.image_path,
        variants,
        variantCount: variants.length,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        available: variants.some(isVariantAvailable),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function catalogProductsFromPage(rows: readonly CatalogPageRow[]): CatalogProduct[] {
  return rows.map(row => ({
    id: row.product_id,
    name: row.product_name,
    manufacturer: row.manufacturer_name,
    imagePath: row.image_path,
    variants: [],
    variantCount: Number(row.variant_count),
    minPrice: Number(row.min_price),
    maxPrice: Number(row.max_price),
    available: row.available,
  }));
}

export function isVariantAvailable(variant: CatalogRow): boolean {
  return variant.available;
}

export function catalogLabel(variant: CatalogRow): string {
  if (!variant.variant_name || variant.variant_name === 'Default') {
    return variant.product_name ?? '';
  }
  return `${variant.product_name ?? ''} · ${variant.variant_name}`;
}
