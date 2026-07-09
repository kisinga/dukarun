import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { StockPurchase } from '../../stock/entities/purchase.entity';
import { FinancialService } from '../financial.service';
import { LedgerProjection } from './ledger-projection.interface';

export interface PurchaseApSnapshot {
  totalOwed: number;
  amountPaid: number;
  amountOwing: number;
}

/**
 * Purchase Accounts-Payable Projection
 *
 * Compares the purchase model's view of what is owed (total - payments)
 * with the ledger's AP balance for the purchase.
 */
@Injectable()
export class PurchaseApProjection implements LedgerProjection<StockPurchase, PurchaseApSnapshot> {
  readonly entityType = 'Purchase';
  readonly toleranceCents = 1;

  constructor(private readonly financialService: FinancialService) {}

  computeFromEntity(purchase: StockPurchase): PurchaseApSnapshot {
    const totalOwed = purchase.totalCost;
    const amountPaid = (purchase.payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const amountOwing = Math.max(0, totalOwed - amountPaid);

    return {
      totalOwed,
      amountPaid,
      amountOwing,
    };
  }

  async fetchFromLedger(ctx: RequestContext, purchase: StockPurchase): Promise<PurchaseApSnapshot> {
    return this.financialService.getPurchasePaymentStatus(ctx, purchase.id);
  }

  compare(
    entitySnapshot: PurchaseApSnapshot,
    ledgerSnapshot: PurchaseApSnapshot
  ): {
    difference: number;
  } {
    return {
      difference: entitySnapshot.amountOwing - ledgerSnapshot.amountOwing,
    };
  }
}
