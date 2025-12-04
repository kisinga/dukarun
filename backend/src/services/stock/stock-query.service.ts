import { Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { StockPurchase } from './entities/purchase.entity';
import { InventoryStockAdjustment } from './entities/stock-adjustment.entity';

export interface PurchaseListOptions {
  skip?: number;
  take?: number;
  filter?: {
    supplierId?: ID;
    startDate?: Date;
    endDate?: Date;
  };
}

export interface StockAdjustmentListOptions {
  skip?: number;
  take?: number;
  filter?: {
    reason?: string;
    startDate?: Date;
    endDate?: Date;
  };
}

/**
 * Stock Query Service
 *
 * Handles querying purchases and stock adjustments.
 */
@Injectable()
export class StockQueryService {
  private readonly logger = new Logger('StockQueryService');

  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Get purchases with filtering and pagination
   */
  async getPurchases(
    ctx: RequestContext,
    options: PurchaseListOptions = {}
  ): Promise<{ items: StockPurchase[]; totalItems: number }> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const baseFilterQb = purchaseRepo.createQueryBuilder('purchase');

    // Always filter by channelId for security
    const channelId = ctx.channelId as number;
    baseFilterQb.andWhere('purchase.channelId = :channelId', { channelId });

    // Apply filters to base query (used for both count and items)
    if (options.filter?.supplierId) {
      baseFilterQb.andWhere('purchase.supplierId = :supplierId', {
        supplierId: parseInt(String(options.filter.supplierId), 10),
      });
    }

    if (options.filter?.startDate) {
      baseFilterQb.andWhere('purchase.purchaseDate >= :startDate', {
        startDate: options.filter.startDate,
      });
    }

    if (options.filter?.endDate) {
      baseFilterQb.andWhere('purchase.purchaseDate <= :endDate', {
        endDate: options.filter.endDate,
      });
    }

    // Get total count using lightweight query (no joins)
    const totalItems = await baseFilterQb.getCount();

    // Build items query with eager joins for the current page
    const itemsQb = purchaseRepo
      .createQueryBuilder('purchase')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('purchase.lines', 'lines')
      .leftJoinAndSelect('lines.variant', 'variant')
      .leftJoinAndSelect('lines.stockLocation', 'stockLocation');

    // Always filter by channelId for security
    itemsQb.andWhere('purchase.channelId = :channelId', { channelId });

    // Reapply filters to items query
    if (options.filter?.supplierId) {
      itemsQb.andWhere('purchase.supplierId = :supplierId', {
        supplierId: parseInt(String(options.filter.supplierId), 10),
      });
    }

    if (options.filter?.startDate) {
      itemsQb.andWhere('purchase.purchaseDate >= :startDate', {
        startDate: options.filter.startDate,
      });
    }

    if (options.filter?.endDate) {
      itemsQb.andWhere('purchase.purchaseDate <= :endDate', {
        endDate: options.filter.endDate,
      });
    }

    // Apply pagination
    if (options.skip !== undefined) {
      itemsQb.skip(options.skip);
    }

    if (options.take !== undefined) {
      itemsQb.take(options.take);
    }

    // Order by date descending
    itemsQb.orderBy('purchase.purchaseDate', 'DESC');

    const items = await itemsQb.getMany();

    return { items, totalItems };
  }

  /**
   * Get stock adjustments with filtering and pagination
   */
  async getStockAdjustments(
    ctx: RequestContext,
    options: StockAdjustmentListOptions = {}
  ): Promise<{ items: InventoryStockAdjustment[]; totalItems: number }> {
    const adjustmentRepo = this.connection.getRepository(ctx, InventoryStockAdjustment);
    const baseFilterQb = adjustmentRepo.createQueryBuilder('adjustment');

    // Always filter by channelId for security
    const channelId = ctx.channelId as number;
    baseFilterQb.andWhere('adjustment.channelId = :channelId', { channelId });

    // Apply filters to base query (used for both count and items)
    if (options.filter?.reason) {
      baseFilterQb.andWhere('adjustment.reason = :reason', {
        reason: options.filter.reason,
      });
    }

    if (options.filter?.startDate) {
      baseFilterQb.andWhere('adjustment.createdAt >= :startDate', {
        startDate: options.filter.startDate,
      });
    }

    if (options.filter?.endDate) {
      baseFilterQb.andWhere('adjustment.createdAt <= :endDate', {
        endDate: options.filter.endDate,
      });
    }

    // Get total count using lightweight query (no joins)
    const totalItems = await baseFilterQb.getCount();

    // Build items query with eager joins for the current page
    const itemsQb = adjustmentRepo
      .createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.adjustedBy', 'adjustedBy')
      .leftJoinAndSelect('adjustment.lines', 'lines')
      .leftJoinAndSelect('lines.variant', 'variant')
      .leftJoinAndSelect('lines.stockLocation', 'stockLocation');

    // Always filter by channelId for security
    itemsQb.andWhere('adjustment.channelId = :channelId', { channelId });

    // Reapply filters to items query
    if (options.filter?.reason) {
      itemsQb.andWhere('adjustment.reason = :reason', {
        reason: options.filter.reason,
      });
    }

    if (options.filter?.startDate) {
      itemsQb.andWhere('adjustment.createdAt >= :startDate', {
        startDate: options.filter.startDate,
      });
    }

    if (options.filter?.endDate) {
      itemsQb.andWhere('adjustment.createdAt <= :endDate', {
        endDate: options.filter.endDate,
      });
    }

    // Apply pagination
    if (options.skip !== undefined) {
      itemsQb.skip(options.skip);
    }

    if (options.take !== undefined) {
      itemsQb.take(options.take);
    }

    // Order by date descending
    itemsQb.orderBy('adjustment.createdAt', 'DESC');

    const items = await itemsQb.getMany();

    return { items, totalItems };
  }
}
