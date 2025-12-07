import { Injectable } from '@nestjs/common';
import { Channel, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';
import { CashControlService } from './cash-control.service';
import { canParticipateInCashControl } from './payment-method-mapping.config';

/**
 * Cashier Flow Integration Service
 *
 * Defines the interface between cash control and cashier flow systems.
 * This service provides integration points that can be extended when
 * cashier flow is fully implemented.
 *
 * Currently, this is a no-op implementation that returns based on
 * cash control only. When cashier flow is implemented, this service
 * can be extended to check both systems.
 */
@Injectable()
export class CashierFlowIntegrationService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly cashControlService: CashControlService
  ) {}

  /**
   * Check if cash control should be enforced
   * This can be extended to check both cash control and cashier flow settings
   */
  async shouldEnforceCashControl(ctx: RequestContext, channelId: number): Promise<boolean> {
    // Currently, only check cash control
    // When cashier flow is implemented, this can check:
    // - cashControlEnabled OR
    // - (cashierFlowEnabled AND cashierOpen)
    return this.cashControlService.isEnabled(ctx, channelId);
  }

  /**
   * Get all payment methods eligible for cash control
   * Returns payment methods that can participate in cash control,
   * regardless of whether they are cashier-controlled
   */
  async getPaymentMethodsForCashControl(
    ctx: RequestContext,
    channelId: number
  ): Promise<PaymentMethod[]> {
    return this.cashControlService.getPaymentMethodsForCashControl(ctx, channelId);
  }

  /**
   * Check if cashier flow is enabled for a channel
   * This is a placeholder for future cashier flow implementation
   */
  async isCashierFlowEnabled(ctx: RequestContext, channelId: number): Promise<boolean> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      return false;
    }

    const cashierFlowEnabled = (channel as any).customFields?.cashierFlowEnabled;
    return cashierFlowEnabled === true;
  }

  /**
   * Check if cashier is currently open
   * This is a placeholder for future cashier flow implementation
   */
  async isCashierOpen(ctx: RequestContext, channelId: number): Promise<boolean> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      return false;
    }

    const cashierOpen = (channel as any).customFields?.cashierOpen;
    return cashierOpen === true;
  }
}




