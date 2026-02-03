import { Injectable, Logger, Optional } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ChartOfAccountsService } from '../financial/chart-of-accounts.service';
import { SupplierCreditService } from '../credit/supplier-credit.service';
import { FinancialService } from '../financial/financial.service';
import { PAYMENT_METHOD_CODES } from './payment-method-codes.constants';
import { StockPurchase } from '../stock/entities/purchase.entity';
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
    private readonly supplierCreditService: SupplierCreditService,
    private readonly financialService: FinancialService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Get unpaid credit purchases for a supplier (oldest first)
   */
  async getUnpaidPurchasesForSupplier(
    ctx: RequestContext,
    supplierId: string
  ): Promise<StockPurchase[]> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);

    // Convert Vendure ID (string) to integer for database query
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

    // Filter to only purchases that are not fully paid
    // For now, we'll use paymentStatus to determine if fully paid
    // In the future, this should track actual payment amounts
    return purchases.filter(purchase => {
      // 'paid' means fully paid, 'partial' means partially paid, 'pending' means unpaid
      return purchase.paymentStatus !== 'paid';
    });
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

        // 3. Convert purchases to PaymentAllocationItem format
        const allocationItems: PaymentAllocationItem[] = unpaidPurchases.map(purchase => {
          // Calculate paid amount based on paymentStatus
          // This is a simplification - ideally we'd track actual payment amounts
          let paidAmount = 0;
          if (purchase.paymentStatus === 'paid') {
            paidAmount = purchase.totalCost; // Fully paid
          } else if (purchase.paymentStatus === 'partial') {
            // For partial payments, we'd need to track actual paid amount
            // For now, we'll estimate as 50% paid (this should be replaced with actual payment tracking)
            paidAmount = Math.floor(purchase.totalCost * 0.5);
          }
          // 'pending' means paidAmount = 0

          return {
            id: purchase.id,
            code: purchase.referenceNumber || purchase.id,
            totalAmount: purchase.totalCost,
            paidAmount: paidAmount,
            createdAt: purchase.createdAt,
          };
        });

        // 4. Calculate allocation using shared utility
        const calculation = calculatePaymentAllocation({
          itemsToPay: allocationItems,
          paymentAmount: paymentAmountInCents,
          selectedItemIds: input.purchaseIds,
        });

        // 5. Apply allocations to purchases
        const purchasesPaid: Array<{
          purchaseId: string;
          purchaseReference: string;
          amountPaid: number;
        }> = [];
        const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);

        for (const allocation of calculation.allocations) {
          const purchase = unpaidPurchases.find(p => p.id === allocation.itemId);
          if (!purchase) {
            continue;
          }

          // Calculate new paid amount
          const currentPaidAmount =
            allocationItems.find(item => item.id === allocation.itemId)?.paidAmount || 0;
          const newPaidAmount = currentPaidAmount + allocation.amountToAllocate;
          const newTotalCost = purchase.totalCost;

          // Update payment status based on new paid amount
          let newPaymentStatus: string;
          if (newPaidAmount >= newTotalCost) {
            newPaymentStatus = 'paid';
          } else if (newPaidAmount > 0) {
            newPaymentStatus = 'partial';
          } else {
            newPaymentStatus = 'pending';
          }

          // Update purchase payment status
          await purchaseRepo.update({ id: purchase.id }, { paymentStatus: newPaymentStatus });

          // Post to ledger via FinancialService (single source of truth)
          const paymentId = `supplier-payment-${purchase.id}-${Date.now()}`;
          await this.financialService.recordSupplierPayment(
            transactionCtx,
            paymentId,
            purchase.id,
            purchase.referenceNumber || purchase.id,
            input.supplierId,
            allocation.amountToAllocate,
            PAYMENT_METHOD_CODES.CASH, // Default to cash, can be made configurable
            input.debitAccountCode?.trim()
          );

          purchasesPaid.push({
            purchaseId: purchase.id,
            purchaseReference: purchase.referenceNumber || purchase.id,
            amountPaid: allocation.amountToAllocate,
          });
        }

        // 6. Record repayment tracking if any payment was made
        if (calculation.totalAllocated > 0) {
          await this.supplierCreditService.recordSupplierRepayment(
            transactionCtx,
            input.supplierId,
            calculation.totalAllocated // Amount in cents
          );
        }

        // 7. Calculate remaining balance
        const remainingUnpaidPurchases = await this.getUnpaidPurchasesForSupplier(
          transactionCtx,
          input.supplierId
        );
        const remainingItems: PaymentAllocationItem[] = remainingUnpaidPurchases.map(purchase => {
          let paidAmount = 0;
          if (purchase.paymentStatus === 'paid') {
            paidAmount = purchase.totalCost;
          } else if (purchase.paymentStatus === 'partial') {
            paidAmount = Math.floor(purchase.totalCost * 0.5);
          }
          return {
            id: purchase.id,
            code: purchase.referenceNumber || purchase.id,
            totalAmount: purchase.totalCost,
            paidAmount: paidAmount,
            createdAt: purchase.createdAt,
          };
        });
        const remainingBalance = calculateRemainingBalance(remainingItems);
        const excessPayment = calculation.excessPayment;
        const totalAllocated = calculation.totalAllocated;

        // 9. Log audit event
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
}
