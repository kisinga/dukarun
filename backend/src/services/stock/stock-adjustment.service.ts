import { Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
  InventoryStockAdjustment,
  InventoryStockAdjustmentLine,
} from './entities/stock-adjustment.entity';
import { StockValidationService } from './stock-validation.service';

export interface StockAdjustmentLineInput {
  variantId: ID;
  quantityChange: number; // Positive for increase, negative for decrease
  stockLocationId: ID;
}

export interface RecordStockAdjustmentInput {
  reason: string;
  notes?: string | null;
  lines: StockAdjustmentLineInput[];
}

/**
 * Stock Adjustment Service
 *
 * Handles adjustment-specific business logic.
 * Separated for single responsibility and testability.
 */
@Injectable()
export class StockAdjustmentService {
  private readonly logger = new Logger('StockAdjustmentService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly validationService: StockValidationService
  ) {}

  /**
   * Create adjustment record
   */
  async createAdjustmentRecord(
    ctx: RequestContext,
    input: RecordStockAdjustmentInput,
    stockMovements: Array<{
      variantId: ID;
      locationId: ID;
      previousStock: number;
      newStock: number;
    }>
  ): Promise<InventoryStockAdjustment> {
    // Create adjustment
    const adjustmentRepo = this.connection.getRepository(ctx, InventoryStockAdjustment);
    const adjustmentLineRepo = this.connection.getRepository(ctx, InventoryStockAdjustmentLine);

    // Create adjustment entity
    const adjustment = new InventoryStockAdjustment();
    adjustment.channelId = ctx.channelId as number;
    adjustment.reason = input.reason;
    adjustment.notes = input.notes || null;
    // Convert Vendure User ID (string) to integer for database
    adjustment.adjustedByUserId = ctx.activeUserId ? parseInt(String(ctx.activeUserId), 10) : null;

    const savedAdjustment = await adjustmentRepo.save(adjustment);

    // Create adjustment lines
    const adjustmentLines = input.lines.map((line, index) => {
      const movement = stockMovements[index];
      const adjustmentLine = new InventoryStockAdjustmentLine();
      adjustmentLine.adjustmentId = savedAdjustment.id;
      // Convert Vendure IDs (strings) to integers for database
      adjustmentLine.variantId = parseInt(String(line.variantId), 10);
      adjustmentLine.quantityChange = line.quantityChange;
      adjustmentLine.previousStock = movement.previousStock;
      adjustmentLine.newStock = movement.newStock;
      adjustmentLine.stockLocationId = parseInt(String(line.stockLocationId), 10);
      return adjustmentLine;
    });

    await adjustmentLineRepo.save(adjustmentLines);

    // Reload with relations
    const adjustmentWithLines = await adjustmentRepo.findOne({
      where: { id: savedAdjustment.id },
      relations: ['lines', 'adjustedBy'],
    });

    this.logger.log(`Created stock adjustment record: ${savedAdjustment.id}`);

    return adjustmentWithLines || savedAdjustment;
  }
}
