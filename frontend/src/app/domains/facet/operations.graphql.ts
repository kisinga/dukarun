import { graphql } from '../../shared/graphql/generated';

export const GET_FACETS_BY_CODES = graphql(`
  query GetFacetsByCodes($codes: [String!]!) {
    facets(options: { filter: { code: { in: $codes } }, take: 10 }) {
      items {
        id
        code
        name
      }
    }
  }
`);

export const GET_FACET_VALUES = graphql(`
  query GetFacetValues($facetId: String!, $term: String) {
    facetValues(
      options: { filter: { facetId: { eq: $facetId }, name: { contains: $term } }, take: 20 }
    ) {
      items {
        id
        name
        code
      }
    }
  }
`);

export const CREATE_FACET = graphql(`
  mutation CreateFacet($input: CreateFacetInput!) {
    createFacet(input: $input) {
      id
      code
      name
    }
  }
`);

export const CREATE_FACET_VALUE = graphql(`
  mutation CreateFacetValue($input: CreateFacetValueInput!) {
    createFacetValue(input: $input) {
      id
      name
      code
    }
  }
`);

