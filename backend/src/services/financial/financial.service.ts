import { Injectable, Logger } from '@nestjs/common';
import { Order, Payment, RequestContext } from '@vendure/core';
import { ACCOUNT_CODES, type AccountCode } from '../../ledger/account-codes.constants';
import { LedgerPostingService } from './ledger-posting.service';
import { LedgerQueryService } from './ledger-query.service';
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
    private readonly queryService: LedgerQueryService
  ) {}

  // ==================== READ OPERATIONS ====================

  /**
   * Get customer balance (amount customer owes)
   * Returns amount in base currency units (not cents)
   */
  async getCustomerBalance(ctx: RequestContext, customerId: string): Promise<number> {
    const balanceInCents = await this.queryService.getCustomerBalance(
      ctx.channelId as number,
      customerId
    );
    return balanceInCents / 100;
  }

  /**
   * Get supplier balance (amount we owe supplier)
   * Returns amount in base currency units (not cents)
   */
  async getSupplierBalance(ctx: RequestContext, supplierId: string): Promise<number> {
    const balanceInCents = await this.queryService.getSupplierBalance(
      ctx.channelId as number,
      supplierId
    );
    return balanceInCents / 100;
  }

  /**
   * Get order payment status from ledger
   * Returns amount still owed in base currency units
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
      totalOwed: totalOwedInCents / 100,
      amountPaid: amountPaidInCents / 100,
      amountOwing: amountOwingInCents / 100,
    };
  }

  /**
   * Get sales total for a period
   * Returns amount in base currency units
   */
  async getSalesTotal(ctx: RequestContext, startDate?: Date, endDate?: Date): Promise<number> {
    const totalInCents = await this.queryService.getSalesTotal(
      ctx.channelId as number,
      startDate?.toISOString().slice(0, 10),
      endDate?.toISOString().slice(0, 10)
    );
    return totalInCents / 100;
  }

  /**
   * Get purchases total for a period
   * Returns amount in base currency units
   */
  async getPurchaseTotal(ctx: RequestContext, startDate?: Date, endDate?: Date): Promise<number> {
    const totalInCents = await this.queryService.getPurchaseTotal(
      ctx.channelId as number,
      startDate?.toISOString().slice(0, 10),
      endDate?.toISOString().slice(0, 10)
    );
    return totalInCents / 100;
  }

  /**
   * Get expenses total for a period
   * Returns amount in base currency units
   */
  async getExpenseTotal(ctx: RequestContext, startDate?: Date, endDate?: Date): Promise<number> {
    const totalInCents = await this.queryService.getExpenseTotal(
      ctx.channelId as number,
      startDate?.toISOString().slice(0, 10),
      endDate?.toISOString().slice(0, 10)
    );
    return totalInCents / 100;
  }

  /**
   * Get account balance (generic)
   * Returns amount in base currency units
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
    return balance.balance / 100;
  }

  // ==================== WRITE OPERATIONS ====================

  /**
   * Record a customer payment
   * Must be called within the same transaction as payment settlement
   *
   * Note: This posts a payment entry (cash/clearing debit, sales credit).
   * For credit sales, use recordSale() instead.
   * For payment allocations (paying off credit), use recordPaymentAllocation() instead.
   */
  async recordPayment(ctx: RequestContext, payment: Payment, order: Order): Promise<void> {
    if (payment.amount <= 0) {
      throw new Error(
        `Payment ${payment.id} has non-positive amount (${payment.amount}) and cannot be posted to ledger`
      );
    }

    // Only post if payment is settled
    if (payment.state !== 'Settled') {
      this.logger.warn(
        `Payment ${payment.id} is not settled (state: ${payment.state}), skipping ledger posting for order ${order.code}`
      );
      return;
    }

    const context: PaymentPostingContext = {
      amount: payment.amount,
      method: payment.method,
      orderId: order.id.toString(),
      orderCode: order.code,
      customerId: order.customer?.id?.toString(),
    };

    try {
      this.logger.log(
        `Posting payment ${payment.id} to ledger: order ${order.code}, amount ${payment.amount}, method ${payment.method}`
      );

      await this.postingService.postPayment(ctx, payment.id.toString(), context);

      this.logger.log(
        `Successfully posted payment ${payment.id} to ledger for order ${order.code}`
      );

      // Invalidate cache for affected accounts
      // Clear SALES cache (most important for dashboard)
      this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.SALES);
      const clearingAccount = this.mapMethodToAccount(payment.method);
      this.queryService.invalidateCache(ctx.channelId as number, clearingAccount);
      this.logger.debug(
        `Invalidated cache for SALES and ${clearingAccount} accounts (channel: ${ctx.channelId})`
      );
    } catch (error) {
      this.logger.error(
        `Failed to post payment ${payment.id} to ledger for order ${order.code}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error; // Re-throw to ensure transaction rollback
    }
  }

  /**
   * Record a credit sale (order fulfilled without payment)
   * Must be called within the same transaction as order fulfillment
   */
  async recordSale(ctx: RequestContext, order: Order): Promise<void> {
    if (!order.customer) {
      throw new Error('Order must have customer for credit sale');
    }

    // Use totalWithTax to get the full tax-inclusive amount when prices include tax
    const orderAmount = order.totalWithTax || order.total;

    if (orderAmount <= 0) {
      throw new Error(
        `Order ${order.id} has non-positive total (${orderAmount}) and cannot be posted as a credit sale`
      );
    }

    const context: SalePostingContext = {
      amount: orderAmount,
      orderId: order.id.toString(),
      orderCode: order.code,
      customerId: order.customer.id.toString(),
      isCreditSale: true,
    };

    await this.postingService.postCreditSale(ctx, order.id.toString(), context);

    // Invalidate cache
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.SALES);
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
    amount: number
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
    };

    await this.postingService.postPaymentAllocation(ctx, paymentId, context);

    // Invalidate cache
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const clearingAccount = this.mapMethodToAccount(paymentMethod);
    this.queryService.invalidateCache(ctx.channelId as number, clearingAccount);
  }

  /**
   * Record a supplier purchase (credit purchase)
   * Must be called within the same transaction as purchase creation
   */
  async recordPurchase(
    ctx: RequestContext,
    purchaseId: string,
    purchaseReference: string,
    supplierId: string,
    totalCost: number
  ): Promise<void> {
    if (totalCost <= 0) {
      throw new Error(
        `Purchase ${purchaseId} has non-positive total cost (${totalCost}) and cannot be posted to ledger`
      );
    }
    const context: PurchasePostingContext = {
      amount: totalCost,
      purchaseId,
      purchaseReference,
      supplierId,
      isCreditPurchase: true,
    };

    await this.postingService.postSupplierPurchase(ctx, purchaseId, context);

    // Invalidate cache
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.PURCHASES);
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
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
    paymentMethod: string
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
    };

    await this.postingService.postSupplierPayment(ctx, paymentId, context);

    // Invalidate cache
    this.queryService.invalidateCache(ctx.channelId as number, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const cashAccount = this.mapMethodToAccount(paymentMethod);
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
