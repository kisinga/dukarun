import { graphql } from '../../core/graphql/generated';

/**
 * Order reconciliation operations for the super-admin app.
 */

export const DIVERGENT_ORDERS = graphql(`
  query DivergentOrders($toleranceCents: Int) {
    divergentOrders(toleranceCents: $toleranceCents) {
      items {
        orderId
        orderCode
        customerId
        orderModelOwing
        ledgerOwing
        difference
        orderTotal
      }
      totalItems
    }
  }
`);

export const RECONCILE_ORDER = graphql(`
  mutation ReconcileOrder($input: ReconcileOrderInput!) {
    reconcileOrder(input: $input) {
      orderId
      success
      message
    }
  }
`);
