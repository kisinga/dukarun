import { Injectable, inject } from '@angular/core';
import { ApolloService } from '../apollo.service';
import { PENDING_CASHIER_ORDERS, SETTLE_ORDER_PAYMENTS } from '../../graphql/operations.graphql';

/** One order awaiting collection at the cashier, with its ledger-derived amount owing. */
export interface CashierPendingOrderView {
  amountOwing: number; // cents
  pendingSince: string | null;
  createdBy?: { id: string; identifier: string } | null;
  order: {
    id: string;
    code: string;
    state: string;
    total: number;
    totalWithTax: number;
    createdAt: string;
    orderPlacedAt?: string | null;
    customer?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      emailAddress?: string | null;
      phoneNumber?: string | null;
    } | null;
    lines: Array<{ id: string; quantity: number; productVariant: { id: string; name: string } }>;
  };
}

/** One tender in a (possibly split) settlement. */
export interface OrderTenderInput {
  paymentMethodCode: string;
  amount: number; // cents
  referenceNumber?: string;
}

export interface SettleOrderPaymentsResultView {
  orderId: string;
  orderCode: string;
  amountSettled: number;
  remainingOwing: number;
  fullySettled: boolean;
  tenders: Array<{ paymentMethodCode: string; amount: number }>;
}

/**
 * Cashier Settlement Service
 *
 * Reads the cashier settlement queue (orders parked for payment) and settles a single
 * order with one or more tenders (split payment). All amounts are in cents.
 */
@Injectable({ providedIn: 'root' })
export class CashierSettlementService {
  private readonly apolloService = inject(ApolloService);

  // The two operations below are new; their generated typings appear only after
  // `npm run codegen` runs against the updated backend schema. Until then the
  // `graphql()` documents are typed `unknown`, so we bridge with a local cast to keep
  // the app compiling. The GraphQL strings are valid either way; codegen just restores
  // full type inference (the casts remain harmless afterwards).

  /** Orders parked at the cashier and still owing (oldest first). */
  async getPendingOrders(): Promise<CashierPendingOrderView[]> {
    const client = this.apolloService.getClient();
    const result = await client.query({
      query: PENDING_CASHIER_ORDERS as any,
      fetchPolicy: 'network-only',
    });
    if (result.error) {
      throw new Error(result.error.message ?? 'Failed to load cashier queue');
    }
    return ((result.data as any)?.pendingCashierOrders ?? []) as CashierPendingOrderView[];
  }

  /** Settle one order with one or more tenders (atomic on the backend). */
  async settleOrder(
    orderId: string,
    tenders: OrderTenderInput[],
  ): Promise<SettleOrderPaymentsResultView> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: SETTLE_ORDER_PAYMENTS as any,
      variables: { input: { orderId, tenders } },
    });
    if (result.error) {
      throw new Error(result.error.message ?? 'Failed to settle order');
    }
    const data = (result.data as any)?.settleOrderPayments;
    if (!data) {
      throw new Error('Failed to settle order — no data returned');
    }
    return data as SettleOrderPaymentsResultView;
  }
}
