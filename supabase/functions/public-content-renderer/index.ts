import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  PublicApp,
  PublicBlogPost,
  PublicProductRow,
  PublicStorefront,
  SitemapBlogPost,
  parsePublicContentRoute,
  renderBlogArticle,
  renderBlogIndex,
  renderNotFound,
  renderProduct,
  renderShop,
  renderSiteSitemap,
  renderStorefrontDirectory,
  renderStorefrontSitemap,
  storageObjectUrl,
} from '../_shared/public-content-renderer.ts';

const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const db = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const publicOrigins: Record<PublicApp, string> = {
  site: (Deno.env.get('SITE_PUBLIC_URL') ?? 'https://dukarun.com').replace(/\/+$/, ''),
  storefront: (Deno.env.get('STOREFRONT_PUBLIC_URL') ?? 'https://store.dukarun.com').replace(
    /\/+$/,
    ''
  ),
};
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src 'self' https:; style-src 'unsafe-inline'",
};
const STOREFRONT_API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=30',
  'CDN-Cache-Control': 'public, max-age=120, stale-while-revalidate=600, stale-if-error=600',
  'X-Content-Type-Options': 'nosniff',
};

function response(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...HTML_HEADERS,
      'Content-Type': contentType,
    },
  });
}

function html(body: string, status = 200): Response {
  return response(body, 'text/html; charset=utf-8', status);
}

function storefrontApiResponse(
  request: Request,
  body: unknown,
  status = 200,
  cacheable = true
): Response {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers:
      status === 200 && cacheable
        ? STOREFRONT_API_HEADERS
        : {
            ...STOREFRONT_API_HEADERS,
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
          },
  });
}

function publicRequest(request: Request): {
  app: PublicApp;
  origin: string;
  storageOrigin: string;
  requestUri: string;
} | null {
  const app = request.headers.get('X-Public-App');
  const requestUri = request.headers.get('X-Original-URI');
  const storageOrigin =
    request.headers.get('X-Public-Storage-Origin') ??
    Deno.env.get('SUPABASE_PUBLIC_URL') ??
    supabaseUrl;
  if ((app !== 'site' && app !== 'storefront') || !requestUri) return null;
  try {
    const parsedOrigin = new URL(publicOrigins[app]);
    const parsedStorageOrigin = new URL(storageOrigin);
    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol) ||
      !['http:', 'https:'].includes(parsedStorageOrigin.protocol)
    )
      return null;
    return {
      app,
      origin: parsedOrigin.origin,
      storageOrigin: parsedStorageOrigin.origin,
      requestUri,
    };
  } catch {
    return null;
  }
}

async function sitemap(app: PublicApp, origin: string): Promise<Response> {
  if (app === 'site') {
    const { data, error } = await db.rpc('public_blog_sitemap');
    if (error) throw error;
    return response(
      renderSiteSitemap(origin, (data ?? []) as unknown as SitemapBlogPost[]),
      'application/xml; charset=utf-8'
    );
  }
  const { data, error } = await db.rpc('public_storefront_sitemap');
  if (error) throw error;
  return response(
    renderStorefrontSitemap(
      origin,
      (data ?? []) as Array<{ slug: string; product_id: string | null; updated_at?: string }>
    ),
    'application/xml; charset=utf-8'
  );
}

Deno.serve(async request => {
  if (!['GET', 'HEAD'].includes(request.method)) return html('Method not allowed', 405);
  const context = publicRequest(request);
  if (!context || !supabaseUrl || !anonKey) return html('Not found', 404);
  const requestUrl = new URL(context.requestUri, context.origin);
  const storefrontApiMatch =
    context.app === 'storefront'
      ? requestUrl.pathname.match(/^\/api\/storefront\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/)
      : null;
  if (storefrontApiMatch) {
    const limit = Number(requestUrl.searchParams.get('limit') ?? '12');
    const offset = Number(requestUrl.searchParams.get('offset') ?? '0');
    const search = requestUrl.searchParams.get('search')?.trim() || undefined;
    const categoryId = requestUrl.searchParams.get('category')?.trim() || undefined;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 48 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10000 ||
      (search?.length ?? 0) > 120 ||
      (categoryId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          categoryId
        ))
    ) {
      return storefrontApiResponse(request, { error: 'invalid_request' }, 400);
    }
    try {
      const { data, error } = await db.rpc('storefront_page', {
        p_slug: storefrontApiMatch[1],
        p_limit: limit,
        p_offset: offset,
        ...(search ? { p_search: search } : {}),
        ...(categoryId ? { p_category_id: categoryId } : {}),
      });
      if (error) throw error;
      // Free-form searches create an unbounded cache key space. Category and
      // browse pages are finite and safe for the shared edge cache.
      return storefrontApiResponse(request, data, 200, !search);
    } catch (error) {
      console.error('storefront API failed', storefrontApiMatch[1], error);
      return storefrontApiResponse(request, { error: 'temporarily_unavailable' }, 503);
    }
  }
  const route = parsePublicContentRoute(context.app, context.requestUri);
  if (!route) return html(renderNotFound(context.origin), 404);

  try {
    if (route.kind === 'sitemap') return await sitemap(context.app, context.origin);
    if (route.kind === 'blog-index') {
      const { data, error } = await db.rpc('public_blog_posts', { p_limit: 50 });
      if (error) throw error;
      return html(renderBlogIndex((data ?? []) as unknown as PublicBlogPost[], context.origin));
    }
    if (route.kind === 'blog-article') {
      const { data, error } = await db.rpc('public_blog_post', { p_slug: route.slug });
      if (error) throw error;
      const post = data as unknown as PublicBlogPost | null;
      if (!post) return html(renderNotFound(context.origin), 404);
      const image =
        storageObjectUrl(context.storageOrigin, 'blog-media', post.cover_image_path) ??
        new URL(
          '/media/video/product-overview/product-overview-full-wide.png',
          `${context.origin}/`
        ).toString();
      return html(renderBlogArticle(post, context.origin, image));
    }
    if (route.kind === 'storefront-directory') {
      const { data, error } = await db
        .from('public_storefronts')
        .select('name,slug,logo_path,catalogue_visible')
        .not('slug', 'is', null)
        .order('name');
      if (error) throw error;
      return html(renderStorefrontDirectory((data ?? []) as PublicStorefront[], context.origin));
    }

    if (route.kind === 'shop') {
      const { data, error } = await db.rpc('storefront_page', {
        p_slug: route.slug,
        p_limit: 48,
        p_offset: 0,
      });
      if (error) throw error;
      const page = data as unknown as {
        storefront: PublicStorefront | null;
        rows: PublicProductRow[];
      } | null;
      const shop = page?.storefront ?? undefined;
      if (!shop) return html(renderNotFound(context.origin), 404);
      const image =
        storageObjectUrl(context.storageOrigin, 'company-logos', shop.logo_path) ??
        new URL(
          '/media/video/product-overview/product-overview-full-wide.png',
          'https://dukarun.com/'
        ).toString();
      return html(renderShop(shop, page?.rows ?? [], context.origin, image));
    }

    const [{ data: shops, error: shopError }, { data: rows, error: productError }] =
      await Promise.all([
        db
          .from('public_storefronts')
          .select('name,slug,logo_path,catalogue_visible')
          .eq('slug', route.slug)
          .limit(1),
        db.rpc('storefront_product', {
          p_slug: route.slug,
          p_product_id: route.productId,
        }),
      ]);
    if (shopError) throw shopError;
    if (productError) throw productError;
    const shop = shops?.[0] as PublicStorefront | undefined;
    const productRows = (rows ?? []) as unknown as PublicProductRow[];
    const product = productRows[0];
    if (!shop?.catalogue_visible || !product) return html(renderNotFound(context.origin), 404);
    const image =
      storageObjectUrl(context.storageOrigin, 'product-images', product.image_path) ??
      storageObjectUrl(context.storageOrigin, 'company-logos', shop.logo_path) ??
      new URL(
        '/media/video/product-overview/product-overview-full-wide.png',
        'https://dukarun.com/'
      ).toString();
    return html(renderProduct(shop, product, context.origin, image));
  } catch (error) {
    console.error('public content render failed', route.kind, error);
    return html('Public content is temporarily unavailable', 503);
  }
});
