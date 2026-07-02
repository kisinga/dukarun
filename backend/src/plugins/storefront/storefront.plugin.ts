import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { StorefrontPublicResolver, STOREFRONT_PUBLIC_SCHEMA } from './storefront-public.resolver';
import { StorefrontSitemapController } from './storefront-sitemap.controller';
import { StorefrontService } from './storefront.service';

/**
 * Storefront Plugin
 *
 * Public, read-only surface for per-merchant storefronts (browse-only + WhatsApp enquiry):
 * - shop-api `storefront(slug)` query: resolves a subdomain slug to a channel's public identity
 *   (name, logo, WhatsApp number, channel token) gated on opt-in + APPROVED + active subscription.
 * - REST /robots.txt and /sitemap.xml: host-aware, per-merchant, noindex when lapsed/disabled.
 *
 * Deliberately exposes no mutations and no admin surface.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [StorefrontService],
  controllers: [StorefrontSitemapController],
  shopApiExtensions: {
    schema: STOREFRONT_PUBLIC_SCHEMA,
    resolvers: [StorefrontPublicResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class StorefrontPlugin {}
