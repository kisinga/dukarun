import { graphql } from '../../core/graphql/generated';

/**
 * Shop-API operations for products.
 */

export const SEARCH_PRODUCTS = graphql(`
  query SearchProducts($input: SearchInput!) {
    search(input: $input) {
      totalItems
      items {
        productId
        productName
        slug
        description
        productAsset {
          id
          preview
        }
        priceWithTax {
          ... on PriceRange {
            min
            max
          }
          ... on SinglePrice {
            value
          }
        }
        currencyCode
        inStock
        facetValueIds
      }
      facetValues {
        count
        facetValue {
          id
          name
          facet {
            id
            name
            code
          }
        }
      }
    }
  }
`);

export const PRODUCT_DETAIL = graphql(`
  query ProductDetail($slug: String!) {
    product(slug: $slug) {
      id
      name
      slug
      description
      featuredAsset {
        id
        preview
      }
      assets {
        id
        preview
      }
      facetValues {
        id
        name
        facet {
          id
          code
          name
        }
      }
      variants {
        id
        name
        sku
        priceWithTax
        currencyCode
        stockLevel
      }
    }
  }
`);
