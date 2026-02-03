import { Injectable, Logger } from '@nestjs/common';
import { ID, Order, RequestContext, UserInputError } from '@vendure/core';
import { CreditService } from '../credit/credit.service';
import { OrderService } from '@vendure/core';

/**
 * Order Credit Validator Service
 *
 * Handles credit validation for orders.
 * Separated for single responsibility and testability.
 */
@Injectable()
export class OrderCreditValidatorService {
  private readonly logger = new Logger('OrderCreditValidatorService');

  constructor(
    private readonly creditService: CreditService,
    private readonly orderService: OrderService
  ) {}

  /**
   * Validate credit sale eligibility
   * Checks credit approval status
   */
  async validateCreditApproval(ctx: RequestContext, customerId: string): Promise<void> {
    const summary = await this.creditService.getCreditSummary(ctx, customerId);
    if (!summary.isCreditApproved) {
      throw new UserInputError('Customer is not approved for credit sales.');
    }
  }

  /**
   * Validate credit limit before order creation
   * Uses estimated total from cart items
   */
  async validateCreditLimitEstimate(
    ctx: RequestContext,
    customerId: string,
    estimatedTotal: number
  ): Promise<void> {
    const summary = await this.creditService.getCreditSummary(ctx, customerId);
    const availableCredit = summary.creditLimit - summary.outstandingAmount;

    if (estimatedTotal > availableCredit) {
      throw new UserInputError(
        `Credit limit exceeded. Available: ${availableCredit}, Required: ${estimatedTotal}`
      );
    }
  }

  /**
   * Validate credit limit with actual order total
   * This is the final validation after order is fully calculated
   * All amounts in smallest currency unit (cents)
   */
  async validateCreditLimitWithOrder(
    ctx: RequestContext,
    customerId: string,
    order: Order
  ): Promise<void> {
    const summary = await this.creditService.getCreditSummary(ctx, customerId);
    const availableCredit = summary.creditLimit - summary.outstandingAmount;
    const orderTotalInCents = order.totalWithTax || order.total;

    if (orderTotalInCents > availableCredit) {
      throw new UserInputError(
        `Credit limit exceeded. Available: ${availableCredit}, Required: ${orderTotalInCents}. ` +
          `Order would exceed credit limit by ${orderTotalInCents - availableCredit}.`
      );
    }

    this.logger.log(
      `Credit validation passed for customer ${customerId}: ` +
        `Available: ${availableCredit}, Order Total: ${orderTotalInCents}, ` +
        `Remaining: ${availableCredit - orderTotalInCents}`
    );
  }
}
