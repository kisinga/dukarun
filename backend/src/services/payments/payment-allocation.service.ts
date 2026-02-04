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
import { OpenSessionService } from '../financial/open-session.service';
import { ChartOfAccountsService } from '../financial/chart-of-accounts.service';
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
  paymentAmount: number; // In smallest currency unit (cents)
  orderIds?: string[]; // Optional - if not provided, auto-select oldest
  debitAccountCode?: string; // Optional - overrides method-based debit account
}

export interface PaymentAllocationResult {
  ordersPaid: Array<{
    orderId: string;
    orderCode: string;
    amountPaid: number; // In smallest currency unit (cents)
  }>;
  remainingBalance: number; // In smallest currency unit (cents)
  totalAllocated: number; // In smallest currency unit (cents)
  excessPayment: number; // In smallest currency unit (cents) - amount paid beyond what's owed
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
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly cashierSessionService: OpenSessionService,
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
    if (input.debitAccountCode?.trim()) {
      await this.chartOfAccountsService.validatePaymentSourceAccount(
        ctx,
        input.debitAccountCode.trim()
      );
    }
    const session = await this.cashierSessionService.requireOpenSession(
      ctx,
      ctx.channelId as number
    );
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

        // 3. Payment amount is already in cents
        const paymentAmountInCents = input.paymentAmount;

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

        // Track payment amounts allocated to each order for cache update
        const paymentAllocationsByOrderId = new Map<string, number>();

        for (const allocation of calculation.allocations) {
          const order = unpaidOrders.find(o => o.id.toString() === allocation.itemId);
          if (!order) {
            continue;
          }

          const amountToAllocate = allocation.amountToAllocate;
          paymentAllocationsByOrderId.set(allocation.itemId, amountToAllocate);

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
                amountToAllocate,
                input.debitAccountCode?.trim(),
                session.id
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
            amountPaid: amountToAllocate,
          });
        }

        // 7. Calculate remaining balance
        // Note: We need to re-fetch unpaid orders to get accurate remaining balance
        // because: (1) if orderIds was provided, we only processed selected orders,
        // so remaining balance should include all unpaid orders; (2) payments may have
        // been updated in the database, so we need fresh data
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
        const remainingBalance = calculateRemainingBalance(remainingItems);
        const totalAllocated = calculation.totalAllocated;
        const excessPayment = calculation.excessPayment;

        // 9. Record repayment tracking if any payment was made
        if (calculation.totalAllocated > 0) {
          await this.creditService.releaseCreditCharge(
            transactionCtx,
            input.customerId,
            totalAllocated // Amount in cents
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
    paymentAmount?: number, // In smallest currency unit (cents), optional - defaults to outstanding amount
    paymentMethodCode?: string, // Payment method code (optional, defaults to credit)
    referenceNumber?: string, // Payment reference number (optional)
    debitAccountCode?: string // Optional - overrides method-based debit account
  ): Promise<PaymentAllocationResult> {
    // Get the order to find the customer
    const order = await this.orderService.findOne(ctx, orderId, ['customer', 'payments']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }

    if (!order.customer) {
      throw new UserInputError(`Order ${orderId} has no customer associated`);
    }

    // Check if the order is in a state that allows payment
    if (!['ArrangingPayment', 'Fulfilled', 'PartiallyFulfilled'].includes(order.state)) {
      throw new UserInputError(
        `Order ${order.code} is in state "${order.state}" and cannot be paid. Only orders in "ArrangingPayment", "Fulfilled", or "PartiallyFulfilled" states can be paid.`
      );
    }

    // Calculate outstanding amount for this order
    const settledPayments = (order.payments || [])
      .filter(p => p.state === 'Settled')
      .reduce((sum, p) => sum + p.amount, 0);

    // Use totalWithTax for tax-inclusive pricing
    const orderTotal = order.totalWithTax || order.total;
    const outstandingAmount = orderTotal - settledPayments;

    if (outstandingAmount <= 0) {
      throw new UserInputError(`Order ${order.code} has no outstanding payment.`);
    }

    // Use the outstanding amount as payment amount if not specified, or validate payment amount
    const actualPaymentAmount = paymentAmount ?? outstandingAmount;

    if (actualPaymentAmount <= 0) {
      throw new UserInputError('Payment amount must be greater than zero.');
    }
    if (actualPaymentAmount > outstandingAmount) {
      throw new UserInputError(
        `Payment amount (${actualPaymentAmount}) cannot exceed outstanding amount (${outstandingAmount})`
      );
    }

    // Store customer ID before transaction (TypeScript safety)
    const customerId = order.customer.id.toString();

    // Use payment method code if provided, otherwise default to credit
    const actualPaymentMethodCode = paymentMethodCode || PAYMENT_METHOD_CODES.CREDIT;

    if (debitAccountCode?.trim()) {
      await this.chartOfAccountsService.validatePaymentSourceAccount(ctx, debitAccountCode.trim());
    }

    const session = await this.cashierSessionService.requireOpenSession(
      ctx,
      ctx.channelId as number
    );

    // Prepare metadata with reference number if provided
    const metadata: Record<string, any> = {
      paymentType: 'credit',
      customerId: customerId,
      allocatedAmount: actualPaymentAmount,
    };
    if (referenceNumber) {
      metadata.referenceNumber = referenceNumber;
    }

    // Use the existing bulk payment method with single order, but we need to pass payment method
    // Since allocatePaymentToOrders doesn't accept payment method, we'll handle it directly here
    return this.connection.withTransaction(ctx, async transactionCtx => {
      const paymentAmountInCents = actualPaymentAmount;

      // Add payment to order using OrderService.addManualPaymentToOrder
      const paymentResult = await this.orderService.addManualPaymentToOrder(transactionCtx, {
        orderId: order.id,
        method: actualPaymentMethodCode,
        metadata,
      });

      if (paymentResult && 'errorCode' in paymentResult) {
        throw new UserInputError(
          `Failed to add payment: ${paymentResult.message || paymentResult.errorCode}`
        );
      }

      // Use the order from the result if available, otherwise fetch it
      // The result should contain the order with payments
      let updatedOrder = paymentResult && 'id' in paymentResult ? paymentResult : null;

      // Always fetch fresh order with payments to ensure we have the latest state
      // The paymentResult might not have payments loaded
      updatedOrder =
        (await this.orderService.findOne(transactionCtx, order.id, ['payments'])) || null;

      if (!updatedOrder) {
        this.logger.error(`Order ${order.code} (${order.id}) not found after adding payment`);
        throw new UserInputError('Failed to retrieve order after payment creation');
      }

      if (!updatedOrder.payments) {
        this.logger.error(
          `Order ${order.code} (${order.id}) has no payments array after adding payment`
        );
        throw new UserInputError('Failed to retrieve payments after creation');
      }

      if (updatedOrder.payments.length === 0) {
        this.logger.error(
          `Order ${order.code} (${order.id}) has empty payments array after adding payment`
        );
        throw new UserInputError('No payments found after creation');
      }

      // Find the payment that was just added
      // Cash payments are created as "Settled" immediately, so we need to handle both settled and unsettled payments
      // Try multiple strategies to find the payment:
      // 1. Match by method, amount, and metadata (most specific) - allow settled for cash
      // 2. Match by method and amount (fallback) - allow settled for cash
      // 3. Match by method and most recent (last resort) - allow settled for cash
      let payment = updatedOrder.payments.find(
        p =>
          p.method === actualPaymentMethodCode &&
          p.amount === paymentAmountInCents &&
          p.metadata?.allocatedAmount === paymentAmountInCents
      );

      if (!payment) {
        // Fallback: match by method and amount (allow settled for cash payments)
        payment = updatedOrder.payments.find(
          p => p.method === actualPaymentMethodCode && p.amount === paymentAmountInCents
        );
      }

      if (!payment) {
        // Last resort: find most recent payment with matching method
        // Sort by createdAt descending and take the first match
        const matchingPayments = updatedOrder.payments
          .filter(p => p.method === actualPaymentMethodCode)
          .sort((a, b) => {
            const aTime = a.createdAt?.getTime() || 0;
            const bTime = b.createdAt?.getTime() || 0;
            return bTime - aTime; // Most recent first
          });
        payment = matchingPayments[0];
      }

      if (!payment) {
        this.logger.error(
          `Payment not found after creation. Order: ${order.code}, Method: ${actualPaymentMethodCode}, Amount: ${paymentAmountInCents}`
        );
        this.logger.error(
          `Available payments: ${JSON.stringify(
            updatedOrder.payments.map(p => ({
              id: p.id,
              method: p.method,
              amount: p.amount,
              state: p.state,
              metadata: p.metadata,
            }))
          )}`
        );
        throw new UserInputError('Payment not found after creation');
      }

      // Settle the payment only if it's not already settled
      // Cash payments are already settled when created
      if (payment.state !== 'Settled') {
        await this.paymentService.settlePayment(transactionCtx, payment.id);
      }

      // Post to ledger via FinancialService
      await this.financialService.recordPaymentAllocation(
        transactionCtx,
        payment.id.toString(),
        updatedOrder,
        actualPaymentMethodCode,
        paymentAmountInCents,
        debitAccountCode?.trim(),
        session.id
      );

      // Update order custom fields for user tracking
      await this.updateOrderCustomFields(transactionCtx, order.id, {
        lastModifiedByUserId: transactionCtx.activeUserId || undefined,
      });

      // Calculate remaining balance (optimized - fetch only if needed for other orders)
      // For single order payment, we can calculate from the updated order state
      // But we still need to check other unpaid orders for the customer
      const remainingUnpaidOrders = await this.getUnpaidOrdersForCustomer(
        transactionCtx,
        customerId
      );

      const remainingItems = remainingUnpaidOrders.map(o => {
        const settled = (o.payments || [])
          .filter(p => p.state === 'Settled')
          .reduce((sum, p) => sum + p.amount, 0);
        const total = o.totalWithTax || o.total;
        return {
          id: o.id.toString(),
          code: o.code,
          totalAmount: total,
          paidAmount: settled,
          createdAt: o.createdAt,
        };
      });

      const remainingBalance = calculateRemainingBalance(remainingItems);

      // Log audit event
      if (this.auditService) {
        await this.auditService.log(transactionCtx, 'credit.payment.allocated', {
          entityType: 'Customer',
          entityId: customerId,
          data: {
            paymentAmount: paymentAmountInCents,
            totalAllocated: paymentAmountInCents,
            remainingBalance,
            excessPayment: 0,
            ordersPaid: [
              {
                orderId: order.id.toString(),
                orderCode: order.code,
                amountPaid: paymentAmountInCents,
              },
            ],
            paymentMethodCode: actualPaymentMethodCode,
            referenceNumber: referenceNumber || null,
          },
        });
      }

      this.logger.log(
        `Single order payment allocated: ${paymentAmountInCents} for order ${order.code} (${orderId}) using method ${actualPaymentMethodCode}. Remaining balance: ${remainingBalance}`
      );

      return {
        ordersPaid: [
          {
            orderId: order.id.toString(),
            orderCode: order.code,
            amountPaid: paymentAmountInCents,
          },
        ],
        remainingBalance,
        totalAllocated: paymentAmountInCents,
        excessPayment: 0,
      };
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
