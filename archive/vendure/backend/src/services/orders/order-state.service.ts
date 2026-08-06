import { Injectable, Logger } from '@nestjs/common';
import {
  EntityHydrator,
  ID,
  Order,
  OrderService,
  RequestContext,
  UserInputError,
} from '@vendure/core';

/**
 * Order State Service
 *
 * Handles order state transitions and ensures proper hydration.
 * Separated for single responsibility and testability.
 */
@Injectable()
export class OrderStateService {
  private readonly logger = new Logger('OrderStateService');

  constructor(
    private readonly orderService: OrderService,
    private readonly entityHydrator: EntityHydrator
  ) {}

  /**
   * Transition order to a new state with proper hydration
   */
  async transitionToState(ctx: RequestContext, orderId: ID, state: string): Promise<Order> {
    await this.orderService.transitionToState(ctx, orderId, state as any);

    // Reload order with all necessary relations for tax calculation
    const order = await this.orderService.findOne(ctx, orderId, [
      'lines',
      'lines.productVariant',
      'surcharges',
      'shippingLines',
    ]);

    if (!order) {
      throw new UserInputError(`Failed to retrieve order after transitioning to ${state}`);
    }

    // Ensure order is fully hydrated for tax calculation
    await this.entityHydrator.hydrate(ctx, order, {
      relations: ['lines', 'surcharges', 'shippingLines'],
    });

    return order;
  }

  /**
   * Refresh order with all relations for tax calculation
   */
  async refreshOrder(ctx: RequestContext, orderId: ID): Promise<Order> {
    const order = await this.orderService.findOne(ctx, orderId, [
      'lines',
      'lines.productVariant',
      'surcharges',
      'shippingLines',
    ]);

    if (!order) {
      throw new UserInputError('Order not found');
    }

    await this.entityHydrator.hydrate(ctx, order, {
      relations: ['lines', 'surcharges', 'shippingLines'],
    });

    return order;
  }
}
