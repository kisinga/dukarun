import { Injectable, Logger, Optional } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryReconciliationService } from '../inventory/inventory-reconciliation.service';
import { InventoryConfigurationService } from '../inventory/inventory-configuration.service';
import { FinancialService } from '../financial/financial.service';
import { PAYMENT_METHOD_CODES } from '../payments/payment-method-codes.constants';
import { StockPurchase } from './entities/purchase.entity';
import { PurchasePayment } from './entities/purchase-payment.entity';
import { InventoryStockAdjustment } from './entities/stock-adjustment.entity';
import { PurchaseService, RecordPurchaseInput } from './purchase.service';
import { StockAdjustmentService, RecordStockAdjustmentInput } from './stock-adjustment.service';
import { StockMovementService } from './stock-movement.service';
import { StockValidationService } from './stock-validation.service';
import { PurchaseCreditValidatorService } from './purchase-credit-validator.service';

/**
 * Stock Management Service
 *
 * Orchestrates purchase and adjustment operations.
 * Similar to OrderCreationService pattern - composes focused services.
 *
 * FUTURE: Integration with InventoryService (FIFO/COGS framework)
 * - Phase 1 (Shadow Mode): Run InventoryService alongside existing flows for validation
 * - Phase 2 (Gradual Migration): Route operations through InventoryService for selected channels
 * - Phase 3 (Authoritative Mode): Use InventoryService as primary, deprecate old flows
 *
 * To enable shadow mode, inject InventoryService and InventoryConfigurationService,
 * then call inventoryService.recordPurchase() after existing purchase recording.
 */
@Injectable()
export class StockManagementService {
  private readonly logger = new Logger('StockManagementService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly purchaseService: PurchaseService,
    private readonly stockAdjustmentService: StockAdjustmentService,
    private readonly stockMovementService: StockMovementService,
    private readonly validationService: StockValidationService,
    private readonly financialService: FinancialService,
    @Optional() private readonly purchaseCreditValidator?: PurchaseCreditValidatorService,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly inventoryService?: InventoryService,
    @Optional() private readonly inventoryConfig?: InventoryConfigurationService,
    @Optional() private readonly reconciliationService?: InventoryReconciliationService
  ) {}

  /**
   * Record a purchase and update stock levels
   * All operations are wrapped in a transaction for atomicity
   */
  async recordPurchase(ctx: RequestContext, input: RecordPurchaseInput): Promise<StockPurchase> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        // 1. Validate input
        this.validationService.validatePurchaseInput(input);

        // 1b. Force credit purchase path when inline payment is provided
        // This ensures the purchase goes through AP so the payment can clear it properly.
        // Without this, a cash purchase would directly credit Cash On Hand, and we
        // wouldn't be able to record a payment from a different source (e.g., M-Pesa).
        if (input.payment && input.payment.amount > 0) {
          input.isCreditPurchase = true;
        } else if (input.paymentStatus === 'pending') {
          input.isCreditPurchase = true;
        }

        // 2. Validate supplier credit if this is a credit purchase
        if (input.isCreditPurchase) {
          if (!this.purchaseCreditValidator) {
            throw new Error(
              'PurchaseCreditValidatorService is required for credit purchases but was not provided.'
            );
          }
          // Validate supplier credit approval
          await this.purchaseCreditValidator.validateSupplierCreditApproval(
            transactionCtx,
            String(input.supplierId)
          );
        }

        // 3. Create purchase record (calculate total first for validation)
        const totalCost = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);

        // 4. Validate credit limit with actual purchase total (if credit purchase)
        if (input.isCreditPurchase && this.purchaseCreditValidator) {
          await this.purchaseCreditValidator.validateSupplierCreditLimitWithPurchase(
            transactionCtx,
            String(input.supplierId),
            totalCost
          );
        }

        // 5. Create purchase record
        const purchase = await this.purchaseService.createPurchaseRecord(transactionCtx, input);

        // 6. Update stock levels for each line
        const stockMovements = [];
        for (const line of input.lines) {
          const movement = await this.stockMovementService.adjustStockLevel(
            transactionCtx,
            line.variantId,
            line.stockLocationId,
            line.quantity, // Positive quantity for purchase
            `Purchase ${purchase.id}`
          );
          stockMovements.push(movement);
        }

        // 7. Log audit event
        await this.logPurchaseAudit(transactionCtx, purchase, stockMovements);

        // 7b. Record inline payment if provided (for paid/partial purchases)
        if (input.payment && input.payment.amount > 0) {
          const paymentAmount = input.payment.amount;
          const purchaseRepo = this.connection.getRepository(transactionCtx, StockPurchase);
          const purchasePaymentRepo = this.connection.getRepository(
            transactionCtx,
            PurchasePayment
          );
          const channelId = transactionCtx.channelId as number;
          const supplierIdNum = parseInt(String(input.supplierId), 10);

          // Create PurchasePayment record for audit trail
          const paymentRecord = purchasePaymentRepo.create({
            channelId,
            purchaseId: purchase.id,
            amount: paymentAmount,
            method: PAYMENT_METHOD_CODES.CASH,
            reference: input.payment.reference || null,
            supplierId: supplierIdNum,
          });
          await purchasePaymentRepo.save(paymentRecord);

          // Post payment to ledger (debit AP, credit payment source)
          const paymentId = `supplier-payment-${purchase.id}-${Date.now()}`;
          await this.financialService.recordSupplierPayment(
            transactionCtx,
            paymentId,
            purchase.id,
            purchase.referenceNumber || purchase.id,
            String(input.supplierId),
            paymentAmount,
            PAYMENT_METHOD_CODES.CASH,
            input.payment.debitAccountCode?.trim() || undefined
          );

          // Update paymentStatus based on amount vs totalCost
          const newPaymentStatus = paymentAmount >= purchase.totalCost ? 'paid' : 'partial';
          await purchaseRepo.update({ id: purchase.id }, { paymentStatus: newPaymentStatus });
          purchase.paymentStatus = newPaymentStatus;

          this.logger.log(
            `Inline payment recorded for purchase ${purchase.id}: ${paymentAmount} cents (${newPaymentStatus})`
          );
        }

        // 8. Shadow mode: Record purchase in InventoryService if enabled
        if (this.inventoryService && this.inventoryConfig) {
          try {
            const isValuationEnabled = await this.inventoryConfig.isValuationEnabled(
              transactionCtx,
              ctx.channelId!
            );

            if (isValuationEnabled) {
              await this.inventoryService.recordPurchase(transactionCtx, {
                purchaseId: purchase.id,
                channelId: ctx.channelId!,
                stockLocationId: input.lines[0]?.stockLocationId || 0,
                supplierId: String(input.supplierId),
                purchaseReference: purchase.referenceNumber || purchase.id,
                isCreditPurchase: input.isCreditPurchase ?? false,
                lines: input.lines.map(line => ({
                  productVariantId: line.variantId,
                  quantity: line.quantity,
                  unitCost: line.unitCost,
                  expiryDate: null, // TODO: Add expiry date to purchase input if needed
                })),
              });

              this.logger.log(
                `Shadow mode: Purchase ${purchase.id} also recorded in InventoryService`
              );

              // Run reconciliation if service is available
              if (this.reconciliationService) {
                try {
                  const reconciliation =
                    await this.reconciliationService.getInventoryValuationVsLedger(transactionCtx);
                  if (!reconciliation.isBalanced) {
                    this.logger.warn(
                      `Inventory valuation mismatch detected: difference=${reconciliation.difference}`
                    );
                  }
                } catch (reconError) {
                  this.logger.warn(
                    `Reconciliation check failed: ${reconError instanceof Error ? reconError.message : String(reconError)}`
                  );
                }
              }
            }
          } catch (inventoryError) {
            // Don't fail the main operation if shadow mode fails
            this.logger.error(
              `Shadow mode: Failed to record purchase in InventoryService: ${inventoryError instanceof Error ? inventoryError.message : String(inventoryError)}`
            );
          }
        }

        this.logger.log(`Purchase recorded successfully: ${purchase.id}`);
        return purchase;
      } catch (error) {
        this.logger.error(
          `Failed to record purchase: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * Record a stock adjustment and update stock levels
   * All operations are wrapped in a transaction for atomicity
   */
  async recordStockAdjustment(
    ctx: RequestContext,
    input: RecordStockAdjustmentInput
  ): Promise<InventoryStockAdjustment> {
    return this.connection.withTransaction(ctx, async transactionCtx => {
      try {
        // 1. Validate input
        this.validationService.validateAdjustmentInput(input);

        // 2. Update stock levels first (to get previous/new stock values)
        const stockMovements = [];
        for (const line of input.lines) {
          const movement = await this.stockMovementService.adjustStockLevel(
            transactionCtx,
            line.variantId,
            line.stockLocationId,
            line.quantityChange,
            `Stock adjustment: ${input.reason}`
          );
          stockMovements.push(movement);
        }

        // 3. Create adjustment record with stock movement data
        const adjustment = await this.stockAdjustmentService.createAdjustmentRecord(
          transactionCtx,
          input,
          stockMovements
        );

        // 4. Log audit event
        await this.logAdjustmentAudit(transactionCtx, adjustment, stockMovements);

        this.logger.log(`Stock adjustment recorded successfully: ${adjustment.id}`);
        return adjustment;
      } catch (error) {
        this.logger.error(
          `Failed to record stock adjustment: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * Log purchase audit event
   */
  private async logPurchaseAudit(
    ctx: RequestContext,
    purchase: StockPurchase,
    stockMovements: Array<{
      variantId: ID;
      locationId: ID;
      previousStock: number;
      newStock: number;
    }>
  ): Promise<void> {
    if (!this.auditService) {
      return;
    }

    await this.auditService.log(ctx, 'purchase.recorded', {
      entityType: 'Purchase',
      entityId: purchase.id,
      data: {
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        referenceNumber: purchase.referenceNumber,
        totalCost: purchase.totalCost,
        paymentStatus: purchase.paymentStatus,
        lineCount: purchase.lines?.length || 0,
        stockMovements: stockMovements.map(m => ({
          variantId: m.variantId,
          locationId: m.locationId,
          previousStock: m.previousStock,
          newStock: m.newStock,
        })),
      },
    });
  }

  /**
   * Log adjustment audit event
   */
  private async logAdjustmentAudit(
    ctx: RequestContext,
    adjustment: InventoryStockAdjustment,
    stockMovements: Array<{
      variantId: ID;
      locationId: ID;
      previousStock: number;
      newStock: number;
    }>
  ): Promise<void> {
    if (!this.auditService) {
      return;
    }

    await this.auditService.log(ctx, 'stock.adjustment.recorded', {
      entityType: 'StockAdjustment',
      entityId: adjustment.id,
      data: {
        adjustmentId: adjustment.id,
        reason: adjustment.reason,
        lineCount: adjustment.lines?.length || 0,
        stockMovements: stockMovements.map(m => ({
          variantId: m.variantId,
          locationId: m.locationId,
          previousStock: m.previousStock,
          newStock: m.newStock,
        })),
      },
    });
  }
}
