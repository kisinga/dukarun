import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { ApprovalRequestEvent } from '../../infrastructure/events/custom-events';
import { OrderReversalService } from '../../services/orders/order-reversal.service';

/**
 * When an order_reversal approval request is approved, runs the actual reversal
 * (post ledger entry and mark order reversed).
 */
@Injectable()
export class OrderReversalApprovalSubscriber implements OnModuleInit {
  private readonly logger = new Logger(OrderReversalApprovalSubscriber.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly orderReversalService: OrderReversalService
  ) {}

  onModuleInit(): void {
    this.eventBus.ofType(ApprovalRequestEvent).subscribe(event => this.handle(event));
  }

  private async handle(event: ApprovalRequestEvent): Promise<void> {
    if (event.approvalType !== 'order_reversal' || event.action !== 'approved') {
      return;
    }
    const orderId = event.data?.entityId ?? event.data?.metadata?.orderId;
    if (!orderId) {
      this.logger.warn(
        `Order reversal approval ${event.approvalId} approved but no entityId or metadata.orderId; skipping reversal.`
      );
      return;
    }
    try {
      await this.orderReversalService.reverseOrder(event.ctx, orderId);
      this.logger.log(`Order ${orderId} reversed via approval ${event.approvalId}.`);
    } catch (err) {
      this.logger.error(
        `Failed to reverse order ${orderId} after approval ${event.approvalId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined
      );
    }
  }
}
