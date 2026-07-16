import { graphql } from '../../shared/graphql/generated';

export const SET_ORDER_LINE_CUSTOM_PRICE = graphql(`
  mutation SetOrderLineCustomPrice($input: SetOrderLineCustomPriceInput!) {
    setOrderLineCustomPrice(input: $input) {
      ... on OrderLine {
        id
        quantity
        linePrice
        linePriceWithTax
        customFields {
          customLinePrice
          priceOverrideReason
        }
        productVariant {
          id
          name
          price
        }
      }
      ... on Error {
        errorCode
        message
      }
    }
  }
`);

