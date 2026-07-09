import { Injectable } from '@nestjs/common';
import { Resolver, ResolveField, Root } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  EntityHydrator,
  Logger,
  Order,
  Permission,
  RequestContext,
} from '@vendure/core';
import { FinancialService } from '../../services/financial/financial.service';
import { OrderAmountOwingLoader } from './order-amount-owing.loader';

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
