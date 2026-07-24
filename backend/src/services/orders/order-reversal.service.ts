import { Injectable, Logger } from '@nestjs/common';
import {
  ID,
  Order,
  OrderService,
  PaymentService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
  isGraphQlErrorResult,
} from '@vendure/core';
import { LedgerPostingService } from '../financial/ledger-posting.service';
import { LedgerConsistencyGuard, OrderArProjection } from '../financial/ledger-projection';
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
 * Provides the ledger-side bookkeeping for order cancellation:
 * - cancelOrder: idempotent, does not require the order to be in sync. Used by
 *   the OrderProcess cancellation hook so any path to Cancelled reverses AR.
 * - reverseOrder: human-initiated reversal that fails closed on divergence.
 * - voidOrder: thin wrapper around transitioning to Cancelled; the hook does the work.
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
    private readonly inventoryService: InventoryService,
    private readonly ledgerConsistencyGuard: LedgerConsistencyGuard,
    private readonly orderArProjection: OrderArProjection
  ) {}

  /**
   * Cancel-side reversal: cancel payments, post an idempotent reversal entry,
   * reverse inventory, and mark the order reversed.
   *
   * Does NOT assert ledger/model sync so it can repair divergent orders.
   * Safe to call multiple times (idempotent).
   */
  async cancelOrder(ctx: RequestContext, orderId: ID): Promise<OrderReversalResult> {
    const order = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    const customFields = (order.customFields as Record<string, unknown>) || {};
    if (customFields.reversedAt) {
      this.logger.debug(`Order ${order.code} is already reversed; skipping cancelOrder.`);
      return { order, hadPayments: false };
    }

    const hadPayments = (order.payments || []).some(p => p.state === 'Settled');

    for (const payment of order.payments || []) {
      if (payment.state === 'Settled' || payment.state === 'Authorized') {
        const result = await this.paymentService.transitionToState(ctx, payment.id, 'Cancelled');
        if (result && 'errorCode' in result) {
          throw new UserInputError(
            `Failed to cancel payment ${payment.id} for order ${order.code}: ${result.message}`
          );
        }
      }
    }

    try {
      await this.ledgerPostingService.postOrderReversal(ctx, order.id.toString(), {
        orderId: order.id.toString(),
        orderCode: order.code,
        customerId: order.customer?.id?.toString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('no ledger entries to reverse')) {
        this.logger.warn(`Order ${order.code} has no ledger footprint; skipping reversal entry.`);
      } else {
        throw err;
      }
    }

    await this.inventoryService.reverseSale(ctx, order.id.toString());

    const orderRepo = this.connection.getRepository(ctx, Order);
    await orderRepo.update(
      { id: orderId },
      {
        customFields: {
          ...customFields,
          reversedAt: new Date(),
          reversedByUserId: ctx.activeUserId ?? undefined,
          // COGS was reversed with the order; clear so the order isn't counted as COGS-recorded.
          cogsStatus: null,
        } as Record<string, unknown>,
      }
    );

    this.logger.log(
      `Cancelled order ${order.code} (reversal entry posted, order marked reversed).`
    );

    const updatedOrder = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    return {
      order: updatedOrder ?? order,
      hadPayments,
    };
  }

  /**
   * Reverse an order: post OrderReversal ledger entry and set order customFields (reversedAt, reversedByUserId).
   * Idempotent: if reversal entry already exists, returns current order.
   */
  async reverseOrder(ctx: RequestContext, orderId: ID): Promise<OrderReversalResult> {
    const order = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    const customFields = (order.customFields as Record<string, unknown>) || {};
    if (customFields.reversedAt) {
      this.logger.debug(`Order ${order.code} is already reversed; skipping reverseOrder.`);
      return { order, hadPayments: false };
    }

    const hadPayments = (order.payments || []).some(p => p.state === 'Settled');

    // Fail closed if the order model and ledger disagree. Reversing a divergent
    // order would make the drift harder to trace.
    await this.ledgerConsistencyGuard.assertInSync(ctx, this.orderArProjection, order);

    await this.ledgerPostingService.postOrderReversal(ctx, order.id.toString(), {
      orderId: order.id.toString(),
      orderCode: order.code,
      customerId: order.customer?.id?.toString(),
    });

    await this.inventoryService.reverseSale(ctx, order.id.toString());

    const orderRepo = this.connection.getRepository(ctx, Order);
    await orderRepo.update(
      { id: orderId },
      {
        customFields: {
          ...customFields,
          reversedAt: new Date(),
          reversedByUserId: ctx.activeUserId ?? undefined,
          // COGS was reversed with the order; clear so the order isn't counted as COGS-recorded.
          cogsStatus: null,
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
   * Void an order: transition to Cancelled.
   * The OrderProcess hook performs payment cancellation, ledger reversal, inventory restoration,
   * and marks the order reversed atomically with the state change.
   */
  async voidOrder(ctx: RequestContext, orderId: ID): Promise<OrderReversalResult> {
    const order = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    if (order.state === 'Cancelled') {
      throw new UserInputError(`Order ${order.code} is already cancelled.`);
    }

    const hadPayments = (order.payments || []).some(p => p.state === 'Settled');

    const result = await this.orderService.transitionToState(ctx, orderId, 'Cancelled' as any);
    if (isGraphQlErrorResult(result)) {
      throw new UserInputError(
        `Cannot void order ${order.code}: ${result.message || result.errorCode || 'Unknown error'}`
      );
    }

    const updatedOrder = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    return {
      order: updatedOrder ?? order,
      hadPayments,
    };
  }
}
