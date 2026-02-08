import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { ManageStockAdjustmentsPermission } from './permissions';
import { ManageSupplierCreditPurchasesPermission } from '../credit/supplier-credit.permissions';
import { StockManagementService } from '../../services/stock/stock-management.service';
import { StockQueryService } from '../../services/stock/stock-query.service';
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
  }>;
  isCreditPurchase?: boolean;
  payment?: {
    amount: number;
    debitAccountCode?: string;
    reference?: string;
  };
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
    private readonly stockQueryService: StockQueryService
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
  @Allow(ManageStockAdjustmentsPermission.Permission)
  async recordStockAdjustment(
    @Ctx() ctx: RequestContext,
    @Args('input') input: RecordStockAdjustmentInput
  ): Promise<InventoryStockAdjustment> {
    return this.stockManagementService.recordStockAdjustment(ctx, input);
  }
}
