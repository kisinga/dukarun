import { Injectable } from '@nestjs/common';
import { Channel, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';
import {
  canParticipateInCashControl,
  getAccountCodeFromPaymentMethod,
  getReconciliationTypeFromPaymentMethod,
  isCashierControlledPaymentMethod,
  requiresReconciliation,
} from './payment-method-mapping.config';

/**
 * Cash Control Service
 *
 * Encapsulates all cash control logic and provides a clean interface
 * for determining cash control state and requirements.
 *
 * Cash control is independent of cashier flow - it works with ANY payment method
 * that has a ledger account and requires reconciliation.
 */
@Injectable()
export class CashControlService {
  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Check if cash control is enabled for a channel
   */
  async isEnabled(ctx: RequestContext, channelId: number): Promise<boolean> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      return false;
    }

    const channelCashControl = (channel as any).customFields?.cashControlEnabled;
    return channelCashControl === true;
  }

  /**
   * Check if a payment method requires an opening count
   * This is typically true for cashier-controlled payment methods
   */
  requiresOpeningCount(paymentMethod: PaymentMethod): boolean {
    return isCashierControlledPaymentMethod(paymentMethod);
  }

  /**
   * Get variance threshold for cash control
   * Returns null if not configured (no threshold enforcement)
   */
  getVarianceThreshold(_ctx: RequestContext, _channelId: number): number | null {
    // TODO: Implement variance threshold from channel settings if needed
    return null;
  }

  /**
   * Get all payment methods that can participate in cash control
   * These are payment methods with ledger accounts that require reconciliation
   */
  async getPaymentMethodsForCashControl(
    ctx: RequestContext,
    channelId: number
  ): Promise<PaymentMethod[]> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
      relations: ['paymentMethods'],
    });

    if (!channel || !channel.paymentMethods) {
      return [];
    }

    return channel.paymentMethods.filter(
      pm => pm.enabled && canParticipateInCashControl(pm)
    );
  }

  /**
   * Get payment method reconciliation config for cash control
   */
  async getPaymentMethodConfigs(
    ctx: RequestContext,
    channelId: number
  ): Promise<
    Array<{
      paymentMethodId: string;
      paymentMethodCode: string;
      reconciliationType: 'blind_count' | 'transaction_verification' | 'statement_match' | 'none';
      ledgerAccountCode: string;
      isCashierControlled: boolean;
      requiresReconciliation: boolean;
    }>
  > {
    const paymentMethods = await this.getPaymentMethodsForCashControl(ctx, channelId);

    return paymentMethods.map(pm => ({
      paymentMethodId: pm.id.toString(),
      paymentMethodCode: pm.code,
      reconciliationType: getReconciliationTypeFromPaymentMethod(pm),
      ledgerAccountCode: getAccountCodeFromPaymentMethod(pm),
      isCashierControlled: isCashierControlledPaymentMethod(pm),
      requiresReconciliation: requiresReconciliation(pm),
    }));
  }
}

