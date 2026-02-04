import { Injectable, Logger } from '@nestjs/common';
import { Order, Payment, RequestContext } from '@vendure/core';
import { ACCOUNT_CODES, type AccountCode } from '../../ledger/account-codes.constants';
import { LedgerPostingService } from './ledger-posting.service';
import { LedgerQueryService } from './ledger-query.service';
import { LedgerTransactionService } from './ledger-transaction.service';
import { PurchaseTransactionData } from './strategies/purchase-posting.strategy';
import {
  CashSaleTransactionData,
  CreditSaleTransactionData,
} from './strategies/sale-posting.strategy';
import { mapPaymentMethodToAccount } from './payment-method-mapping.config';
import {
  PaymentPostingContext,
  PurchasePostingContext,
  RefundPostingContext,
  SalePostingContext,
  SupplierPaymentPostingContext,
} from './posting-policy';

/**
 * FinancialService - Clean Facade for Financial Operations
 *
 * This service abstracts all accounting terminology and provides
 * business-friendly methods. The ledger is the single source of truth
 * for all financial data.
 */
@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);

  constructor(
    private readonly postingService: LedgerPostingService,
    private readonly queryService: LedgerQueryService,
    private readonly ledgerTransactionService: LedgerTransactionService
  ) {}

  // ==================== READ OPERATIONS ====================

  /**
   * Get customer balance (amount customer owes)
   * Returns amount in smallest currency unit (cents)
   */
  async getCustomerBalance(ctx: RequestContext, customerId: string): Promise<number> {
    return this.queryService.getCustomerBalance(ctx.channelId as number, customerId);
  }

  /**
   * Get supplier balance (amount we owe supplier)
   * Returns amount in smallest currency unit (cents)
   */
  async getSupplierBalance(ctx: RequestContext, supplierId: string): Promise<number> {
    return this.queryService.getSupplierBalance(ctx.channelId as number, supplierId);
  }

  /**
   * Get order payment status from ledger
   * Returns amounts in smallest currency unit (cents)
   */
  async getOrderPaymentStatus(
    ctx: RequestContext,
    orderId: string
  ): Promise<{
    totalOwed: number;
    amountPaid: number;
    amountOwing: number;
  }> {
    const balance = await this.queryService.getAccountBalance({
      channelId: ctx.channelId as number,
      accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      orderId,
    });

    const totalOwedInCents = balance.debitTotal;
    const amountPaidInCents = balance.creditTotal;
    const amountOwingInCents = Math.max(balance.balance, 0); // AR should not go negative

    return {
      totalOwed: totalOwedInCents,
      amountPaid: amountPaidInCents,
      amountOwing: amountOwingInCents,
    };
  }

  /**
   * Get sales total for a period
   * Returns amount in smallest currency unit (cents)
   */
  async getSalesTotal(ctx: RequestContext, startDate?: Date, endDate?: Date): Promise<number> {
    return this.queryService.getSalesTotal(
      ctx.channelId as number,
      startDate?.toISOString().slice(0, 10),
      endDate?.toISOString().slice(0, 10)
    );
  }

  /**
   * Get purchases total for a period
   * Returns amount in smallest currency unit (cents)
   */
  async getPurchaseTotal(ctx: RequestContext, startDate?: Date, endDate?: Date): Promise<number> {
    return this.queryService.getPurchaseTotal(
      ctx.channelId as number,
      startDate?.toISOString().slice(0, 10),
      endDate?.toISOString().slice(0, 10)
    );
  }

  /**
   * Get expenses total for a period
   * Returns amount in smallest currency unit (cents)
   */
  async getExpenseTotal(ctx: RequestContext, startDate?: Date, endDate?: Date): Promise<number> {
    return this.queryService.getExpenseTotal(
      ctx.channelId as number,
      startDate?.toISOString().slice(0, 10),
      endDate?.toISOString().slice(0, 10)
    );
  }

  /**
   * Get account balance (generic)
   * Returns amount in smallest currency unit (cents)
   */
  async getAccountBalance(
    ctx: RequestContext,
    accountCode: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    const balance = await this.queryService.getAccountBalance({
      channelId: ctx.channelId as number,
      accountCode,
      startDate: startDate?.toISOString().slice(0, 10),
      endDate: endDate?.toISOString().slice(0, 10),
    });
    return balance.balance;
  }

  // ==================== WRITE OPERATIONS ====================

  /**
   * Record a customer payment
   * Must be called within the same transaction as payment settlement
   *
   * Note: This posts a payment entry (cash/clearing debit, sales credit).
   * For credit sales, use recordSale() instead.
   * For payment allocations (paying off credit), use recordPaymentAllocation() instead.
   *
   * @deprecated Use LedgerTransactionService.postTransaction() directly for new code.
   * This method is kept for backward compatibility and delegates to LedgerTransactionService.
   */
  async recordPayment(ctx: RequestContext, payment: Payment, order: Order): Promise<void> {
    const transactionData: CashSaleTransactionData = {
      ctx,
      sourceId: payment.id.toString(),
      channelId: ctx.channelId as number,
      payment,
      order,
      isCreditSale: false,
    };

    const result = await this.ledgerTransactionService.postTransaction(transactionData);
    if (!result.success) {
      throw new Error(`Failed to post payment to ledger: ${result.error}`);
    }
  }

  /**
   * Record a credit sale (order fulfilled without payment)
   * Must be called within the same transaction as order fulfillment
   *
   * @deprecated Use LedgerTransactionService.postTransaction() directly for new code.
   * This method is kept for backward compatibility and delegates to LedgerTransactionService.
   */
  async recordSale(ctx: RequestContext, order: Order): Promise<void> {
    const transactionData: CreditSaleTransactionData = {
      ctx,
      sourceId: order.id.toString(),
      channelId: ctx.channelId as number,
      order,
      isCreditSale: true,
    };

    const result = await this.ledgerTransactionService.postTransaction(transactionData);
    if (!result.success) {
      throw new Error(`Failed to post credit sale to ledger: ${result.error}`);
    }
  }

  /**
   * Record a payment allocation (customer paying off credit)
   * Must be called within the same transaction as payment allocation
   */
  async recordPaymentAllocation(
    ctx: RequestContext,
    paymentId: string,
    order: Order,
    paymentMethod: string,
    amount: number,
    debitAccountCode?: string,
    openSessionId?: string
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error(
        `Payment allocation for order ${order.id} has non-positive amount (${amount}) and cannot be posted to ledger`
      );
    }

    const context: PaymentPostingContext = {
      amount,
      method: paymentMethod,
      orderId: order.id.toString(),
      orderCode: order.code,
      customerId: order.customer?.id?.toString(),
      resolvedAccountCode: debitAccountCode?.trim() || undefined,
      openSessionId,
    };

    await this.postingService.postPaymentAllocation(ctx, paymentId, context);

    // Invalidate cache (clearing account = debit account used)
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const clearingAccount = debitAccountCode?.trim() || this.mapMethodToAccount(paymentMethod);
    this.queryService.invalidateCache(ctx.channelId as number, clearingAccount);
  }

  /**
   * Post a variance adjustment so the ledger balances (short/over).
   * Call when declared != expected on opening/closing count or reconciliation.
   */
  async postVarianceAdjustment(
    ctx: RequestContext,
    sessionId: string,
    accountCode: string,
    varianceCents: number,
    reason: string,
    countId: string
  ): Promise<void> {
    const channelId = ctx.channelId as number;
    const sourceId = `${sessionId}-${accountCode}-${countId}`;
    await this.postingService.postVarianceAdjustment(
      ctx,
      channelId,
      sessionId,
      accountCode,
      varianceCents,
      reason,
      sourceId
    );
    this.queryService.invalidateCache(channelId, accountCode);
    this.queryService.invalidateCache(channelId, ACCOUNT_CODES.CASH_SHORT_OVER);
  }

  /**
   * Record a supplier purchase (credit or cash purchase)
   * Must be called within the same transaction as purchase creation
   *
   * @deprecated Use LedgerTransactionService.postTransaction() directly for new code.
   * This method is kept for backward compatibility and delegates to LedgerTransactionService.
   */
  async recordPurchase(
    ctx: RequestContext,
    purchaseId: string,
    purchaseReference: string,
    supplierId: string,
    totalCost: number,
    isCreditPurchase: boolean
  ): Promise<void> {
    const transactionData: PurchaseTransactionData = {
      ctx,
      sourceId: purchaseId,
      channelId: ctx.channelId as number,
      purchaseId,
      purchaseReference,
      supplierId,
      totalCost,
      isCreditPurchase,
    };

    const result = await this.ledgerTransactionService.postTransaction(transactionData);
    if (!result.success) {
      throw new Error(`Failed to post purchase to ledger: ${result.error}`);
    }
  }

  /**
   * Record a supplier payment
   * Must be called within the same transaction as payment allocation
   */
  async recordSupplierPayment(
    ctx: RequestContext,
    paymentId: string,
    purchaseId: string,
    purchaseReference: string,
    supplierId: string,
    amount: number,
    paymentMethod: string,
    debitAccountCode?: string
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error(
        `Supplier payment ${paymentId} has non-positive amount (${amount}) and cannot be posted to ledger`
      );
    }

    const context: SupplierPaymentPostingContext = {
      amount,
      purchaseId,
      purchaseReference,
      supplierId,
      method: paymentMethod,
      resolvedAccountCode: debitAccountCode?.trim() || undefined,
    };

    await this.postingService.postSupplierPayment(ctx, paymentId, context);

    // Invalidate cache (cash account = debit account used)
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const cashAccount = debitAccountCode?.trim() || this.mapMethodToAccount(paymentMethod);
    this.queryService.invalidateCache(ctx.channelId as number, cashAccount);
  }

  /**
   * Record a refund
   * Must be called within the same transaction as refund creation
   */
  async recordRefund(
    ctx: RequestContext,
    refundId: string,
    order: Order,
    originalPayment: Payment,
    amount: number
  ): Promise<void> {
    const context: RefundPostingContext = {
      amount,
      orderId: order.id.toString(),
      orderCode: order.code,
      originalPaymentId: originalPayment.id.toString(),
      method: originalPayment.method,
    };

    await this.postingService.postRefund(ctx, refundId, context);

    // Invalidate cache
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.SALES_RETURNS);
    const clearingAccount = this.mapMethodToAccount(originalPayment.method);
    this.queryService.invalidateCache(ctx.channelId as number, clearingAccount);
  }

  /**
   * Map payment method to account code
   * Delegates to centralized configuration-based mapping
   */
  private mapMethodToAccount(methodCode: string): AccountCode {
    return mapPaymentMethodToAccount(methodCode);
  }
}
