/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Storefront($slug: String!) {\n    storefront(slug: $slug) {\n      channelToken\n      name\n      slug\n      whatsappNumber\n      catalogueVisible\n      logo {\n        id\n        preview\n      }\n    }\n  }\n": typeof types.StorefrontDocument,
    "\n  query PublicStorefronts {\n    publicStorefronts {\n      name\n      slug\n      logo {\n        id\n        preview\n      }\n    }\n  }\n": typeof types.PublicStorefrontsDocument,
    "\n  query SearchProducts($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          id\n          preview\n        }\n        priceWithTax {\n          ... on PriceRange {\n            min\n            max\n          }\n          ... on SinglePrice {\n            value\n          }\n        }\n        currencyCode\n        inStock\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n": typeof types.SearchProductsDocument,
    "\n  query ProductDetail($slug: String!) {\n    product(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n      assets {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        priceWithTax\n        currencyCode\n        stockLevel\n      }\n    }\n  }\n": typeof types.ProductDetailDocument,
    "\n  query CollectionDetail($slug: String!) {\n    collection(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n": typeof types.CollectionDetailDocument,
    "\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        featuredAsset {\n          id\n          preview\n        }\n      }\n    }\n  }\n": typeof types.CollectionsDocument,
};
const documents: Documents = {
    "\n  query Storefront($slug: String!) {\n    storefront(slug: $slug) {\n      channelToken\n      name\n      slug\n      whatsappNumber\n      catalogueVisible\n      logo {\n        id\n        preview\n      }\n    }\n  }\n": types.StorefrontDocument,
    "\n  query PublicStorefronts {\n    publicStorefronts {\n      name\n      slug\n      logo {\n        id\n        preview\n      }\n    }\n  }\n": types.PublicStorefrontsDocument,
    "\n  query SearchProducts($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          id\n          preview\n        }\n        priceWithTax {\n          ... on PriceRange {\n            min\n            max\n          }\n          ... on SinglePrice {\n            value\n          }\n        }\n        currencyCode\n        inStock\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n": types.SearchProductsDocument,
    "\n  query ProductDetail($slug: String!) {\n    product(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n      assets {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        priceWithTax\n        currencyCode\n        stockLevel\n      }\n    }\n  }\n": types.ProductDetailDocument,
    "\n  query CollectionDetail($slug: String!) {\n    collection(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n": types.CollectionDetailDocument,
    "\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        featuredAsset {\n          id\n          preview\n        }\n      }\n    }\n  }\n": types.CollectionsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Storefront($slug: String!) {\n    storefront(slug: $slug) {\n      channelToken\n      name\n      slug\n      whatsappNumber\n      catalogueVisible\n      logo {\n        id\n        preview\n      }\n    }\n  }\n"): (typeof documents)["\n  query Storefront($slug: String!) {\n    storefront(slug: $slug) {\n      channelToken\n      name\n      slug\n      whatsappNumber\n      catalogueVisible\n      logo {\n        id\n        preview\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PublicStorefronts {\n    publicStorefronts {\n      name\n      slug\n      logo {\n        id\n        preview\n      }\n    }\n  }\n"): (typeof documents)["\n  query PublicStorefronts {\n    publicStorefronts {\n      name\n      slug\n      logo {\n        id\n        preview\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchProducts($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          id\n          preview\n        }\n        priceWithTax {\n          ... on PriceRange {\n            min\n            max\n          }\n          ... on SinglePrice {\n            value\n          }\n        }\n        currencyCode\n        inStock\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query SearchProducts($input: SearchInput!) {\n    search(input: $input) {\n      totalItems\n      items {\n        productId\n        productName\n        slug\n        description\n        productAsset {\n          id\n          preview\n        }\n        priceWithTax {\n          ... on PriceRange {\n            min\n            max\n          }\n          ... on SinglePrice {\n            value\n          }\n        }\n        currencyCode\n        inStock\n      }\n      facetValues {\n        count\n        facetValue {\n          id\n          name\n          facet {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ProductDetail($slug: String!) {\n    product(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n      assets {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        priceWithTax\n        currencyCode\n        stockLevel\n      }\n    }\n  }\n"): (typeof documents)["\n  query ProductDetail($slug: String!) {\n    product(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n      assets {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        priceWithTax\n        currencyCode\n        stockLevel\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CollectionDetail($slug: String!) {\n    collection(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n"): (typeof documents)["\n  query CollectionDetail($slug: String!) {\n    collection(slug: $slug) {\n      id\n      name\n      slug\n      description\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        featuredAsset {\n          id\n          preview\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Collections($options: CollectionListOptions) {\n    collections(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        featuredAsset {\n          id\n          preview\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;