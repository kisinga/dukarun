import { Injectable } from '@nestjs/common';
import { Args, Resolver, ResolveField, Root } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  Customer,
  ListQueryBuilder,
  Logger,
  Order,
  Permission,
  Relations,
  RequestContext,
} from '@vendure/core';
import { CreditService } from '../../services/credit/credit.service';
import { CreditAgingService } from '../../services/credit/credit-aging.service';
import { SupplierCreditAgingService } from '../../services/credit/supplier-credit-aging.service';

/**
 * Customer Field Resolver
 *
 * Adds computed fields to the Customer type for credit management.
 *
 * These are DERIVED display fields — a failure computing a balance (missing
 * ledger account, a transient DB error, etc.) must never null the whole Customer
 * and break every screen that loads it (that surfaced as a blank / "Customer not
 * found" detail page opened from the payments list). So each resolver degrades to
 * 0 and logs the real error instead of throwing.
 */
@Resolver('Customer')
@Injectable()
export class CustomerFieldResolver {
  private static readonly loggerCtx = 'CustomerFieldResolver';

  constructor(
    private readonly creditService: CreditService,
    private readonly creditAgingService: CreditAgingService,
    private readonly supplierCreditAgingService: SupplierCreditAgingService,
    private readonly listQueryBuilder: ListQueryBuilder
  ) {}

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async outstandingAmount(
    @Root() customer: Customer,
    @Ctx() ctx: RequestContext
  ): Promise<number | null> {
    try {
      const summary = await this.creditService.getCreditSummary(ctx, customer.id, 'customer');
      return summary.outstandingAmount;
    } catch (e) {
      Logger.error(
        `Failed to compute outstandingAmount for customer ${customer.id}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        CustomerFieldResolver.loggerCtx
      );
      return null;
    }
  }

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async daysOverdue(@Root() customer: Customer, @Ctx() ctx: RequestContext): Promise<number> {
    try {
      const summary = await this.creditService.getCreditSummary(ctx, customer.id, 'customer');
      const aging = await this.creditAgingService.getCustomerAging(
        ctx,
        customer.id.toString(),
        summary.outstandingAmount
      );
      return aging?.daysOverdue ?? 0;
    } catch (e) {
      Logger.error(
        `Failed to compute daysOverdue for customer ${customer.id}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        CustomerFieldResolver.loggerCtx
      );
      return 0;
    }
  }

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async isOverdue(@Root() customer: Customer, @Ctx() ctx: RequestContext): Promise<boolean> {
    const days = await this.daysOverdue(customer, ctx);
    return days > 0;
  }

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async supplierOutstandingAmount(
    @Root() customer: Customer,
    @Ctx() ctx: RequestContext
  ): Promise<number | null> {
    const customFields = customer.customFields as { isSupplier?: boolean } | undefined;
    if (!customFields?.isSupplier) return 0;
    try {
      const summary = await this.creditService.getCreditSummary(ctx, customer.id, 'supplier');
      return summary.outstandingAmount;
    } catch (e) {
      Logger.error(
        `Failed to compute supplierOutstandingAmount for customer ${customer.id}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        CustomerFieldResolver.loggerCtx
      );
      return null;
    }
  }

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async supplierDaysOverdue(
    @Root() customer: Customer,
    @Ctx() ctx: RequestContext
  ): Promise<number> {
    const customFields = customer.customFields as { isSupplier?: boolean } | undefined;
    if (!customFields?.isSupplier) return 0;
    try {
      const summary = await this.creditService.getCreditSummary(ctx, customer.id, 'supplier');
      const aging = await this.supplierCreditAgingService.getSupplierAging(
        ctx,
        customer.id.toString(),
        summary.outstandingAmount
      );
      return aging?.daysOverdue ?? 0;
    } catch (e) {
      Logger.error(
        `Failed to compute supplierDaysOverdue for customer ${customer.id}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        CustomerFieldResolver.loggerCtx
      );
      return 0;
    }
  }

  @ResolveField()
  @Allow(Permission.ReadCustomer)
  async supplierIsOverdue(
    @Root() customer: Customer,
    @Ctx() ctx: RequestContext
  ): Promise<boolean> {
    const days = await this.supplierDaysOverdue(customer, ctx);
    return days > 0;
  }

  /**
   * Override the core Customer.orders resolver.
   *
   * Vendure's built-in OrderService.findByCustomerId() uses the alias `order`
   * in raw SQL fragments. `order` is a reserved word in Postgres, so any
   * customer-scoped order list (customer.orders, "See orders" from the customer
   * page, the orders advanced-filter by customer) fails with a syntax error and
   * the UI shows "No orders found". Using ListQueryBuilder with a non-reserved
   * entityAlias fixes the query while keeping filtering, sorting and pagination.
   */
  @ResolveField()
  @Allow(Permission.ReadOrder)
  async orders(
    @Ctx() ctx: RequestContext,
    @Root() customer: Customer,
    @Args() args: { options?: any },
    @Relations({ entity: Order }) relations: string[]
  ): Promise<{ items: Order[]; totalItems: number }> {
    const options = args.options ?? {};
    const qb = this.listQueryBuilder.build(Order, options, {
      ctx,
      channelId: ctx.channelId,
      relations,
      entityAlias: 'orderEntity',
    });
    qb.andWhere('orderEntity.state != :draftState', { draftState: 'Draft' }).andWhere(
      'orderEntity.customerId = :customerId',
      { customerId: customer.id }
    );
    const [items, totalItems] = await qb.getManyAndCount();
    return { items, totalItems };
  }
}
