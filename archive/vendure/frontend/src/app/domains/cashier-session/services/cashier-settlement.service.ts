import { Injectable, inject } from '@angular/core';
import { ApolloService } from '../../../shared/services/apollo.service';
import { PENDING_CASHIER_ORDERS, SETTLE_ORDER_PAYMENTS } from '@dukarun/credit';
import type {
  PendingCashierOrdersQuery,
  SettleOrderPaymentsMutation,
  OrderTenderInput as GeneratedOrderTenderInput,
} from '../../../shared/graphql/generated/graphql';

/** One order awaiting collection at the cashier, with its ledger-derived amount owing. */
export type CashierPendingOrderView = PendingCashierOrdersQuery['pendingCashierOrders'][number];

/** One tender in a (possibly split) settlement. */
export type OrderTenderInput = GeneratedOrderTenderInput;

export type SettleOrderPaymentsResultView = SettleOrderPaymentsMutation['settleOrderPayments'];

/**
 * Cashier Settlement Service
 *
 * Reads the cashier settlement queue (orders parked for payment) and settles a single
 * order with one or more tenders (split payment). All amounts are in cents.
 */
@Injectable({ providedIn: 'root' })
export class CashierSettlementService {
  private readonly apolloService = inject(ApolloService);

  /** Orders parked at the cashier and still owing (oldest first). */
  async getPendingOrders(): Promise<CashierPendingOrderView[]> {
    const client = this.apolloService.getClient();
    const result = await client.query({
      query: PENDING_CASHIER_ORDERS,
      fetchPolicy: 'network-only',
    });
    if (result.error) {
      throw new Error(result.error.message ?? 'Failed to load cashier queue');
    }
    return result.data?.pendingCashierOrders ?? [];
  }

  /** Settle one order with one or more tenders (atomic on the backend). */
  async settleOrder(
    orderId: string,
    tenders: OrderTenderInput[],
  ): Promise<SettleOrderPaymentsResultView> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: SETTLE_ORDER_PAYMENTS,
      variables: { input: { orderId, tenders } },
    });
    if (result.error) {
      throw new Error(result.error.message ?? 'Failed to settle order');
    }
    const data = result.data?.settleOrderPayments;
    if (!data) {
      throw new Error('Failed to settle order — no data returned');
    }
    return data;
  }
}
