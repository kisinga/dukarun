import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  RequestContext,
  TransactionalConnection,
  UserInputError,
  Order,
  OrderService,
  PaymentService,
  ID,
} from '@vendure/core';
import { In } from 'typeorm';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { FinancialService } from '../financial/financial.service';
import { CreditService } from '../credit/credit.service';
import { PAYMENT_METHOD_CODES } from './payment-method-codes.constants';
import {
  PaymentAllocationItem,
  calculatePaymentAllocation,
  calculateRemainingBalance,
} from './payment-allocation-base.types';

export interface PaymentAllocationInput {
  customerId: string;
  paymentAmount: number; // In base currency units (will be converted to cents)
  orderIds?: string[]; // Optional - if not provided, auto-select oldest
}

export interface PaymentAllocationResult {
  ordersPaid: Array<{
    orderId: string;
    orderCode: string;
    amountPaid: number; // In base currency units
  }>;
  remainingBalance: number; // In base currency units
  totalAllocated: number; // In base currency units
  excessPayment: number; // In base currency units - amount paid beyond what's owed
}

@Injectable()
export class PaymentAllocationService {
  private readonly logger = new Logger('PaymentAllocationService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly financialService: FinancialService,
    private readonly creditService: CreditService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Get unpaid orders for a customer (oldest first)
   */
  async getUnpaidOrdersForCustomer(ctx: RequestContext, customerId: string): Promise<Order[]> {
    const orderRepo = this.connection.getRepository(ctx, Order);

    const orders = await orderRepo.find({
      where: {
        customer: { id: customerId },
        state: In(['ArrangingPayment', 'Fulfilled', 'PartiallyFulfilled']),
      },
      relations: ['payments'],
      order: {
        createdAt: 'ASC', // Oldest first
      },
    });

    // Filter to only orders that are not fully paid
    return orders.filter(order => {
      const settledPayments = (order.payments || [])
        .filter(p => p.state === 'Settled')
        .reduce((sum, p) => sum + p.amount, 0);
      // Use totalWithTax for tax-inclusive pricing
      const orderTotal = order.totalWithTax || order.total;
      return orderTotal > settledPayments;
    });
  }

  /**
   * Allocate payment amount across orders (oldest first by default)
   */
  async allocatePaymentToOrders(
    ctx: RequestContext,
    input: PaymentAllocationInput
  ): Promise<PaymentAllocationResult> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        // 1. Get unpaid orders
        let unpaidOrders = await this.getUnpaidOrdersForCustomer(transactionCtx, input.customerId);

        // 2. Filter to selected orders if provided
        if (input.orderIds && input.orderIds.length > 0) {
          unpaidOrders = unpaidOrders.filter(order =>
            input.orderIds!.includes(order.id.toString())
          );
        }

        if (unpaidOrders.length === 0) {
          throw new UserInputError('No unpaid orders found for this customer.');
        }

        // 3. Convert payment amount from base currency to cents for internal calculations
        const paymentAmountInCents = Math.round(input.paymentAmount * 100);

        // 4. Convert orders to PaymentAllocationItem format
        const allocationItems: PaymentAllocationItem[] = unpaidOrders.map(order => {
          const settledPayments = (order.payments || [])
            .filter(p => p.state === 'Settled')
            .reduce((sum, p) => sum + p.amount, 0);
          // Use totalWithTax for tax-inclusive pricing
          const orderTotal = order.totalWithTax || order.total;
          return {
            id: order.id.toString(),
            code: order.code,
            totalAmount: orderTotal,
            paidAmount: settledPayments,
            createdAt: order.createdAt,
          };
        });

        // 5. Calculate allocation using shared utility
        const calculation = calculatePaymentAllocation({
          itemsToPay: allocationItems,
          paymentAmount: paymentAmountInCents,
          selectedItemIds: input.orderIds,
        });

        // 6. Apply allocations to orders
        const ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }> = [];

        for (const allocation of calculation.allocations) {
          const order = unpaidOrders.find(o => o.id.toString() === allocation.itemId);
          if (!order) {
            continue;
          }

          const amountToAllocate = allocation.amountToAllocate;

          // Add payment to order using OrderService.addManualPaymentToOrder
          const paymentResult = await this.orderService.addManualPaymentToOrder(transactionCtx, {
            orderId: order.id,
            method: PAYMENT_METHOD_CODES.CREDIT,
            metadata: {
              paymentType: 'credit',
              customerId: input.customerId,
              allocatedAmount: amountToAllocate,
            },
          });

          if (paymentResult && 'errorCode' in paymentResult) {
            throw new UserInputError(
              `Failed to add payment: ${paymentResult.message || paymentResult.errorCode}`
            );
          }

          // Get the payment from the order to settle it
          const updatedOrder = await this.orderService.findOne(transactionCtx, order.id);
          if (updatedOrder && updatedOrder.payments) {
            const payment = updatedOrder.payments.find(
              p =>
                p.metadata?.paymentType === 'credit' &&
                p.metadata?.allocatedAmount === amountToAllocate &&
                p.state !== 'Settled'
            );
            if (payment) {
              await this.paymentService.settlePayment(transactionCtx, payment.id);
              // Post to ledger via FinancialService (single source of truth)
              await this.financialService.recordPaymentAllocation(
                transactionCtx,
                payment.id.toString(),
                updatedOrder,
                PAYMENT_METHOD_CODES.CREDIT,
                amountToAllocate
              );
            }
          }

          // Update order custom fields for user tracking
          await this.updateOrderCustomFields(transactionCtx, order.id, {
            lastModifiedByUserId: transactionCtx.activeUserId || undefined,
          });

          ordersPaid.push({
            orderId: order.id.toString(),
            orderCode: order.code,
            amountPaid: amountToAllocate / 100, // Convert back to base currency
          });
        }

        // 7. Calculate remaining balance
        const remainingUnpaidOrders = await this.getUnpaidOrdersForCustomer(
          transactionCtx,
          input.customerId
        );
        const remainingItems: PaymentAllocationItem[] = remainingUnpaidOrders.map(order => {
          const settledPayments = (order.payments || [])
            .filter(p => p.state === 'Settled')
            .reduce((sum, p) => sum + p.amount, 0);
          // Use totalWithTax for tax-inclusive pricing
          const orderTotal = order.totalWithTax || order.total;
          return {
            id: order.id.toString(),
            code: order.code,
            totalAmount: orderTotal,
            paidAmount: settledPayments,
            createdAt: order.createdAt,
          };
        });
        const remainingBalanceInCents = calculateRemainingBalance(remainingItems);

        // 8. Convert to base currency units
        const totalAllocated = calculation.totalAllocated / 100;
        const excessPayment = calculation.excessPayment / 100;
        const remainingBalance = remainingBalanceInCents / 100;

        // 9. Record repayment tracking if any payment was made
        if (calculation.totalAllocated > 0) {
          await this.creditService.releaseCreditCharge(
            transactionCtx,
            input.customerId,
            totalAllocated // Amount in base currency units (shillings)
          );
        }

        // 10. Log audit event
        if (this.auditService) {
          await this.auditService.log(transactionCtx, 'credit.payment.allocated', {
            entityType: 'Customer',
            entityId: input.customerId,
            data: {
              paymentAmount: input.paymentAmount,
              totalAllocated,
              remainingBalance,
              excessPayment,
              ordersPaid: ordersPaid.map(o => ({
                orderId: o.orderId,
                orderCode: o.orderCode,
                amountPaid: o.amountPaid,
              })),
              orderIds: input.orderIds || null,
            },
          });
        }

        this.logger.log(
          `Payment allocated: ${totalAllocated} across ${ordersPaid.length} orders for customer ${input.customerId}. ` +
            `Remaining balance: ${remainingBalance}, Excess payment: ${excessPayment}`
        );

        return {
          ordersPaid,
          remainingBalance,
          totalAllocated,
          excessPayment,
        };
      } catch (error) {
        this.logger.error(
          `Failed to allocate payment: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * Pay a single order (convenience method for individual order payments)
   */
  async paySingleOrder(
    ctx: RequestContext,
    orderId: string,
    paymentAmount?: number // In base currency units (shillings), optional - defaults to outstanding amount
  ): Promise<PaymentAllocationResult> {
    // Get the order to find the customer
    const order = await this.orderService.findOne(ctx, orderId, ['customer']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    if (!order.customer) {
      throw new UserInputError(`Order ${orderId} has no customer associated`);
    }

    // Calculate outstanding amount for this order
    const settledPayments = (order.payments || [])
      .filter(p => p.state === 'Settled')
      .reduce((sum, p) => sum + p.amount, 0);

    // Use totalWithTax for tax-inclusive pricing
    const orderTotal = order.totalWithTax || order.total;
    const outstandingAmount = orderTotal - settledPayments;
    const outstandingAmountInShillings = outstandingAmount / 100;

    // Use the outstanding amount as payment amount if not specified, or validate payment amount
    const actualPaymentAmount = paymentAmount ?? outstandingAmountInShillings;

    if (actualPaymentAmount > outstandingAmountInShillings) {
      throw new UserInputError(
        `Payment amount (${actualPaymentAmount}) cannot exceed outstanding amount (${outstandingAmountInShillings})`
      );
    }

    // Use the existing bulk payment method with single order
    return this.allocatePaymentToOrders(ctx, {
      customerId: order.customer.id.toString(),
      paymentAmount: actualPaymentAmount,
      orderIds: [orderId],
    });
  }

  /**
   * Update order custom fields for user tracking
   */
  private async updateOrderCustomFields(
    ctx: RequestContext,
    orderId: ID,
    fields: { lastModifiedByUserId?: ID }
  ): Promise<void> {
    try {
      const orderRepo = this.connection.getRepository(ctx, Order);
      const order = await orderRepo.findOne({
        where: { id: orderId },
        select: ['id', 'customFields'],
      });
      if (order) {
        const customFields = (order.customFields as any) || {};
        await orderRepo.update({ id: orderId }, { customFields: { ...customFields, ...fields } });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update order custom fields for order ${orderId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
