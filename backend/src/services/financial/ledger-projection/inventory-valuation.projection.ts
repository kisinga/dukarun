import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ACCOUNT_CODES } from '../../../ledger/account-codes.constants';
import { FinancialService } from '../financial.service';
import { InventoryReconciliationService } from '../inventory-reconciliation.service';
import { LedgerProjection } from './ledger-projection.interface';

export interface InventoryValuationSnapshot {
  totalValue: number;
  batchCount: number;
  itemCount: number;
}

/**
 * Value object representing the channel's inventory valuation at a point in time.
 * Used as the entity for the ledger projection.
 */
export class InventoryValuation {
  constructor(
    readonly channelId: number,
    readonly stockLocationId: number | undefined,
    readonly snapshot: InventoryValuationSnapshot
  ) {}
}

/**
 * Inventory Valuation Projection
 *
 * Compares the batch-based inventory valuation (quantity * unitCost)
 * with the ledger INVENTORY account balance.
 */
@Injectable()
export class InventoryValuationProjection implements LedgerProjection<
  InventoryValuation,
  InventoryValuationSnapshot
> {
  readonly entityType = 'Inventory';
  readonly toleranceCents = 1;

  constructor(
    private readonly inventoryReconciliation: InventoryReconciliationService,
    private readonly financialService: FinancialService
  ) {}

  computeFromEntity(entity: InventoryValuation): InventoryValuationSnapshot {
    return entity.snapshot;
  }

  async fetchFromLedger(
    ctx: RequestContext,
    entity: InventoryValuation
  ): Promise<InventoryValuationSnapshot> {
    const balance = await this.financialService.getAccountBalance(ctx, ACCOUNT_CODES.INVENTORY);
    return {
      totalValue: balance,
      batchCount: entity.snapshot.batchCount,
      itemCount: entity.snapshot.itemCount,
    };
  }

  compare(
    entitySnapshot: InventoryValuationSnapshot,
    ledgerSnapshot: InventoryValuationSnapshot
  ): { difference: number } {
    return {
      difference: entitySnapshot.totalValue - ledgerSnapshot.totalValue,
    };
  }

  /**
   * Load the entity-model view of inventory valuation.
   * The projection interface is synchronous, so the async loading lives here.
   */
  async loadEntity(
    ctx: RequestContext,
    channelId: number,
    stockLocationId?: number
  ): Promise<InventoryValuation> {
    const asOfDate = new Date().toISOString().slice(0, 10);
    const valuation = await this.inventoryReconciliation.calculateInventoryValuation(
      ctx,
      channelId,
      asOfDate,
      stockLocationId
    );
    return new InventoryValuation(channelId, stockLocationId, {
      totalValue: Number(valuation.totalValue),
      batchCount: valuation.batchCount,
      itemCount: valuation.itemCount,
    });
  }
}
