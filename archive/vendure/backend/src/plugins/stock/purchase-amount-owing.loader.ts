import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import DataLoader from 'dataloader';
import { getRequestContextFromReq } from '../../infrastructure/audit/get-request-context';
import { FinancialService } from '../../services/financial/financial.service';

/**
 * Request-scoped DataLoader for purchase amountOwing lookups.
 *
 * Batches all amountOwing resolutions for a single GraphQL request into one
 * ledger query keyed by purchase IDs, eliminating N+1 queries for purchase lists.
 */
@Injectable({ scope: Scope.REQUEST })
export class PurchaseAmountOwingLoader {
  private readonly logger = new Logger(PurchaseAmountOwingLoader.name);
  private readonly loader: DataLoader<string, number>;

  constructor(
    @Inject(REQUEST) request: Request,
    private readonly financialService: FinancialService
  ) {
    const req = ((request as unknown as { req?: Request }).req ?? request) as Request;
    const ctx = getRequestContextFromReq(req);

    this.loader = new DataLoader<string, number>(async purchaseIds => {
      if (!ctx) {
        throw new Error('No RequestContext available for batch amountOwing lookup');
      }

      const statuses = await this.financialService.getPurchasePaymentStatuses(ctx, [
        ...purchaseIds,
      ]);
      return purchaseIds.map(id => {
        const status = statuses.get(id);
        if (!status) {
          return new Error(`No ledger AP rows found for purchase ${id}`);
        }
        return status.amountOwing;
      });
    });
  }

  async load(purchaseId: string): Promise<number> {
    return this.loader.load(purchaseId);
  }
}
