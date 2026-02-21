import { Injectable, Logger, Optional } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ChartOfAccountsService } from '../financial/chart-of-accounts.service';
import { CreditService } from '../credit/credit.service';
import { FinancialService } from '../financial/financial.service';
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
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Get paid amount per purchase (sum of PurchasePayment.amount) for a supplier in the channel.
   * Single source of truth for how much has been paid on each purchase.
   */
  private async getPaidAmountByPurchaseId(
    ctx: RequestContext,
    supplierId: string
  ): Promise<Map<string, number>> {
    const paymentRepo = this.connection.getRepository(ctx, PurchasePayment);
    const channelId = ctx.channelId as number;
    const supplierIdNum = parseInt(String(supplierId), 10);
    const payments = await paymentRepo.find({
      where: { channelId, supplierId: supplierIdNum },
      select: ['purchaseId', 'amount'],
    });
    const map = new Map<string, number>();
    for (const p of payments) {
      const current = map.get(p.purchaseId) ?? 0;
      map.set(p.purchaseId, current + Number(p.amount));
    }
    return map;
  }

  /**
   * Get unpaid credit purchases for a supplier (oldest first).
   * Uses paymentStatus for filtering; paidAmount for allocation comes from getPaidAmountByPurchaseId.
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
      order: {
        createdAt: 'ASC', // Oldest first
      },
    });

    return purchases.filter(purchase => purchase.paymentStatus !== 'paid');
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
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        // 1. Get unpaid purchases
        let unpaidPurchases = await this.getUnpaidPurchasesForSupplier(
          transactionCtx,
          input.supplierId
        );

        if (unpaidPurchases.length === 0) {
          throw new UserInputError('No unpaid credit purchases found for this supplier.');
        }

        // 2. Payment amount is already in cents
        const paymentAmountInCents = input.paymentAmount;

        // 3. Paid amount per purchase (single source of truth: sum of PurchasePayment)
        const paidAmountByPurchaseId = await this.getPaidAmountByPurchaseId(
          transactionCtx,
          input.supplierId
        );

        // 4. Convert purchases to PaymentAllocationItem format
        const allocationItems: PaymentAllocationItem[] = unpaidPurchases.map(purchase => {
          const paidAmount = paidAmountByPurchaseId.get(purchase.id) ?? 0;
          return {
            id: purchase.id,
            code: purchase.referenceNumber || purchase.id,
            totalAmount: purchase.totalCost,
            paidAmount,
            createdAt: purchase.createdAt,
          };
        });

        // 5. Calculate allocation using shared utility
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

        // 6. Apply allocations: update paymentStatus, create PurchasePayment, post to ledger (single place)
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

          const currentPaidAmount =
            allocationItems.find(item => item.id === allocation.itemId)?.paidAmount ?? 0;
          const newPaidAmount = currentPaidAmount + allocation.amountToAllocate;
          const newTotalCost = purchase.totalCost;

          let newPaymentStatus: string;
          if (newPaidAmount >= newTotalCost) {
            newPaymentStatus = 'paid';
          } else if (newPaidAmount > 0) {
            newPaymentStatus = 'partial';
          } else {
            newPaymentStatus = 'pending';
          }

          await purchaseRepo.update({ id: purchase.id }, { paymentStatus: newPaymentStatus });

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

          purchasesPaid.push({
            purchaseId: purchase.id,
            purchaseReference: purchase.referenceNumber || purchase.id,
            amountPaid: allocation.amountToAllocate,
          });
        }

        // 7. Record repayment tracking if any payment was made
        if (calculation.totalAllocated > 0) {
          await this.creditService.recordRepayment(
            transactionCtx,
            input.supplierId,
            'supplier',
            calculation.totalAllocated
          );
        }

        // 8. Remaining balance: use paid amounts from PurchasePayment (now includes new payments)
        const remainingUnpaidPurchases = await this.getUnpaidPurchasesForSupplier(
          transactionCtx,
          input.supplierId
        );
        const paidAmountByPurchaseIdAfter = await this.getPaidAmountByPurchaseId(
          transactionCtx,
          input.supplierId
        );
        const remainingItems: PaymentAllocationItem[] = remainingUnpaidPurchases.map(purchase => {
          const paidAmount = paidAmountByPurchaseIdAfter.get(purchase.id) ?? 0;
          return {
            id: purchase.id,
            code: purchase.referenceNumber || purchase.id,
            totalAmount: purchase.totalCost,
            paidAmount,
            createdAt: purchase.createdAt,
          };
        });
        const remainingBalance = calculateRemainingBalance(remainingItems);
        const excessPayment = calculation.excessPayment;
        const totalAllocated = calculation.totalAllocated;

        // 9. Log audit
        if (this.auditService) {
          await this.auditService.log(transactionCtx, 'supplier.payment.allocated', {
            entityType: 'Customer',
            entityId: input.supplierId,
            data: {
              paymentAmount: input.paymentAmount,
              totalAllocated,
              remainingBalance,
              excessPayment,
              purchasesPaid: purchasesPaid.map(p => ({
                purchaseId: p.purchaseId,
                purchaseReference: p.purchaseReference,
                amountPaid: p.amountPaid,
              })),
              purchaseIds: input.purchaseIds || null,
            },
          });
        }

        this.logger.log(
          `Supplier payment allocated: ${totalAllocated} across ${purchasesPaid.length} purchases for supplier ${input.supplierId}. ` +
            `Remaining balance: ${remainingBalance}, Excess payment: ${excessPayment}`
        );

        return {
          purchasesPaid,
          remainingBalance,
          totalAllocated,
          excessPayment,
        };
      } catch (error) {
        this.logger.error(
          `Failed to allocate supplier payment: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
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
    });
    if (!purchase) {
      throw new UserInputError(`Purchase ${purchaseId} not found.`);
    }
    if (!purchase.isCreditPurchase) {
      throw new UserInputError(`Purchase ${purchaseId} is not a credit purchase.`);
    }
    const paidMap = await this.getPaidAmountByPurchaseId(ctx, String(purchase.supplierId));
    const paidAmount = paidMap.get(purchase.id) ?? 0;
    const outstanding = purchase.totalCost - paidAmount;
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
}
