import { graphql } from '../../shared/graphql/generated';

export const SEARCH_PRODUCTS = graphql(`
  query SearchProducts($term: String!) {
    products(options: { filter: { name: { contains: $term } }, take: 5 }) {
      items {
        id
        name
        featuredAsset {
          preview
        }
        facetValues {
          id
          name
          facet {
            code
          }
        }
        variants {
          id
          name
          sku
          price
          priceWithTax
          stockOnHand
          trackInventory
          customFields {
            wholesalePrice
            allowFractionalQuantity
          }
          prices {
            price
            currencyCode
          }
        }
      }
    }
  }
`);

export const GET_PRODUCT = graphql(`
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      name
      customFields {
        barcode
        mlEmbedding
        mlEmbeddingVersion
      }
      featuredAsset {
        preview
      }
      facetValues {
        id
        name
        facet {
          code
        }
      }
      variants {
        id
        name
        sku
        price
        priceWithTax
        stockOnHand
        trackInventory
        prices {
          price
          currencyCode
        }
        customFields {
          wholesalePrice
          allowFractionalQuantity
        }
      }
    }
  }
`);

export const GET_VARIANT_STOCK_LEVEL = graphql(`
  query GetVariantStockLevel($variantId: ID!) {
    productVariant(id: $variantId) {
      id
      name
      sku
      stockOnHand
    }
  }
`);

export const SEARCH_BY_BARCODE = graphql(`
  query SearchByBarcode($barcode: String!) {
    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {
      items {
        id
        name
        customFields {
          barcode
        }
        featuredAsset {
          preview
        }
        facetValues {
          id
          name
          facet {
            code
          }
        }
        variants {
          id
          name
          sku
          priceWithTax
          stockOnHand
          trackInventory
          customFields {
            wholesalePrice
            allowFractionalQuantity
          }
        }
      }
    }
  }
`);

export const PREFETCH_PRODUCTS = graphql(`
  query PrefetchProducts($take: Int!, $skip: Int) {
    products(options: { take: $take, skip: $skip }) {
      totalItems
      items {
        id
        name
        enabled
        customFields {
          barcode
          mlEmbedding
          mlEmbeddingVersion
        }
        featuredAsset {
          preview
        }
        facetValues {
          id
          name
          facet {
            code
          }
        }
        variants {
          id
          name
          sku
          price
          priceWithTax
          stockOnHand
          customFields {
            wholesalePrice
            allowFractionalQuantity
          }
          prices {
            price
            currencyCode
          }
        }
      }
    }
  }
`);

