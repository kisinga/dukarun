import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { CreditService } from '../../services/credit/credit.service';
import { CreditSummary } from '../../services/credit/credit-party.types';
import { ManageSupplierCreditPurchasesPermission } from './supplier-credit.permissions';

/** Maps unified CreditSummary to the supplier-specific GraphQL shape */
function toSupplierGraphQL(s: CreditSummary) {
  return {
    supplierId: s.entityId,
    isSupplierCreditApproved: s.isCreditApproved,
    supplierCreditLimit: s.creditLimit,
    outstandingAmount: s.outstandingAmount,
    availableCredit: s.availableCredit,
    lastRepaymentDate: s.lastRepaymentDate,
    lastRepaymentAmount: s.lastRepaymentAmount,
    supplierCreditDuration: s.creditDuration,
  };
}

@Resolver()
export class SupplierCreditResolver {
  constructor(private readonly creditService: CreditService) {}

  @Query()
  @Allow(Permission.ReadCustomer)
  async supplierCreditSummary(@Ctx() ctx: RequestContext, @Args('supplierId') supplierId: string) {
    const summary = await this.creditService.getCreditSummary(ctx, supplierId, 'supplier');
    return toSupplierGraphQL(summary);
  }

  @Mutation()
  @Allow(ManageSupplierCreditPurchasesPermission.Permission)
  async approveSupplierCredit(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: {
      supplierId: string;
      approved: boolean;
      supplierCreditLimit?: number;
      supplierCreditDuration?: number;
    }
  ) {
    const result = await this.creditService.approveCredit(
      ctx,
      input.supplierId,
      'supplier',
      input.approved,
      input.supplierCreditLimit,
      input.supplierCreditDuration
    );
    return toSupplierGraphQL(result);
  }

  @Mutation()
  @Allow(ManageSupplierCreditPurchasesPermission.Permission)
  async updateSupplierCreditLimit(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: { supplierId: string; supplierCreditLimit: number; supplierCreditDuration?: number }
  ) {
    const result = await this.creditService.updateCreditLimit(
      ctx,
      input.supplierId,
      'supplier',
      input.supplierCreditLimit,
      input.supplierCreditDuration
    );
    return toSupplierGraphQL(result);
  }

  @Mutation()
  @Allow(ManageSupplierCreditPurchasesPermission.Permission)
  async updateSupplierCreditDuration(
    @Ctx() ctx: RequestContext,
    @Args('input') input: { supplierId: string; supplierCreditDuration: number }
  ) {
    const result = await this.creditService.updateCreditDuration(
      ctx,
      input.supplierId,
      'supplier',
      input.supplierCreditDuration
    );
    return toSupplierGraphQL(result);
  }
}
