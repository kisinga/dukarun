import { Injectable } from '@nestjs/common';
import { Order, OrderService, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { AR_OWING_ORDER_STATES } from '../../constants/order-states.constants';
import {
  InventoryValuationProjection,
  LedgerConsistencyGuard,
  OrderArProjection,
  PurchaseApProjection,
} from './ledger-projection';
import { StockPurchase } from '../../services/stock/entities/purchase.entity';

export interface LedgerDivergenceItem {
  entityType: string;
  entityId: string;
  descriptor: string;
  entityValue: number;
  ledgerValue: number;
  difference: number;
}

export interface LedgerDivergenceSummary {
  totalDivergences: number;
  byEntityType: Record<string, number>;
  items: LedgerDivergenceItem[];
}

/**
 * Ledger Divergence Service
 *
 * Unified diagnostic surface for the ledger-as-SSOT pattern.
 * Scans orders, purchases, and inventory valuation for drift from the ledger.
 * Does not auto-repair; it surfaces divergences for human review.
 */
@Injectable()
export class LedgerDivergenceService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly orderService: OrderService,
    private readonly ledgerConsistencyGuard: LedgerConsistencyGuard,
    private readonly orderArProjection: OrderArProjection,
    private readonly purchaseApProjection: PurchaseApProjection,
    private readonly inventoryValuationProjection: InventoryValuationProjection
  ) {}

  async findAllDivergences(
    ctx: RequestContext,
    toleranceCents?: number
  ): Promise<LedgerDivergenceSummary> {
    const [orderDivergences, purchaseDivergences, inventoryDivergences] = await Promise.all([
      this.findOrderDivergences(ctx, toleranceCents),
      this.findPurchaseDivergences(ctx, toleranceCents),
      this.findInventoryDivergences(ctx, toleranceCents),
    ]);

    const items = [...orderDivergences, ...purchaseDivergences, ...inventoryDivergences];
    const byEntityType: Record<string, number> = {};
    for (const item of items) {
      byEntityType[item.entityType] = (byEntityType[item.entityType] || 0) + 1;
    }

    return {
      totalDivergences: items.length,
      byEntityType,
      items,
    };
  }

  private async findOrderDivergences(
    ctx: RequestContext,
    toleranceCents?: number
  ): Promise<LedgerDivergenceItem[]> {
    const orders = await this.fetchAllReconcilableOrders(ctx);

    const divergences = await this.ledgerConsistencyGuard.findDivergences(
      ctx,
      this.orderArProjection,
      async () => orders,
      toleranceCents
    );

    return divergences.map(d => ({
      entityType: 'Order',
      entityId: d.entity.id.toString(),
      descriptor: d.entity.code,
      entityValue: d.entitySnapshot.amountOwing,
      ledgerValue: d.ledgerSnapshot.amountOwing,
      difference: d.difference,
    }));
  }

  private async findPurchaseDivergences(
    ctx: RequestContext,
    toleranceCents?: number
  ): Promise<LedgerDivergenceItem[]> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const channelId = ctx.channelId as number;
    const purchases = await purchaseRepo.find({
      where: {
        channelId,
        isCreditPurchase: true,
        paymentStatus: In(['pending', 'partial', 'paid']),
      },
      relations: ['payments'],
    });

    const divergences = await this.ledgerConsistencyGuard.findDivergences(
      ctx,
      this.purchaseApProjection,
      async () => purchases,
      toleranceCents
    );

    return divergences.map(d => ({
      entityType: 'Purchase',
      entityId: d.entity.id,
      descriptor: d.entity.referenceNumber || d.entity.id,
      entityValue: d.entitySnapshot.amountOwing,
      ledgerValue: d.ledgerSnapshot.amountOwing,
      difference: d.difference,
    }));
  }

  private async findInventoryDivergences(
    ctx: RequestContext,
    toleranceCents?: number
  ): Promise<LedgerDivergenceItem[]> {
    const channelId = ctx.channelId as number;
    const valuation = await this.inventoryValuationProjection.loadEntity(ctx, channelId);

    const divergences = await this.ledgerConsistencyGuard.findDivergences(
      ctx,
      this.inventoryValuationProjection,
      async () => [valuation],
      toleranceCents
    );

    return divergences.map(d => ({
      entityType: 'Inventory',
      entityId: `channel-${channelId}`,
      descriptor: `Channel ${channelId} inventory valuation`,
      entityValue: d.entitySnapshot.totalValue,
      ledgerValue: d.ledgerSnapshot.totalValue,
      difference: d.difference,
    }));
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
              in: AR_OWING_ORDER_STATES,
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
