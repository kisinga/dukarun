import { Injectable } from '@nestjs/common';
import {
  Channel,
  ListQueryBuilder,
  Product,
  ProductVariant,
  RequestContext,
  TransactionalConnection,
  type ListQueryOptions,
} from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { InventoryBatch } from './entities/inventory-batch.entity';

export type InventoryAlertFilter = 'LOW_STOCK' | 'EXPIRING_SOON' | 'EXPIRED';

export interface InventoryAlertCounts {
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
}

export interface AlertProductList {
  items: Product[];
  totalItems: number;
}

/**
 * InventoryAlertService
 *
 * Provides accurate backend counts and paginated product lists for low-stock
 * and expiry alerts. Uses ProductVariant / inventory_batch as the source of
 * truth so out-of-stock variants are included in low-stock counts.
 */
@Injectable()
export class InventoryAlertService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly listQueryBuilder: ListQueryBuilder
  ) {}

  /**
   * Get inventory alert counts for the current channel.
   *
   * @param expiryThresholdDays Number of days within which a batch is considered "expiring soon". Default 30.
   */
  async getAlertCounts(
    ctx: RequestContext,
    expiryThresholdDays = 30
  ): Promise<InventoryAlertCounts> {
    const channelId = ctx.channelId as number;
    if (!channelId) {
      return { lowStockCount: 0, expiringSoonCount: 0, expiredCount: 0 };
    }

    const lowStockThreshold = await this.getLowStockThreshold(ctx, channelId);

    const [lowStockCount, expiringSoonCount, expiredCount] = await Promise.all([
      this.getLowStockProductCount(ctx, channelId, lowStockThreshold),
      this.getExpiringSoonProductCount(ctx, channelId, expiryThresholdDays),
      this.getExpiredProductCount(ctx, channelId),
    ]);

    return { lowStockCount, expiringSoonCount, expiredCount };
  }

  /**
   * Get paginated products matching an inventory alert filter.
   *
   * Filtering, pagination and sorting happen on the server so dashboard links
   * always show the complete, correct result set.
   */
  async findAlertProducts(
    ctx: RequestContext,
    filter: InventoryAlertFilter,
    options?: ListQueryOptions<Product>
  ): Promise<AlertProductList> {
    const channelId = ctx.channelId as number;
    if (!channelId) {
      return { items: [], totalItems: 0 };
    }

    const lowStockThreshold = await this.getLowStockThreshold(ctx, channelId);
    const variantSubQuery = this.buildAlertVariantSubQuery(
      ctx,
      channelId,
      filter,
      lowStockThreshold,
      30
    );

    const listQb = this.listQueryBuilder.build(Product, options, {
      channelId: ctx.channelId,
    });
    listQb.andWhere(
      `product.id IN (${variantSubQuery.getQuery()})`,
      variantSubQuery.getParameters()
    );

    const [items, totalItems] = await listQb.getManyAndCount();
    return { items, totalItems };
  }

  private async getLowStockThreshold(ctx: RequestContext, channelId: number): Promise<number> {
    const channel = await this.connection.getRepository(ctx, Channel).findOne({
      where: { id: channelId },
    });
    const customFields = (channel?.customFields ?? {}) as { lowStockThreshold?: number };
    return customFields.lowStockThreshold ?? 10;
  }

  /**
   * Count distinct products with at least one variant whose total open batch
   * quantity is at or below the channel's low-stock threshold.
   *
   * ProductVariant is the starting point with a LEFT JOIN to inventory_batch so
   * variants with zero batches (out of stock) are counted as low stock.
   */
  private async getLowStockProductCount(
    ctx: RequestContext,
    channelId: number,
    threshold: number
  ): Promise<number> {
    const variantSubQuery = this.buildLowStockVariantSubQuery(ctx, channelId, threshold);
    return this.countDistinctAlertProducts(ctx, variantSubQuery);
  }

  /**
   * Count distinct products with at least one open batch expiring within the
   * given number of days.
   */
  private async getExpiringSoonProductCount(
    ctx: RequestContext,
    channelId: number,
    days: number
  ): Promise<number> {
    const variantSubQuery = this.buildExpiringSoonVariantSubQuery(ctx, channelId, days);
    return this.countDistinctAlertProducts(ctx, variantSubQuery);
  }

  /**
   * Count distinct products with at least one open batch already expired.
   */
  private async getExpiredProductCount(ctx: RequestContext, channelId: number): Promise<number> {
    const variantSubQuery = this.buildExpiredVariantSubQuery(ctx, channelId);
    return this.countDistinctAlertProducts(ctx, variantSubQuery);
  }

  private buildAlertVariantSubQuery(
    ctx: RequestContext,
    channelId: number,
    filter: InventoryAlertFilter,
    lowStockThreshold: number,
    expiryThresholdDays: number
  ): SelectQueryBuilder<ProductVariant> {
    switch (filter) {
      case 'LOW_STOCK':
        return this.buildLowStockVariantSubQuery(ctx, channelId, lowStockThreshold);
      case 'EXPIRING_SOON':
        return this.buildExpiringSoonVariantSubQuery(ctx, channelId, expiryThresholdDays);
      case 'EXPIRED':
        return this.buildExpiredVariantSubQuery(ctx, channelId);
    }
  }

  private buildLowStockVariantSubQuery(
    ctx: RequestContext,
    channelId: number,
    threshold: number
  ): SelectQueryBuilder<ProductVariant> {
    return this.connection
      .getRepository(ctx, ProductVariant)
      .createQueryBuilder('variant')
      .select('variant.productId', 'productId')
      .innerJoin(Product, 'product', 'product.id = variant.productId')
      .innerJoin('product.channels', 'channel', 'channel.id = :channelId_alert')
      .leftJoin(
        InventoryBatch,
        'batch',
        'batch.productVariantId = variant.id AND batch.channelId = :channelId_alert',
        { channelId_alert: channelId }
      )
      .where('product.deletedAt IS NULL')
      .andWhere('variant.deletedAt IS NULL')
      .groupBy('variant.id')
      .addGroupBy('variant.productId')
      .having('COALESCE(SUM(batch.quantity), 0) <= :threshold_alert', {
        threshold_alert: threshold,
      });
  }

  private buildExpiringSoonVariantSubQuery(
    ctx: RequestContext,
    channelId: number,
    days: number
  ): SelectQueryBuilder<ProductVariant> {
    const now = new Date();
    const thresholdDate = new Date(now);
    thresholdDate.setDate(thresholdDate.getDate() + days);
    thresholdDate.setHours(23, 59, 59, 999);

    return this.connection
      .getRepository(ctx, ProductVariant)
      .createQueryBuilder('variant')
      .select('variant.productId', 'productId')
      .innerJoin(Product, 'product', 'product.id = variant.productId')
      .innerJoin(InventoryBatch, 'batch', 'batch.productVariantId = variant.id')
      .where('batch.channelId = :channelId_alert', { channelId_alert: channelId })
      .andWhere('batch.quantity > 0')
      .andWhere('batch.expiryDate IS NOT NULL')
      .andWhere('batch.expiryDate >= :now_alert', { now_alert: now })
      .andWhere('batch.expiryDate <= :thresholdDate_alert', { thresholdDate_alert: thresholdDate })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('variant.deletedAt IS NULL')
      .groupBy('variant.id')
      .addGroupBy('variant.productId');
  }

  private buildExpiredVariantSubQuery(
    ctx: RequestContext,
    channelId: number
  ): SelectQueryBuilder<ProductVariant> {
    const now = new Date();

    return this.connection
      .getRepository(ctx, ProductVariant)
      .createQueryBuilder('variant')
      .select('variant.productId', 'productId')
      .innerJoin(Product, 'product', 'product.id = variant.productId')
      .innerJoin(InventoryBatch, 'batch', 'batch.productVariantId = variant.id')
      .where('batch.channelId = :channelId_alert', { channelId_alert: channelId })
      .andWhere('batch.quantity > 0')
      .andWhere('batch.expiryDate IS NOT NULL')
      .andWhere('batch.expiryDate < :now_alert', { now_alert: now })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('variant.deletedAt IS NULL')
      .groupBy('variant.id')
      .addGroupBy('variant.productId');
  }

  private async countDistinctAlertProducts(
    ctx: RequestContext,
    variantSubQuery: SelectQueryBuilder<ProductVariant>
  ): Promise<number> {
    const result = await this.connection
      .getRepository(ctx, Product)
      .createQueryBuilder('product')
      .select('COUNT(DISTINCT product.id)', 'count')
      .innerJoin(
        `(${variantSubQuery.getQuery()})`,
        'alert_products',
        'alert_products.productId = product.id'
      )
      .setParameters(variantSubQuery.getParameters())
      .where('product.deletedAt IS NULL')
      .getRawOne<{ count: string }>();

    return Number(result?.count ?? 0);
  }
}
