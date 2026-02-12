import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, UserInputError } from '@vendure/core';
import { CreditService } from './credit.service';
import { CreditPartyType } from './credit-party.types';

/**
 * Unified Credit Validator Service
 *
 * Validates credit approval and limits for both customers and suppliers.
 */
@Injectable()
export class CreditValidatorService {
  private readonly logger = new Logger('CreditValidatorService');

  constructor(private readonly creditService: CreditService) {}

  /**
   * Validate credit approval status.
   * Throws if not approved or account is frozen.
   */
  async validateCreditApproval(
    ctx: RequestContext,
    entityId: string,
    partyType: CreditPartyType
  ): Promise<void> {
    const summary = await this.creditService.getCreditSummary(ctx, entityId, partyType);
    const label = partyType === 'supplier' ? 'Supplier' : 'Customer';
    const action = partyType === 'supplier' ? 'credit purchases' : 'credit sales';

    if (!summary.isCreditApproved) {
      throw new UserInputError(`${label} is not approved for ${action}.`);
    }
    if (summary.creditFrozen) {
      throw new UserInputError(
        `${label} account is frozen. No new credit allowed; payments can still be recorded.`
      );
    }
  }

  /**
   * Validate that the requested amount fits within the available credit limit.
   */
  async validateCreditLimit(
    ctx: RequestContext,
    entityId: string,
    partyType: CreditPartyType,
    amount: number
  ): Promise<void> {
    const summary = await this.creditService.getCreditSummary(ctx, entityId, partyType);
    if (amount > summary.availableCredit) {
      throw new UserInputError(
        `Credit limit exceeded. Available: ${summary.availableCredit}, Required: ${amount}. ` +
          `Would exceed credit limit by ${amount - summary.availableCredit}.`
      );
    }

    this.logger.log(
      `Credit validation passed for ${partyType} ${entityId}: ` +
        `Available: ${summary.availableCredit}, Required: ${amount}, ` +
        `Remaining: ${summary.availableCredit - amount}`
    );
  }
}
