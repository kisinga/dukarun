import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  Customer,
  Permission,
  RequestContext,
  Order,
  TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { addDays, diffCalendarDays } from '../../utils/date.utils';
import { PAYABLE_ORDER_STATES } from '../../constants/order-states.constants';
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
import { OrderReconciliationService } from '../../services/payments/order-reconciliation.service';
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
    private readonly financialService: FinancialService,
    private readonly orderReconciliationService: OrderReconciliationService,
    private readonly connection: TransactionalConnection
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
  @Allow(Permission.ReadOrder)
  async overdueOrders(
    @Ctx() ctx: RequestContext,
    @Args('options') options?: { take?: number; skip?: number; sort?: any }
  ): Promise<{ items: Order[]; totalItems: number }> {
    const orderRepo = this.connection.getRepository(ctx, Order);

    const orders = await orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .where('order.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('order.state IN (:...states)', { states: PAYABLE_ORDER_STATES })
      .getMany();

    const dueCandidates = orders.filter(order => {
      const dueDate = this.computeDueDate(order);
      return dueDate && diffCalendarDays(new Date(), dueDate) > 0;
    });

    const statuses = await this.financialService.getOrderPaymentStatuses(
      ctx,
      dueCandidates.map(o => o.id.toString())
    );

    const overdue = dueCandidates.filter(
      order => (statuses.get(order.id.toString())?.amountOwing ?? 0) > 0
    );

    // Apply caller sort, default to most recently placed first.
    const sort = options?.sort;
    if (sort?.orderPlacedAt) {
      overdue.sort((a, b) =>
        sort.orderPlacedAt === 'ASC'
          ? (a.orderPlacedAt?.getTime() ?? 0) - (b.orderPlacedAt?.getTime() ?? 0)
          : (b.orderPlacedAt?.getTime() ?? 0) - (a.orderPlacedAt?.getTime() ?? 0)
      );
    } else {
      overdue.sort((a, b) => (b.orderPlacedAt?.getTime() ?? 0) - (a.orderPlacedAt?.getTime() ?? 0));
    }

    const skip = options?.skip ?? 0;
    const take = options?.take ?? 100;
    const items = overdue.slice(skip, skip + take);
    return { items, totalItems: overdue.length };
  }

  private computeDueDate(order: Order): Date | null {
    const customer = order.customer as Customer | undefined;
    if (!customer) return null;
    const anchorDate = order.orderPlacedAt || order.createdAt;
    if (!anchorDate) return null;
    const customFields = (customer.customFields || {}) as { creditDuration?: number };
    const duration = Number(customFields.creditDuration ?? 30);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return addDays(new Date(anchorDate), duration);
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

  @Query()
  @Allow(Permission.SuperAdmin)
  async divergentOrders(
    @Ctx() ctx: RequestContext,
    @Args('toleranceCents') toleranceCents?: number
  ) {
    return this.orderReconciliationService.findDivergentOrders(ctx, toleranceCents ?? 1);
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.ORDER_RECONCILED,
    extractEntityId: (_result, args) => args.orderId ?? null,
  })
  async rebuildOrderFromLedger(
    @Ctx() ctx: RequestContext,
    @Args('orderId') orderId: string,
    @Args('note', { nullable: true }) note?: string
  ) {
    const order = await this.orderReconciliationService.rebuildOrderFromLedger(ctx, orderId, note);
    return {
      orderId: order.id.toString(),
      success: true,
      message: `Order ${order.code} rebuilt from ledger.`,
    };
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.ORDER_RECONCILED,
    extractEntityId: (_result, args) => args.input?.orderId ?? null,
  })
  async reconcileOrder(
    @Ctx() ctx: RequestContext,
    @Args('input') input: { orderId: string; strategy: string; note?: string }
  ) {
    const order = await this.orderReconciliationService.reconcileOrder(ctx, input);

    return {
      orderId: order.id.toString(),
      success: true,
      message: `Order ${order.code} reconciled with strategy ${input.strategy}.`,
    };
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.ORDER_RECONCILED,
    extractEntityId: (_result, args) => args.orderId ?? null,
  })
  async repairCancelledOrder(
    @Ctx() ctx: RequestContext,
    @Args('orderId') orderId: string,
    @Args('note', { nullable: true }) note?: string
  ) {
    const order = await this.orderReconciliationService.repairCancelledOrder(ctx, orderId, note);

    return {
      orderId: order.id.toString(),
      success: true,
      message: `Order ${order.code} repaired: missing reversal posted.`,
    };
  }
}
