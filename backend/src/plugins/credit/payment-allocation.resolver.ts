import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Order } from '@vendure/core';
import { AuditLog as AuditLogDecorator } from '../../infrastructure/audit/audit-log.decorator';
import { AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';
import {
  PaymentAllocationService,
  PaymentAllocationInput,
  PaymentAllocationResult,
} from '../../services/payments/payment-allocation.service';

interface PaySingleOrderInput {
  orderId: string;
  paymentAmount?: number;
  paymentMethodCode?: string;
  referenceNumber?: string;
  debitAccountCode?: string;
}

@Resolver()
export class PaymentAllocationResolver {
  constructor(private readonly paymentAllocationService: PaymentAllocationService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async unpaidOrdersForCustomer(
    @Ctx() ctx: RequestContext,
    @Args('customerId') customerId: string
  ): Promise<Order[]> {
    return this.paymentAllocationService.getUnpaidOrdersForCustomer(ctx, customerId);
  }

  @Mutation()
  @Allow(Permission.UpdateOrder)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.PAYMENT_ALLOCATED,
    extractEntityId: (_result, args) => args.input?.customerId ?? null,
  })
  async allocateBulkPayment(
    @Ctx() ctx: RequestContext,
    @Args('input') input: PaymentAllocationInput
  ): Promise<PaymentAllocationResult> {
    return this.paymentAllocationService.allocatePaymentToOrders(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateOrder)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.PAYMENT_SINGLE_ORDER,
    entityType: 'Order',
    extractEntityId: (_result, args) => args.input?.orderId ?? null,
  })
  async paySingleOrder(
    @Ctx() ctx: RequestContext,
    @Args('input') input: PaySingleOrderInput
  ): Promise<PaymentAllocationResult> {
    return this.paymentAllocationService.paySingleOrder(
      ctx,
      input.orderId,
      input.paymentAmount,
      input.paymentMethodCode,
      input.referenceNumber,
      input.debitAccountCode
    );
  }
}
