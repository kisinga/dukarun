import { Injectable } from '@nestjs/common';
import { Channel, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';

/**
 * Shared service for loading channel payment methods and resolving display names.
 * Used by OpenSessionService and ReconciliationValidatorService to avoid duplication.
 */
@Injectable()
export class ChannelPaymentMethodService {
  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Load payment methods for a channel with translations (for display names).
   */
  async getChannelPaymentMethods(ctx: RequestContext, channelId: number): Promise<PaymentMethod[]> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
      relations: ['paymentMethods', 'paymentMethods.translations'],
    });
    return channel?.paymentMethods || [];
  }

  /**
   * Display name for a payment method (translation name or code fallback).
   */
  getPaymentMethodDisplayName(pm: PaymentMethod): string {
    const t = (pm as { translations?: Array<{ name: string }> }).translations;
    const name = t?.[0]?.name;
    return name && name.trim() ? name : pm.code;
  }
}
