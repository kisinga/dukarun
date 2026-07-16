import { Injectable } from '@nestjs/common';
import { Resolver, ResolveField, Root } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  Customer,
  EntityHydrator,
  Logger,
  Order,
  Permission,
  RequestContext,
} from '@vendure/core';
import { addDays } from '../../utils/date.utils';
import { FinancialService } from '../../services/financial/financial.service';
import { OrderAmountOwingLoader } from './order-amount-owing.loader';

const DEFAULT_CREDIT_DURATION_DAYS = 30;

/**
 * Order Field Resolver
 *
 * Adds ledger-derived computed fields to the Order type.
 * Failures are logged and fall back to the order-model amount owing so a ledger
 * error never falsely shows an unpaid order as fully paid.
 *
 * Uses a request-scoped DataLoader to batch amountOwing lookups for order lists.
 */
@Resolver('Order')
@Injectable()
export class OrderFieldResolver {
  private static readonly loggerCtx = 'OrderFieldResolver';

  constructor(
    private readonly financialService: FinancialService,
    private readonly entityHydrator: EntityHydrator,
    private readonly amountOwingLoader: OrderAmountOwingLoader
  ) {}

  @ResolveField()
  @Allow(Permission.ReadOrder)
  async amountOwing(@Root() order: Order, @Ctx() ctx: RequestContext): Promise<number> {
    try {
      return await this.amountOwingLoader.load(order.id.toString());
    } catch (e) {
      Logger.error(
        `Failed to compute amountOwing for order ${order.id}: ${e instanceof Error ? e.message : String(e)}`,
        OrderFieldResolver.loggerCtx
      );
      return this.computeModelAmountOwing(ctx, order);
    }
  }

  @ResolveField()
  @Allow(Permission.ReadOrder)
  async dueDate(@Root() order: Order): Promise<Date | null> {
    return this.computeDueDate(order);
  }

  @ResolveField()
  @Allow(Permission.ReadOrder)
  async isOverdue(@Root() order: Order, @Ctx() ctx: RequestContext): Promise<boolean> {
    const dueDate = this.computeDueDate(order);
    if (!dueDate) return false;
    if (dueDate.getTime() > Date.now()) return false;
    try {
      const owing = await this.amountOwingLoader.load(order.id.toString());
      return owing > 0;
    } catch (e) {
      Logger.error(
        `Failed to compute isOverdue for order ${order.id}: ${e instanceof Error ? e.message : String(e)}`,
        OrderFieldResolver.loggerCtx
      );
      return false;
    }
  }

  private computeDueDate(order: Order): Date | null {
    const customer = order.customer as Customer | undefined;
    if (!customer) return null;

    const anchorDate = order.orderPlacedAt || order.createdAt;
    if (!anchorDate) return null;

    const customFields = (customer.customFields || {}) as { creditDuration?: number };
    const duration = Number(customFields.creditDuration ?? DEFAULT_CREDIT_DURATION_DAYS);
    if (!Number.isFinite(duration) || duration <= 0) return null;

    return addDays(new Date(anchorDate), duration);
  }

  private async computeModelAmountOwing(ctx: RequestContext, order: Order): Promise<number> {
    try {
      await this.entityHydrator.hydrate(ctx, order, { relations: ['payments'] });
      const totalOwed = order.totalWithTax || order.total;
      const settledPayments = (order.payments || [])
        .filter(p => p.state === 'Settled')
        .reduce((sum, p) => sum + p.amount, 0);
      return Math.max(0, totalOwed - settledPayments);
    } catch (fallbackError) {
      Logger.error(
        `Failed to compute model fallback amountOwing for order ${order.id}: ` +
          `${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        OrderFieldResolver.loggerCtx
      );
      // Last resort: return the order total so the UI never shows the order as paid.
      return order.totalWithTax || order.total || 0;
    }
  }
}
