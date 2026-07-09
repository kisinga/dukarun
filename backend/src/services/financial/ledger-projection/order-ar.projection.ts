import { Injectable } from '@nestjs/common';
import { Order, RequestContext } from '@vendure/core';
import { FinancialService } from '../financial.service';
import { LedgerProjection } from './ledger-projection.interface';

export interface OrderArSnapshot {
  totalOwed: number;
  amountPaid: number;
  amountOwing: number;
}

/**
 * Order Accounts-Receivable Projection
 *
 * Compares the order model's view of what is owed (total - settled payments)
 * with the ledger's AR balance for the order.
 */
@Injectable()
export class OrderArProjection implements LedgerProjection<Order, OrderArSnapshot> {
  readonly entityType = 'Order';
  readonly toleranceCents = 1;

  constructor(private readonly financialService: FinancialService) {}

  computeFromEntity(order: Order): OrderArSnapshot {
    const totalOwed = order.totalWithTax || order.total;
    const settledPayments = (order.payments || [])
      .filter(p => p.state === 'Settled')
      .reduce((sum, p) => sum + p.amount, 0);
    const amountOwing = Math.max(0, totalOwed - settledPayments);

    return {
      totalOwed,
      amountPaid: settledPayments,
      amountOwing,
    };
  }

  async fetchFromLedger(ctx: RequestContext, order: Order): Promise<OrderArSnapshot> {
    return this.financialService.getOrderPaymentStatus(ctx, order.id.toString());
  }

  compare(
    entitySnapshot: OrderArSnapshot,
    ledgerSnapshot: OrderArSnapshot
  ): {
    difference: number;
  } {
    return {
      difference: entitySnapshot.amountOwing - ledgerSnapshot.amountOwing,
    };
  }
}
