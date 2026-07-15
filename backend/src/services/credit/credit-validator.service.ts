import { Injectable, Logger } from '@nestjs/common';
import { EventBus, RequestContext, UserInputError } from '@vendure/core';
import { CustomerNotificationEvent } from '../../infrastructure/events/custom-events';
import { CreditService } from './credit.service';
import { CreditPartyType } from './credit-party.types';

/**
 * In-memory throttle to avoid spamming admins with repeated credit-sale-blocked
 * events for the same customer in the same process.
 */
const BLOCK_EVENT_THROTTLE_MS = 60 * 60 * 1000; // 1 hour
const MAX_THROTTLE_ENTRIES = 10_000;
const lastBlockEventByCustomer = new Map<string, number>();

/**
 * Unified Credit Validator Service
 *
 * Validates credit approval and limits for both customers and suppliers.
 */
@Injectable()
export class CreditValidatorService {
  private readonly logger = new Logger('CreditValidatorService');

  constructor(
    private readonly creditService: CreditService,
    private readonly eventBus: EventBus
  ) {}

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

    if (!summary.isCreditApproved || summary.creditFrozen) {
      this.emitCreditSaleBlocked(ctx, entityId, partyType, 'not_approved_or_frozen');
      throw new UserInputError(
        summary.creditFrozen
          ? `${label} account is frozen. No new credit allowed; payments can still be recorded.`
          : `${label} is not approved for ${action}.`
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
      this.emitCreditSaleBlocked(ctx, entityId, partyType, 'limit_exceeded', {
        requestedAmount: amount,
        availableCredit: summary.availableCredit,
      });
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

  private emitCreditSaleBlocked(
    ctx: RequestContext,
    entityId: string,
    partyType: CreditPartyType,
    reason: 'not_approved_or_frozen' | 'limit_exceeded',
    extra: Record<string, unknown> = {}
  ): void {
    const key = `${ctx.channelId}:${partyType}:${entityId}:${reason}`;
    const now = Date.now();
    const last = lastBlockEventByCustomer.get(key);
    if (last !== undefined && now - last < BLOCK_EVENT_THROTTLE_MS) {
      return;
    }

    if (lastBlockEventByCustomer.size >= MAX_THROTTLE_ENTRIES) {
      const oldest = lastBlockEventByCustomer.keys().next().value as string | undefined;
      if (oldest !== undefined) {
        lastBlockEventByCustomer.delete(oldest);
      }
    }
    lastBlockEventByCustomer.set(key, now);

    const eventType =
      partyType === 'supplier' ? 'supplier_credit_purchase_blocked' : 'credit_sale_blocked';

    this.eventBus.publish(
      new CustomerNotificationEvent(ctx, ctx.channelId?.toString() ?? '', eventType, entityId, {
        partyType,
        reason,
        ...extra,
      })
    );
  }
}
