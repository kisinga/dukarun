import { Injectable, Logger } from '@nestjs/common';
import { Customer, RequestContext, TransactionalConnection } from '@vendure/core';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import type { CreditPartyType } from '../credit/credit-party.types';

export interface BalanceChangePayload {
  oldBalanceCents: number;
  newBalanceCents: number;
}

/**
 * Delivers account-related notifications (balance changes, etc.) to the party (customer or supplier)
 * via SMS and email. Composable: add supplier contact resolution when needed.
 */
@Injectable()
export class AccountNotificationDeliveryService {
  private readonly logger = new Logger(AccountNotificationDeliveryService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly communicationService: CommunicationService
  ) {}

  /**
   * Send balance-update notification to the party. SMS uses ACCOUNT_NOTIFICATION category (gated count).
   */
  async deliverBalanceChange(
    ctx: RequestContext,
    channelId: string,
    partyType: CreditPartyType,
    entityId: string,
    payload: BalanceChangePayload
  ): Promise<void> {
    if (partyType === 'customer') {
      await this.deliverBalanceChangeToCustomer(ctx, channelId, entityId, payload);
    }
    // supplier: extend when supplier contact resolution exists
  }

  private async deliverBalanceChangeToCustomer(
    ctx: RequestContext,
    channelId: string,
    customerId: string,
    payload: BalanceChangePayload
  ): Promise<void> {
    const customer = await this.connection.getRepository(ctx, Customer).findOne({
      where: { id: customerId },
      relations: ['user'],
    });
    if (!customer) return;

    const cf = (customer as any).customFields || {};
    const phone = cf.phoneNumber ?? (customer as any).user?.identifier ?? null;
    const newBalanceFormatted = this.formatCents(payload.newBalanceCents);
    const message = `Your account balance has been updated. Outstanding balance: KES ${newBalanceFormatted}.`;

    if (phone && typeof phone === 'string' && phone.trim()) {
      const result = await this.communicationService.send({
        channel: 'sms',
        recipient: phone.trim(),
        body: message,
        ctx,
        channelId,
        metadata: { purpose: 'account_notification' },
        smsCategory: 'ACCOUNT_NOTIFICATION',
      });
      if (!result.success) {
        this.logger.warn(
          `Account notification SMS failed for customer ${customerId}: ${result.error}`
        );
      }
    }
    // Email: extend when generic transactional email is supported by CommunicationService
  }

  private formatCents(cents: number): string {
    return (cents / 100).toFixed(2);
  }
}
