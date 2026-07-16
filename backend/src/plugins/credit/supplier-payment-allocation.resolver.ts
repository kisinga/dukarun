import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { ManageReconciliationPermission } from '../ledger/permissions';
import { AuditLog as AuditLogDecorator } from '../../infrastructure/audit/audit-log.decorator';
import { AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';
import {
  SupplierPaymentAllocationService,
  SupplierPaymentAllocationInput,
  SupplierPaymentAllocationResult,
} from '../../services/payments/supplier-payment-allocation.service';
import {
  PurchaseReconciliationService,
  PurchaseReconciliationResult,
} from '../../services/payments/purchase-reconciliation.service';
import { StockPurchase } from '../../services/stock/entities/purchase.entity';
import { ManageSupplierCreditPurchasesPermission } from './supplier-credit.permissions';

@Resolver()
export class SupplierPaymentAllocationResolver {
  constructor(
    private readonly supplierPaymentAllocationService: SupplierPaymentAllocationService,
    private readonly purchaseReconciliationService: PurchaseReconciliationService
  ) {}

  @Query()
  @Allow(Permission.ReadProduct)
  async unpaidPurchasesForSupplier(
    @Ctx() ctx: RequestContext,
    @Args('supplierId') supplierId: string
  ): Promise<StockPurchase[]> {
    return this.supplierPaymentAllocationService.getUnpaidPurchasesForSupplier(ctx, supplierId);
  }

  @Mutation()
  @Allow(ManageSupplierCreditPurchasesPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.SUPPLIER_PAYMENT_ALLOCATED,
    extractEntityId: (_result, args) => args.input?.supplierId ?? null,
  })
  async allocateBulkSupplierPayment(
    @Ctx() ctx: RequestContext,
    @Args('input') input: SupplierPaymentAllocationInput
  ): Promise<SupplierPaymentAllocationResult> {
    return this.supplierPaymentAllocationService.allocatePaymentToPurchases(ctx, input);
  }

  @Mutation()
  @Allow(ManageSupplierCreditPurchasesPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.SUPPLIER_PAYMENT_SINGLE_PURCHASE,
    entityType: 'StockPurchase',
    extractEntityId: (_result, args) => args.input?.purchaseId ?? null,
  })
  async paySinglePurchase(
    @Ctx() ctx: RequestContext,
    @Args('input') input: { purchaseId: string; debitAccountCode: string; paymentAmount?: number }
  ): Promise<SupplierPaymentAllocationResult> {
    return this.supplierPaymentAllocationService.paySinglePurchase(
      ctx,
      input.purchaseId,
      input.debitAccountCode,
      input.paymentAmount
    );
  }

  @Query()
  @Allow(ManageReconciliationPermission.Permission)
  async divergentPurchases(
    @Ctx() ctx: RequestContext,
    @Args('toleranceCents') toleranceCents?: number
  ): Promise<PurchaseReconciliationResult> {
    return this.purchaseReconciliationService.findDivergentPurchases(ctx, toleranceCents);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async reconcilePurchase(
    @Ctx() ctx: RequestContext,
    @Args('input') input: { purchaseId: string; strategy: string; note?: string }
  ): Promise<{ purchaseId: string; success: boolean; message: string }> {
    await this.purchaseReconciliationService.reconcilePurchase(ctx, input);
    return {
      purchaseId: input.purchaseId,
      success: true,
      message: `Purchase ${input.purchaseId} reconciled with strategy ${input.strategy}`,
    };
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async rebuildPurchaseFromLedger(
    @Ctx() ctx: RequestContext,
    @Args('purchaseId') purchaseId: string
  ): Promise<StockPurchase> {
    return this.supplierPaymentAllocationService.rebuildPurchaseFromLedger(ctx, purchaseId);
  }
}
