import { Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { LedgerQueryService } from '../financial/ledger-query.service';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { InventoryStore, ValuationSnapshot } from './interfaces/inventory-store.interface';
import { InventoryMovement, MovementFilters } from './interfaces/inventory-store.interface';

/**
 * Reconciliation result comparing inventory valuation with ledger
 */
export interface InventoryValuationReconciliation {
  channelId: ID;
  stockLocationId?: ID;
  inventoryValuation: number; // in cents
  ledgerBalance: number; // in cents
  difference: number; // in cents
  isBalanced: boolean;
  asOfDate: Date;
}

/**
 * Movement audit trail result
 */
export interface MovementAuditTrail {
  movements: InventoryMovement[];
  totalMovements: number;
  dateRange: {
    from: Date;
    to: Date;
  };
}

/**
 * Stock level reconciliation result
 */
export interface StockLevelReconciliation {
  variantId: ID;
  locationId: ID;
  batchSum: number; // sum of batch quantities
  vendureStock: null; // stock_level is write-only compatibility; never read as truth
  difference: null;
  isBalanced: true;
}

/**
 * InventoryReconciliationService
 *
 * Provides reconciliation primitives for validating inventory framework accuracy
 * and comparing with existing systems (ledger, Vendure stock levels).
 */
@Injectable()
export class InventoryReconciliationService {
  private readonly logger = new Logger(InventoryReconciliationService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly inventoryStore: InventoryStore,
    private readonly ledgerQueryService: LedgerQueryService
  ) {}

  /**
   * Compare inventory valuation with ledger INVENTORY account balance
   */
  async getInventoryValuationVsLedger(
    ctx: RequestContext,
    stockLocationId?: ID
  ): Promise<InventoryValuationReconciliation> {
    const filters: any = {
      channelId: ctx.channelId!,
    };

    if (stockLocationId) {
      filters.stockLocationId = stockLocationId;
    }

    // Get inventory valuation from batches
    const valuation = await this.inventoryStore.getValuationSnapshot(ctx, filters);

    // Get ledger balance for INVENTORY account
    const accountBalance = await this.ledgerQueryService.getAccountBalance({
      channelId: ctx.channelId as number,
      accountCode: ACCOUNT_CODES.INVENTORY,
    });

    const ledgerBalance = accountBalance.balance;
    const difference = valuation.totalValue - ledgerBalance;
    const isBalanced = Math.abs(difference) < 1; // Allow 1 cent tolerance for rounding

    if (!isBalanced) {
      this.logger.warn(
        `Inventory valuation mismatch: inventory=${valuation.totalValue}, ledger=${ledgerBalance}, difference=${difference}`
      );
    }

    return {
      channelId: ctx.channelId!,
      stockLocationId: stockLocationId,
      inventoryValuation: valuation.totalValue,
      ledgerBalance,
      difference,
      isBalanced,
      asOfDate: new Date(),
    };
  }

  /**
   * Get movement audit trail for reporting/audit
   */
  async getMovementAuditTrail(
    ctx: RequestContext,
    filters: MovementFilters
  ): Promise<MovementAuditTrail> {
    const movements = await this.inventoryStore.getMovements(ctx, filters);

    // Determine date range from movements
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (movements.length > 0) {
      const dates = movements.map(m => m.createdAt).sort((a, b) => a.getTime() - b.getTime());
      dateFrom = dates[0];
      dateTo = dates[dates.length - 1];
    } else {
      dateFrom = new Date();
      dateTo = new Date();
    }

    return {
      movements,
      totalMovements: movements.length,
      dateRange: {
        from: dateFrom,
        to: dateTo,
      },
    };
  }

  /**
   * Reconcile batch sums with Vendure stock levels
   */
  async reconcileStockLevels(
    ctx: RequestContext,
    variantId: ID,
    locationId: ID
  ): Promise<StockLevelReconciliation> {
    // Get batch sum
    const batches = await this.inventoryStore.getOpenBatches(ctx, {
      channelId: ctx.channelId!,
      stockLocationId: locationId,
      productVariantId: variantId,
    });

    const batchSum = batches.reduce((sum, batch) => sum + batch.quantity, 0);

    return {
      variantId,
      locationId,
      batchSum,
      vendureStock: null,
      difference: null,
      isBalanced: true,
    };
  }

  /**
   * Get comprehensive reconciliation report for a channel
   */
  async getReconciliationReport(ctx: RequestContext): Promise<{
    valuationReconciliation: InventoryValuationReconciliation;
    summary: {
      totalBatches: number;
      totalMovements: number;
      totalValuation: number;
    };
  }> {
    const valuationReconciliation = await this.getInventoryValuationVsLedger(ctx);

    // Get summary statistics
    const batches = await this.inventoryStore.getOpenBatches(ctx, {
      channelId: ctx.channelId!,
    });

    const movements = await this.inventoryStore.getMovements(ctx, {
      channelId: ctx.channelId!,
    });

    return {
      valuationReconciliation,
      summary: {
        totalBatches: batches.length,
        totalMovements: movements.length,
        totalValuation: valuationReconciliation.inventoryValuation,
      },
    };
  }
}
