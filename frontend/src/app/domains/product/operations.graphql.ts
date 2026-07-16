import { graphql } from '../../shared/graphql/generated';

export const GET_STOCK_LOCATIONS = graphql(`
  query GetStockLocations {
    stockLocations(options: { take: 100 }) {
      items {
        id
        name
        description
      }
    }
  }
`);

export const CHECK_SKU_EXISTS = graphql(`
  query CheckSkuExists($sku: String!) {
    productVariants(options: { filter: { sku: { eq: $sku } }, take: 1 }) {
      items {
        id
        sku
        product {
          id
          name
        }
      }
    }
  }
`);

export const CHECK_BARCODE_EXISTS = graphql(`
  query CheckBarcodeExists($barcode: String!) {
    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {
      items {
        id
        name
        customFields {
          barcode
        }
      }
    }
  }
`);

export const CREATE_PRODUCT = graphql(`
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
      id
      name
      slug
      description
      enabled
      featuredAsset {
        id
        preview
      }
      variants {
        id
        name
        sku
        price
        stockOnHand
        customFields {
          wholesalePrice
          allowFractionalQuantity
        }
      }
    }
  }
`);

export const CREATE_PRODUCT_VARIANTS = graphql(`
  mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {
    createProductVariants(input: $input) {
      id
      name
      sku
      price
      priceWithTax
      stockOnHand
      product {
        id
        name
      }
    }
  }
`);

export const DELETE_PRODUCT_VARIANTS = graphql(`
  mutation DeleteProductVariants($ids: [ID!]!) {
    deleteProductVariants(ids: $ids) {
      result
      message
    }
  }
`);

export const GET_PRODUCT_DETAIL = graphql(`
  query GetProductDetail($id: ID!) {
    product(id: $id) {
      id
      name
      slug
      description
      enabled
      customFields {
        barcode
      }
      facetValues {
        id
        name
        code
        facet {
          id
          code
        }
      }
      assets {
        id
        name
        preview
        source
      }
      featuredAsset {
        id
        preview
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
`);

export const GET_PRODUCTS = graphql(`
  query GetProducts($options: ProductListOptions) {
    products(options: $options) {
      totalItems
      items {
        id
        name
        slug
        description
        enabled
        featuredAsset {
          id
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
          inventoryBatches {
            id
            quantity
            expiryDate
            batchNumber
            consumePriority
          }
        }
      }
    }
  }
`);

export const GET_PRODUCTS_BY_INVENTORY_ALERT = graphql(`
  query GetProductsByInventoryAlert($filter: InventoryAlertFilter!, $options: ProductListOptions) {
    productsByInventoryAlert(filter: $filter, options: $options) {
      totalItems
      items {
        id
        name
        slug
        description
        enabled
        featuredAsset {
          id
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
          inventoryBatches {
            id
            quantity
            expiryDate
            batchNumber
            consumePriority
          }
        }
      }
    }
  }
`);

export const DELETE_PRODUCT = graphql(`
  mutation DeleteProduct($id: ID!) {
    deleteProduct(id: $id) {
      result
      message
    }
  }
`);

export const CREATE_PRODUCT_OPTION_GROUP = graphql(`
  mutation CreateProductOptionGroup($input: CreateProductOptionGroupInput!) {
    createProductOptionGroup(input: $input) {
      id
      code
      name
      options {
        id
        code
        name
      }
    }
  }
`);

export const CREATE_PRODUCT_OPTION = graphql(`
  mutation CreateProductOption($input: CreateProductOptionInput!) {
    createProductOption(input: $input) {
      id
      code
      name
      group {
        id
        name
      }
    }
  }
`);

export const ADD_OPTION_GROUP_TO_PRODUCT = graphql(`
  mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!) {
    addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) {
      id
      name
      optionGroups {
        id
        code
        name
        options {
          id
          code
          name
        }
      }
    }
  }
`);

export const UPDATE_PRODUCT_VARIANT = graphql(`
  mutation UpdateProductVariant($input: UpdateProductVariantInput!) {
    updateProductVariant(input: $input) {
      id
      name
      sku
      price
      priceWithTax
      stockOnHand
      product {
        id
        name
      }
    }
  }
`);

