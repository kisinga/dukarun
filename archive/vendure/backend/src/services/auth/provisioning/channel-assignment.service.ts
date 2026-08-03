import { Injectable } from '@nestjs/common';
import {
  ChangeChannelEvent,
  Channel,
  ChannelService,
  EventBus,
  ID,
  PaymentMethod,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core';

/**
 * Channel Assignment Service
 *
 * Handles many-to-many relationship assignments to channels:
 * - Payment methods → channels
 *
 * **Vendure Service Usage:**
 * - Uses ChannelService.findOne() for channel lookups
 *
 * **Repository Usage (Documented Exceptions per PROVISIONING_PRINCIPLES.md):**
 * - M2M assignments: TypeORM relation manager is used for many-to-many updates.
 *   This is Vendure's internal pattern and there are no service methods for M2M assignments.
 *   Exception documented: "No Service Exists" - Vendure doesn't provide service methods for
 *   M2M relationship assignments, so TypeORM relation manager is the standard approach.
 * - Payment method lookups: PaymentMethodService doesn't provide findOne()
 * - Verification methods: ChannelService.findOne() doesn't support relations parameter,
 *   so repository is used to load channels with relations for verification (read-only operation)
 */
@Injectable()
export class ChannelAssignmentService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly channelService: ChannelService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Assign payment method to channel
   * Verifies assignment after saving
   *
   * Uses Vendure ChannelService to load channel and TypeORM relation manager
   * to update many-to-many relationship. Changes are persisted when transaction commits.
   */
  async assignPaymentMethodToChannel(
    ctx: RequestContext,
    paymentMethodId: ID,
    channelId: ID
  ): Promise<void> {
    // Verify entities exist using Vendure services
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error(
        `REGISTRATION_PAYMENT_METHOD_ASSIGN_FAILED: ` + `Channel ${channelId} not found`
      );
    }

    // Verify payment method exists
    const paymentMethodRepo = this.connection.getRepository(ctx, PaymentMethod);
    const paymentMethod = await paymentMethodRepo.findOne({ where: { id: paymentMethodId } });
    if (!paymentMethod) {
      throw new Error(
        `REGISTRATION_PAYMENT_METHOD_ASSIGN_FAILED: ` +
          `Payment method ${paymentMethodId} not found`
      );
    }

    // Use TypeORM relation manager to assign M2M relationship
    const channelRepo = this.connection.getRepository(ctx, Channel);
    await channelRepo
      .createQueryBuilder()
      .relation(Channel, 'paymentMethods')
      .of(channelId)
      .add(paymentMethodId);

    // Publish ChangeChannelEvent (Good Citizen)
    await this.eventBus.publish(
      new ChangeChannelEvent(ctx, paymentMethod, [channelId], 'assigned', PaymentMethod)
    );

    // Verify assignment (relation manager changes are visible within transaction)
    await this.verifyPaymentMethodAssignment(ctx, paymentMethodId, channelId);
  }

  /**
   * Verify payment method is assigned to channel
   * Uses repository to load channel with relations (ChannelService limitation)
   */
  private async verifyPaymentMethodAssignment(
    ctx: RequestContext,
    paymentMethodId: ID,
    channelId: ID
  ): Promise<void> {
    // Use repository to load channel with payment methods relation
    // Note: ChannelService.findOne doesn't support relations parameter,
    // so we use repository with relations for verification (Vendure limitation)
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const verifiedChannel = await channelRepo.findOne({
      where: { id: channelId },
      relations: ['paymentMethods'],
    });

    if (
      !verifiedChannel ||
      !verifiedChannel.paymentMethods?.some(pm => pm.id === paymentMethodId)
    ) {
      throw new Error(
        `REGISTRATION_PAYMENT_METHOD_ASSIGN_FAILED: ` +
          `Failed to verify payment method assignment to channel`
      );
    }
  }

  /**
   * Verify channel has minimum number of payment methods
   * Uses repository to load channel with relations (ChannelService limitation)
   */
  async verifyPaymentMethodCount(
    ctx: RequestContext,
    channelId: ID,
    minimumCount: number = 2
  ): Promise<void> {
    // Use repository to load channel with payment methods relation
    // Note: ChannelService.findOne doesn't support relations parameter,
    // so we use repository with relations for verification (Vendure limitation)
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
      relations: ['paymentMethods'],
    });

    if (!channel || !channel.paymentMethods || channel.paymentMethods.length < minimumCount) {
      throw new Error(
        `REGISTRATION_PAYMENT_METHOD_ASSIGN_FAILED: ` +
          `Channel should have at least ${minimumCount} payment methods assigned, ` +
          `but found ${channel?.paymentMethods?.length || 0}`
      );
    }
  }
}
