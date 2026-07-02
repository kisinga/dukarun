import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Order } from '@vendure/core';
import { AuditLog as AuditLogDecorator } from '../../infrastructure/audit/audit-log.decorator';
import { AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';
import { FinancialService } from '../../services/financial/financial.service';
import {
  PaymentAllocationService,
  PaymentAllocationInput,
  PaymentAllocationResult,
  RecordPaymentInput,
  SettleOrderPaymentsInput,
  SettleOrderPaymentsResult,
  CashierPendingOrder,
} from '../../services/payments/payment-allocation.service';
import { SettleOrderPermission } from './permissions';

interface PaySingleOrderInput {
  orderId: string;
  paymentAmount?: number;
  paymentMethodCode?: string;
  referenceNumber?: string;
  debitAccountCode?: string;
}

@Resolver()
export class PaymentAllocationResolver {
  constructor(
    private readonly paymentAllocationService: PaymentAllocationService,
    private readonly financialService: FinancialService
  ) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async orderPaymentStatus(
    @Ctx() ctx: RequestContext,
    @Args('orderId') orderId: string
  ): Promise<{ totalOwed: number; amountPaid: number; amountOwing: number }> {
    return this.financialService.getOrderPaymentStatus(ctx, orderId);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async unpaidOrdersForCustomer(
    @Ctx() ctx: RequestContext,
    @Args('customerId') customerId: string
  ): Promise<Order[]> {
    return this.paymentAllocationService.getUnpaidOrdersForCustomer(ctx, customerId);
  }

  @Query()
  @Allow(SettleOrderPermission.Permission)
  async pendingCashierOrders(@Ctx() ctx: RequestContext): Promise<CashierPendingOrder[]> {
    return this.paymentAllocationService.getPendingCashierOrders(ctx);
  }

  @Mutation()
  @Allow(SettleOrderPermission.Permission)
  async settleOrderPayments(
    @Ctx() ctx: RequestContext,
    @Args('input') input: SettleOrderPaymentsInput
  ): Promise<SettleOrderPaymentsResult> {
    // Audit is emitted by the service as 'order.cashier.settled' with per-tender detail.
    return this.paymentAllocationService.settleOrderPayments(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateOrder)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.PAYMENT_ALLOCATED,
    extractEntityId: (_result, args) =>
      (args.input as RecordPaymentInput).orderId ??
      (args.input as RecordPaymentInput).customerId ??
      null,
  })
  async recordPayment(
    @Ctx() ctx: RequestContext,
    @Args('input') input: RecordPaymentInput
  ): Promise<PaymentAllocationResult> {
    return this.paymentAllocationService.recordPayment(ctx, input);
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
