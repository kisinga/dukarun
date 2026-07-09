import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, OrderStateTransitionEvent } from '@vendure/core';
import { FinancialService } from '../financial/financial.service';

/**
 * Detector for the cancellation invariant: Cancelled orders must have zero AR.
 *
 * The OrderProcess hook is the primary enforcement. This subscriber is a safety net
 * that logs/metrics when a Cancelled transition happened without the hook reversing
 * the order (e.g. native admin cancellation, misconfigured process).
 */
@Injectable()
export class OrderCancellationDetectorSubscriber implements OnModuleInit {
  private readonly logger = new Logger(OrderCancellationDetectorSubscriber.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly financialService: FinancialService
  ) {}

  onModuleInit(): void {
    this.eventBus.ofType(OrderStateTransitionEvent).subscribe(event => {
      void this.handleTransition(event);
    });
  }

  private async handleTransition(event: OrderStateTransitionEvent): Promise<void> {
    const { order, toState, ctx } = event;
    if (toState !== 'Cancelled' || !order || !ctx) {
      return;
    }

    const customFields = (order.customFields as Record<string, unknown>) || {};
    if (customFields.reversedAt) {
      return;
    }

    try {
      const status = await this.financialService.getOrderPaymentStatus(ctx, order.id.toString());
      if (status.amountOwing > 0) {
        this.logger.error(
          `Cancellation invariant violated: order ${order.code} is Cancelled but ledger AR is ${status.amountOwing}. ` +
            `Run order reconciliation to post the missing reversal.`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to verify cancellation invariant for order ${order.code}: ${message}`
      );
    }
  }
}
