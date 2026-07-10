import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Reconciliation } from '../../domain/recon/reconciliation.entity';
import { InventoryBatch } from '../inventory/entities/inventory-batch.entity';
import { AccountBalanceService } from './account-balance.service';
import { LedgerPostingService } from './ledger-posting.service';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import {
  InventoryReconciliationResult,
  InventoryValuation,
  toScopeRefId,
} from './period-management.types';

export interface CreateInventoryReconciliationInput {
  channelId: number;
  periodEndDate: string;
  stockLocationId?: number;
  actualBalance: string; // in smallest currency unit
  notes?: string;
}

/**
 * Inventory Reconciliation Service
 *
 * IMPORTANT: The ledger is the SINGLE SOURCE OF TRUTH for financial figures.
 * This service reconciles inventory valuation (from inventory_batch table) against
 * the ledger INVENTORY account balance. The ledger balance is authoritative.
 */
@Injectable()
export class InventoryReconciliationService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly accountBalanceService: AccountBalanceService,
    private readonly ledgerPostingService: LedgerPostingService
  ) {}

  /**
   * Calculate inventory valuation from inventory_batch table
   */
  async calculateInventoryValuation(
    ctx: RequestContext,
    channelId: number,
    asOfDate: string,
    stockLocationId?: number
  ): Promise<InventoryValuation> {
    const batchRepo = this.connection.getRepository(ctx, InventoryBatch);

    // Convert asOfDate to timestamp for comparison
    const asOfTimestamp = new Date(asOfDate);
    asOfTimestamp.setHours(23, 59, 59, 999); // End of day

    let queryBuilder = batchRepo
      .createQueryBuilder('batch')
      .where('batch.channelId = :channelId', { channelId })
      .andWhere('batch.createdAt <= :asOfTimestamp', { asOfTimestamp });

    if (stockLocationId) {
      queryBuilder = queryBuilder.andWhere('batch.stockLocationId = :stockLocationId', {
        stockLocationId,
      });
    }

    // Sum quantity * unitCost for all batches
    const result = await queryBuilder
      .select('SUM(batch.quantity * batch.unitCost)', 'totalValue')
      .addSelect('COUNT(DISTINCT batch.id)', 'batchCount')
      .addSelect('COUNT(DISTINCT batch.productVariantId)', 'itemCount')
      .getRawOne();

    const totalValue = result?.totalValue ? BigInt(result.totalValue).toString() : '0';
    const batchCount = parseInt(result?.batchCount || '0', 10);
    const itemCount = parseInt(result?.itemCount || '0', 10);

    return {
      channelId,
      stockLocationId,
      asOfDate,
      totalValue,
      batchCount,
      itemCount,
    };
  }

  /**
   * Reconcile inventory valuation vs ledger
   */
  async reconcileInventoryVsLedger(
    ctx: RequestContext,
    channelId: number,
    periodEndDate: string,
    stockLocationId?: number
  ): Promise<InventoryReconciliationResult> {
    // Calculate inventory valuation
    const inventoryValuation = await this.calculateInventoryValuation(
      ctx,
      channelId,
      periodEndDate,
      stockLocationId
    );

    // Get ledger INVENTORY account balance
    const ledgerBalance = await this.accountBalanceService.getAccountBalance(
      ctx,
      ACCOUNT_CODES.INVENTORY,
      channelId,
      { asOfDate: periodEndDate }
    );

    const ledgerBalanceStr = BigInt(ledgerBalance.balance).toString();
    const inventoryValuationStr = inventoryValuation.totalValue;

    // Calculate variance (ledger balance - inventory valuation)
    const variance = (BigInt(ledgerBalanceStr) - BigInt(inventoryValuationStr)).toString();

    return {
      channelId,
      stockLocationId,
      periodEndDate,
      ledgerBalance: ledgerBalanceStr,
      inventoryValuation: inventoryValuationStr,
      variance,
    };
  }

  /**
   * Repair ledger INVENTORY account so it matches the batch valuation.
   * Batches are the operational SSOT for stock; this posts an adjustment to make
   * the ledger follow the model.
   */
  async reconcileToModel(
    ctx: RequestContext,
    channelId: number,
    reason: string,
    stockLocationId?: number
  ): Promise<InventoryReconciliationResult> {
    const periodEndDate = new Date().toISOString().slice(0, 10);
    const result = await this.reconcileInventoryVsLedger(
      ctx,
      channelId,
      periodEndDate,
      stockLocationId
    );

    const valueChangeCents = Number(
      BigInt(result.inventoryValuation) - BigInt(result.ledgerBalance)
    );
    if (valueChangeCents !== 0) {
      const sourceId = `inventory-reconciliation:${channelId}:${stockLocationId ?? 'ALL'}:${Date.now()}`;
      await this.ledgerPostingService.postInventoryAdjustment(ctx, sourceId, {
        valueChangeCents,
        reason,
        adjustmentId: sourceId,
      });
    }

    return result;
  }

  /**
   * Create inventory reconciliation record
   */
  async createInventoryReconciliation(
    ctx: RequestContext,
    input: CreateInventoryReconciliationInput
  ): Promise<Reconciliation> {
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);

    // Calculate expected balance from inventory valuation
    const inventoryValuation = await this.calculateInventoryValuation(
      ctx,
      input.channelId,
      input.periodEndDate,
      input.stockLocationId
    );

    // Calculate variance
    const expectedBalance = BigInt(inventoryValuation.totalValue);
    const actualBalance = BigInt(input.actualBalance);
    const varianceAmount = (expectedBalance - actualBalance).toString();

    const scopeRefId = toScopeRefId({
      scope: 'inventory',
      stockLocationId: input.stockLocationId ?? 'ALL',
    });

    const createdBy = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : 0;

    const reconciliation = reconciliationRepo.create({
      channelId: input.channelId,
      scope: 'inventory',
      scopeRefId,
      snapshotAt: input.periodEndDate,
      status: 'verified',
      expectedBalance: inventoryValuation.totalValue,
      actualBalance: input.actualBalance,
      varianceAmount,
      notes: input.notes || null,
      createdBy,
    });

    return reconciliationRepo.save(reconciliation);
  }
}
