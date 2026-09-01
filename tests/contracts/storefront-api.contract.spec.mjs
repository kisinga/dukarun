import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isUuid,
  parseStorefrontApiRoute,
  parseStorefrontListOptions,
  publicCatalogPage,
  publicProduct,
  storefrontApiError,
  storefrontApiOptionsResponse,
  storefrontApiResponse,
} from '../../supabase/functions/_shared/storefront-api.ts';

const storefrontId = '7e520000-0000-4000-8000-000000000001';
const categoryId = '7e520000-0000-4000-8000-000000000002';
const productId = '7e520000-0000-4000-8000-000000000003';
const manufacturerId = '7e520000-0000-4000-8000-000000000004';
const variantId = '7e520000-0000-4000-8000-000000000005';
const storageOrigin = 'https://supa.dukarun.com';

test('v1 routes only the catalogue and product resources', () => {
  assert.deepEqual(parseStorefrontApiRoute('/api/v1/storefronts/example-shop?limit=12'), {
    kind: 'catalog',
    slug: 'example-shop',
  });
  assert.deepEqual(
    parseStorefrontApiRoute(`/api/v1/storefronts/example-shop/products/${productId}`),
    { kind: 'product', slug: 'example-shop', productId }
  );
  assert.equal(parseStorefrontApiRoute('/api/v1/orders'), null);
  assert.equal(parseStorefrontApiRoute('/api/v2/storefronts/example-shop'), null);
  assert.equal(isUuid(productId), true);
  assert.equal(isUuid('not-a-product-id'), false);
});

test('catalogue query limits are explicit and bounded', () => {
  assert.deepEqual(parseStorefrontListOptions('/api/v1/storefronts/example-shop'), {
    ok: true,
    value: { limit: 12, offset: 0, search: undefined, categoryId: undefined },
  });
  assert.deepEqual(
    parseStorefrontListOptions(
      `/api/v1/storefronts/example-shop?limit=48&offset=24&search=tea&category=${categoryId}`
    ),
    {
      ok: true,
      value: { limit: 48, offset: 24, search: 'tea', categoryId },
    }
  );
  for (const request of [
    '/api/v1/storefronts/example-shop?limit=0',
    '/api/v1/storefronts/example-shop?limit=49',
    '/api/v1/storefronts/example-shop?offset=10001',
    '/api/v1/storefronts/example-shop?category=private-id',
    `/api/v1/storefronts/example-shop?search=${'x'.repeat(121)}`,
  ]) {
    assert.deepEqual(parseStorefrontListOptions(request), { ok: false });
  }
});

test('responses provide CORS, cache policy, request IDs, and consistent errors', async () => {
  const requestId = '7e520000-0000-4000-8000-000000000099';
  const request = new Request('https://store.dukarun.com/api/v1/storefronts/example-shop');
  const response = storefrontApiResponse(request, requestId, { data: 'ok' });
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=30');
  assert.equal(response.headers.get('x-request-id'), requestId);

  const search = storefrontApiResponse(request, requestId, { data: 'ok' }, 200, false);
  assert.equal(search.headers.get('cache-control'), 'no-store');

  const error = storefrontApiError(request, requestId, 400, 'invalid_request', 'Invalid.');
  assert.equal(error.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await error.json(), {
    error: { code: 'invalid_request', message: 'Invalid.', request_id: requestId },
  });

  const head = storefrontApiResponse(new Request(request.url, { method: 'HEAD' }), requestId, {
    data: 'not-sent',
  });
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('x-request-id'), requestId);

  const options = storefrontApiOptionsResponse(requestId);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  assert.equal(options.headers.get('x-request-id'), requestId);
});

test('catalogue mapper exposes an allowlisted public shape', () => {
  const response = publicCatalogPage(
    {
      storefront: {
        id: storefrontId,
        name: 'Example Shop',
        slug: 'example-shop',
        logo_path: 'example/logo file.webp',
        public_whatsapp_number: '+254700000000',
        catalogue_visible: true,
      },
      categories: [
        {
          id: categoryId,
          name: 'Groceries',
          slug: 'groceries',
          description: 'Pantry items',
          company_id: 'must-not-leak',
          created_at: 'must-not-leak',
        },
      ],
      rows: [
        {
          product_id: productId,
          product_name: 'Tea Leaves',
          image_path: 'example/tea file.webp',
          manufacturer_id: manufacturerId,
          manufacturer_name: 'Example Foods',
          min_price: 120,
          max_price: 240,
          variant_count: 2,
          available: true,
          barcode: 'must-not-leak',
          wholesale_price: 80,
          exact_stock: 99,
        },
      ],
      offset: 0,
      hasMore: true,
    },
    { limit: 12, offset: 0 },
    storageOrigin
  );

  assert.ok(response);
  assert.deepEqual(Object.keys(response.data.storefront), [
    'id',
    'name',
    'slug',
    'logo_url',
    'whatsapp_number',
    'catalogue_visible',
    'currency_code',
  ]);
  assert.deepEqual(Object.keys(response.data.categories[0]), ['id', 'name', 'slug', 'description']);
  assert.deepEqual(Object.keys(response.data.products[0]), [
    'id',
    'name',
    'image_url',
    'manufacturer',
    'price',
    'variant_count',
    'available',
  ]);
  assert.equal(
    response.data.products[0].image_url,
    `${storageOrigin}/storage/v1/object/public/product-images/example/tea%20file.webp`
  );
  assert.deepEqual(response.data.products[0].price, { currency: 'KES', min: 120, max: 240 });
  assert.deepEqual(response.pagination, { limit: 12, offset: 0, has_more: true });
  assert.doesNotMatch(JSON.stringify(response), /must-not-leak|barcode|wholesale|exact_stock/);
});

test('known hidden catalogues remain identifiable but empty', () => {
  const response = publicCatalogPage(
    {
      storefront: {
        id: storefrontId,
        name: 'Example Shop',
        slug: 'example-shop',
        logo_path: null,
        public_whatsapp_number: null,
        catalogue_visible: false,
      },
      categories: [],
      rows: [],
      hasMore: false,
    },
    { limit: 12, offset: 0 },
    storageOrigin
  );
  assert.equal(response?.data.storefront.catalogue_visible, false);
  assert.deepEqual(response?.data.categories, []);
  assert.deepEqual(response?.data.products, []);
  assert.equal(
    publicCatalogPage({ storefront: null }, { limit: 12, offset: 0 }, storageOrigin),
    null
  );
});

test('product mapper exposes variants without private inventory fields', () => {
  const response = publicProduct(
    [
      {
        product_id: productId,
        product_name: 'Tea Leaves',
        image_path: null,
        manufacturer_id: manufacturerId,
        manufacturer_name: 'Example Foods',
        variant_id: variantId,
        variant_name: '100 g',
        kind: 'good',
        sku: 'TEA-100',
        price: 120,
        available: true,
        total_count: 1,
        exact_stock: 20,
      },
    ],
    storageOrigin
  );
  assert.deepEqual(response?.data.product.variants, [
    {
      id: variantId,
      name: '100 g',
      kind: 'stock',
      sku: 'TEA-100',
      price: { currency: 'KES', amount: 120 },
      available: true,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(response), /exact_stock|total_count/);
  assert.equal(publicProduct([], storageOrigin), null);
});

test('published OpenAPI document matches the two-route v1 surface', async () => {
  const [source, reference, scalarCopy] = await Promise.all([
    readFile('apps/site/public/openapi/storefront-v1.yaml', 'utf8'),
    readFile('apps/site/public/developers/storefront/reference/index.html', 'utf8'),
    readFile('scripts/copy-scalar-reference.mjs', 'utf8'),
  ]);
  const document = JSON.parse(source);
  assert.equal(document.openapi, '3.1.0');
  assert.deepEqual(document.security, []);
  assert.deepEqual(Object.keys(document.paths), [
    '/storefronts/{slug}',
    '/storefronts/{slug}/products/{productId}',
  ]);
  assert.equal(document.components.parameters.Limit.schema.maximum, 48);
  assert.equal(document.components.parameters.Offset.schema.maximum, 10000);
  assert.equal(document.components.schemas.Storefront.properties.currency_code.const, 'KES');
  assert.deepEqual(document.components.schemas.Variant.properties.kind.enum, ['stock', 'service']);
  assert.ok(document.paths['/storefronts/{slug}'].get.responses['429']);
  assert.match(reference, /\/vendor\/scalar\/1\.67\.0\/standalone\.js/);
  assert.doesNotMatch(reference, /cdn\.jsdelivr\.net/);
  assert.match(scalarCopy, /@scalar\/api-reference/);
  assert.match(scalarCopy, /dist\/browser\/standalone\.js/);
  assert.equal(
    document.components.schemas.CatalogueResponse.properties.pagination.properties.total,
    undefined
  );
});

test('proxy and deployment configuration publish v1 without removing the legacy route', async () => {
  const [nginx, deploy, edgeFunction, storefrontClient] = await Promise.all([
    readFile('apps/nginx.conf', 'utf8'),
    readFile('scripts/deploy-db.sh', 'utf8'),
    readFile('supabase/functions/storefront-api/index.ts', 'utf8'),
    readFile('apps/storefront/src/app/storefront.service.ts', 'utf8'),
  ]);
  assert.match(nginx, /location \^~ \/api\/v1\/storefronts\//);
  assert.match(nginx, /\/functions\/v1\/storefront-api\/\$1/);
  assert.match(nginx, /limit_req zone=storefront_api burst=20 nodelay/);
  assert.match(nginx, /limit_req zone=storefront_search burst=5 nodelay/);
  assert.match(nginx, /"code":"rate_limited"/);
  assert.match(nginx, /location \^~ \/api\/storefront\//);
  assert.match(nginx, /proxy_set_header X-Original-URI \$request_uri/);
  assert.match(deploy, /public-content-renderer storefront-api site-deploy/);
  assert.match(edgeFunction, /supabaseUrl && anonKey\s+\? createClient/);
  assert.match(edgeFunction, /if \(!db\)/);
  assert.equal(
    storefrontClient.match(/!environment\.production && request\.status === 404/g)?.length,
    2
  );
});
