import { Injectable, Logger } from '@nestjs/common';
import {
  Fulfillment,
  FulfillmentService,
  ID,
  Order,
  OrderLine,
  OrderService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';

/**
 * Order Fulfillment Service
 *
 * Handles fulfillment creation and state transitions.
 * Separated for single responsibility and testability.
 */
@Injectable()
export class OrderFulfillmentService {
  private readonly logger = new Logger('OrderFulfillmentService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly orderService: OrderService,
    private readonly fulfillmentService: FulfillmentService
  ) {}

  /**
   * Create and complete fulfillment for an order.
   * For POS handover, we attempt a deterministic state progression using the
   * default Vendure fulfillment process (Created -> Pending -> Shipped).
   */
  async fulfillOrder(ctx: RequestContext, orderId: ID): Promise<Fulfillment> {
    const order = await this.orderService.findOne(ctx, orderId, ['lines']);
    if (!order?.lines?.length) {
      throw new UserInputError('Order not found or has no lines to fulfill');
    }

    // Prepare fulfillment input
    const fulfillmentInput = {
      lines: order.lines.map(line => ({
        orderLineId: line.id,
        quantity: line.quantity,
      })),
      handler: {
        code: 'manual-fulfillment',
        arguments: [
          { name: 'method', value: 'POS Handover' },
          { name: 'trackingCode', value: `POS-${Date.now()}` },
        ],
      },
    };

    // Create fulfillment using FulfillmentService.create method.
    // This is the standard Vendure API for creating fulfillments:
    //   create(ctx, order, items, handler)
    const fulfillment = await (this.fulfillmentService as any).create(
      ctx,
      order,
      fulfillmentInput.lines.map(line => ({
        orderLineId: line.orderLineId,
        quantity: line.quantity,
      })),
      fulfillmentInput.handler
    );

    if (!fulfillment || 'errorCode' in fulfillment) {
      const error = fulfillment as any;
      throw new UserInputError(
        `Failed to create fulfillment: ${error?.message || error?.errorCode || 'Unknown error'}`
      );
    }

    // Deterministically advance fulfillment state for POS handover
    await this.progressFulfillmentForPos(ctx, fulfillment);

    this.logger.log(`Order ${order.code} fulfilled with fulfillment ${fulfillment.id}`);
    return fulfillment;
  }

  /**
   * For POS we want immediate handover. With the default fulfillment process,
   * the valid path is Created -> Pending -> Shipped. Walk that path and stop
   * cleanly on the first invalid transition.
   */
  private async progressFulfillmentForPos(
    ctx: RequestContext,
    fulfillment: Fulfillment
  ): Promise<void> {
    let currentState = fulfillment.state;
    const steps: Array<'Pending' | 'Shipped'> = ['Pending', 'Shipped'];

    for (const targetState of steps) {
      if (currentState === targetState) {
        continue;
      }

      try {
        const result = await (this.fulfillmentService as any).transitionToState(
          ctx,
          fulfillment.id,
          targetState
        );

        if (result && 'errorCode' in result) {
          const errorResult = result as { errorCode?: string; message?: string };
          this.logger.debug(
            `Could not transition fulfillment ${fulfillment.id} from ${currentState} to ${targetState}: ` +
              `${errorResult.message || errorResult.errorCode || 'Unknown error'}`
          );
          break;
        }

        currentState = (result as Fulfillment).state;
      } catch (error) {
        this.logger.debug(
          `Error transitioning fulfillment ${fulfillment.id} to ${targetState}: ` +
            `${error instanceof Error ? error.message : String(error)}`
        );
        // Non-fatal - fulfillment is still created, stop trying further transitions
        break;
      }
    }
  }
}
