import { Injectable } from '@nestjs/common';
import { Customer, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { In, Repository } from 'typeorm';
import { AR_OWING_ORDER_STATES } from '../../constants/order-states.constants';
import { addDays, diffCalendarDays } from '../../utils/date.utils';
import { FinancialService } from '../financial/financial.service';

export interface AgedOrder {
  orderId: string;
  orderCode: string;
  orderTotal: number;
  amountOwing: number;
  orderDate: Date;
  dueDate: Date;
  daysOverdue: number;
}

export interface CustomerCreditAging {
  customerId: string;
  customerName: string;
  phoneNumber: string | null;
  outstandingAmount: number;
  creditLimit: number;
  creditDurationDays: number;
  availableCredit: number;
  utilizationPercent: number;
  oldestOrder: AgedOrder | null;
  daysOverdue: number;
  lastRepaymentDate: Date | null;
}

/**
 * Computes order-based credit aging for customers.
 *
 * - Due date = order orderPlacedAt (or createdAt fallback) + customer creditDuration.
 * - Days overdue = floor(now - dueDate) for the oldest unpaid order.
 * - Utilization = outstanding / creditLimit (0 if no limit).
 *
 * PaymentSettled orders are ignored; they are not expected to carry AR.
 */
@Injectable()
export class CreditAgingService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly financialService: FinancialService
  ) {}

  async getCustomerAging(
    ctx: RequestContext,
    customerId: string,
    outstandingAmount: number
  ): Promise<CustomerCreditAging | null> {
    const customer = await this.customerRepo(ctx).findOne({
      where: { id: customerId },
      relations: ['user'],
    });
    if (!customer) return null;

    const cf = (customer.customFields || {}) as Record<string, unknown>;
    const creditLimit = Number(cf.creditLimit ?? 0);
    const creditDurationDays = Number(cf.creditDuration ?? 30);
    const availableCredit = Math.max(0, creditLimit - outstandingAmount);
    const utilizationPercent = creditLimit > 0 ? outstandingAmount / creditLimit : 0;

    const oldestOrder = await this.getOldestUnpaidOrder(ctx, customerId, creditDurationDays);

    return {
      customerId,
      customerName: this.customerName(customer),
      phoneNumber: this.customerPhone(customer),
      outstandingAmount,
      creditLimit,
      creditDurationDays,
      availableCredit,
      utilizationPercent,
      oldestOrder,
      daysOverdue: oldestOrder?.daysOverdue ?? 0,
      lastRepaymentDate: cf.lastRepaymentDate ? new Date(String(cf.lastRepaymentDate)) : null,
    };
  }

  /**
   * All customers in the channel with any outstanding balance on AR-carrying orders.
   */
  async findCustomersWithOutstanding(ctx: RequestContext): Promise<string[]> {
    const rows = (await this.orderRepo(ctx)
      .createQueryBuilder('order')
      .select(['order.id AS id', 'order.customerId AS customerId'])
      .where('order.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('order.state IN (:...states)', { states: AR_OWING_ORDER_STATES })
      .getRawMany()) as Array<{ id: string; customerId: string | number }>;

    const statuses = await this.financialService.getOrderPaymentStatuses(
      ctx,
      rows.map(r => r.id)
    );

    const owingCustomers = new Set<string>();
    for (const row of rows) {
      const amountOwing = statuses.get(row.id)?.amountOwing ?? 0;
      if (amountOwing <= 0) continue;
      owingCustomers.add(String(row.customerId));
    }

    return Array.from(owingCustomers);
  }

  private async getOldestUnpaidOrder(
    ctx: RequestContext,
    customerId: string,
    creditDurationDays: number
  ): Promise<AgedOrder | null> {
    const now = new Date();
    const orders = await this.orderRepo(ctx).find({
      where: {
        customer: { id: customerId },
        channelId: ctx.channelId as number,
        state: In(AR_OWING_ORDER_STATES),
      } as any,
      order: { createdAt: 'ASC' },
    });

    const statuses = await this.financialService.getOrderPaymentStatuses(
      ctx,
      orders.map(o => o.id.toString())
    );

    let oldest: AgedOrder | null = null;

    for (const order of orders) {
      const status = statuses.get(order.id.toString());
      const amountOwing = status?.amountOwing ?? 0;
      if (amountOwing <= 0) continue;

      const orderDate = order.orderPlacedAt ?? order.createdAt;
      if (!orderDate) continue;

      const dueDate = addDays(new Date(orderDate), creditDurationDays);
      const daysOverdue = Math.max(0, diffCalendarDays(now, dueDate));

      if (!oldest || dueDate.getTime() < oldest.dueDate.getTime()) {
        oldest = {
          orderId: order.id.toString(),
          orderCode: order.code,
          orderTotal: status?.totalOwed ?? order.totalWithTax ?? order.total ?? 0,
          amountOwing,
          orderDate: new Date(orderDate),
          dueDate,
          daysOverdue,
        };
      }
    }

    return oldest;
  }

  private customerName(customer: Customer): string {
    const firstName = customer.firstName ?? '';
    const lastName = customer.lastName ?? '';
    const full = `${firstName} ${lastName}`.trim();
    return full || customer.emailAddress || `Customer ${customer.id}`;
  }

  private customerPhone(customer: Customer): string | null {
    const cf = (customer.customFields || {}) as Record<string, unknown>;
    const phone = cf.phoneNumber;
    return typeof phone === 'string' && phone.trim() ? phone.trim() : null;
  }

  private customerRepo(ctx: RequestContext): Repository<Customer> {
    return this.connection.getRepository(ctx, Customer);
  }

  private orderRepo(ctx: RequestContext): Repository<Order> {
    return this.connection.getRepository(ctx, Order);
  }
}
