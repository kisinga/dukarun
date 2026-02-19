import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ApprovalRequest } from '../../domain/approval/approval-request.entity';
import { ApprovalHandlerRegistry } from '../../services/approval/approval-handler.registry';
import { OrderReversalService } from '../../services/orders/order-reversal.service';
import { OrderStateService } from '../../services/orders/order-state.service';

/**
 * Registers the order_reversal approval handler.
 * When an order_reversal approval is approved, the handler runs the actual reversal
 * (post ledger entry and mark order reversed) and transitions the order to Cancelled.
 */
@Injectable()
export class OrderReversalApprovalSubscriber implements OnModuleInit {
  private readonly logger = new Logger(OrderReversalApprovalSubscriber.name);

  constructor(
    private readonly approvalHandlerRegistry: ApprovalHandlerRegistry,
    private readonly orderReversalService: OrderReversalService,
    private readonly orderStateService: OrderStateService
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
    await this.orderReversalService.reverseOrder(ctx, orderId);
    await this.orderStateService.transitionToState(ctx, orderId, 'Cancelled');
    this.logger.log(`Order ${orderId} reversed via approval ${request.id}.`);
  }
}
