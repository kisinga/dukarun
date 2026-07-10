import { Injectable } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { LedgerConsistencyGuard, PurchaseApProjection } from '../financial/ledger-projection';
import { FinancialService } from '../financial/financial.service';
import { LedgerPostingService } from '../financial/ledger-posting.service';
import { StockPurchase } from '../stock/entities/purchase.entity';
import { PurchasePayment } from '../stock/entities/purchase-payment.entity';

export interface PurchaseReconciliationItem {
  purchaseId: string;
  purchaseReference: string | null;
  supplierId: number;
  purchaseModelOwing: number;
  ledgerOwing: number;
  difference: number;
  purchaseTotal: number;
  purchaseModelPaid: number;
  ledgerPaid: number;
}

export interface PurchaseReconciliationResult {
  items: PurchaseReconciliationItem[];
  totalItems: number;
}

/**
 * Purchase Reconciliation Service
 *
 * Finds credit purchases where the purchase-model outstanding AP balance has
 * drifted from the ledger. Human-approved repairs only.
 */
@Injectable()
export class PurchaseReconciliationService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly ledgerConsistencyGuard: LedgerConsistencyGuard,
    private readonly purchaseApProjection: PurchaseApProjection,
    private readonly financialService: FinancialService,
    private readonly ledgerPostingService: LedgerPostingService
  ) {}

  async findDivergentPurchases(
    ctx: RequestContext,
    toleranceCents?: number
  ): Promise<PurchaseReconciliationResult> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const channelId = ctx.channelId as number;
    const purchases = await purchaseRepo.find({
      where: { channelId, isCreditPurchase: true },
      relations: ['payments'],
    });

    const divergences = await this.ledgerConsistencyGuard.findDivergences(
      ctx,
      this.purchaseApProjection,
      async () => purchases,
      toleranceCents
    );

    const items: PurchaseReconciliationItem[] = divergences.map(d => ({
      purchaseId: d.entity.id,
      purchaseReference: d.entity.referenceNumber,
      supplierId: d.entity.supplierId,
      purchaseModelOwing: d.entitySnapshot.amountOwing,
      ledgerOwing: d.ledgerSnapshot.amountOwing,
      difference: d.difference,
      purchaseTotal: d.entitySnapshot.totalOwed,
      purchaseModelPaid: d.entitySnapshot.amountPaid,
      ledgerPaid: d.ledgerSnapshot.amountPaid,
    }));

    return { items, totalItems: items.length };
  }

  /**
   * Reconcile a credit purchase with the ledger.
   *
   * - 'ledger' (trust ledger): create a synthetic PurchasePayment record for any
   *   amount the model owes but the ledger does not. No ledger entry is posted.
   * - 'order' (trust order): post a purchase-scoped AP balance adjustment to bring
   *   the ledger in line with the purchase model.
   */
  async reconcilePurchase(
    ctx: RequestContext,
    input: { purchaseId: string; strategy: string; note?: string }
  ): Promise<StockPurchase> {
    const strategy = input.strategy?.toLowerCase();
    const note = input.note?.trim() || '';

    if (strategy !== 'ledger' && strategy !== 'order') {
      throw new UserInputError(`Unsupported reconciliation strategy: ${input.strategy}`);
    }

    return this.connection.withTransaction(ctx, async txCtx => {
      const purchaseRepo = this.connection.getRepository(txCtx, StockPurchase);
      let purchase = await purchaseRepo.findOne({
        where: { id: input.purchaseId, channelId: txCtx.channelId as number },
        relations: ['payments'],
      });
      if (!purchase) {
        throw new UserInputError(`Purchase ${input.purchaseId} not found`);
      }
      if (!purchase.isCreditPurchase) {
        throw new UserInputError(`Purchase ${purchase.id} is not a credit purchase`);
      }

      if (strategy === 'ledger') {
        purchase = await this.applyLedgerTrustStrategy(txCtx, purchase, note);
      } else {
        await this.applyOrderTrustStrategy(txCtx, purchase, note);
      }

      return purchase;
    });
  }

  private async applyLedgerTrustStrategy(
    ctx: RequestContext,
    purchase: StockPurchase,
    note?: string
  ): Promise<StockPurchase> {
    const status = await this.financialService.getPurchasePaymentStatus(ctx, purchase.id);
    const modelOwing = this.computeModelOwing(purchase);
    const diff = modelOwing - status.amountOwing;

    if (diff < 0) {
      throw new UserInputError(
        `Ledger shows ${Math.abs(diff)} more owing than the purchase model. ` +
          `Use the 'order' strategy to adjust the ledger, or investigate manually.`
      );
    }

    if (diff > 0) {
      const purchasePaymentRepo = this.connection.getRepository(ctx, PurchasePayment);
      const payment = purchasePaymentRepo.create({
        channelId: purchase.channelId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        amount: diff,
        method: 'reconciliation',
        reference: `reconciliation-${purchase.id}-${Date.now()}`,
        meta: {
          paymentType: 'reconciliation',
          purchaseId: purchase.id,
          purchaseReference: purchase.referenceNumber,
          reason: note || 'Purchase reconciliation: trust ledger',
        },
      } as DeepPartial<PurchasePayment>);
      await purchasePaymentRepo.save(payment);

      const totalPaid =
        (purchase.payments || []).reduce((sum, p) => sum + Number(p.amount), 0) + diff;
      purchase.paymentStatus = this.derivePaymentStatus(totalPaid, purchase.totalCost);
      await this.connection.getRepository(ctx, StockPurchase).save(purchase);
    }

    return purchase;
  }

  private async applyOrderTrustStrategy(
    ctx: RequestContext,
    purchase: StockPurchase,
    note?: string
  ): Promise<void> {
    const status = await this.financialService.getPurchasePaymentStatus(ctx, purchase.id);
    const modelOwing = this.computeModelOwing(purchase);
    const diff = modelOwing - status.amountOwing;

    if (diff === 0) {
      return;
    }

    const direction = diff > 0 ? 'decrease' : 'increase';
    const amount = Math.abs(diff);

    await this.ledgerPostingService.postSupplierBalanceAdjustment(
      ctx,
      `purchase-reconciliation-${purchase.id}`,
      {
        amount,
        direction,
        supplierId: purchase.supplierId.toString(),
        reason: note || `Purchase reconciliation: trust order (${direction} ${amount})`,
        purchaseId: purchase.id,
      }
    );
  }

  private computeModelOwing(purchase: StockPurchase): number {
    const totalOwed = purchase.totalCost || 0;
    const paid = (purchase.payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    return Math.max(0, totalOwed - paid);
  }

  private derivePaymentStatus(totalPaid: number, totalCost: number): string {
    if (totalPaid >= totalCost) {
      return 'paid';
    }
    if (totalPaid > 0) {
      return 'partial';
    }
    return 'pending';
  }
}
