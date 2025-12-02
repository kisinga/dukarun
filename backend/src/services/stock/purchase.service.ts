import { Injectable, Logger } from '@nestjs/common';
import {
  Customer,
  ID,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { FinancialService } from '../financial/financial.service';
import { StockPurchase, StockPurchaseLine } from './entities/purchase.entity';
import { StockValidationService } from './stock-validation.service';

export interface PurchaseLineInput {
  variantId: ID;
  quantity: number;
  unitCost: number; // In smallest currency unit (cents)
  stockLocationId: ID;
}

export interface RecordPurchaseInput {
  supplierId: ID;
  purchaseDate: Date;
  referenceNumber?: string | null;
  paymentStatus: string;
  notes?: string | null;
  lines: PurchaseLineInput[];
  isCreditPurchase?: boolean;
}

/**
 * Purchase Service
 *
 * Handles purchase-specific business logic.
 * Separated for single responsibility and testability.
 */
@Injectable()
export class PurchaseService {
  private readonly logger = new Logger('PurchaseService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly validationService: StockValidationService,
    private readonly financialService: FinancialService
  ) {}

  /**
   * Create purchase record
   */
  async createPurchaseRecord(
    ctx: RequestContext,
    input: RecordPurchaseInput
  ): Promise<StockPurchase> {
    // Validate supplier exists
    const customerRepo = this.connection.getRepository(ctx, Customer);
    const supplier = await customerRepo.findOne({
      where: { id: input.supplierId },
    });

    if (!supplier) {
      throw new UserInputError(`Supplier ${input.supplierId} not found`);
    }

    // Validate supplier is marked as supplier
    const customFields = supplier.customFields as any;
    if (!customFields?.isSupplier) {
      throw new UserInputError(`Customer ${input.supplierId} is not marked as a supplier.`);
    }

    // Calculate total cost
    const totalCost = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);

    // Create purchase
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const purchaseLineRepo = this.connection.getRepository(ctx, StockPurchaseLine);

    // Create purchase entity
    const purchase = new StockPurchase();
    // Convert Vendure ID (string) to integer for database
    purchase.supplierId = parseInt(String(input.supplierId), 10);
    purchase.purchaseDate = input.purchaseDate;
    purchase.referenceNumber = input.referenceNumber || null;
    purchase.totalCost = totalCost;
    purchase.paymentStatus = input.paymentStatus;
    purchase.notes = input.notes || null;
    purchase.isCreditPurchase = input.isCreditPurchase ?? false;

    const savedPurchase = await purchaseRepo.save(purchase);

    // Post purchase to ledger (single source of truth)
    // Handles both credit purchases (AP) and cash purchases (Cash on Hand)
    await this.financialService.recordPurchase(
      ctx,
      savedPurchase.id,
      savedPurchase.referenceNumber || savedPurchase.id,
      input.supplierId.toString(),
      totalCost,
      savedPurchase.isCreditPurchase
    );

    // Create purchase lines
    const purchaseLines = input.lines.map(line => {
      const purchaseLine = new StockPurchaseLine();
      purchaseLine.purchaseId = savedPurchase.id;
      // Convert Vendure IDs (strings) to integers for database
      purchaseLine.variantId = parseInt(String(line.variantId), 10);
      purchaseLine.quantity = line.quantity;
      purchaseLine.unitCost = line.unitCost;
      purchaseLine.totalCost = line.quantity * line.unitCost;
      purchaseLine.stockLocationId = parseInt(String(line.stockLocationId), 10);
      return purchaseLine;
    });

    await purchaseLineRepo.save(purchaseLines);

    // Reload with relations
    const purchaseWithLines = await purchaseRepo.findOne({
      where: { id: savedPurchase.id },
      relations: ['lines', 'supplier'],
    });

    this.logger.log(`Created purchase record: ${savedPurchase.id}`);

    return purchaseWithLines || savedPurchase;
  }
}
