import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  OrderLine,
  OrderService,
  Permission,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';

@Resolver()
export class FractionalQuantityResolver {
  constructor(
    private readonly orderService: OrderService,
    private readonly connection: TransactionalConnection
  ) {}

  @Mutation()
  @Allow(Permission.UpdateOrder)
  async updateOrderLineQuantity(
    @Ctx() ctx: RequestContext,
    @Args('orderLineId') orderLineId: string,
    @Args('quantity') quantity: number
  ) {
    if (this.hasInvalidFractionalQuantity(quantity)) {
      throw new UserInputError('Quantity can have at most 1 decimal place');
    }

    const orderLine = await this.connection.getRepository(ctx, OrderLine).findOne({
      where: { id: orderLineId },
      relations: ['order'],
    });

    if (!orderLine || !orderLine.order) {
      throw new UserInputError('Order line not found');
    }

    const orderId = orderLine.order.id;
    const result = await this.orderService.adjustOrderLine(
      ctx,
      orderId as string,
      orderLineId,
      quantity
    );

    if (result && typeof result === 'object' && 'errorCode' in result) {
      return result;
    }
    return result;
  }

  /**
   * Validates that quantity has at most 1 decimal place
   * Rejects: 0.55, 0.123, 1.234
   * Accepts: 0.5, 1.0, 2.3
   */
  private hasInvalidFractionalQuantity(quantity: number): boolean {
    const decimalPlaces = (quantity.toString().split('.')[1] || '').length;
    return decimalPlaces > 1;
  }
}
