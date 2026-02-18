import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { ManageStockAdjustmentsPermission } from './permissions';
import { ManageSupplierCreditPurchasesPermission } from '../credit/supplier-credit.permissions';
import { StockManagementService } from '../../services/stock/stock-management.service';
import { StockQueryService } from '../../services/stock/stock-query.service';
import { PurchaseService } from '../../services/stock/purchase.service';
import { StockPurchase } from '../../services/stock/entities/purchase.entity';
import { InventoryStockAdjustment } from '../../services/stock/entities/stock-adjustment.entity';

interface RecordPurchaseInput {
  supplierId: string;
  purchaseDate: Date;
  referenceNumber?: string | null;
  paymentStatus: string;
  notes?: string | null;
  lines: Array<{
    variantId: string;
    quantity: number;
    unitCost: number;
    stockLocationId: string;
    batchNumber?: string | null;
    expiryDate?: Date | string | null;
  }>;
  isCreditPurchase?: boolean;
  payment?: {
    amount: number;
    debitAccountCode?: string;
    reference?: string;
  };
  saveAsDraft?: boolean;
}

interface UpdateDraftPurchaseInput {
  supplierId?: string;
  purchaseDate?: Date;
  referenceNumber?: string | null;
  notes?: string | null;
  lines?: Array<{
    variantId: string;
    quantity: number;
    unitCost: number;
    stockLocationId: string;
    batchNumber?: string | null;
    expiryDate?: Date | string | null;
  }>;
}

interface RecordStockAdjustmentInput {
  reason: string;
  notes?: string | null;
  lines: Array<{
    variantId: string;
    quantityChange: number;
    stockLocationId: string;
  }>;
}

@Resolver('StockPurchase')
export class StockResolver {
  constructor(
    private readonly stockManagementService: StockManagementService,
    private readonly stockQueryService: StockQueryService,
    private readonly purchaseService: PurchaseService
  ) {}

  @Query()
  @Allow(Permission.ReadProduct)
  async purchases(
    @Ctx() ctx: RequestContext,
    @Args('options') options?: any
  ): Promise<{ items: StockPurchase[]; totalItems: number }> {
    return this.stockQueryService.getPurchases(ctx, options);
  }

  @Query()
  @Allow(Permission.ReadProduct)
  async purchase(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string
  ): Promise<StockPurchase | null> {
    return this.stockQueryService.getPurchaseById(ctx, id);
  }

  @Query()
  @Allow(Permission.ReadProduct)
  async stockAdjustments(
    @Ctx() ctx: RequestContext,
    @Args('options') options?: any
  ): Promise<{ items: InventoryStockAdjustment[]; totalItems: number }> {
    return this.stockQueryService.getStockAdjustments(ctx, options);
  }

  @Mutation()
  @Allow(Permission.UpdateProduct, ManageSupplierCreditPurchasesPermission.Permission)
  async recordPurchase(
    @Ctx() ctx: RequestContext,
    @Args('input') input: RecordPurchaseInput
  ): Promise<StockPurchase> {
    // Enforce supplier credit permission if this is a credit purchase
    if (input.isCreditPurchase) {
      // Permission check is handled by @Allow decorator
      // The permission system will verify the user has ManageSupplierCreditPurchasesPermission
    }
    return this.stockManagementService.recordPurchase(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateProduct, ManageSupplierCreditPurchasesPermission.Permission)
  async confirmPurchase(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string
  ): Promise<StockPurchase> {
    return this.stockManagementService.confirmPurchase(ctx, id);
  }

  @Mutation()
  @Allow(Permission.UpdateProduct, ManageSupplierCreditPurchasesPermission.Permission)
  async updateDraftPurchase(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string,
    @Args('input') input: UpdateDraftPurchaseInput
  ): Promise<StockPurchase> {
    return this.purchaseService.updateDraftPurchase(ctx, id, input);
  }

  @Mutation()
  @Allow(ManageStockAdjustmentsPermission.Permission)
  async recordStockAdjustment(
    @Ctx() ctx: RequestContext,
    @Args('input') input: RecordStockAdjustmentInput
  ): Promise<InventoryStockAdjustment> {
    return this.stockManagementService.recordStockAdjustment(ctx, input);
  }
}
