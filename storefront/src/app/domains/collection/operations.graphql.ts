import { graphql } from '../../core/graphql/generated';

/**
 * Shop-API operations for collections.
 */

export const COLLECTION_DETAIL = graphql(`
  query CollectionDetail($slug: String!) {
    collection(slug: $slug) {
      id
      name
      slug
      description
      featuredAsset {
        id
        preview
      }
    }
  }
`);

export const COLLECTIONS = graphql(`
  query Collections($options: CollectionListOptions) {
    collections(options: $options) {
      totalItems
      items {
        id
        name
        slug
        featuredAsset {
          id
          preview
        }
      }
    }
  }
`);
