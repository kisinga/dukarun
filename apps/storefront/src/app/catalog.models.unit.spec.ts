import { describe, expect, it } from 'vitest';
import { catalogLabel, catalogProductsFromPage, groupCatalog } from './catalog.models';
import type { CatalogPageRow, CatalogRow } from './storefront.service';

describe('catalog model', () => {
  it('groups variants and derives the price range', () => {
    const rows = [
      {
        product_id: 'product-1',
        product_name: 'Cable',
        variant_name: '1 metre',
        manufacturer_name: 'Acme',
        manufacturer_id: 'manufacturer-1',
        image_path: '',
        kind: 'stock',
        price: 100,
        sku: 'CABLE-1',
        total_count: 2,
        variant_id: 'variant-1',
        available: true,
      },
      {
        product_id: 'product-1',
        product_name: 'Cable',
        variant_name: '2 metres',
        manufacturer_name: 'Acme',
        manufacturer_id: 'manufacturer-1',
        image_path: '',
        kind: 'stock',
        price: 180,
        sku: 'CABLE-2',
        total_count: 2,
        variant_id: 'variant-2',
        available: false,
      },
    ] satisfies CatalogRow[];

    expect(groupCatalog(rows)[0]).toMatchObject({
      name: 'Cable',
      minPrice: 100,
      maxPrice: 180,
      available: true,
    });
    expect(catalogLabel(rows[0])).toBe('Cable · 1 metre');
  });

  it('uses bounded product summaries for catalogue pages', () => {
    const rows = [
      {
        product_id: 'product-1',
        product_name: 'Cable',
        manufacturer_name: 'Acme',
        manufacturer_id: 'manufacturer-1',
        image_path: '',
        min_price: 100,
        max_price: 180,
        variant_count: 2,
        available: true,
      },
    ] satisfies CatalogPageRow[];

    expect(catalogProductsFromPage(rows)[0]).toMatchObject({
      name: 'Cable',
      minPrice: 100,
      maxPrice: 180,
      variantCount: 2,
      variants: [],
    });
  });
});
