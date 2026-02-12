import { Logger, Optional } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Order } from '@vendure/core';

import { ChannelCommunicationService } from '../../services/channels/channel-communication.service';
import { CreditService } from '../../services/credit/credit.service';
import { CreditSummary } from '../../services/credit/credit-party.types';
import { CreditValidatorService } from '../../services/credit/credit-validator.service';
import {
  OrderCreationService,
  CreateOrderInput,
} from '../../services/orders/order-creation.service';
import {
  ApproveCustomerCreditPermission,
  ManageCustomerCreditLimitPermission,
} from './permissions';

interface ApproveCustomerCreditInput {
  customerId: string;
  approved: boolean;
  creditLimit?: number;
  creditDuration?: number;
}

interface UpdateCustomerCreditLimitInput {
  customerId: string;
  creditLimit: number;
  creditDuration?: number;
}

interface UpdateCreditDurationInput {
  customerId: string;
  creditDuration: number;
}

interface ValidateCreditInput {
  customerId: string;
  estimatedOrderTotal: number;
}

interface CreditValidationResult {
  isValid: boolean;
  error?: string;
  availableCredit: number;
  estimatedOrderTotal: number;
  wouldExceedLimit: boolean;
}

/** Maps unified CreditSummary to the customer-specific GraphQL shape */
function toCustomerGraphQL(s: CreditSummary) {
  return {
    customerId: s.entityId,
    isCreditApproved: s.isCreditApproved,
    creditFrozen: s.creditFrozen,
    creditLimit: s.creditLimit,
    outstandingAmount: s.outstandingAmount,
    availableCredit: s.availableCredit,
    lastRepaymentDate: s.lastRepaymentDate,
    lastRepaymentAmount: s.lastRepaymentAmount,
    creditDuration: s.creditDuration,
  };
}

@Resolver('CreditSummary')
export class CreditResolver {
  private readonly logger = new Logger(CreditResolver.name);

  constructor(
    private readonly creditService: CreditService,
    private readonly orderCreationService: OrderCreationService,
    private readonly creditValidator: CreditValidatorService,
    @Optional() private readonly communicationService?: ChannelCommunicationService
  ) {}

  @Query()
  @Allow(Permission.ReadCustomer)
  async creditSummary(@Ctx() ctx: RequestContext, @Args('customerId') customerId: string) {
    const summary = await this.creditService.getCreditSummary(ctx, customerId, 'customer');
    return toCustomerGraphQL(summary);
  }

  @Query()
  @Allow(Permission.ReadCustomer)
  async validateCredit(
    @Ctx() ctx: RequestContext,
    @Args('input') input: ValidateCreditInput
  ): Promise<CreditValidationResult> {
    try {
      const summary = await this.creditService.getCreditSummary(ctx, input.customerId, 'customer');

      if (!summary.isCreditApproved) {
        return {
          isValid: false,
          error: 'Customer is not approved for credit sales.',
          availableCredit: summary.availableCredit,
          estimatedOrderTotal: input.estimatedOrderTotal,
          wouldExceedLimit: false,
        };
      }

      const availableCredit = summary.creditLimit - summary.outstandingAmount;
      const wouldExceedLimit = input.estimatedOrderTotal > availableCredit;

      if (wouldExceedLimit) {
        return {
          isValid: false,
          error: `Credit limit would be exceeded. Available: ${availableCredit}, Required: ${input.estimatedOrderTotal}`,
          availableCredit,
          estimatedOrderTotal: input.estimatedOrderTotal,
          wouldExceedLimit: true,
        };
      }

      return {
        isValid: true,
        availableCredit,
        estimatedOrderTotal: input.estimatedOrderTotal,
        wouldExceedLimit: false,
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Failed to validate credit',
        availableCredit: 0,
        estimatedOrderTotal: input.estimatedOrderTotal,
        wouldExceedLimit: false,
      };
    }
  }

  @Mutation()
  @Allow(ApproveCustomerCreditPermission.Permission)
  async approveCustomerCredit(
    @Ctx() ctx: RequestContext,
    @Args('input') input: ApproveCustomerCreditInput
  ) {
    const result = await this.creditService.approveCredit(
      ctx,
      input.customerId,
      'customer',
      input.approved,
      input.creditLimit,
      input.creditDuration
    );

    if (input.approved && this.communicationService) {
      await this.communicationService
        .sendAccountApprovedNotification(
          ctx,
          input.customerId,
          input.creditLimit,
          input.creditDuration
        )
        .catch(error => {
          this.logger.warn(
            `Failed to send approval notification: ${error instanceof Error ? error.message : String(error)}`
          );
        });
    }

    return toCustomerGraphQL(result);
  }

  @Mutation()
  @Allow(ManageCustomerCreditLimitPermission.Permission)
  async updateCustomerCreditLimit(
    @Ctx() ctx: RequestContext,
    @Args('input') input: UpdateCustomerCreditLimitInput
  ) {
    const result = await this.creditService.updateCreditLimit(
      ctx,
      input.customerId,
      'customer',
      input.creditLimit,
      input.creditDuration
    );
    return toCustomerGraphQL(result);
  }

  @Mutation()
  @Allow(ManageCustomerCreditLimitPermission.Permission)
  async updateCreditDuration(
    @Ctx() ctx: RequestContext,
    @Args('input') input: UpdateCreditDurationInput
  ) {
    const result = await this.creditService.updateCreditDuration(
      ctx,
      input.customerId,
      'customer',
      input.creditDuration
    );
    return toCustomerGraphQL(result);
  }

  @Mutation()
  @Allow(Permission.CreateOrder)
  async createOrder(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateOrderInput
  ): Promise<Order> {
    return this.orderCreationService.createOrder(ctx, input);
  }
}
