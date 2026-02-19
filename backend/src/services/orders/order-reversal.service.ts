import { Injectable, Logger } from '@nestjs/common';
import {
  ID,
  Order,
  OrderService,
  PaymentService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { LedgerPostingService } from '../financial/ledger-posting.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStateService } from './order-state.service';

export interface OrderReversalResult {
  order: Order;
  /** True if the order had settled payments (partially or fully paid) before reversal. Refund is not automatic. */
  hadPayments: boolean;
}

/**
 * Order Reversal Service
 *
 * Posts a single ledger entry dated at the reversal date that reverses the order's net effect
 * (CreditSale + PaymentAllocation for credit orders, or Payment entries for cash orders),
 * and marks the order as reversed via custom fields.
 * Inventory/quantity restoration is left to Vendure.
 */
@Injectable()
export class OrderReversalService {
  private readonly logger = new Logger(OrderReversalService.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly orderStateService: OrderStateService,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly connection: TransactionalConnection,
    private readonly inventoryService: InventoryService
  ) {}

  /**
   * Reverse an order: post OrderReversal ledger entry and set order customFields (reversedAt, reversedByUserId).
   * Idempotent: if reversal entry already exists, returns current order and hadPayments from order state.
   */
  async reverseOrder(ctx: RequestContext, orderId: ID): Promise<OrderReversalResult> {
    const order = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    const customFields = (order.customFields as Record<string, unknown>) || {};
    if (customFields.reversedAt) {
      throw new UserInputError(`Order ${order.code} is already reversed.`);
    }

    const settledPayments = (order.payments || [])
      .filter(p => p.state === 'Settled')
      .reduce((sum, p) => sum + p.amount, 0);
    const hadPayments = settledPayments > 0;

    const reversalDate = new Date().toISOString().slice(0, 10);
    await this.ledgerPostingService.postOrderReversal(ctx, order.id.toString(), {
      orderId: order.id.toString(),
      orderCode: order.code,
      customerId: order.customer?.id?.toString(),
      reversalDate,
    });

    try {
      await this.inventoryService.reverseSale(ctx, order.id.toString());
    } catch (err) {
      this.logger.warn(
        `Inventory reverseSale failed for order ${order.code}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const orderRepo = this.connection.getRepository(ctx, Order);
    const now = new Date();
    await orderRepo.update(
      { id: orderId },
      {
        customFields: {
          ...customFields,
          reversedAt: now,
          reversedByUserId: ctx.activeUserId ?? undefined,
        } as Record<string, unknown>,
      }
    );

    this.logger.log(`Reversed order ${order.code} (reversal entry posted, order marked reversed).`);

    const updatedOrder = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    return {
      order: updatedOrder ?? order,
      hadPayments,
    };
  }

  /**
   * Void an order: cancel payments (triggers credit repayment), run reversal (ledger + inventory),
   * then transition order to Cancelled. Composes reverseOrder().
   */
  async voidOrder(ctx: RequestContext, orderId: ID): Promise<OrderReversalResult> {
    const order = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    const customFields = (order.customFields as Record<string, unknown>) || {};
    if (customFields.reversedAt) {
      throw new UserInputError(`Order ${order.code} is already reversed.`);
    }
    if (order.state === 'Cancelled') {
      throw new UserInputError(`Order ${order.code} is already cancelled.`);
    }

    const paymentsToCancel = (order.payments || []).filter(
      p => p.state === 'Settled' || p.state === 'Authorized'
    );
    for (const payment of paymentsToCancel) {
      const result = await this.paymentService.transitionToState(ctx, payment.id, 'Cancelled');
      if (result && 'errorCode' in result) {
        this.logger.warn(
          `Failed to cancel payment ${payment.id} for order ${order.code}: ${result.message}`
        );
      }
    }

    const result = await this.reverseOrder(ctx, orderId);
    await this.orderStateService.transitionToState(ctx, orderId, 'Cancelled');

    const updatedOrder = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    return {
      order: updatedOrder ?? result.order,
      hadPayments: result.hadPayments,
    };
  }
}
