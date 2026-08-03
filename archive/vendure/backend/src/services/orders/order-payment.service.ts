import { Injectable, Logger } from '@nestjs/common';
import {
  ID,
  OrderService,
  Payment,
  PaymentService,
  RequestContext,
  UserInputError,
} from '@vendure/core';
import { FinancialService } from '../financial/financial.service';
import { LedgerTransactionService } from '../financial/ledger-transaction.service';
import { CashSaleTransactionData } from '../financial/strategies/sale-posting.strategy';
import { OpenSessionService } from '../financial/open-session.service';

/**
 * Order Payment Service
 *
 * Handles payment processing for orders.
 * Separated for single responsibility and testability.
 */
@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger('OrderPaymentService');

  constructor(
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly financialService: FinancialService,
    private readonly ledgerTransactionService: LedgerTransactionService,
    private readonly openSessionService: OpenSessionService
  ) {}

  /**
   * Add manual payment to order and settle it if needed
   * Posts to ledger if FinancialService is available
   */
  async addPayment(
    ctx: RequestContext,
    orderId: ID,
    paymentMethodCode: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const paymentResult = await this.orderService.addManualPaymentToOrder(ctx, {
      orderId,
      method: paymentMethodCode,
      metadata: metadata || {},
    });

    if (paymentResult && 'errorCode' in paymentResult) {
      throw new UserInputError(
        `Failed to add payment: ${paymentResult.message || paymentResult.errorCode}`
      );
    }

    // Use the order from the result if available, otherwise fetch it
    // The result should contain the order with payments
    let order = paymentResult && 'id' in paymentResult ? paymentResult : null;
    if (!order) {
      order = (await this.orderService.findOne(ctx, orderId, ['payments'])) || null;
    }

    if (!order) {
      this.logger.error(`Order ${orderId} not found after adding payment`);
      return;
    }

    if (!order.payments || order.payments.length === 0) {
      this.logger.warn(`Order ${orderId} has no payments after adding payment`);
      return;
    }

    // Find the payment that was just added
    // For cash/mpesa, it's already settled when created
    // For credit, it needs to be settled
    const newPayment = order.payments.find(p => p.method === paymentMethodCode);

    if (!newPayment) {
      this.logger.warn(`Payment with method ${paymentMethodCode} not found in order ${orderId}`);
      return;
    }

    // Settle the payment if not already settled (cash/mpesa are already settled)
    let settledPayment = newPayment;
    if (newPayment.state !== 'Settled') {
      const settleResult = await this.paymentService.settlePayment(ctx, newPayment.id);
      if (!settleResult || 'errorCode' in settleResult) {
        const errorMsg =
          settleResult && 'errorCode' in settleResult
            ? settleResult.message || settleResult.errorCode
            : 'Unknown error';
        this.logger.error(
          `Failed to settle payment ${newPayment.id} for order ${orderId}: ${errorMsg}`
        );
        return;
      }
      // Payment is now settled - use the settled payment from the result
      settledPayment = settleResult as Payment;
    }

    // Verify payment is settled before posting
    if (settledPayment.state !== 'Settled') {
      this.logger.error(
        `Payment ${settledPayment.id} is not in Settled state (current: ${settledPayment.state}) - skipping ledger posting`
      );
      return;
    }

    try {
      // Post cash sale to ledger automatically (single source of truth)
      // Tag with openSessionId when session exists for session-scoped reconciliation
      const channelId = ctx.channelId as number;
      const session = await this.openSessionService.getCurrentSession(ctx, channelId);
      const transactionData: CashSaleTransactionData = {
        ctx,
        sourceId: settledPayment.id.toString(),
        channelId,
        payment: settledPayment,
        order,
        isCreditSale: false as const,
        ...(session?.id && { openSessionId: session.id }),
      };

      const result = await this.ledgerTransactionService.postTransaction(transactionData);
      if (!result.success) {
        throw new Error(`Failed to post payment to ledger: ${result.error}`);
      }

      this.logger.log(
        `Posted payment ${settledPayment.id} to ledger for order ${order.code} (amount: ${settledPayment.amount})`
      );
    } catch (error) {
      this.logger.error(
        `Failed to post payment ${settledPayment.id} to ledger: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error; // Re-throw to ensure transaction rollback on failure
    }
  }
}
