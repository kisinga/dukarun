import { Injectable } from '@nestjs/common';
import { ChannelService, RequestContext } from '@vendure/core';
import { DataSource } from 'typeorm';
import { parseStockValueCache, StockValueCache } from '../../domain/channel-custom-fields';
import { InventoryBatch } from '../inventory/entities/inventory-batch.entity';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

export interface StockValueStats {
  retail: number;
  wholesale: number;
  cost: number;
}

export type StockValuationType = 'RETAIL' | 'WHOLESALE' | 'COST';

export interface StockValueRankingItem {
  productVariantId: number;
  productId: number;
  productName: string;
  variantName: string | null;
  value: number;
}

export interface StockValueRankingResult {
  items: StockValueRankingItem[];
  total: number;
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

  async getStockValueRanking(
    ctx: RequestContext,
    valuationType: StockValuationType,
    limit = 20,
    stockLocationId?: number
  ): Promise<StockValueRankingResult> {
    const channelId = ctx.channelId as number;
    if (!channelId) {
      return { items: [], total: 0 };
    }

    if (valuationType === 'COST') {
      return this.getCostRanking(ctx, channelId, limit, stockLocationId);
    }
    return this.getRetailOrWholesaleRanking(channelId, valuationType, limit, stockLocationId);
  }

  private async getRetailOrWholesaleRanking(
    channelId: number,
    valuationType: 'RETAIL' | 'WHOLESALE',
    limit: number,
    stockLocationId?: number
  ): Promise<StockValueRankingResult> {
    const joinClause =
      stockLocationId != null
        ? `LEFT JOIN stock_level sl ON sl."productVariantId" = pv.id AND sl."stockLocationId" = $2`
        : `LEFT JOIN stock_level sl ON sl."productVariantId" = pv.id`;
    const params: (number | string)[] = [channelId];
    if (stockLocationId != null) params.push(stockLocationId);

    const valueExpr =
      valuationType === 'RETAIL'
        ? `(pvp.price * COALESCE(SUM(sl."stockOnHand"), 0))`
        : `(COALESCE(pv."customFieldsWholesaleprice", 0) * COALESCE(SUM(sl."stockOnHand"), 0))`;

    const limitVal = Math.max(1, Math.min(limit, 100));

    const rows = await this.dataSource.query(
      `SELECT
        pv.id AS "productVariantId",
        pv."productId" AS "productId",
        COALESCE(pt.name, '') AS "productName",
        pvt.name AS "variantName",
        ${valueExpr} AS value
      FROM product_variant pv
      INNER JOIN product_channels_channel pcc ON pcc."productId" = pv."productId"
      INNER JOIN product_variant_price pvp ON pvp."variantId" = pv.id AND pvp."channelId" = $1
      LEFT JOIN product_translation pt ON pt."baseId" = pv."productId" AND pt."languageCode" = 'en'
      LEFT JOIN product_variant_translation pvt ON pvt."baseId" = pv.id AND pvt."languageCode" = 'en'
      ${joinClause}
      WHERE pcc."channelId" = $1
      GROUP BY pv.id, pv."productId", pvp.price, pv."customFieldsWholesaleprice", pt.name, pvt.name
      HAVING ${valueExpr} > 0
      ORDER BY ${valueExpr} DESC
      LIMIT $${params.length + 1}`,
      [...params, limitVal]
    );

    let total = 0;
    const items: StockValueRankingItem[] = (rows ?? []).map((row: any) => {
      const value = Number(row.value ?? 0);
      total += value;
      return {
        productVariantId: Number(row.productVariantId),
        productId: Number(row.productId),
        productName: String(row.productName ?? ''),
        variantName: row.variantName != null ? String(row.variantName) : null,
        value,
      };
    });

    if (items.length === 0) {
      return { items: [], total: 0 };
    }

    const totalQuery =
      valuationType === 'RETAIL'
        ? await this.computeRetailAndWholesale(channelId, stockLocationId)
        : await this.computeRetailAndWholesale(channelId, stockLocationId);
    const fullTotal = valuationType === 'RETAIL' ? totalQuery.retail : totalQuery.wholesale;

    return { items, total: fullTotal };
  }

  private async getCostRanking(
    ctx: RequestContext,
    channelId: number,
    limit: number,
    stockLocationId?: number
  ): Promise<StockValueRankingResult> {
    const batchRepo = this.dataSource.getRepository(InventoryBatch);
    const qb = batchRepo
      .createQueryBuilder('batch')
      .select('batch.productVariantId', 'productVariantId')
      .addSelect('SUM(batch.quantity * batch.unitCost)', 'value')
      .where('batch.channelId = :channelId', { channelId })
      .groupBy('batch.productVariantId')
      .orderBy('value', 'DESC')
      .limit(Math.max(1, Math.min(limit, 100)));

    if (stockLocationId != null) {
      qb.andWhere('batch.stockLocationId = :stockLocationId', {
        stockLocationId,
      });
    }

    const rows = await qb.getRawMany();

    const variantIds = (rows ?? []).map((r: any) => r.productVariantId);
    if (variantIds.length === 0) {
      const valuation = await this.inventoryReconciliation.calculateInventoryValuation(
        ctx,
        channelId,
        new Date().toISOString().slice(0, 10),
        stockLocationId
      );
      return {
        items: [],
        total: Number(valuation.totalValue),
      };
    }

    const namesRows = await this.dataSource.query(
      `SELECT
        pv.id AS "productVariantId",
        pv."productId" AS "productId",
        COALESCE(pt.name, '') AS "productName",
        pvt.name AS "variantName"
      FROM product_variant pv
      LEFT JOIN product_translation pt ON pt."baseId" = pv."productId" AND pt."languageCode" = 'en'
      LEFT JOIN product_variant_translation pvt ON pvt."baseId" = pv.id AND pvt."languageCode" = 'en'
      WHERE pv.id = ANY($1::int[])`,
      [variantIds]
    );

    const nameMap = new Map<
      number,
      { productId: number; productName: string; variantName: string | null }
    >();
    for (const r of namesRows ?? []) {
      nameMap.set(Number(r.productVariantId), {
        productId: Number(r.productId),
        productName: String(r.productName ?? ''),
        variantName: r.variantName != null ? String(r.variantName) : null,
      });
    }

    let total = 0;
    const items: StockValueRankingItem[] = (rows ?? []).map((row: any) => {
      const value = Number(row.value ?? 0);
      total += value;
      const names = nameMap.get(Number(row.productVariantId)) ?? {
        productId: 0,
        productName: '',
        variantName: null,
      };
      return {
        productVariantId: Number(row.productVariantId),
        productId: names.productId,
        productName: names.productName,
        variantName: names.variantName,
        value,
      };
    });

    const valuation = await this.inventoryReconciliation.calculateInventoryValuation(
      ctx,
      channelId,
      new Date().toISOString().slice(0, 10),
      stockLocationId
    );
    const fullTotal = Number(valuation.totalValue);

    return { items, total: fullTotal };
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
        pvp.price,
        COALESCE(pv."customFieldsWholesaleprice", 0) AS wholesale,
        COALESCE(SUM(sl."stockOnHand"), 0) AS qty
      FROM product_variant pv
      INNER JOIN product_channels_channel pcc ON pcc."productId" = pv."productId"
      INNER JOIN product_variant_price pvp ON pvp."variantId" = pv.id AND pvp."channelId" = $1
      ${joinClause}
      WHERE pcc."channelId" = $1
      GROUP BY pv.id, pvp.price, pv."customFieldsWholesaleprice"`,
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
