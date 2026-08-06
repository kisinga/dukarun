import { Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { startOfDay } from '../../utils/date.utils';
import { FinancialService } from '../financial/financial.service';
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
    overdueOnly?: boolean;
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

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly financialService: FinancialService
  ) {}

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

    if (filter?.overdueOnly) {
      qb.andWhere(`${alias}.isCreditPurchase = :isCreditPurchase`, {
        isCreditPurchase: true,
      }).andWhere(`${alias}.dueDate < :startOfToday`, {
        startOfToday: startOfDay(new Date()),
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

    // Overdue list must be filtered by the ledger AP balance, not paymentStatus.
    if (options.filter?.overdueOnly) {
      return this.getOverduePurchases(ctx, options);
    }

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

  private async getOverduePurchases(
    ctx: RequestContext,
    options: PurchaseListOptions
  ): Promise<{ items: StockPurchase[]; totalItems: number }> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const channelId = ctx.channelId as number;

    // Candidate purchases: credit, past due date, other filters applied.
    const candidateQb = purchaseRepo
      .createQueryBuilder('purchase')
      .select('purchase.id', 'id')
      .addSelect('purchase.purchaseDate', 'purchaseDate');
    this.applyPurchaseFilters(candidateQb, 'purchase', channelId, options.filter);
    candidateQb.orderBy('purchase.purchaseDate', 'DESC');

    const candidateRows = (await candidateQb.getRawMany()) as Array<{
      id: string;
      purchaseDate: Date;
    }>;
    const candidateIds = candidateRows.map(r => r.id);

    // Batch-read AP balances and keep purchases that still owe money.
    const statuses = await this.financialService.getPurchasePaymentStatuses(ctx, candidateIds);
    const owingIds = candidateIds.filter(id => (statuses.get(id)?.amountOwing ?? 0) > 0);

    const totalItems = owingIds.length;
    const skip = options.skip ?? 0;
    const take = options.take ?? 50;
    const pageIds = owingIds.slice(skip, skip + take);

    if (pageIds.length === 0) {
      return { items: [], totalItems };
    }

    const items = await purchaseRepo
      .createQueryBuilder('purchase')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('purchase.lines', 'lines')
      .leftJoinAndSelect('lines.variant', 'variant')
      .leftJoinAndSelect('lines.stockLocation', 'stockLocation')
      .whereInIds(pageIds)
      .orderBy('purchase.purchaseDate', 'DESC')
      .getMany();

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
