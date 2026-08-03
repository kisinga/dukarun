import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { gql } from 'graphql-tag';

import { StorefrontService } from './storefront.service';
import { SubscriptionAccess } from '../subscriptions/subscription-access.decorator';

/**
 * Public shop-api schema for resolving a merchant storefront by its subdomain slug.
 *
 * `logo` is the core `Asset` type, so the AssetServerPlugin's field resolver turns `preview`/
 * `source` into absolute URLs for free — the storefront just queries `logo { preview }`.
 */
export const STOREFRONT_PUBLIC_SCHEMA = gql`
  type PublicStorefront {
    channelToken: String!
    name: String!
    slug: String!
    logo: Asset
    whatsappNumber: String
    catalogueVisible: Boolean!
  }

  extend type Query {
    """
    Resolve a public storefront by its subdomain slug. Public, no auth. Returns null if the
    store does not exist, has not opted in, or the channel is not APPROVED. When the channel's
    subscription has lapsed, identity is still returned but catalogueVisible is false.
    """
    storefront(slug: String!): PublicStorefront

    """
    List all browsable public storefronts (opted-in + APPROVED + active subscription). Powers the
    discovery/directory page. Public, no auth.
    """
    publicStorefronts: [PublicStorefront!]!
  }
`;

@Resolver()
export class StorefrontPublicResolver {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Query()
  @Allow(Permission.Public)
  @SubscriptionAccess('public')
  async storefront(@Ctx() ctx: RequestContext, @Args('slug') slug: string) {
    const result = await this.storefrontService.resolveStorefront(ctx, slug);
    return result ? this.toPublic(result) : null;
  }

  @Query()
  @Allow(Permission.Public)
  @SubscriptionAccess('public')
  async publicStorefronts(@Ctx() ctx: RequestContext) {
    const list = await this.storefrontService.listStorefronts(ctx);
    return list.map(r => this.toPublic(r));
  }

  private toPublic(result: {
    channelToken: string;
    name: string;
    slug: string;
    logo: unknown;
    whatsappNumber: string | null;
    catalogueVisible: boolean;
  }) {
    return {
      channelToken: result.channelToken,
      name: result.name,
      slug: result.slug,
      logo: result.logo,
      whatsappNumber: result.whatsappNumber,
      catalogueVisible: result.catalogueVisible,
    };
  }
}
