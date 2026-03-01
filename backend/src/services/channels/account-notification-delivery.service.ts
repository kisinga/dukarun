import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { OutboundDeliveryService } from '../notifications/outbound-delivery.service';
import type { CreditPartyType } from '../credit/credit-party.types';

export interface BalanceChangePayload {
  oldBalanceCents: number;
  newBalanceCents: number;
}

/**
 * Thin wrapper around OutboundDeliveryService for balance-change delivery.
 * Prefer publishing CustomerNotificationEvent and letting the subscriber call deliver;
 * this service remains for backward compatibility if any code calls deliverBalanceChange directly.
 */
@Injectable()
export class AccountNotificationDeliveryService {
  private readonly logger = new Logger(AccountNotificationDeliveryService.name);

  constructor(private readonly outboundDelivery: OutboundDeliveryService) {}

  async deliverBalanceChange(
    ctx: RequestContext,
    channelId: string,
    partyType: CreditPartyType,
    entityId: string,
    payload: BalanceChangePayload
  ): Promise<void> {
    if (partyType !== 'customer') return;
    await this.outboundDelivery.deliver(ctx, 'balance_changed', {
      channelId,
      customerId: entityId,
      newBalanceCents: payload.newBalanceCents,
      oldBalanceCents: payload.oldBalanceCents,
    });
  }
}
