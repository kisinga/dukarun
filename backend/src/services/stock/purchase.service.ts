import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { AuditService } from '../../infrastructure/audit/audit.service';
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
  saveAsDraft?: boolean;
}

export interface UpdateDraftPurchaseInput {
  supplierId?: ID;
  purchaseDate?: Date;
  referenceNumber?: string | null;
  notes?: string | null;
  lines?: PurchaseLineInput[];
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
    private readonly ledgerTransactionService: LedgerTransactionService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Create draft purchase record (Purchase Order).
   * No ledger posting, no stock movements. For use when saveAsDraft is true.
   */
  async createDraftPurchaseRecord(
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

    const customFields = supplier.customFields as any;
    if (!customFields?.isSupplier) {
      throw new UserInputError(`Customer ${input.supplierId} is not marked as a supplier.`);
    }

    const totalCost = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const purchaseLineRepo = this.connection.getRepository(ctx, StockPurchaseLine);

    const purchase = new StockPurchase();
    purchase.channelId = ctx.channelId as number;
    purchase.supplierId = parseInt(String(input.supplierId), 10);
    purchase.purchaseDate = input.purchaseDate;
    purchase.referenceNumber = input.referenceNumber || null;
    purchase.totalCost = totalCost;
    purchase.paymentStatus = input.paymentStatus || 'pending';
    purchase.notes = input.notes || null;
    purchase.isCreditPurchase = input.isCreditPurchase ?? false;
    purchase.status = 'draft';

    const savedPurchase = await purchaseRepo.save(purchase);

    const purchaseLines = input.lines.map(line => {
      const purchaseLine = new StockPurchaseLine();
      purchaseLine.purchaseId = savedPurchase.id;
      purchaseLine.variantId = parseInt(String(line.variantId), 10);
      purchaseLine.quantity = line.quantity;
      purchaseLine.unitCost = line.unitCost;
      purchaseLine.totalCost = line.quantity * line.unitCost;
      purchaseLine.stockLocationId = parseInt(String(line.stockLocationId), 10);
      return purchaseLine;
    });

    await purchaseLineRepo.save(purchaseLines);

    const purchaseWithLines = await purchaseRepo.findOne({
      where: { id: savedPurchase.id },
      relations: ['lines', 'supplier'],
    });

    this.logger.log(`Created draft purchase record: ${savedPurchase.id}`);
    return purchaseWithLines || savedPurchase;
  }

  /**
   * Create purchase record (confirmed purchase)
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
    purchase.status = 'confirmed';

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

  /**
   * Update a draft purchase. No ledger, no stock. Audit log should be called by caller.
   */
  async updateDraftPurchase(
    ctx: RequestContext,
    id: string,
    input: UpdateDraftPurchaseInput
  ): Promise<StockPurchase> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const purchaseLineRepo = this.connection.getRepository(ctx, StockPurchaseLine);

    const purchase = await purchaseRepo.findOne({
      where: { id },
      relations: ['lines'],
    });

    if (!purchase) {
      throw new UserInputError(`Purchase ${id} not found`);
    }

    if (purchase.status !== 'draft') {
      throw new UserInputError(`Purchase ${id} is not a draft and cannot be updated`);
    }

    if (input.supplierId !== undefined) {
      const customerRepo = this.connection.getRepository(ctx, Customer);
      const supplier = await customerRepo.findOne({
        where: { id: input.supplierId },
      });
      if (!supplier) {
        throw new UserInputError(`Supplier ${input.supplierId} not found`);
      }
      const customFields = supplier.customFields as any;
      if (!customFields?.isSupplier) {
        throw new UserInputError(`Customer ${input.supplierId} is not marked as a supplier.`);
      }
      purchase.supplierId = parseInt(String(input.supplierId), 10);
    }

    if (input.purchaseDate !== undefined) {
      purchase.purchaseDate = input.purchaseDate;
    }

    if (input.referenceNumber !== undefined) {
      purchase.referenceNumber = input.referenceNumber || null;
    }

    if (input.notes !== undefined) {
      purchase.notes = input.notes || null;
    }

    if (input.lines !== undefined && input.lines.length > 0) {
      const totalCost = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
      purchase.totalCost = totalCost;

      await purchaseLineRepo.delete({ purchaseId: id });

      const purchaseLines = input.lines.map(line => {
        const purchaseLine = new StockPurchaseLine();
        purchaseLine.purchaseId = id;
        purchaseLine.variantId = parseInt(String(line.variantId), 10);
        purchaseLine.quantity = line.quantity;
        purchaseLine.unitCost = line.unitCost;
        purchaseLine.totalCost = line.quantity * line.unitCost;
        purchaseLine.stockLocationId = parseInt(String(line.stockLocationId), 10);
        return purchaseLine;
      });

      await purchaseLineRepo.save(purchaseLines);
    }

    await purchaseRepo.save(purchase);

    if (this.auditService) {
      await this.auditService.log(ctx, 'purchase.draft.updated', {
        entityType: 'Purchase',
        entityId: id,
        data: {
          purchaseId: id,
          supplierId: purchase.supplierId,
          referenceNumber: purchase.referenceNumber,
          totalCost: purchase.totalCost,
        },
      });
    }

    const purchaseWithLines = await purchaseRepo.findOne({
      where: { id },
      relations: ['lines', 'supplier'],
    });

    this.logger.log(`Updated draft purchase: ${id}`);
    return purchaseWithLines || purchase;
  }

  /**
   * Confirm a draft purchase: post to ledger. Caller (StockManagementService) handles stock movements.
   */
  async confirmPurchase(ctx: RequestContext, id: string): Promise<StockPurchase> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);

    const purchase = await purchaseRepo.findOne({
      where: { id },
      relations: ['lines', 'supplier'],
    });

    if (!purchase) {
      throw new UserInputError(`Purchase ${id} not found`);
    }

    if (purchase.status !== 'draft') {
      throw new UserInputError(`Purchase ${id} is not a draft and cannot be confirmed`);
    }

    purchase.status = 'confirmed';
    await purchaseRepo.save(purchase);

    const transactionData: PurchaseTransactionData = {
      ctx,
      sourceId: purchase.id,
      channelId: ctx.channelId as number,
      purchaseId: purchase.id,
      purchaseReference: purchase.referenceNumber || purchase.id,
      supplierId: String(purchase.supplierId),
      totalCost: Number(purchase.totalCost),
      isCreditPurchase: purchase.isCreditPurchase,
    };

    const result = await this.ledgerTransactionService.postTransaction(transactionData);
    if (!result.success) {
      throw new Error(`Failed to post purchase to ledger: ${result.error}`);
    }

    this.logger.log(`Confirmed purchase: ${id}`);
    return purchase;
  }
}
