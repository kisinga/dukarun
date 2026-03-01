import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  RequestContext,
  TransactionalConnection,
  UserInputError,
  Order,
  OrderService,
  Payment,
  PaymentService,
  ID,
  idsAreEqual,
  isGraphQlErrorResult,
} from '@vendure/core';
import { In } from 'typeorm';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { OpenSessionService } from '../financial/open-session.service';
import { ChartOfAccountsService } from '../financial/chart-of-accounts.service';
import { FinancialService } from '../financial/financial.service';
import { CreditService } from '../credit/credit.service';
import { ChannelPaymentMethodService } from '../financial/channel-payment-method.service';
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
  paymentMethodCode?: string; // Optional - defaults to credit (resolved to channel PaymentMethod.code)
  referenceNumber?: string; // Optional - stored in payment metadata
  debitAccountCode?: string; // Optional - overrides method-based debit account
}

/**
 * Single unified input for recording a payment. When orderId is set, pays that order;
 * when omitted, allocates payment across customer's unpaid orders (bulk).
 */
export interface RecordPaymentInput {
  customerId: string;
  paymentAmount: number; // In smallest currency unit (cents)
  paymentMethodCode: string; // Channel PaymentMethod.code or handler (e.g. credit) - resolved to full code
  referenceNumber?: string;
  orderId?: string; // Optional - when set, pay this order only; when omitted, allocate across unpaid orders
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
    private readonly channelPaymentMethodService: ChannelPaymentMethodService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Resolve payment method code to channel's PaymentMethod.code so createPayment receives a valid code.
   * Accepts either full code (e.g. credit-1) or handler (e.g. credit); returns full code.
   */
  private async resolvePaymentMethodCode(ctx: RequestContext, methodCode: string): Promise<string> {
    const channelId = ctx.channelId as number;
    const methods = await this.channelPaymentMethodService.getChannelPaymentMethods(ctx, channelId);
    const trimmed = methodCode?.trim() || '';
    const fullMatch = methods.find(pm => pm.code === trimmed);
    if (fullMatch) return fullMatch.code;
    const handler = trimmed || PAYMENT_METHOD_CODES.CREDIT;
    const byHandler = methods.find(
      pm => pm.code === `${handler}-${channelId}` || pm.code.startsWith(handler + '-')
    );
    if (byHandler) return byHandler.code;
    throw new UserInputError(
      `Payment method not found for channel. Provide a valid payment method code (e.g. from channel payment methods).`
    );
  }

  /**
   * Single endpoint: record payment. When orderId is set, pays that order; when omitted, allocates across customer's unpaid orders.
   */
  async recordPayment(
    ctx: RequestContext,
    input: RecordPaymentInput
  ): Promise<PaymentAllocationResult> {
    if (input.orderId) {
      const order = await this.orderService.findOne(ctx, input.orderId, ['customer', 'payments']);
      if (!order) throw new UserInputError(`Order ${input.orderId} not found`);
      if (!order.customer) throw new UserInputError(`Order ${input.orderId} has no customer`);
      if (!idsAreEqual(order.customer.id, input.customerId)) {
        throw new UserInputError(`Order does not belong to customer ${input.customerId}`);
      }
      return this.paySingleOrder(
        ctx,
        input.orderId,
        input.paymentAmount,
        input.paymentMethodCode,
        input.referenceNumber,
        undefined
      );
    }
    return this.allocatePaymentToOrders(ctx, {
      customerId: input.customerId,
      paymentAmount: input.paymentAmount,
      paymentMethodCode: input.paymentMethodCode,
      referenceNumber: input.referenceNumber,
    });
  }

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
    const resolvedMethodCode = await this.resolvePaymentMethodCode(
      ctx,
      input.paymentMethodCode || PAYMENT_METHOD_CODES.CREDIT
    );
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

        if (calculation.excessPayment > 0) {
          throw new UserInputError(
            `Payment amount (${paymentAmountInCents}) exceeds total owed (${calculation.totalAllocated}). ` +
              `Please enter amount up to ${calculation.totalAllocated} or use exact amount.`
          );
        }

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

          const metadata: Record<string, unknown> = {
            paymentType: 'credit',
            customerId: input.customerId,
            allocatedAmount: amountToAllocate,
          };
          if (input.referenceNumber) metadata.referenceNumber = input.referenceNumber;

          const payment = await this.addAllocatedPaymentToOrder(
            transactionCtx,
            order,
            amountToAllocate,
            resolvedMethodCode,
            metadata
          );

          await this.financialService.recordPaymentAllocation(
            transactionCtx,
            payment.id.toString(),
            order,
            resolvedMethodCode,
            amountToAllocate,
            input.debitAccountCode?.trim(),
            session.id
          );

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
          await this.creditService.recordRepayment(
            transactionCtx,
            input.customerId,
            'customer',
            totalAllocated
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

    // Use ledger as source of truth for order-level outstanding (AR balance for this order).
    // Query by order entity id (not API id) so we match how journal lines were written.
    const status = await this.financialService.getOrderPaymentStatus(ctx, order.id.toString());
    const outstandingAmount = status.amountOwing;

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

    const actualPaymentMethodCode = await this.resolvePaymentMethodCode(
      ctx,
      paymentMethodCode || PAYMENT_METHOD_CODES.CREDIT
    );

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

    return this.connection.withTransaction(ctx, async transactionCtx => {
      const paymentAmountInCents = actualPaymentAmount;

      const payment = await this.addAllocatedPaymentToOrder(
        transactionCtx,
        order,
        paymentAmountInCents,
        actualPaymentMethodCode,
        metadata
      );

      await this.financialService.recordPaymentAllocation(
        transactionCtx,
        payment.id.toString(),
        order,
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
   * Create a payment with the allocated amount (via handler) and settle it if needed.
   * Uses PaymentService.createPayment so the handler runs and Payment.amount is correct (e.g. partial).
   */
  private async addAllocatedPaymentToOrder(
    ctx: RequestContext,
    order: Order,
    amount: number,
    method: string,
    metadata: Record<string, unknown>
  ): Promise<Payment> {
    const result = await this.paymentService.createPayment(ctx, order, amount, method, metadata);
    if (isGraphQlErrorResult(result)) {
      throw new UserInputError(
        result.message || (result as { errorCode?: string }).errorCode || 'Failed to add payment'
      );
    }
    let payment = result as Payment;
    if (payment.state !== 'Settled') {
      const settleResult = await this.paymentService.settlePayment(ctx, payment.id);
      if (isGraphQlErrorResult(settleResult)) {
        throw new UserInputError(
          settleResult.message ||
            (settleResult as { errorCode?: string }).errorCode ||
            'Failed to settle payment'
        );
      }
      payment = settleResult as Payment;
    }
    return payment;
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
