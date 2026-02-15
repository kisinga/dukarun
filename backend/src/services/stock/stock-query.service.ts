import { Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { StockPurchase } from './entities/purchase.entity';
import { InventoryStockAdjustment } from './entities/stock-adjustment.entity';

export interface PurchaseListOptions {
  skip?: number;
  take?: number;
  filter?: {
    supplierId?: ID;
    status?: string;
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
   * Apply purchase filters to a query builder
   */
  private applyPurchaseFilters<T>(
    qb: any,
    alias: string,
    channelId: number,
    filter?: PurchaseListOptions['filter']
  ): void {
    qb.andWhere(`${alias}.channelId = :channelId`, { channelId });

    if (filter?.supplierId) {
      qb.andWhere(`${alias}.supplierId = :supplierId`, {
        supplierId: parseInt(String(filter.supplierId), 10),
      });
    }

    if (filter?.status) {
      qb.andWhere(`${alias}.status = :status`, { status: filter.status });
    }

    if (filter?.startDate) {
      qb.andWhere(`${alias}.purchaseDate >= :startDate`, {
        startDate: filter.startDate,
      });
    }

    if (filter?.endDate) {
      qb.andWhere(`${alias}.purchaseDate <= :endDate`, {
        endDate: filter.endDate,
      });
    }
  }

  /**
   * Get purchases with filtering and pagination
   */
  async getPurchases(
    ctx: RequestContext,
    options: PurchaseListOptions = {}
  ): Promise<{ items: StockPurchase[]; totalItems: number }> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const channelId = ctx.channelId as number;

    // Build base filter query for count
    const baseFilterQb = purchaseRepo.createQueryBuilder('purchase');
    this.applyPurchaseFilters(baseFilterQb, 'purchase', channelId, options.filter);

    // Get total count using lightweight query (no joins)
    const totalItems = await baseFilterQb.getCount();

    // Build items query with eager joins for the current page
    const itemsQb = purchaseRepo
      .createQueryBuilder('purchase')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('purchase.lines', 'lines')
      .leftJoinAndSelect('lines.variant', 'variant')
      .leftJoinAndSelect('lines.stockLocation', 'stockLocation');

    // Apply same filters to items query
    this.applyPurchaseFilters(itemsQb, 'purchase', channelId, options.filter);

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
   * Get a single purchase by ID
   */
  async getPurchaseById(ctx: RequestContext, id: string): Promise<StockPurchase | null> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const channelId = ctx.channelId as number;

    return purchaseRepo.findOne({
      where: { id, channelId },
      relations: ['lines', 'lines.variant', 'lines.stockLocation', 'supplier'],
    });
  }

  /**
   * Apply stock adjustment filters to a query builder
   */
  private applyStockAdjustmentFilters<T>(
    qb: any,
    alias: string,
    channelId: number,
    filter?: StockAdjustmentListOptions['filter']
  ): void {
    qb.andWhere(`${alias}.channelId = :channelId`, { channelId });

    if (filter?.reason) {
      qb.andWhere(`${alias}.reason = :reason`, {
        reason: filter.reason,
      });
    }

    if (filter?.startDate) {
      qb.andWhere(`${alias}.createdAt >= :startDate`, {
        startDate: filter.startDate,
      });
    }

    if (filter?.endDate) {
      qb.andWhere(`${alias}.createdAt <= :endDate`, {
        endDate: filter.endDate,
      });
    }
  }

  /**
   * Get stock adjustments with filtering and pagination
   */
  async getStockAdjustments(
    ctx: RequestContext,
    options: StockAdjustmentListOptions = {}
  ): Promise<{ items: InventoryStockAdjustment[]; totalItems: number }> {
    const adjustmentRepo = this.connection.getRepository(ctx, InventoryStockAdjustment);
    const channelId = ctx.channelId as number;

    // Build base filter query for count
    const baseFilterQb = adjustmentRepo.createQueryBuilder('adjustment');
    this.applyStockAdjustmentFilters(baseFilterQb, 'adjustment', channelId, options.filter);

    // Get total count using lightweight query (no joins)
    const totalItems = await baseFilterQb.getCount();

    // Build items query with eager joins for the current page
    const itemsQb = adjustmentRepo
      .createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.adjustedBy', 'adjustedBy')
      .leftJoinAndSelect('adjustment.lines', 'lines')
      .leftJoinAndSelect('lines.variant', 'variant')
      .leftJoinAndSelect('lines.stockLocation', 'stockLocation');

    // Apply same filters to items query
    this.applyStockAdjustmentFilters(itemsQb, 'adjustment', channelId, options.filter);

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
