import { Injectable, Logger } from '@nestjs/common';
import { ID, Order, OrderService, RequestContext, UserInputError } from '@vendure/core';
import { PriceOverrideService } from './price-override.service';
import { CartItemInput } from './order-creation.service';

/**
 * Order Item Service
 *
 * Handles adding items to orders and applying custom pricing.
 * Separated for single responsibility and testability.
 *
 * Applying a custom line price must trigger Vendure's price recalculation (e.g. via
 * adjustOrderLine) so line and order totals stay in sync.
 */
@Injectable()
export class OrderItemService {
  private readonly logger = new Logger('OrderItemService');

  constructor(
    private readonly orderService: OrderService,
    private readonly priceOverrideService: PriceOverrideService
  ) {}

  /**
   * Add items to an order with optional custom pricing
   */
  async addItems(ctx: RequestContext, orderId: ID, items: CartItemInput[]): Promise<void> {
    for (const item of items) {
      // Add item to order
      const addItemResult = await this.orderService.addItemToOrder(
        ctx,
        orderId,
        item.variantId,
        item.quantity
      );

      // Handle errors
      if ('errorCode' in addItemResult) {
        const error = addItemResult as any;
        throw new UserInputError(
          `Failed to add item: ${error.message || error.errorCode || 'Unknown error'}`
        );
      }

      // Apply custom price if provided
      if (item.customLinePrice && item.customLinePrice > 0) {
        await this.applyCustomPrice(ctx, orderId, item);
      }
    }
  }

  /**
   * Apply custom price to an order line.
   * Persist customFields then trigger recalculation so the strategy runs with updated customLinePrice.
   */
  private async applyCustomPrice(
    ctx: RequestContext,
    orderId: ID,
    item: CartItemInput
  ): Promise<void> {
    // Get updated order to find the order line
    const order = await this.orderService.findOne(ctx, orderId);
    if (!order) {
      throw new UserInputError('Failed to retrieve order after adding item');
    }

    const orderLine = order.lines?.find(line => line.productVariant?.id === item.variantId);

    if (orderLine) {
      await this.priceOverrideService.setOrderLineCustomPrice(ctx, {
        orderLineId: orderLine.id.toString(),
        customLinePrice: item.customLinePrice!,
        reason: item.priceOverrideReason,
      });

      // Trigger Vendure price recalculation so OrderItemPriceCalculationStrategy runs
      // with updated customFields and line/order totals are updated.
      const adjustResult = await this.orderService.adjustOrderLine(
        ctx,
        orderId as string,
        orderLine.id.toString(),
        item.quantity
      );
      if (adjustResult && typeof adjustResult === 'object' && 'errorCode' in adjustResult) {
        const error = adjustResult as { errorCode: string; message?: string };
        throw new UserInputError(
          `Failed to apply custom price: ${error.message || error.errorCode || 'Unknown error'}`
        );
      }
    }
  }
}
