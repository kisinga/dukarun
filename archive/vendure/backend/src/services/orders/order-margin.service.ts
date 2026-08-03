import { Injectable } from '@nestjs/common';
import {
  ID,
  Order,
  OrderService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { In, IsNull } from 'typeorm';
import { SaleCogs } from '../inventory/entities/sale-cogs.entity';
import { SalePostingStrategy } from '../financial/strategies/sale-posting.strategy';

/**
 * Unreliability reasons for an order's margin figure.
 * - SKIPPED_COGS: COGS recording was skipped (no batch stock at sale time).
 * - ZERO_COST_BATCH: some COGS came from zero-cost batches (opening stock / cost-free adjustments).
 * - NO_COGS_DATA: no COGS rows exist for an order that should have them (e.g. legacy orders).
 */
export type OrderMarginUnreliableReason = 'SKIPPED_COGS' | 'ZERO_COST_BATCH' | 'NO_COGS_DATA';

export interface OrderMargin {
  netRevenueCents: number;
  cogsCents: number;
  marginCents: number;
  /** Null when net revenue is zero (margin % undefined). */
  marginPercent: number | null;
  reliable: boolean;
  unreliableReasons: OrderMarginUnreliableReason[];
}

/**
 * Order Margin Service
 *
 * Per-order margin from the canonical figures:
 * - Revenue: Σ orderLine.proratedLinePrice — tax-exclusive, post-discount, excludes shipping.
 * - COGS: Σ sale_cogs.cogsCents for the order (non-voided rows only), channel-scoped.
 */
@Injectable()
export class OrderMarginService {
  constructor(
    private readonly orderService: OrderService,
    private readonly connection: TransactionalConnection,
    private readonly salePostingStrategy: SalePostingStrategy
  ) {}

  async getOrderMargin(ctx: RequestContext, orderId: ID): Promise<OrderMargin> {
    const order = await this.orderService.findOne(ctx, orderId, ['lines']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }
    return this.computeMargin(ctx, order);
  }

  /**
   * Re-run COGS recording for an order whose COGS was skipped (e.g. after restocking).
   * Idempotent: the underlying path skips when COGS was already posted. When stock is
   * still insufficient the order stays skipped — returns the current margin without throwing.
   */
  async retrySkippedCogs(ctx: RequestContext, orderId: ID): Promise<OrderMargin> {
    const order = await this.orderService.findOne(ctx, orderId, ['lines']);
    if (!order) {
      throw new UserInputError(`Order ${orderId} not found`);
    }
    const cogsStatus = (order.customFields as Record<string, unknown>)?.cogsStatus;
    if (cogsStatus !== 'skipped') {
      throw new UserInputError(
        `Order ${order.code} COGS is not marked as skipped (status: ${cogsStatus ?? 'none'})`
      );
    }

    await this.salePostingStrategy.recordSaleCogsIfNeeded(ctx, order);

    // Reload so the margin reflects the updated cogsStatus and any new sale_cogs rows
    const updated = await this.orderService.findOne(ctx, orderId, ['lines']);
    return this.computeMargin(ctx, updated ?? order);
  }

  /**
   * Period aggregates for the periodProfit query, computed from source tables (not the MVs):
   * revenue = Σ proratedLinePrice for settled/fulfilled orders placed in [startDate, endDate]
   * (YYYY-MM-DD, compared on DATE(orderPlacedAt)); COGS = non-voided sale_cogs for those orders.
   */
  async getPeriodMarginStats(
    ctx: RequestContext,
    startDate: string,
    endDate: string
  ): Promise<{
    netRevenueCents: number;
    cogsCents: number;
    grossMarginCents: number;
    unreliableOrderCount: number;
  }> {
    const channelId = ctx.channelId as number;

    const orders = await this.connection
      .getRepository(ctx, Order)
      .createQueryBuilder('o')
      .innerJoin('o.channels', 'channel', 'channel.id = :channelId', { channelId })
      .leftJoinAndSelect('o.lines', 'line')
      .where('o.state IN (:...states)', {
        states: ['PaymentSettled', 'Fulfilled', 'Shipped', 'Delivered'],
      })
      .andWhere('o."orderPlacedAt" IS NOT NULL')
      .andWhere('DATE(o."orderPlacedAt") >= :startDate', { startDate })
      .andWhere('DATE(o."orderPlacedAt") <= :endDate', { endDate })
      .getMany();

    const netRevenueCents = orders.reduce(
      (sum, order) => sum + (order.lines ?? []).reduce((s, line) => s + line.proratedLinePrice, 0),
      0
    );

    let cogsCents = 0;
    let unreliableOrderCount = 0;
    const orderIds = orders.map(order => String(order.id));
    if (orderIds.length > 0) {
      const cogsRows = await this.connection.getRepository(ctx, SaleCogs).find({
        where: { channelId, orderId: In(orderIds), voidedAt: IsNull() },
      });
      cogsCents = cogsRows.reduce((sum, row) => sum + Number(row.cogsCents), 0);

      const rowsByOrder = new Map<string, SaleCogs[]>();
      for (const row of cogsRows) {
        const list = rowsByOrder.get(row.orderId) ?? [];
        list.push(row);
        rowsByOrder.set(row.orderId, list);
      }

      for (const order of orders) {
        const rows = rowsByOrder.get(String(order.id)) ?? [];
        const cogsStatus = (order.customFields as Record<string, unknown>)?.cogsStatus;
        const unreliable =
          cogsStatus === 'skipped' ||
          rows.some(row => Number(row.cogsCents) === 0 && Number(row.quantity) > 0) ||
          (rows.length === 0 && (order.lines?.length ?? 0) > 0 && cogsStatus !== 'recorded');
        if (unreliable) {
          unreliableOrderCount++;
        }
      }
    }

    return {
      netRevenueCents,
      cogsCents,
      grossMarginCents: netRevenueCents - cogsCents,
      unreliableOrderCount,
    };
  }

  private async computeMargin(ctx: RequestContext, order: Order): Promise<OrderMargin> {
    const channelId = ctx.channelId as number;
    const lines = order.lines ?? [];
    const netRevenueCents = lines.reduce((sum, line) => sum + line.proratedLinePrice, 0);

    const cogsRows = await this.connection.getRepository(ctx, SaleCogs).find({
      where: { channelId, orderId: String(order.id), voidedAt: IsNull() },
    });
    const cogsCents = cogsRows.reduce((sum, row) => sum + Number(row.cogsCents), 0);

    const cogsStatus = (order.customFields as Record<string, unknown>)?.cogsStatus;
    const unreliableReasons: OrderMarginUnreliableReason[] = [];
    if (cogsStatus === 'skipped') {
      unreliableReasons.push('SKIPPED_COGS');
    }
    if (cogsRows.some(row => Number(row.cogsCents) === 0 && Number(row.quantity) > 0)) {
      unreliableReasons.push('ZERO_COST_BATCH');
    }
    if (lines.length > 0 && cogsRows.length === 0 && cogsStatus !== 'recorded') {
      unreliableReasons.push('NO_COGS_DATA');
    }

    const marginCents = netRevenueCents - cogsCents;
    const marginPercent = netRevenueCents > 0 ? (marginCents / netRevenueCents) * 100 : null;

    return {
      netRevenueCents,
      cogsCents,
      marginCents,
      marginPercent,
      reliable: unreliableReasons.length === 0,
      unreliableReasons,
    };
  }
}
