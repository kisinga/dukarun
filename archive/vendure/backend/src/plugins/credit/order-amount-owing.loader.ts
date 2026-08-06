import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import DataLoader from 'dataloader';
import { In } from 'typeorm';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { getRequestContextFromReq } from '../../infrastructure/audit/get-request-context';
import { FinancialService } from '../../services/financial/financial.service';

/**
 * Request-scoped DataLoader for order amountOwing lookups.
 *
 * Batches all amountOwing resolutions for a single GraphQL request into one
 * ledger query keyed by order IDs, eliminating N+1 queries for order lists.
 *
 * Orders without AR journal lines are an expected state, not an error: cash
 * sales never touch AR (DR cash / CR SALES) and pre-ledger orders were never
 * backfilled. Those fall back to the order model (total minus settled payments),
 * computed in one batched query for all misses in the request.
 */
@Injectable({ scope: Scope.REQUEST })
export class OrderAmountOwingLoader {
  private readonly loader: DataLoader<string, number>;

  constructor(
    @Inject(REQUEST) request: Request,
    private readonly financialService: FinancialService,
    private readonly connection: TransactionalConnection
  ) {
    // In GraphQL, Nest's REQUEST token is the Apollo integration context object
    // ({ req, res }), not the Express request itself. Vendure stores the
    // RequestContext on req.vendureRequestContext, so unwrap .req when present.
    const req = ((request as unknown as { req?: Request }).req ?? request) as Request;
    const ctx = getRequestContextFromReq(req);

    this.loader = new DataLoader<string, number>(async orderIds => {
      if (!ctx) {
        throw new Error('No RequestContext available for batch amountOwing lookup');
      }

      const statuses = await this.financialService.getOrderPaymentStatuses(ctx, [...orderIds]);

      const missingIds = orderIds.filter(id => !statuses.has(id));
      const modelAmounts: Map<string, number> =
        missingIds.length > 0 ? await this.computeModelAmountsOwing(ctx, missingIds) : new Map();

      return orderIds.map(id => {
        const status = statuses.get(id);
        if (status) {
          return status.amountOwing;
        }
        const modelAmount = modelAmounts.get(id);
        if (modelAmount === undefined) {
          return new Error(`Order ${id} not found for amountOwing lookup`);
        }
        return modelAmount;
      });
    });
  }

  private async computeModelAmountsOwing(
    ctx: RequestContext,
    orderIds: string[]
  ): Promise<Map<string, number>> {
    const orders = await this.connection.getRepository(ctx, Order).find({
      where: { id: In(orderIds) },
      relations: ['payments'],
    });

    const result = new Map<string, number>();
    for (const order of orders) {
      const totalOwed = order.totalWithTax || order.total;
      const settledPayments = (order.payments || [])
        .filter(p => p.state === 'Settled')
        .reduce((sum, p) => sum + p.amount, 0);
      result.set(order.id.toString(), Math.max(0, totalOwed - settledPayments));
    }
    return result;
  }

  async load(orderId: string): Promise<number> {
    return this.loader.load(orderId);
  }
}
