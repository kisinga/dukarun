import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ApprovalRequest } from '../../domain/approval/approval-request.entity';
import { ApprovalHandlerRegistry } from '../../services/approval/approval-handler.registry';
import { OrderReversalService } from '../../services/orders/order-reversal.service';

/**
 * Registers the order_reversal approval handler.
 * When an order_reversal approval is approved, the handler voids the order
 * (transition to Cancelled). The OrderCancellationProcess hook performs payment
 * cancellation, ledger reversal, inventory restoration, and marks the order
 * reversed atomically.
 */
@Injectable()
export class OrderReversalApprovalSubscriber implements OnModuleInit {
  private readonly logger = new Logger(OrderReversalApprovalSubscriber.name);

  constructor(
    private readonly approvalHandlerRegistry: ApprovalHandlerRegistry,
    private readonly orderReversalService: OrderReversalService
  ) {}

  onModuleInit(): void {
    this.approvalHandlerRegistry.register('order_reversal', {
      onApproved: (ctx, request) => this.handleApproved(ctx, request),
    });
  }

  private async handleApproved(ctx: RequestContext, request: ApprovalRequest): Promise<void> {
    const orderId = request.entityId ?? request.metadata?.orderId;
    if (!orderId) {
      this.logger.warn(
        `Order reversal approval ${request.id} approved but no entityId or metadata.orderId; skipping reversal.`
      );
      return;
    }
    await this.orderReversalService.voidOrder(ctx, orderId);
    this.logger.log(`Order ${orderId} cancelled via approval ${request.id}.`);
  }
}
