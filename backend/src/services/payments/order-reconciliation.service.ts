import { Injectable } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import {
  Order,
  Payment,
  PaymentMetadata,
  OrderService,
  PaymentService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
  isGraphQlErrorResult,
} from '@vendure/core';
import { AR_OWING_ORDER_STATES } from '../../constants/order-states.constants';
import { FinancialService } from '../financial/financial.service';
import { LedgerPostingService } from '../financial/ledger-posting.service';
import { OrderReversalService } from '../../services/orders/order-reversal.service';
import { LedgerConsistencyGuard, OrderArProjection } from '../financial/ledger-projection';

export interface OrderReconciliationItem {
  orderId: string;
  orderCode: string;
  customerId?: string;
  orderModelOwing: number;
  ledgerOwing: number;
  difference: number;
  orderTotal: number;
  orderModelPaid: number;
  ledgerPaid: number;
  orderModelTotal: number;
  ledgerTotalOwed: number;
}

export interface OrderReconciliationResult {
  items: OrderReconciliationItem[];
  totalItems: number;
}

/**
 * Order Reconciliation Service
 *
 * Finds orders where the order-model outstanding balance has drifted from the ledger.
 * This is a diagnostic tool for superadmins; it does not auto-repair.
 */
@Injectable()
export class OrderReconciliationService {
  constructor(
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly ledgerConsistencyGuard: LedgerConsistencyGuard,
    private readonly orderArProjection: OrderArProjection,
    private readonly financialService: FinancialService,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly connection: TransactionalConnection,
    private readonly orderReversalService: OrderReversalService
  ) {}

  async findDivergentOrders(
    ctx: RequestContext,
    toleranceCents?: number
  ): Promise<OrderReconciliationResult> {
    const orders = await this.fetchAllReconcilableOrders(ctx);

    const divergences = await this.ledgerConsistencyGuard.findDivergences(
      ctx,
      this.orderArProjection,
      async () => orders,
      toleranceCents
    );

    const items: OrderReconciliationItem[] = divergences.map(d => ({
      orderId: d.entity.id.toString(),
      orderCode: d.entity.code,
      customerId: d.entity.customer?.id?.toString(),
      orderModelOwing: d.entitySnapshot.amountOwing,
      ledgerOwing: d.ledgerSnapshot.amountOwing,
      difference: d.difference,
      orderTotal: d.entity.totalWithTax || d.entity.total,
      orderModelPaid: d.entitySnapshot.amountPaid,
      ledgerPaid: d.ledgerSnapshot.amountPaid,
      orderModelTotal: d.entitySnapshot.totalOwed,
      ledgerTotalOwed: d.ledgerSnapshot.totalOwed,
    }));

    return {
      items,
      totalItems: items.length,
    };
  }

  /**
   * Rebuild an order's state from the ledger AR balance.
   *
   * This is a human-approved healing action for existing drift. It only changes
   * order state and reconciliation metadata; it never posts adjustment entries.
   */
  async rebuildOrderFromLedger(
    ctx: RequestContext,
    orderId: string,
    note?: string
  ): Promise<Order> {
    const order = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    const status = await this.financialService.getOrderPaymentStatus(ctx, orderId);

    // Legal reconciliation transitions: only move forward from pre-payment states to
    // PaymentSettled when the ledger shows the order is fully paid. Never rewind a
    // fulfilled/shipped/delivered order or move PaymentSettled back to ArrangingPayment;
    // those divergences must be handled by the dedicated reversal/voiding flows.
    const canAdvanceToPaymentSettled =
      status.amountOwing <= 0 &&
      (order.state === 'ArrangingPayment' || order.state === 'PaymentAuthorized');

    if (!canAdvanceToPaymentSettled) {
      if (order.state === 'PaymentSettled' && status.amountOwing > 0) {
        // The order claims to be paid but the ledger disagrees. This strategy cannot
        // rewind state; it must be repaired through the dedicated reversal/void flow.
        throw new UserInputError(
          `Order ${order.code} is PaymentSettled but ledger shows ${status.amountOwing} owing. ` +
            `Use the payment reversal or order void flow to repair this divergence.`
        );
      }
      // No legal/needed transition; return the order without claiming reconciliation.
      return order;
    }

    const result = await this.orderService.transitionToState(ctx, orderId, 'PaymentSettled' as any);
    if (isGraphQlErrorResult(result)) {
      throw new UserInputError(
        `Cannot transition order to PaymentSettled: ${result.message || result.errorCode || 'Unknown error'}`
      );
    }

    const customFields = (order.customFields as Record<string, unknown>) || {};
    const reconciliationNote = [
      `[${new Date().toISOString()}] ledger-rebuild`,
      note?.trim(),
      `ledgerAmountOwing=${status.amountOwing}`,
    ]
      .filter(Boolean)
      .join(' | ');

    const orderRepo = this.connection.getRepository(ctx, Order);
    await orderRepo.update(
      { id: order.id },
      {
        customFields: {
          ...customFields,
          reconciliationStrategy: 'ledger-rebuild',
          reconciliationNote,
          reconciledAt: new Date(),
        } as Record<string, unknown>,
      }
    );

    const reloaded = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!reloaded) {
      throw new UserInputError(`Order ${orderId} disappeared after rebuild`);
    }
    return reloaded;
  }

  /**
   * Reconcile an order with the ledger inside a single transaction.
   *
   * - 'ledger' (trust ledger): settle authorized payments, then add a synthetic settled
   *   Payment to the order for any amount the model owes but the ledger does not. This
   *   brings the order model in line with the ledger without double-posting. If the
   *   order is in a pre-payment state and the ledger shows it fully paid, advance to
   *   PaymentSettled.
   * - 'order' (trust order): post an order-scoped AR balance adjustment to bring the
   *   ledger in line with the order model.
   */
  async reconcileOrder(
    ctx: RequestContext,
    input: { orderId: string; strategy: string; note?: string }
  ): Promise<Order> {
    const strategy = input.strategy?.toLowerCase();
    const note = input.note?.trim() || '';

    return this.connection.withTransaction(ctx, async txCtx => {
      let order = await this.orderService.findOne(txCtx, input.orderId, ['payments', 'customer']);
      if (!order) {
        throw new UserInputError(`Order ${input.orderId} not found`);
      }

      if (strategy === 'ledger') {
        order = await this.applyLedgerTrustStrategy(txCtx, order, note);
      } else if (strategy === 'order') {
        await this.applyOrderTrustStrategy(txCtx, order, note);
      } else {
        throw new UserInputError(`Unsupported reconciliation strategy: ${input.strategy}`);
      }

      const customFields = (order.customFields as Record<string, unknown>) || {};
      const reconciliationNote = [`[${new Date().toISOString()}] ${strategy}`, note]
        .filter(Boolean)
        .join(' | ');

      const orderRepo = this.connection.getRepository(txCtx, Order);
      await orderRepo.update(
        { id: order.id },
        {
          customFields: {
            ...customFields,
            reconciliationStrategy: strategy,
            reconciliationNote,
            reconciledAt: new Date(),
          } as Record<string, unknown>,
        }
      );

      const reloaded = await this.orderService.findOne(txCtx, input.orderId, [
        'payments',
        'customer',
      ]);
      if (!reloaded) {
        throw new UserInputError(`Order ${input.orderId} disappeared after reconciliation`);
      }
      return reloaded;
    });
  }

  private async applyLedgerTrustStrategy(
    ctx: RequestContext,
    order: Order,
    note?: string
  ): Promise<Order> {
    order = await this.settleAuthorizedPayments(ctx, order);

    const status = await this.financialService.getOrderPaymentStatus(ctx, order.id.toString());
    const modelOwing = this.computeModelOwing(order);
    const diff = modelOwing - status.amountOwing;

    if (diff > 0) {
      await this.createReconciliationPayment(ctx, order, diff, note);
    } else if (diff < 0) {
      throw new UserInputError(
        `Ledger shows ${Math.abs(diff)} more owing than the order model. ` +
          `Use the 'order' strategy to adjust the ledger, or investigate manually.`
      );
    }

    const canAdvanceToPaymentSettled =
      status.amountOwing <= 0 &&
      (order.state === 'ArrangingPayment' || order.state === 'PaymentAuthorized');

    if (canAdvanceToPaymentSettled) {
      const transitionResult = await this.orderService.transitionToState(
        ctx,
        order.id.toString(),
        'PaymentSettled' as any
      );
      if (isGraphQlErrorResult(transitionResult)) {
        throw new UserInputError(
          `Cannot transition order to PaymentSettled: ` +
            `${transitionResult.message || transitionResult.errorCode || 'Unknown error'}`
        );
      }
    }

    return order;
  }

  private async applyOrderTrustStrategy(
    ctx: RequestContext,
    order: Order,
    note?: string
  ): Promise<void> {
    const status = await this.financialService.getOrderPaymentStatus(ctx, order.id.toString());
    const modelOwing = this.computeModelOwing(order);
    const diff = modelOwing - status.amountOwing;

    if (diff === 0) {
      return;
    }

    const direction = diff > 0 ? 'increase' : 'decrease';
    const amount = Math.abs(diff);
    const customerId = order.customer?.id?.toString();
    if (!customerId) {
      throw new UserInputError(
        `Order ${order.code} has no customer; cannot post balance adjustment`
      );
    }

    await this.ledgerPostingService.postBalanceAdjustment(ctx, `order-reconciliation-${order.id}`, {
      amount,
      direction,
      customerId,
      reason: note || `Order reconciliation: trust order (${direction} ${amount})`,
      orderId: order.id.toString(),
    } as any);
  }

  private async settleAuthorizedPayments(ctx: RequestContext, order: Order): Promise<Order> {
    for (const payment of order.payments || []) {
      if (payment.state === 'Authorized') {
        const settleResult = await this.paymentService.settlePayment(ctx, payment.id);
        if (isGraphQlErrorResult(settleResult)) {
          throw new UserInputError(
            `Failed to settle payment ${payment.id}: ` +
              `${settleResult.message || settleResult.errorCode || 'Unknown error'}`
          );
        }
      }
    }
    const reloaded = await this.orderService.findOne(ctx, order.id.toString(), [
      'payments',
      'customer',
    ]);
    if (!reloaded) {
      throw new UserInputError(`Order ${order.id} disappeared while settling payments`);
    }
    return reloaded;
  }

  private computeModelOwing(order: Order): number {
    const totalOwed = order.totalWithTax || order.total;
    const settledPayments = (order.payments || [])
      .filter(p => p.state === 'Settled')
      .reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, totalOwed - settledPayments);
  }

  private async createReconciliationPayment(
    ctx: RequestContext,
    order: Order,
    amount: number,
    note?: string
  ): Promise<Payment> {
    const paymentRepo = this.connection.getRepository(ctx, Payment);
    const payment = paymentRepo.create({
      amount,
      state: 'Settled',
      method: 'reconciliation',
      transactionId: `reconciliation-${order.id}-${Date.now()}`,
      metadata: {
        paymentType: 'reconciliation',
        orderId: order.id.toString(),
        orderCode: order.code,
        reason: note || 'Order reconciliation: trust ledger',
      } as PaymentMetadata,
      order,
    } as DeepPartial<Payment>);
    return paymentRepo.save(payment);
  }

  /**
   * Repair a Cancelled order whose ledger AR was never reversed.
   *
   * Idempotently posts the missing reversal, cancels payments, restores inventory,
   * and marks the order reversed without changing its state.
   */
  async repairCancelledOrder(ctx: RequestContext, orderId: string, note?: string): Promise<Order> {
    const order = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }
    if (order.state !== 'Cancelled') {
      throw new UserInputError(`Order ${order.code} is not cancelled`);
    }

    await this.orderReversalService.cancelOrder(ctx, orderId);

    const updatedOrder = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!updatedOrder) {
      throw new UserInputError(`Order ${orderId} disappeared after repair`);
    }

    const customFields = (updatedOrder.customFields as Record<string, unknown>) || {};
    const reconciliationNote = [
      `[${new Date().toISOString()}] repair-cancelled-order`,
      note?.trim(),
    ]
      .filter(Boolean)
      .join(' | ');

    const orderRepo = this.connection.getRepository(ctx, Order);
    await orderRepo.update(
      { id: updatedOrder.id },
      {
        customFields: {
          ...customFields,
          reconciliationStrategy: 'repair-cancelled-order',
          reconciliationNote,
          reconciledAt: new Date(),
        } as Record<string, unknown>,
      }
    );

    const reloaded = await this.orderService.findOne(ctx, orderId, ['payments', 'customer']);
    if (!reloaded) {
      throw new UserInputError(`Order ${orderId} disappeared after repair`);
    }
    return reloaded;
  }

  private async fetchAllReconcilableOrders(ctx: RequestContext): Promise<Order[]> {
    const all: Order[] = [];
    const take = 1000;
    let skip = 0;

    while (true) {
      const page = await this.orderService.findAll(
        ctx,
        {
          filter: {
            state: {
              in: [...AR_OWING_ORDER_STATES, 'Cancelled'],
            },
          },
          take,
          skip,
        },
        ['payments', 'customer']
      );

      all.push(...page.items);
      if (page.items.length < take) {
        break;
      }
      skip += take;
    }

    return all;
  }
}
