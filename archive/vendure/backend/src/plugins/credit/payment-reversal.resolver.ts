import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import {
  PaymentReversalResult,
  PaymentReversalService,
} from '../../services/payments/payment-reversal.service';
import { ReverseOrderPermission } from './permissions';

@Resolver()
export class PaymentReversalResolver {
  constructor(private readonly paymentReversalService: PaymentReversalService) {}

  @Mutation()
  @Allow(ReverseOrderPermission.Permission)
  async reversePayment(
    @Ctx() ctx: RequestContext,
    @Args('paymentId') paymentId: string
  ): Promise<PaymentReversalResult> {
    return this.paymentReversalService.reversePayment(ctx, paymentId);
  }
}
