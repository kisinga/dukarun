import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { CustomerStatementService } from '../../services/customers/customer-statement.service';

@Resolver()
export class CustomerStatementResolver {
  constructor(private readonly statementService: CustomerStatementService) {}

  @Mutation()
  @Allow(Permission.ReadCustomer)
  async sendCustomerStatementEmail(
    @Ctx() ctx: RequestContext,
    @Args('customerId') customerId: string
  ): Promise<boolean> {
    return this.statementService.sendStatementEmail(ctx, customerId);
  }

  @Mutation()
  @Allow(Permission.ReadCustomer)
  async sendCustomerStatementSms(
    @Ctx() ctx: RequestContext,
    @Args('customerId') customerId: string
  ): Promise<boolean> {
    return this.statementService.sendMiniStatementSms(ctx, customerId);
  }
}
