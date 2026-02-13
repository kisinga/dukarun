import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import {
  OrderReversalService,
  OrderReversalResult,
} from '../../services/orders/order-reversal.service';
import { ReverseOrderPermission } from './permissions';

@Resolver()
export class OrderReversalResolver {
  constructor(private readonly orderReversalService: OrderReversalService) {}

  @Mutation()
  @Allow(ReverseOrderPermission.Permission)
  async reverseOrder(
    @Ctx() ctx: RequestContext,
    @Args('orderId') orderId: string
  ): Promise<OrderReversalResult> {
    return this.orderReversalService.reverseOrder(ctx, orderId);
  }
}
