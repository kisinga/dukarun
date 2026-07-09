import { Injectable, Logger, Optional } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ChartOfAccountsService } from '../financial/chart-of-accounts.service';
import { CreditService } from '../credit/credit.service';
import { FinancialService } from '../financial/financial.service';
import {
  LedgerConsistencyGuard,
  PurchaseApProjection,
  PurchaseApSnapshot,
} from '../financial/ledger-projection';
import { PAYMENT_METHOD_CODES } from './payment-method-codes.constants';
import { StockPurchase } from '../stock/entities/purchase.entity';
import { PurchasePayment } from '../stock/entities/purchase-payment.entity';
import {
  PaymentAllocationItem,
  calculatePaymentAllocation,
  calculateRemainingBalance,
} from './payment-allocation-base.types';

export interface SupplierPaymentAllocationInput {
  supplierId: string;
  paymentAmount: number; // In smallest currency unit (cents)
  purchaseIds?: string[]; // Optional - if not provided, auto-select oldest
  debitAccountCode?: string; // Optional - overrides method-based debit account
}

export interface SupplierPaymentAllocationResult {
  purchasesPaid: Array<{
    purchaseId: string;
    purchaseReference: string;
    amountPaid: number; // In smallest currency unit (cents)
  }>;
  remainingBalance: number; // In smallest currency unit (cents)
  totalAllocated: number; // In smallest currency unit (cents)
  excessPayment: number; // In smallest currency unit (cents) - amount paid beyond what's owed
}

@Injectable()
export class SupplierPaymentAllocationService {
  private readonly logger = new Logger('SupplierPaymentAllocationService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly creditService: CreditService,
    private readonly financialService: FinancialService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly ledgerConsistencyGuard: LedgerConsistencyGuard,
    private readonly purchaseApProjection: PurchaseApProjection,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Get unpaid credit purchases for a supplier (oldest first).
   * Loads payments so the ledger projection can compute the entity-model view.
   */
  async getUnpaidPurchasesForSupplier(
    ctx: RequestContext,
    supplierId: string
  ): Promise<StockPurchase[]> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);

    const channelId = ctx.channelId as number;
    const purchases = await purchaseRepo.find({
      where: {
        channelId: channelId,
        supplierId: parseInt(String(supplierId), 10),
        isCreditPurchase: true,
        paymentStatus: In(['pending', 'partial']),
      },
      relations: ['payments'],
      order: {
        createdAt: 'ASC', // Oldest first
      },
    });

    return purchases.filter(purchase => purchase.paymentStatus !== 'paid');
  }

  /**
   * Verify the purchase-model AP balance matches the ledger before mutating payments.
   * Returns the verified ledger snapshot so callers do not need to fetch it again.
   */
  private async assertPurchaseLedgerInSync(
    ctx: RequestContext,
    purchase: StockPurchase
  ): Promise<PurchaseApSnapshot> {
    return this.ledgerConsistencyGuard.assertInSync(ctx, this.purchaseApProjection, purchase);
  }

  /**
   * Allocate payment amount across credit purchases (oldest first by default)
   * Handles excess payments by returning the excess amount
   */
  async allocatePaymentToPurchases(
    ctx: RequestContext,
    input: SupplierPaymentAllocationInput
  ): Promise<SupplierPaymentAllocationResult> {
    if (input.debitAccountCode?.trim()) {
      await this.chartOfAccountsService.validatePaymentSourceAccount(
        ctx,
        input.debitAccountCode.trim()
      );
    }
    const allocationResult = await this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        // 1. Get unpaid purchases
        let unpaidPurchases = await this.getUnpaidPurchasesForSupplier(
          transactionCtx,
          input.supplierId
        );

        if (unpaidPurchases.length === 0) {
          throw new UserInputError('No unpaid credit purchases found for this supplier.');
        }

        // 2. Filter to selected purchases if provided
        if (input.purchaseIds && input.purchaseIds.length > 0) {
          unpaidPurchases = unpaidPurchases.filter(purchase =>
            input.purchaseIds!.includes(purchase.id)
          );
        }

        // 3. Fail closed if any selected purchase has drifted from the ledger, and capture
        // the verified ledger status for each purchase.
        const purchaseStatusMap = new Map<
          string,
          { totalOwed: number; amountPaid: number; amountOwing: number }
        >();
        for (const purchase of unpaidPurchases) {
          const status = await this.assertPurchaseLedgerInSync(transactionCtx, purchase);
          purchaseStatusMap.set(purchase.id, status);
        }

        // 4. Payment amount is already in cents
        const paymentAmountInCents = input.paymentAmount;

        // 5. Build allocation items from ledger (AP balance per purchase) as source of truth
        const allocationItems: PaymentAllocationItem[] = unpaidPurchases.map(purchase => {
          const status = purchaseStatusMap.get(purchase.id)!;
          return {
            id: purchase.id,
            code: purchase.referenceNumber || purchase.id,
            totalAmount: status.totalOwed,
            paidAmount: status.amountPaid,
            createdAt: purchase.createdAt,
          };
        });

        // 6. Calculate allocation using shared utility
        const calculation = calculatePaymentAllocation({
          itemsToPay: allocationItems,
          paymentAmount: paymentAmountInCents,
          selectedItemIds: input.purchaseIds,
        });

        if (calculation.excessPayment > 0) {
          throw new UserInputError(
            `Payment amount (${paymentAmountInCents}) exceeds total owed (${calculation.totalAllocated}). ` +
              `Please enter amount up to ${calculation.totalAllocated} or use exact amount.`
          );
        }

        // 7. Apply allocations: update paymentStatus, create PurchasePayment, post to ledger (single place)
        const purchasesPaid: Array<{
          purchaseId: string;
          purchaseReference: string;
          amountPaid: number;
        }> = [];
        const purchaseRepo = this.connection.getRepository(transactionCtx, StockPurchase);
        const purchasePaymentRepo = this.connection.getRepository(transactionCtx, PurchasePayment);
        const supplierIdNum = parseInt(String(input.supplierId), 10);
        const channelId = transactionCtx.channelId as number;

        for (const allocation of calculation.allocations) {
          const purchase = unpaidPurchases.find(p => p.id === allocation.itemId);
          if (!purchase) {
            continue;
          }

          // Persist payment for audit and so paidAmount = sum(PurchasePayment) stays single source of truth
          const paymentRecord = purchasePaymentRepo.create({
            channelId,
            purchaseId: purchase.id,
            amount: allocation.amountToAllocate,
            method: PAYMENT_METHOD_CODES.CASH,
            reference: null,
            supplierId: supplierIdNum,
          });
          await purchasePaymentRepo.save(paymentRecord);

          const paymentId = `supplier-payment-${purchase.id}-${Date.now()}`;
          await this.financialService.recordSupplierPayment(
            transactionCtx,
            paymentId,
            purchase.id,
            purchase.referenceNumber || purchase.id,
            input.supplierId,
            allocation.amountToAllocate,
            PAYMENT_METHOD_CODES.CASH,
            input.debitAccountCode?.trim()
          );

          // Derive the new paymentStatus from the pre-posting ledger snapshot plus this
          // allocation. Re-querying the global DataSource inside a transaction would miss
          // the uncommitted supplier-payment entry, so we compute locally from the verified
          // snapshot captured in purchaseStatusMap.
          const snapshot = purchaseStatusMap.get(purchase.id);
          const totalOwed = snapshot?.totalOwed ?? purchase.totalCost;
          const paidBefore = snapshot?.amountPaid ?? 0;
          const paidAfter = paidBefore + allocation.amountToAllocate;

          let newPaymentStatus: string;
          if (paidAfter >= totalOwed) {
            newPaymentStatus = 'paid';
          } else if (paidAfter > 0) {
            newPaymentStatus = 'partial';
          } else {
            newPaymentStatus = 'pending';
          }

          await purchaseRepo.update({ id: purchase.id }, { paymentStatus: newPaymentStatus });

          purchasesPaid.push({
            purchaseId: purchase.id,
            purchaseReference: purchase.referenceNumber || purchase.id,
            amountPaid: allocation.amountToAllocate,
          });
        }

        // 8. Record repayment tracking if any payment was made
        if (calculation.totalAllocated > 0) {
          await this.creditService.recordRepayment(
            transactionCtx,
            input.supplierId,
            'supplier',
            calculation.totalAllocated
          );
        }

        return {
          purchasesPaid,
          totalAllocated: calculation.totalAllocated,
          excessPayment: calculation.excessPayment,
        };
      } catch (error) {
        this.logger.error(
          `Failed to allocate supplier payment: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });

    // 9. Remaining balance from ledger (AP by supplierId) as source of truth.
    // Query AFTER the transaction commits: the global ledger query cannot see
    // uncommitted supplier-payment entries, so reading inside the transaction
    // returned the pre-payment balance.
    const remainingBalance = await this.financialService.getSupplierBalance(ctx, input.supplierId);

    // 10. Log audit
    if (this.auditService) {
      await this.auditService.log(ctx, 'supplier.payment.allocated', {
        entityType: 'Customer',
        entityId: input.supplierId,
        data: {
          paymentAmount: input.paymentAmount,
          totalAllocated: allocationResult.totalAllocated,
          remainingBalance,
          excessPayment: allocationResult.excessPayment,
          purchasesPaid: allocationResult.purchasesPaid.map(p => ({
            purchaseId: p.purchaseId,
            purchaseReference: p.purchaseReference,
            amountPaid: p.amountPaid,
          })),
          purchaseIds: input.purchaseIds || null,
        },
      });
    }

    this.logger.log(
      `Supplier payment allocated: ${allocationResult.totalAllocated} across ${allocationResult.purchasesPaid.length} purchases for supplier ${input.supplierId}. ` +
        `Remaining balance: ${remainingBalance}, Excess payment: ${allocationResult.excessPayment}`
    );

    return {
      ...allocationResult,
      remainingBalance,
    };
  }

  /**
   * Pay a single purchase (convenience for UI). Reuses allocatePaymentToPurchases with one purchase.
   */
  async paySinglePurchase(
    ctx: RequestContext,
    purchaseId: string,
    paymentAmount?: number,
    debitAccountCode?: string
  ): Promise<SupplierPaymentAllocationResult> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const purchase = await purchaseRepo.findOne({
      where: { id: purchaseId, channelId: ctx.channelId as number },
      relations: ['payments'],
    });
    if (!purchase) {
      throw new UserInputError(`Purchase ${purchaseId} not found.`);
    }
    if (!purchase.isCreditPurchase) {
      throw new UserInputError(`Purchase ${purchaseId} is not a credit purchase.`);
    }

    // Fail closed if purchase and ledger disagree. The ledger status is the source of truth
    // for the purchase-level outstanding (AP balance for this purchase).
    const status = await this.assertPurchaseLedgerInSync(ctx, purchase);
    const outstanding = status.amountOwing;

    if (outstanding <= 0) {
      throw new UserInputError(`Purchase ${purchaseId} has no outstanding balance.`);
    }
    const amount = paymentAmount ?? outstanding;
    if (amount <= 0) {
      throw new UserInputError('Payment amount must be greater than zero.');
    }
    if (amount > outstanding) {
      throw new UserInputError(
        `Payment amount (${amount}) cannot exceed outstanding (${outstanding}).`
      );
    }
    return this.allocatePaymentToPurchases(ctx, {
      supplierId: String(purchase.supplierId),
      paymentAmount: amount,
      purchaseIds: [purchaseId],
      debitAccountCode: debitAccountCode?.trim() || undefined,
    });
  }

  /**
   * Human-approved rebuild: set a purchase's paymentStatus from the ledger AP balance.
   * Does not mutate PurchasePayment records (audit trail). Superadmin only.
   */
  async rebuildPurchaseFromLedger(ctx: RequestContext, purchaseId: string): Promise<StockPurchase> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const purchase = await purchaseRepo.findOne({
      where: { id: purchaseId, channelId: ctx.channelId as number },
    });
    if (!purchase) {
      throw new UserInputError(`Purchase ${purchaseId} not found.`);
    }
    if (!purchase.isCreditPurchase) {
      throw new UserInputError(`Purchase ${purchaseId} is not a credit purchase.`);
    }

    const status = await this.financialService.getPurchasePaymentStatus(ctx, purchaseId);

    let newPaymentStatus: string;
    if (status.amountOwing <= 0) {
      newPaymentStatus = 'paid';
    } else if (status.amountPaid <= 0) {
      newPaymentStatus = 'pending';
    } else {
      newPaymentStatus = 'partial';
    }

    if (purchase.paymentStatus !== newPaymentStatus) {
      purchase.paymentStatus = newPaymentStatus;
      await purchaseRepo.save(purchase);

      this.logger.log(
        `Rebuilt purchase ${purchaseId} paymentStatus from ledger: ${newPaymentStatus} ` +
          `(amountOwing=${status.amountOwing}, amountPaid=${status.amountPaid})`
      );

      if (this.auditService) {
        await this.auditService.log(ctx, 'purchase.rebuild.from.ledger', {
          entityType: 'Purchase',
          entityId: purchaseId,
          data: {
            purchaseId,
            newPaymentStatus,
            amountOwing: status.amountOwing,
            amountPaid: status.amountPaid,
            totalOwed: status.totalOwed,
          },
        });
      }
    }

    return purchase;
  }
}
