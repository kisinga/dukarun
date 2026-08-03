import { graphql } from './generated';

// ============================================================================
// FRACTIONAL QUANTITY MUTATIONS
// ============================================================================

export const UPDATE_ORDER_LINE_QUANTITY = graphql(`
  mutation UpdateOrderLineQuantity($orderLineId: ID!, $quantity: Float!) {
    updateOrderLineQuantity(orderLineId: $orderLineId, quantity: $quantity) {
      ... on Order {
        id
        lines {
          id
          quantity
          productVariant {
            id
            name
            customFields {
              allowFractionalQuantity
            }
          }
        }
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`);
