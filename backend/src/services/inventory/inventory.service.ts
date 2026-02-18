import { Injectable, Logger, Optional } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { LedgerPostingService } from '../financial/ledger-posting.service';
import {
  BatchAllocation,
  CostAllocationRequest,
  CostAllocationResult,
} from './interfaces/costing-strategy.interface';
import { FifoCostingStrategy } from './strategies/fifo-costing.strategy';
import { DefaultExpiryPolicy } from './policies/default-expiry.policy';
import {
  BatchFilters,
  CreateBatchInput,
  CreateMovementInput,
  InventoryBatch,
  InventoryMovement,
  MovementType,
  ValuationSnapshot,
} from './interfaces/inventory-store.interface';
import { SaleCogs } from './entities/sale-cogs.entity';
import { InventoryStoreService } from './inventory-store.service';

/**
 * Input for recording a purchase
 */
export interface RecordPurchaseInput {
  purchaseId: string;
  channelId: ID;
  stockLocationId: ID;
  supplierId: string;
  purchaseReference: string;
  isCreditPurchase: boolean;
  lines: Array<{
    productVariantId: ID;
    quantity: number;
    unitCost: number; // in cents
    expiryDate?: Date | null;
    batchNumber?: string | null;
  }>;
}

/**
 * Result of recording a purchase
 */
export interface PurchaseResult {
  purchaseId: string;
  batches: InventoryBatch[];
  movements: InventoryMovement[];
}

/**
 * Input for recording a sale
 */
export interface RecordSaleInput {
  orderId: string;
  orderCode: string;
  channelId: ID;
  stockLocationId: ID;
  customerId: string;
  /** Sale date (YYYY-MM-DD) for analytics; defaults to today */
  saleDate?: string;
  lines: Array<{
    productVariantId: ID;
    quantity: number;
    /** When set, sell from this batch only; otherwise use costing strategy. */
    batchId?: ID;
  }>;
}

/**
 * Result of recording a sale
 */
export interface SaleResult {
  orderId: string;
  allocations: BatchAllocation[];
  totalCogs: number; // in cents
  movements: InventoryMovement[];
}

/**
 * Input for recording an adjustment
 */
export interface RecordAdjustmentInput {
  adjustmentId: string;
  channelId: ID;
  stockLocationId: ID;
  reason: string;
  lines: Array<{
    productVariantId: ID;
    quantityChange: number; // positive for increase, negative for decrease
  }>;
}

/**
 * Result of recording an adjustment
 */
export interface AdjustmentResult {
  adjustmentId: string;
  movements: InventoryMovement[];
}

/**
 * Input for recording a write-off
 */
export interface RecordWriteOffInput {
  adjustmentId: string;
  channelId: ID;
  stockLocationId: ID;
  reason: string;
  lines: Array<{
    productVariantId: ID;
    quantity: number;
  }>;
}

/**
 * Result of recording a write-off
 */
export interface WriteOffResult {
  adjustmentId: string;
  allocations: BatchAllocation[];
  totalLoss: number; // in cents
  movements: InventoryMovement[];
}

/**
 * Input for creating opening stock batches (synthetic batches with unitCost 0)
 */
export interface CreateOpeningStockBatchesInput {
  channelId: ID;
  stockLocationId: ID;
  lines: Array<{
    productVariantId: ID;
    quantity: number;
  }>;
}

/**
 * Result of creating opening stock batches
 */
export interface OpeningStockBatchesResult {
  batches: InventoryBatch[];
  movements: InventoryMovement[];
}

/**
 * InventoryService
 *
 * High-level facade for inventory operations.
 * Orchestrates InventoryStore, CostingStrategy, ExpiryPolicy, and LedgerPostingService
 * with transaction boundaries and verification.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly inventoryStore: InventoryStoreService,
    private readonly costingStrategy: FifoCostingStrategy,
    private readonly expiryPolicy: DefaultExpiryPolicy,
    private readonly ledgerPostingService: LedgerPostingService
  ) {}

  /**
   * Record a purchase and create inventory batches
   */
  async recordPurchase(ctx: RequestContext, input: RecordPurchaseInput): Promise<PurchaseResult> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        const batches: InventoryBatch[] = [];
        const movements: InventoryMovement[] = [];

        // Create batches and movements for each line
        for (const line of input.lines) {
          // Create batch
          const batchInput: CreateBatchInput = {
            channelId: input.channelId,
            stockLocationId: input.stockLocationId,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            expiryDate: line.expiryDate || null,
            sourceType: 'Purchase',
            sourceId: input.purchaseId,
            batchNumber: line.batchNumber ?? null,
            metadata: {
              purchaseReference: input.purchaseReference,
              supplierId: input.supplierId,
            },
          };

          const batch = await this.inventoryStore.createBatch(transactionCtx, batchInput);
          batches.push(batch);

          // Verify batch was created
          const batchExists = await this.inventoryStore.verifyBatchExists(transactionCtx, batch.id);
          if (!batchExists) {
            throw new Error(`Failed to create batch for purchase ${input.purchaseId}`);
          }

          // Create movement
          const movementInput: CreateMovementInput = {
            channelId: input.channelId,
            stockLocationId: input.stockLocationId,
            productVariantId: line.productVariantId,
            movementType: MovementType.PURCHASE,
            quantity: line.quantity,
            batchId: batch.id,
            sourceType: 'Purchase',
            sourceId: input.purchaseId,
            metadata: {
              purchaseReference: input.purchaseReference,
              supplierId: input.supplierId,
            },
          };

          const movement = await this.inventoryStore.createMovement(transactionCtx, movementInput);
          movements.push(movement);

          // Call expiry policy hook
          await this.expiryPolicy.onBatchCreated(transactionCtx, batch);
        }

        // Post to ledger
        const totalCost = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);

        await this.ledgerPostingService.postInventoryPurchase(transactionCtx, input.purchaseId, {
          purchaseId: input.purchaseId,
          purchaseReference: input.purchaseReference,
          supplierId: input.supplierId,
          totalCost,
          isCreditPurchase: input.isCreditPurchase,
          batchAllocations: batches.map(b => ({
            batchId: String(b.id),
            quantity: b.quantity,
            unitCost: b.unitCost,
          })),
        });

        this.logger.log(
          `Recorded purchase ${input.purchaseId}: ${batches.length} batches, total cost: ${totalCost}`
        );

        return {
          purchaseId: input.purchaseId,
          batches,
          movements,
        };
      } catch (error) {
        this.logger.error(
          `Failed to record purchase ${input.purchaseId}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * Record a sale and allocate COGS
   */
  async recordSale(ctx: RequestContext, input: RecordSaleInput): Promise<SaleResult> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        const allAllocations: BatchAllocation[] = [];
        const movements: InventoryMovement[] = [];
        const lineCogsRows: Array<{ productVariantId: ID; quantity: number; cogsCents: number }> =
          [];

        // Process each line
        for (const line of input.lines) {
          let allocationResult: CostAllocationResult;

          if (line.batchId) {
            // Single-batch path: sell from the specified batch only
            const batches = await this.inventoryStore.getOpenBatches(transactionCtx, {
              channelId: input.channelId,
              stockLocationId: input.stockLocationId,
              productVariantId: line.productVariantId,
            });
            const batch = batches.find(b => String(b.id) === String(line.batchId));
            if (!batch) {
              throw new UserInputError(
                `Batch ${line.batchId} not found or not available for variant ${line.productVariantId}`
              );
            }
            if (batch.quantity < line.quantity) {
              throw new UserInputError(
                `Insufficient quantity in batch ${line.batchId}. Available: ${batch.quantity}, requested: ${line.quantity}`
              );
            }
            const expiryValidation = await this.expiryPolicy.validateBeforeConsume(
              transactionCtx,
              batch,
              line.quantity,
              MovementType.SALE
            );
            if (!expiryValidation.allowed) {
              throw new UserInputError(
                expiryValidation.error || 'Cannot consume batch due to expiry policy'
              );
            }
            if (expiryValidation.warning) {
              this.logger.warn(expiryValidation.warning);
            }
            const totalCost = batch.unitCost * line.quantity;
            allocationResult = {
              allocations: [
                {
                  batchId: batch.id,
                  quantity: line.quantity,
                  unitCost: batch.unitCost,
                  totalCost,
                },
              ],
              totalCost,
              metadata: {},
            };
          } else {
            // Strategy path: use costing strategy to allocate
            const hasStock = await this.inventoryStore.verifyStockLevel(
              transactionCtx,
              line.productVariantId,
              input.stockLocationId,
              line.quantity
            );
            if (!hasStock) {
              throw new UserInputError(
                `Insufficient stock for variant ${line.productVariantId}. Requested: ${line.quantity}`
              );
            }
            const allocationRequest: CostAllocationRequest = {
              channelId: input.channelId,
              stockLocationId: input.stockLocationId,
              productVariantId: line.productVariantId,
              quantity: line.quantity,
              sourceType: 'Order',
              sourceId: input.orderId,
              metadata: {
                orderCode: input.orderCode,
                customerId: input.customerId,
              },
            };
            allocationResult = await this.costingStrategy.allocateCost(
              transactionCtx,
              allocationRequest
            );
          }

          // Validate expiry and consume for each allocation (same path for both)
          for (const allocation of allocationResult.allocations) {
            const batches = await this.inventoryStore.getOpenBatches(transactionCtx, {
              channelId: input.channelId,
              stockLocationId: input.stockLocationId,
              productVariantId: line.productVariantId,
            });
            const allocatedBatch = batches.find(b => b.id === allocation.batchId);
            if (!allocatedBatch) {
              throw new Error(`Batch ${allocation.batchId} not found`);
            }
            const expiryValidation = await this.expiryPolicy.validateBeforeConsume(
              transactionCtx,
              allocatedBatch,
              allocation.quantity,
              MovementType.SALE
            );
            if (!expiryValidation.allowed) {
              throw new UserInputError(
                expiryValidation.error || 'Cannot consume batch due to expiry policy'
              );
            }
            if (expiryValidation.warning) {
              this.logger.warn(expiryValidation.warning);
            }
            await this.inventoryStore.updateBatchQuantity(
              transactionCtx,
              allocation.batchId,
              -allocation.quantity
            );
            const movementInput: CreateMovementInput = {
              channelId: input.channelId,
              stockLocationId: input.stockLocationId,
              productVariantId: line.productVariantId,
              movementType: MovementType.SALE,
              quantity: -allocation.quantity,
              batchId: allocation.batchId,
              sourceType: 'Order',
              sourceId: input.orderId,
              metadata: {
                orderCode: input.orderCode,
                customerId: input.customerId,
              },
            };
            const movement = await this.inventoryStore.createMovement(
              transactionCtx,
              movementInput
            );
            movements.push(movement);
          }

          allAllocations.push(...allocationResult.allocations);
          const lineCogs = allocationResult.allocations.reduce((sum, a) => sum + a.totalCost, 0);
          lineCogsRows.push({
            productVariantId: line.productVariantId,
            quantity: line.quantity,
            cogsCents: lineCogs,
          });
        }

        // Calculate total COGS
        const totalCogs = allAllocations.reduce((sum, alloc) => sum + alloc.totalCost, 0);

        // Post COGS to ledger
        await this.ledgerPostingService.postInventorySaleCogs(transactionCtx, input.orderId, {
          orderId: input.orderId,
          orderCode: input.orderCode,
          customerId: input.customerId,
          cogsAllocations: allAllocations.map(a => ({
            batchId: String(a.batchId),
            quantity: a.quantity,
            unitCost: a.unitCost,
            totalCost: a.totalCost,
          })),
          totalCogs,
        });

        // Persist sale_cogs for analytics (same transaction)
        const saleDate = input.saleDate ?? new Date().toISOString().slice(0, 10);
        const saleCogsRepo = this.connection.getRepository(transactionCtx, SaleCogs);
        for (const row of lineCogsRows) {
          const saleCogs = saleCogsRepo.create({
            channelId: Number(input.channelId),
            orderId: input.orderId,
            orderLineId: null,
            productVariantId: Number(row.productVariantId),
            saleDate,
            quantity: row.quantity,
            cogsCents: row.cogsCents,
            source: 'fifo',
          });
          await saleCogsRepo.save(saleCogs);
        }

        this.logger.log(
          `Recorded sale ${input.orderId}: ${allAllocations.length} allocations, total COGS: ${totalCogs}`
        );

        return {
          orderId: input.orderId,
          allocations: allAllocations,
          totalCogs,
          movements,
        };
      } catch (error) {
        this.logger.error(
          `Failed to record sale ${input.orderId}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * Create opening stock batches for variants that have no batches at the given location.
   * Idempotent: deterministic sourceId per (variant, location) so duplicate calls return existing batch.
   * Used when a variant receives initial stock (product create or first stock set).
   */
  async createOpeningStockBatches(
    ctx: RequestContext,
    input: CreateOpeningStockBatchesInput
  ): Promise<OpeningStockBatchesResult> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      const batches: InventoryBatch[] = [];
      const movements: InventoryMovement[] = [];

      for (const line of input.lines) {
        if (line.quantity <= 0) continue;

        const sourceId = `OpeningStock:${line.productVariantId}:${input.stockLocationId}`;
        const batchInput: CreateBatchInput = {
          channelId: input.channelId,
          stockLocationId: input.stockLocationId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          unitCost: 0,
          expiryDate: null,
          sourceType: 'OpeningStock',
          sourceId,
        };

        const batch = await this.inventoryStore.createBatch(transactionCtx, batchInput);
        batches.push(batch);

        const movementInput: CreateMovementInput = {
          channelId: input.channelId,
          stockLocationId: input.stockLocationId,
          productVariantId: line.productVariantId,
          movementType: MovementType.PURCHASE,
          quantity: line.quantity,
          batchId: batch.id,
          sourceType: 'OpeningStock',
          sourceId,
          metadata: { openingStock: true },
        };
        const movement = await this.inventoryStore.createMovement(transactionCtx, movementInput);
        movements.push(movement);
      }

      this.logger.log(
        `Created ${batches.length} opening stock batch(es) at location ${input.stockLocationId}`
      );
      return { batches, movements };
    });
  }

  /**
   * Ensure a variant has an opening-stock batch at the given location when it has no batches.
   * Call when stock is set (e.g. after adjustStockLevel) so FIFO/recordSale always has a batch to consume.
   * No-op if the variant already has batches at this location.
   */
  async ensureOpeningStockBatchIfNeeded(
    ctx: RequestContext,
    productVariantId: ID,
    stockLocationId: ID,
    quantity: number
  ): Promise<OpeningStockBatchesResult | null> {
    if (quantity <= 0) return null;

    const existing = await this.inventoryStore.getOpenBatches(ctx, {
      channelId: ctx.channelId as number,
      stockLocationId,
      productVariantId,
    });
    if (existing.length > 0) return null;

    return this.createOpeningStockBatches(ctx, {
      channelId: ctx.channelId as ID,
      stockLocationId,
      lines: [{ productVariantId, quantity }],
    });
  }

  /**
   * Reverse a sale: restore batch quantities from SALE movements for this order,
   * create reversal movements, and void sale_cogs rows so analytics exclude the order.
   * Idempotent: if OrderReversal movements already exist for this order, no-op.
   */
  async reverseSale(ctx: RequestContext, orderId: string): Promise<void> {
    await this.connection.withTransaction(ctx, async transactionCtx => {
      const channelId = ctx.channelId as number;

      const allReversals = await this.inventoryStore.getMovements(transactionCtx, {
        channelId,
        sourceType: 'OrderReversal',
      });
      const existingReversal = allReversals.filter(m =>
        m.sourceId.startsWith(`${orderId}-reversal`)
      );
      if (existingReversal.length > 0) {
        this.logger.log(
          `Reversal already applied for order ${orderId}, skipping inventory reverseSale`
        );
        await this.voidSaleCogsForOrder(transactionCtx, orderId);
        return;
      }

      const saleMovements = await this.inventoryStore.getMovements(transactionCtx, {
        channelId,
        sourceType: 'Order',
        sourceId: orderId,
      });

      if (saleMovements.length === 0) {
        await this.voidSaleCogsForOrder(transactionCtx, orderId);
        return;
      }

      for (const mov of saleMovements) {
        if (mov.movementType !== MovementType.SALE || mov.quantity >= 0) continue;
        const batchId = mov.batchId ?? mov.batch?.id;
        if (!batchId) continue;

        const restoreQty = Math.abs(mov.quantity);
        await this.inventoryStore.updateBatchQuantity(transactionCtx, batchId, restoreQty);

        const reversalSourceId = `${orderId}-reversal-${batchId}`;
        const movementInput: CreateMovementInput = {
          channelId,
          stockLocationId: mov.stockLocationId,
          productVariantId: mov.productVariantId,
          movementType: MovementType.PURCHASE,
          quantity: restoreQty,
          batchId,
          sourceType: 'OrderReversal',
          sourceId: reversalSourceId,
          metadata: { reversedOrderId: orderId },
        };
        await this.inventoryStore.createMovement(transactionCtx, movementInput);
      }

      await this.voidSaleCogsForOrder(transactionCtx, orderId);
      this.logger.log(`Reversed sale for order ${orderId}: restored batches, voided sale_cogs`);
    });
  }

  private async voidSaleCogsForOrder(ctx: RequestContext, orderId: string): Promise<void> {
    const repo = this.connection.getRepository(ctx, SaleCogs);
    await repo.delete({ orderId });
  }

  /**
   * Record a stock adjustment
   */
  async recordAdjustment(
    ctx: RequestContext,
    input: RecordAdjustmentInput
  ): Promise<AdjustmentResult> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        const movements: InventoryMovement[] = [];

        for (const line of input.lines) {
          // Create movement
          const movementInput: CreateMovementInput = {
            channelId: input.channelId,
            stockLocationId: input.stockLocationId,
            productVariantId: line.productVariantId,
            movementType: MovementType.ADJUSTMENT,
            quantity: line.quantityChange,
            batchId: null, // Adjustments don't reference specific batches
            sourceType: 'Adjustment',
            sourceId: input.adjustmentId,
            metadata: {
              reason: input.reason,
            },
          };

          const movement = await this.inventoryStore.createMovement(transactionCtx, movementInput);
          movements.push(movement);
        }

        this.logger.log(`Recorded adjustment ${input.adjustmentId}: ${movements.length} movements`);

        return {
          adjustmentId: input.adjustmentId,
          movements,
        };
      } catch (error) {
        this.logger.error(
          `Failed to record adjustment ${input.adjustmentId}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * Record a write-off with COGS allocation
   */
  async recordWriteOff(ctx: RequestContext, input: RecordWriteOffInput): Promise<WriteOffResult> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        const allAllocations: BatchAllocation[] = [];
        const movements: InventoryMovement[] = [];

        for (const line of input.lines) {
          // Allocate cost for write-off
          const allocationRequest: CostAllocationRequest = {
            channelId: input.channelId,
            stockLocationId: input.stockLocationId,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
            sourceType: 'WriteOff',
            sourceId: input.adjustmentId,
            metadata: {
              reason: input.reason,
            },
          };

          const allocationResult = await this.costingStrategy.allocateCost(
            transactionCtx,
            allocationRequest
          );

          // Update batch quantities and create movements
          for (const allocation of allocationResult.allocations) {
            // Update batch quantity
            await this.inventoryStore.updateBatchQuantity(
              transactionCtx,
              allocation.batchId,
              -allocation.quantity
            );

            // Create movement
            const movementInput: CreateMovementInput = {
              channelId: input.channelId,
              stockLocationId: input.stockLocationId,
              productVariantId: line.productVariantId,
              movementType: MovementType.WRITE_OFF,
              quantity: -allocation.quantity,
              batchId: allocation.batchId,
              sourceType: 'WriteOff',
              sourceId: input.adjustmentId,
              metadata: {
                reason: input.reason,
              },
            };

            const movement = await this.inventoryStore.createMovement(
              transactionCtx,
              movementInput
            );
            movements.push(movement);
          }

          allAllocations.push(...allocationResult.allocations);
        }

        // Calculate total loss
        const totalLoss = allAllocations.reduce((sum, alloc) => sum + alloc.totalCost, 0);

        // Post write-off to ledger
        await this.ledgerPostingService.postInventoryWriteOff(transactionCtx, input.adjustmentId, {
          adjustmentId: input.adjustmentId,
          reason: input.reason,
          batchAllocations: allAllocations.map(a => ({
            batchId: String(a.batchId),
            quantity: a.quantity,
            unitCost: a.unitCost,
            totalCost: a.totalCost,
          })),
          totalLoss,
        });

        this.logger.log(
          `Recorded write-off ${input.adjustmentId}: ${allAllocations.length} allocations, total loss: ${totalLoss}`
        );

        return {
          adjustmentId: input.adjustmentId,
          allocations: allAllocations,
          totalLoss,
          movements,
        };
      } catch (error) {
        this.logger.error(
          `Failed to record write-off ${input.adjustmentId}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * Get valuation snapshot
   */
  async getValuation(ctx: RequestContext, filters: BatchFilters): Promise<ValuationSnapshot> {
    return this.inventoryStore.getValuationSnapshot(ctx, filters);
  }

  /**
   * Get open batches
   */
  async getOpenBatches(ctx: RequestContext, filters: BatchFilters): Promise<InventoryBatch[]> {
    return this.inventoryStore.getOpenBatches(ctx, filters);
  }
}
