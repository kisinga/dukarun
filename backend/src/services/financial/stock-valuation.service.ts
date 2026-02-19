import { Injectable } from '@nestjs/common';
import { ChannelService, RequestContext } from '@vendure/core';
import { DataSource } from 'typeorm';
import { parseStockValueCache, StockValueCache } from '../../domain/channel-custom-fields';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

export interface StockValueStats {
  retail: number;
  wholesale: number;
  cost: number;
}

/**
 * Computes and caches stock value at retail, wholesale, and cost (batch COGS).
 * Cache is stored in Channel.customFields.stockValueCache (JSON); invalidate on stock or price changes.
 */
@Injectable()
export class StockValuationService {
  constructor(
    private readonly channelService: ChannelService,
    private readonly inventoryReconciliation: InventoryReconciliationService,
    private readonly dataSource: DataSource
  ) {}

  async getStockValueStats(
    ctx: RequestContext,
    stockLocationId?: number,
    forceRefresh?: boolean
  ): Promise<StockValueStats> {
    const channelId = ctx.channelId as number;
    if (!channelId) {
      return { retail: 0, wholesale: 0, cost: 0 };
    }

    if (!forceRefresh) {
      const channel = await this.channelService.findOne(ctx, channelId);
      const cached = parseStockValueCache(channel?.customFields ?? {});
      if (cached) {
        return {
          retail: Number(cached.retail),
          wholesale: Number(cached.wholesale),
          cost: Number(cached.cost),
        };
      }
    }

    const result = await this.compute(ctx, channelId, stockLocationId);
    await this.writeCache(ctx, channelId, result);
    return {
      retail: result.retail,
      wholesale: result.wholesale,
      cost: result.cost,
    };
  }

  async invalidateCache(ctx: RequestContext): Promise<void> {
    const channelId = ctx.channelId;
    if (channelId == null) return;
    await this.channelService.update(ctx, {
      id: channelId,
      customFields: { stockValueCache: null },
    });
  }

  private async compute(
    ctx: RequestContext,
    channelId: number,
    stockLocationId?: number
  ): Promise<StockValueStats> {
    const today = new Date().toISOString().slice(0, 10);
    const costValuation = await this.inventoryReconciliation.calculateInventoryValuation(
      ctx,
      channelId,
      today,
      stockLocationId
    );
    const cost = Number(costValuation.totalValue);

    const { retail, wholesale } = await this.computeRetailAndWholesale(channelId, stockLocationId);

    return { retail, wholesale, cost };
  }

  private async computeRetailAndWholesale(
    channelId: number,
    stockLocationId?: number
  ): Promise<{ retail: number; wholesale: number }> {
    const joinClause =
      stockLocationId != null
        ? `LEFT JOIN stock_level sl ON sl."productVariantId" = pv.id AND sl."stockLocationId" = $2`
        : `LEFT JOIN stock_level sl ON sl."productVariantId" = pv.id`;
    const params: number[] = [channelId];
    if (stockLocationId != null) params.push(stockLocationId);

    const rows = await this.dataSource.query(
      `SELECT
        pv.price,
        COALESCE(pv."customFieldsWholesaleprice", 0) AS wholesale,
        COALESCE(SUM(sl."stockOnHand"), 0) AS qty
      FROM product_variant pv
      INNER JOIN product_channels_channel pcc ON pcc."productId" = pv."productId"
      ${joinClause}
      WHERE pcc."channelId" = $1
      GROUP BY pv.id, pv.price, pv."customFieldsWholesaleprice"`,
      params
    );

    let retail = 0;
    let wholesale = 0;
    for (const row of rows ?? []) {
      const price = Number(row.price ?? 0);
      const wh = Number(row.wholesale ?? 0);
      const qty = Number(row.qty ?? 0);
      retail += price * qty;
      wholesale += wh * qty;
    }
    return { retail, wholesale };
  }

  private async writeCache(
    ctx: RequestContext,
    channelId: number,
    result: StockValueStats
  ): Promise<void> {
    const cache: StockValueCache = {
      retail: String(result.retail),
      wholesale: String(result.wholesale),
      cost: String(result.cost),
      updatedAt: new Date().toISOString(),
    };
    await this.channelService.update(ctx, {
      id: channelId,
      customFields: { stockValueCache: JSON.stringify(cache) },
    });
  }
}
