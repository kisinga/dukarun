import { graphql } from '../../core/graphql/generated';

/**
 * Shop-API operations for the public storefront.
 */

export const STOREFRONT = graphql(`
  query Storefront($slug: String!) {
    storefront(slug: $slug) {
      channelToken
      name
      slug
      whatsappNumber
      catalogueVisible
      logo {
        id
        preview
      }
    }
  }
`);

export const PUBLIC_STOREFRONTS = graphql(`
  query PublicStorefronts {
    publicStorefronts {
      name
      slug
      logo {
        id
        preview
      }
    }
  }
`);
