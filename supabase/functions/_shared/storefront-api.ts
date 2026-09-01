import { storageObjectUrl } from './public-content-renderer.ts';

export const STOREFRONT_API_CURRENCY = 'KES' as const;

export const STOREFRONT_API_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type, X-Request-Id',
  'Access-Control-Expose-Headers': 'X-Request-Id',
  'Access-Control-Max-Age': '86400',
} as const;

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30',
  'CDN-Cache-Control': 'public, max-age=120, stale-while-revalidate=600, stale-if-error=600',
} as const;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
} as const;

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StorefrontApiRoute =
  { kind: 'catalog'; slug: string } | { kind: 'product'; slug: string; productId: string };

export interface StorefrontListOptions {
  limit: number;
  offset: number;
  search?: string;
  categoryId?: string;
}

export interface StorefrontRpc {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  public_whatsapp_number: string | null;
  catalogue_visible: boolean;
}

export interface CategoryRpc {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface CatalogProductRpc {
  product_id: string;
  product_name: string;
  image_path: string | null;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  min_price: number;
  max_price: number;
  variant_count: number;
  available: boolean;
}

export interface StorefrontPageRpc {
  storefront: StorefrontRpc | null;
  categories?: CategoryRpc[] | null;
  rows?: CatalogProductRpc[] | null;
  offset?: number;
  hasMore?: boolean;
}

export interface ProductVariantRpc {
  product_id: string;
  product_name: string;
  image_path: string | null;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  variant_id: string;
  variant_name: string;
  kind: 'good' | 'service';
  sku: string;
  price: number;
  available: boolean;
}

export function storefrontApiResponse(
  request: Request,
  requestId: string,
  body: unknown,
  status = 200,
  cacheable = true
): Response {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers: {
      ...STOREFRONT_API_CORS_HEADERS,
      ...(status === 200 && cacheable ? CACHE_HEADERS : NO_STORE_HEADERS),
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      Allow: 'GET, HEAD, OPTIONS',
    },
  });
}

export function storefrontApiError(
  request: Request,
  requestId: string,
  status: number,
  code: string,
  message: string
): Response {
  return storefrontApiResponse(
    request,
    requestId,
    { error: { code, message, request_id: requestId } },
    status
  );
}

export function storefrontApiOptionsResponse(requestId: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...STOREFRONT_API_CORS_HEADERS,
      ...NO_STORE_HEADERS,
      'X-Request-Id': requestId,
      Allow: 'GET, HEAD, OPTIONS',
    },
  });
}

export function parseStorefrontApiRoute(requestUri: string): StorefrontApiRoute | null {
  let pathname: string;
  try {
    pathname = new URL(requestUri, 'https://storefront-api.invalid').pathname;
  } catch {
    return null;
  }
  const product = new RegExp(`^/api/v1/storefronts/(${SLUG})/products/([^/]+)/?$`, 'i').exec(
    pathname
  );
  if (product) {
    return {
      kind: 'product',
      slug: product[1].toLowerCase(),
      productId: product[2].toLowerCase(),
    };
  }
  const catalog = new RegExp(`^/api/v1/storefronts/(${SLUG})/?$`, 'i').exec(pathname);
  return catalog ? { kind: 'catalog', slug: catalog[1].toLowerCase() } : null;
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function parseStorefrontListOptions(
  requestUri: string
): { ok: true; value: StorefrontListOptions } | { ok: false } {
  let url: URL;
  try {
    url = new URL(requestUri, 'https://storefront-api.invalid');
  } catch {
    return { ok: false };
  }
  const rawLimit = url.searchParams.get('limit');
  const rawOffset = url.searchParams.get('offset');
  const limit = rawLimit === null ? 12 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  const search = url.searchParams.get('search')?.trim() || undefined;
  const categoryId = url.searchParams.get('category')?.trim() || undefined;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 48 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    (search?.length ?? 0) > 120 ||
    (categoryId !== undefined && !isUuid(categoryId))
  ) {
    return { ok: false };
  }
  return { ok: true, value: { limit, offset, search, categoryId } };
}

function manufacturer(id: string | null, name: string | null) {
  return id && name ? { id, name } : null;
}

export function publicStorefront(storefront: StorefrontRpc, storageOrigin: string) {
  return {
    id: storefront.id,
    name: storefront.name,
    slug: storefront.slug,
    logo_url: storageObjectUrl(storageOrigin, 'company-logos', storefront.logo_path),
    whatsapp_number: storefront.public_whatsapp_number,
    catalogue_visible: storefront.catalogue_visible,
    currency_code: STOREFRONT_API_CURRENCY,
  };
}

export function publicCategory(category: CategoryRpc) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
  };
}

export function publicCatalogProduct(product: CatalogProductRpc, storageOrigin: string) {
  return {
    id: product.product_id,
    name: product.product_name,
    image_url: storageObjectUrl(storageOrigin, 'product-images', product.image_path),
    manufacturer: manufacturer(product.manufacturer_id, product.manufacturer_name),
    price: {
      currency: STOREFRONT_API_CURRENCY,
      min: Number(product.min_price),
      max: Number(product.max_price),
    },
    variant_count: Number(product.variant_count),
    available: product.available === true,
  };
}

export function publicCatalogPage(
  page: StorefrontPageRpc,
  options: StorefrontListOptions,
  storageOrigin: string
) {
  if (!page.storefront) return null;
  return {
    data: {
      storefront: publicStorefront(page.storefront, storageOrigin),
      categories: (page.categories ?? []).map(publicCategory),
      products: (page.rows ?? []).map(product => publicCatalogProduct(product, storageOrigin)),
    },
    pagination: {
      limit: options.limit,
      offset: Number(page.offset ?? options.offset),
      has_more: page.hasMore === true,
    },
  };
}

export function publicProduct(rows: ProductVariantRpc[], storageOrigin: string) {
  const first = rows[0];
  if (!first) return null;
  return {
    data: {
      product: {
        id: first.product_id,
        name: first.product_name,
        image_url: storageObjectUrl(storageOrigin, 'product-images', first.image_path),
        manufacturer: manufacturer(first.manufacturer_id, first.manufacturer_name),
        variants: rows.map(row => ({
          id: row.variant_id,
          name: row.variant_name,
          kind: row.kind === 'good' ? 'stock' : 'service',
          sku: row.sku,
          price: { currency: STOREFRONT_API_CURRENCY, amount: Number(row.price) },
          available: row.available === true,
        })),
      },
    },
  };
}
