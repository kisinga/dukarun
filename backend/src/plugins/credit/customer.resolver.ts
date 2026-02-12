import { Injectable } from '@nestjs/common';
import { Resolver, ResolveField, Root } from '@nestjs/graphql';
import { Allow, Ctx, Customer, Permission, RequestContext } from '@vendure/core';
import { CreditService } from '../../services/credit/credit.service';

/**
 * Customer Field Resolver
 *
 * Adds computed fields to the Customer type for credit management.
 */
@Resolver('Customer')
@Injectable()
export class CustomerFieldResolver {
  constructor(private readonly creditService: CreditService) {}

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async outstandingAmount(@Root() customer: Customer, @Ctx() ctx: RequestContext): Promise<number> {
    const summary = await this.creditService.getCreditSummary(ctx, customer.id, 'customer');
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
    const summary = await this.creditService.getCreditSummary(ctx, customer.id, 'supplier');
    return summary.outstandingAmount;
  }
}
