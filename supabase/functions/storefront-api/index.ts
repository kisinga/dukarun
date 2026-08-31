import { createClient } from 'npm:@supabase/supabase-js@2';
import type { ProductVariantRpc, StorefrontPageRpc } from '../_shared/storefront-api.ts';
import {
  isUuid,
  parseStorefrontApiRoute,
  parseStorefrontListOptions,
  publicCatalogPage,
  publicProduct,
  storefrontApiError,
  storefrontApiOptionsResponse,
  storefrontApiResponse,
} from '../_shared/storefront-api.ts';

const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const db =
  supabaseUrl && anonKey
    ? createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

function originalUri(request: Request): string {
  const forwarded = request.headers.get('X-Original-URI');
  if (forwarded) return forwarded;
  const url = new URL(request.url);
  return `${url.pathname.replace(/^\/functions\/v1\/storefront-api/, '')}${url.search}`;
}

function storageOrigin(request: Request): string {
  const candidate =
    request.headers.get('X-Public-Storage-Origin') ??
    Deno.env.get('SUPABASE_PUBLIC_URL') ??
    supabaseUrl;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : supabaseUrl;
  } catch {
    return supabaseUrl;
  }
}

Deno.serve(async request => {
  const requestId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return storefrontApiOptionsResponse(requestId);
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return storefrontApiError(request, requestId, 405, 'method_not_allowed', 'Use GET or HEAD.');
  }
  if (!db) {
    return storefrontApiError(
      request,
      requestId,
      503,
      'temporarily_unavailable',
      'The storefront API is temporarily unavailable.'
    );
  }

  const requestUri = originalUri(request);
  const route = parseStorefrontApiRoute(requestUri);
  if (!route) {
    return storefrontApiError(
      request,
      requestId,
      404,
      'not_found',
      'The requested resource was not found.'
    );
  }

  try {
    if (route.kind === 'catalog') {
      const parsed = parseStorefrontListOptions(requestUri);
      if (!parsed.ok) {
        return storefrontApiError(
          request,
          requestId,
          400,
          'invalid_request',
          'One or more query parameters are invalid.'
        );
      }
      const options = parsed.value;
      const { data, error } = await db.rpc('storefront_page', {
        p_slug: route.slug,
        p_limit: options.limit,
        p_offset: options.offset,
        ...(options.search ? { p_search: options.search } : {}),
        ...(options.categoryId ? { p_category_id: options.categoryId } : {}),
      });
      if (error) throw error;
      const response = publicCatalogPage(
        (data ?? { storefront: null }) as unknown as StorefrontPageRpc,
        options,
        storageOrigin(request)
      );
      if (!response) {
        return storefrontApiError(
          request,
          requestId,
          404,
          'storefront_not_found',
          'Storefront not found.'
        );
      }
      return storefrontApiResponse(request, requestId, response, 200, !options.search);
    }

    if (!isUuid(route.productId)) {
      return storefrontApiError(
        request,
        requestId,
        400,
        'invalid_request',
        'The product ID is invalid.'
      );
    }
    const { data, error } = await db.rpc('storefront_product', {
      p_slug: route.slug,
      p_product_id: route.productId,
    });
    if (error) throw error;
    const response = publicProduct(
      (data ?? []) as unknown as ProductVariantRpc[],
      storageOrigin(request)
    );
    return response
      ? storefrontApiResponse(request, requestId, response)
      : storefrontApiError(request, requestId, 404, 'product_not_found', 'Product not found.');
  } catch (error) {
    console.error('storefront API failed', requestId, route.kind, route.slug, error);
    return storefrontApiError(
      request,
      requestId,
      503,
      'temporarily_unavailable',
      'The storefront API is temporarily unavailable.'
    );
  }
});
