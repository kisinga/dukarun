import { Args, Mutation, ResolveField, Resolver, Root } from '@nestjs/graphql';
import { Allow, Ctx, Order, Permission, RequestContext } from '@vendure/core';
import { OrderMargin, OrderMarginService } from '../../services/orders/order-margin.service';
import { ReverseOrderPermission } from './permissions';

/**
 * Order Margin Resolver
 *
 * Adds the per-order margin field (revenue vs FIFO COGS) to the Order type and the
 * retrySkippedCogs mutation for orders whose COGS recording was skipped at sale time.
 */
@Resolver('Order')
export class OrderMarginResolver {
  constructor(private readonly orderMarginService: OrderMarginService) {}

  @ResolveField()
  @Allow(Permission.ReadOrder)
  async margin(@Root() order: Order, @Ctx() ctx: RequestContext): Promise<OrderMargin> {
    return this.orderMarginService.getOrderMargin(ctx, order.id);
  }

  @Mutation()
  @Allow(ReverseOrderPermission.Permission)
  async retrySkippedCogs(
    @Ctx() ctx: RequestContext,
    @Args('orderId') orderId: string
  ): Promise<OrderMargin> {
    return this.orderMarginService.retrySkippedCogs(ctx, orderId);
  }
}
