import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parsePublicContentRoute,
  renderBlogArticle,
  renderProduct,
  renderSiteSitemap,
  renderStorefrontSitemap,
  storageObjectUrl,
} from '../../supabase/functions/_shared/public-content-renderer.ts';

const origin = 'https://dukarun.com';
const productOrigin = 'https://store.dukarun.com';
const productId = 'ab51ac73-6fe6-4657-99d8-6a6fa7c29e23';

test('routes only supported public content', () => {
  assert.deepEqual(parsePublicContentRoute('site', '/blog/stock-control?utm_source=test'), {
    kind: 'blog-article',
    slug: 'stock-control',
  });
  assert.deepEqual(parsePublicContentRoute('storefront', `/jutik/products/${productId}`), {
    kind: 'product',
    slug: 'jutik',
    productId,
  });
  assert.deepEqual(
    parsePublicContentRoute('storefront', '/tesla/products/7e520000-0000-0000-0000-000000000030'),
    {
      kind: 'product',
      slug: 'tesla',
      productId: '7e520000-0000-0000-0000-000000000030',
    }
  );
  assert.deepEqual(parsePublicContentRoute('site', '/sitemap.xml'), { kind: 'sitemap' });
  assert.deepEqual(parsePublicContentRoute('storefront', '/jutik'), {
    kind: 'shop',
    slug: 'jutik',
  });
  assert.equal(parsePublicContentRoute('storefront', '/statement/private-token'), null);
});

test('product preview includes current image metadata without price', () => {
  const page = renderProduct(
    { name: 'Jutik Electricals', slug: 'jutik', logo_path: null, catalogue_visible: true },
    {
      product_id: productId,
      product_name: 'LED Bulb',
      image_path: 'products/led bulb.webp',
      manufacturer_name: 'Bright & Co',
    },
    productOrigin,
    'https://supa.dukarun.com/storage/v1/object/public/product-images/products/led%20bulb.webp'
  );
  assert.match(page, /property="og:type" content="product"/);
  assert.match(page, /property="og:image" content="https:\/\/supa\.dukarun\.com/);
  assert.match(
    page,
    new RegExp(`rel="canonical" href="${productOrigin}/jutik/products/${productId}"`)
  );
  assert.doesNotMatch(page, /price|KES/i);
  assert.match(page, /Bright &amp; Co/);
});

test('blog renderer emits full safe article HTML and social metadata', () => {
  const page = renderBlogArticle(
    {
      slug: 'stock-control',
      title: 'Stock <control>',
      excerpt: 'Know what is on the shelf.',
      author_name: 'Dukarun team',
      cover_image_path: null,
      cover_image_alt: null,
      seo_title: 'Stock control',
      seo_description: 'A practical guide.',
      published_at: '2026-08-12T06:00:00.000Z',
      updated_at: '2026-08-12T07:00:00.000Z',
      reading_minutes: 3,
      content_markdown: '# Count stock\n\n<script>alert(1)</script>\n\n## Reconcile daily',
    },
    origin,
    `${origin}/cover.webp`
  );
  assert.match(page, /property="og:type" content="article"/);
  assert.match(page, /"@type":"BlogPosting"/);
  assert.match(page, /<h2>Reconcile daily<\/h2>/);
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(page, /<script>alert/);
});

test('dynamic sitemap contains current blog revisions', () => {
  const sitemap = renderSiteSitemap(origin, [
    { slug: 'stock-control', updated_at: '2026-08-12T07:00:00.000Z' },
  ]);
  assert.match(sitemap, /<loc>https:\/\/dukarun\.com\/blog\/stock-control<\/loc>/);
  assert.match(sitemap, /<lastmod>2026-08-12T07:00:00\.000Z<\/lastmod>/);
});

test('storefront sitemap contains current shops and products', () => {
  const sitemap = renderStorefrontSitemap(productOrigin, [
    { slug: 'jutik', product_id: productId, updated_at: '2026-08-12T07:00:00.000Z' },
    { slug: 'empty-shop', product_id: null },
  ]);
  assert.match(sitemap, /<loc>https:\/\/store\.dukarun\.com\/jutik<\/loc>/);
  assert.match(sitemap, new RegExp(`<loc>${productOrigin}/jutik/products/${productId}</loc>`));
  assert.match(sitemap, /<loc>https:\/\/store\.dukarun\.com\/empty-shop<\/loc>/);
});

test('storage paths are encoded by segment', () => {
  assert.equal(
    storageObjectUrl('https://supa.dukarun.com/', 'product-images', 'shop/LED bulb.webp'),
    'https://supa.dukarun.com/storage/v1/object/public/product-images/shop/LED%20bulb.webp'
  );
  assert.equal(
    storageObjectUrl('https://supa.dukarun.com', 'company-logos', 'https://cdn.example/logo.png'),
    'https://cdn.example/logo.png'
  );
});
