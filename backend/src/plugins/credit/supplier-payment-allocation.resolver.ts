import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { AuditLog as AuditLogDecorator } from '../../infrastructure/audit/audit-log.decorator';
import { AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';
import {
  SupplierPaymentAllocationService,
  SupplierPaymentAllocationInput,
  SupplierPaymentAllocationResult,
} from '../../services/payments/supplier-payment-allocation.service';
import { StockPurchase } from '../../services/stock/entities/purchase.entity';
import { ManageSupplierCreditPurchasesPermission } from './supplier-credit.permissions';

@Resolver()
export class SupplierPaymentAllocationResolver {
  constructor(
    private readonly supplierPaymentAllocationService: SupplierPaymentAllocationService
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
    @Args('input') input: { purchaseId: string; paymentAmount?: number; debitAccountCode?: string }
  ): Promise<SupplierPaymentAllocationResult> {
    return this.supplierPaymentAllocationService.paySinglePurchase(
      ctx,
      input.purchaseId,
      input.paymentAmount,
      input.debitAccountCode
    );
  }
}
