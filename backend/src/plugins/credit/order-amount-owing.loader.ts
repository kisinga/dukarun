import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import DataLoader from 'dataloader';
import { getRequestContextFromReq } from '../../infrastructure/audit/get-request-context';
import { FinancialService } from '../../services/financial/financial.service';

/**
 * Request-scoped DataLoader for order amountOwing lookups.
 *
 * Batches all amountOwing resolutions for a single GraphQL request into one
 * ledger query keyed by order IDs, eliminating N+1 queries for order lists.
 */
@Injectable({ scope: Scope.REQUEST })
export class OrderAmountOwingLoader {
  private readonly logger = new Logger(OrderAmountOwingLoader.name);
  private readonly loader: DataLoader<string, number>;

  constructor(
    @Inject(REQUEST) request: Request,
    private readonly financialService: FinancialService
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
      return orderIds.map(id => {
        const status = statuses.get(id);
        if (!status) {
          return new Error(`No ledger AR rows found for order ${id}`);
        }
        return status.amountOwing;
      });
    });
  }

  async load(orderId: string): Promise<number> {
    return this.loader.load(orderId);
  }
}
