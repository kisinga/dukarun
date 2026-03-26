import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ID,
  Order,
  OrderService,
  Payment,
  PaymentService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { FinancialService } from '../financial/financial.service';

export interface PaymentReversalResult {
  paymentId: string;
  reversedAmount: number;
  orderNowUnderpaid: boolean;
}

@Injectable()
export class PaymentReversalService {
  private readonly logger = new Logger('PaymentReversalService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly financialService: FinancialService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Reverse a specific payment. Posts the inverse ledger entry and cancels the Vendure payment.
   * All financial data (accounts, amounts, meta) is read from the ledger, not from ORM entities.
   */
  async reversePayment(ctx: RequestContext, paymentId: ID): Promise<PaymentReversalResult> {
    // Look up Payment directly via TypeORM, then load its order
    const paymentRepo = this.connection.getRepository(ctx, Payment);
    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['order'],
    });

    if (!payment) {
      throw new UserInputError(`Payment ${paymentId} not found.`);
    }

    const order = payment.order
      ? await this.orderService.findOne(ctx, payment.order.id, ['customer'])
      : null;

    if (!order) {
      throw new UserInputError(`Order for payment ${paymentId} not found.`);
    }

    // Guard: only Settled payments can be reversed
    if (payment.state !== 'Settled') {
      throw new UserInputError(
        `Payment ${paymentId} is in state "${payment.state}" and cannot be reversed. ` +
          `Only Settled payments can be reversed.`
      );
    }

    // Guard: order must not already be reversed
    const orderCustomFields = (order.customFields as Record<string, unknown>) || {};
    if (orderCustomFields.reversedAt) {
      throw new UserInputError(
        `Order ${order.code} has already been reversed. ` +
          `Cannot reverse individual payments on a reversed order.`
      );
    }

    // Post the reversal — reads everything from the ledger
    const reversedAmount = await this.financialService.reversePayment(ctx, paymentId.toString());

    if (reversedAmount === 0) {
      throw new UserInputError(`Payment ${paymentId} has already been reversed.`);
    }

    // Transition payment to Cancelled
    const cancelResult = await this.paymentService.transitionToState(ctx, paymentId, 'Cancelled');
    if (cancelResult && 'errorCode' in cancelResult) {
      this.logger.warn(
        `Payment ${paymentId} ledger reversed but Vendure state transition to Cancelled failed: ${cancelResult.message}`
      );
    }

    // Check if order is now underpaid
    const status = await this.financialService.getOrderPaymentStatus(ctx, order.id.toString());
    const orderNowUnderpaid = status.amountOwing > 0;

    // Audit
    if (this.auditService) {
      await this.auditService.log(ctx, 'payment.reversed', {
        entityType: 'Payment',
        entityId: paymentId.toString(),
        data: {
          orderId: order.id.toString(),
          orderCode: order.code,
          reversedAmount,
          orderNowUnderpaid,
        },
      });
    }

    this.logger.log(
      `Reversed payment ${paymentId} for order ${order.code}, amount: ${reversedAmount}`
    );

    return {
      paymentId: paymentId.toString(),
      reversedAmount,
      orderNowUnderpaid,
    };
  }
}
