import { Injectable } from '@nestjs/common';
import {
  Order,
  OrderService,
  PaymentService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
  isGraphQlErrorResult,
} from '@vendure/core';
import { AR_OWING_ORDER_STATES } from '../../constants/order-states.constants';
import { FinancialService } from '../financial/financial.service';
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
   * Currently supports the 'ledger' strategy: settle authorized payments and advance
   * to PaymentSettled when the ledger shows the order is fully paid. No backward
   * transitions are performed; fulfilled/shipped/delivered orders keep their state.
   */
  async reconcileOrder(
    ctx: RequestContext,
    input: { orderId: string; strategy: string; note?: string }
  ): Promise<Order> {
    const strategy = input.strategy?.toLowerCase();
    const note = input.note?.trim() || '';

    return this.connection.withTransaction(ctx, async txCtx => {
      const order = await this.orderService.findOne(txCtx, input.orderId, ['payments', 'customer']);
      if (!order) {
        throw new UserInputError(`Order ${input.orderId} not found`);
      }

      if (strategy === 'ledger') {
        const status = await this.financialService.getOrderPaymentStatus(
          txCtx,
          order.id.toString()
        );
        const canAdvanceToPaymentSettled =
          status.amountOwing <= 0 &&
          (order.state === 'ArrangingPayment' || order.state === 'PaymentAuthorized');

        if (canAdvanceToPaymentSettled) {
          for (const payment of order.payments || []) {
            if (payment.state === 'Authorized') {
              const settleResult = await this.paymentService.settlePayment(txCtx, payment.id);
              if (isGraphQlErrorResult(settleResult)) {
                throw new UserInputError(
                  `Failed to settle payment ${payment.id}: ` +
                    `${settleResult.message || settleResult.errorCode || 'Unknown error'}`
                );
              }
            }
          }

          const transitionResult = await this.orderService.transitionToState(
            txCtx,
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
