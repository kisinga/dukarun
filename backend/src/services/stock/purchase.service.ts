import { Injectable, Logger } from '@nestjs/common';
import {
  Customer,
  ID,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { FinancialService } from '../financial/financial.service';
import { LedgerTransactionService } from '../financial/ledger-transaction.service';
import { PurchaseTransactionData } from '../financial/strategies/purchase-posting.strategy';
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
  payment?: {
    amount: number; // In smallest currency unit (cents)
    debitAccountCode?: string;
    reference?: string;
  };
  approvalId?: string;
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
    private readonly financialService: FinancialService,
    private readonly ledgerTransactionService: LedgerTransactionService
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
    purchase.channelId = ctx.channelId as number;
    // Convert Vendure ID (string) to integer for database
    purchase.supplierId = parseInt(String(input.supplierId), 10);
    purchase.purchaseDate = input.purchaseDate;
    purchase.referenceNumber = input.referenceNumber || null;
    purchase.totalCost = totalCost;
    purchase.paymentStatus = input.paymentStatus;
    purchase.notes = input.notes || null;
    purchase.isCreditPurchase = input.isCreditPurchase ?? false;

    const savedPurchase = await purchaseRepo.save(purchase);

    // Post purchase to ledger automatically (single source of truth)
    // Handles both credit purchases (AP) and cash purchases (Cash on Hand)
    const transactionData: PurchaseTransactionData = {
      ctx,
      sourceId: savedPurchase.id,
      channelId: ctx.channelId as number,
      purchaseId: savedPurchase.id,
      purchaseReference: savedPurchase.referenceNumber || savedPurchase.id,
      supplierId: input.supplierId.toString(),
      totalCost,
      isCreditPurchase: savedPurchase.isCreditPurchase,
    };

    const result = await this.ledgerTransactionService.postTransaction(transactionData);
    if (!result.success) {
      throw new Error(`Failed to post purchase to ledger: ${result.error}`);
    }

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
