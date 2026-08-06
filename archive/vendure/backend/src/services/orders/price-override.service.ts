import { Injectable } from '@nestjs/common';
import { OrderLine, RequestContext, TransactionalConnection } from '@vendure/core';

export interface SetOrderLineCustomPriceInput {
  orderLineId: string;
  customLinePrice: number;
  reason?: string;
}

@Injectable()
export class PriceOverrideService {
  constructor(private connection: TransactionalConnection) {}

  async setOrderLineCustomPrice(
    ctx: RequestContext,
    input: SetOrderLineCustomPriceInput
  ): Promise<OrderLine | null> {
    const { orderLineId, customLinePrice, reason } = input;

    // Validate custom price (must be positive)
    if (customLinePrice <= 0) {
      throw new Error('Custom price must be greater than 0');
    }

    // Get the order line
    const orderLine = await this.connection.getRepository(ctx, OrderLine).findOne({
      where: { id: orderLineId },
      relations: ['order'],
    });

    if (!orderLine) {
      throw new Error('Order line not found');
    }

    // Update with line price (total, not per-item)
    orderLine.customFields = {
      ...orderLine.customFields,
      customLinePrice, // Line price in cents
      priceOverrideReason: reason || null,
    };

    return await this.connection.getRepository(ctx, OrderLine).save(orderLine);
  }
}
