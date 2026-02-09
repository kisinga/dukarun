import { Injectable } from '@nestjs/common';
import { Resolver, ResolveField, Root } from '@nestjs/graphql';
import { Allow, Ctx, Customer, Permission, RequestContext } from '@vendure/core';
import { CreditService } from '../../services/credit/credit.service';
import { FinancialService } from '../../services/financial/financial.service';

/**
 * Customer Field Resolver
 *
 * Adds computed fields to the Customer type for credit management.
 */
@Resolver('Customer')
@Injectable()
export class CustomerFieldResolver {
  constructor(
    private readonly creditService: CreditService,
    private readonly financialService: FinancialService
  ) {}

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async outstandingAmount(@Root() customer: Customer, @Ctx() ctx: RequestContext): Promise<number> {
    const summary = await this.creditService.getCreditSummary(ctx, customer.id);
    return summary.outstandingAmount;
  }

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async supplierOutstandingAmount(
    @Root() customer: Customer,
    @Ctx() ctx: RequestContext
  ): Promise<number> {
    const customFields = customer.customFields as { isSupplier?: boolean } | undefined;
    if (!customFields?.isSupplier) return 0;
    return this.financialService.getSupplierBalance(ctx, customer.id.toString());
  }
}
