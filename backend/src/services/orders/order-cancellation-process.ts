import { Injectable, Logger } from '@nestjs/common';
import { configureDefaultOrderProcess } from '@vendure/core';
import type { Injector } from '@vendure/core/dist/common/injector';
import { OrderReversalService } from './order-reversal.service';

type OrderProcessType = ReturnType<typeof configureDefaultOrderProcess>;
type OrderStateType = Parameters<NonNullable<OrderProcessType['onTransitionStart']>>[1];
type OrderTransitionDataType = Parameters<NonNullable<OrderProcessType['onTransitionStart']>>[2];

/**
 * Order cancellation process hook.
 *
 * Enforces the invariant: order.state === 'Cancelled' ⟺ ledger AR(order) === 0.
 * When any caller transitions an order to Cancelled, this hook posts the reversal
 * entry, cancels payments, and restores inventory before the state change commits.
 */
@Injectable()
export class OrderCancellationProcess implements OrderProcessType {
  private readonly logger = new Logger(OrderCancellationProcess.name);
  private orderReversalService?: OrderReversalService;

  init(injector: Injector): void {
    this.orderReversalService = injector.get(OrderReversalService);
  }

  async onTransitionStart(
    _fromState: OrderStateType,
    toState: OrderStateType,
    data: OrderTransitionDataType
  ): Promise<string | void> {
    if (toState !== 'Cancelled') {
      return;
    }

    if (!this.orderReversalService) {
      this.logger.error('OrderReversalService not initialized in OrderCancellationProcess');
      return 'Cancellation hook is not ready';
    }

    const orderId = data.order.id.toString();
    try {
      const result = await this.orderReversalService.cancelOrder(data.ctx, orderId);
      // Vendure will persist data.order after this hook. Keep its in-memory customFields
      // in sync so the reversal timestamp written by cancelOrder is not overwritten.
      data.order.customFields = (result.order.customFields as Record<string, unknown>) || {};
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Order ${orderId} cancellation blocked: ${message}`);
      return `Cancellation failed: ${message}`;
    }
  }
}
