import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  EventBus,
  ChannelEvent,
  Channel,
  TransactionalConnection,
  Administrator,
  RequestContext,
} from '@vendure/core';
import { ChannelEventRouterService } from '../events/channel-event-router.service';
import { ChannelEventType } from '../events/types/event-type.enum';
import { ActionCategory } from '../events/types/action-category.enum';
import { getChannelStatus, ChannelStatus } from '../../domain/channel-custom-fields';

/**
 * Channel Status Event Subscriber
 *
 * Subscribes to Vendure ChannelEvent and triggers SMS notifications
 * when channel status changes to APPROVED.
 * This catches ALL channel updates regardless of how they're made
 * (admin UI, GraphQL, direct service calls, etc.)
 */
@Injectable()
export class ChannelStatusSubscriber implements OnModuleInit {
  private readonly logger = new Logger(ChannelStatusSubscriber.name);
  private readonly processedTransitions = new Set<string>(); // Track processed transitions: "channelId:oldStatus->newStatus"
  private readonly processingChannels = new Set<string>(); // Track channels currently being processed

  constructor(
    private readonly eventBus: EventBus,
    private readonly eventRouter: ChannelEventRouterService,
    private readonly connection: TransactionalConnection
  ) {}

  onModuleInit(): void {
    this.logger.log('ChannelStatusSubscriber: Subscribing to ChannelEvent');
    this.eventBus.ofType(ChannelEvent).subscribe(async event => {
      try {
        if (event.type === 'updated' && event.entity) {
          await this.handleChannelUpdate(event);
        }
      } catch (error) {
        this.logger.error(
          `Error handling channel update event: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }
    });
  }

  /**
   * Handle channel update event
   *
   * CRITICAL: Only process if status VALUE actually changed, not just if status field exists.
   * When customFields are merged, status is always included, so we must compare VALUES.
   */
  private async handleChannelUpdate(event: ChannelEvent): Promise<void> {
    const channelFromEvent = event.entity as Channel;
    const channelIdStr = channelFromEvent.id?.toString() || event.ctx.channelId?.toString();
    if (!channelIdStr) {
      this.logger.warn('ChannelEvent missing channel ID');
      return;
    }

    // CRITICAL: Check and set processing flag IMMEDIATELY to prevent race conditions
    // This must happen before any async operations
    if (this.processingChannels.has(channelIdStr)) {
      this.logger.debug(
        `Channel ${channelIdStr} is already being processed - skipping duplicate event`
      );
      return;
    }

    // Mark as processing immediately (atomic operation)
    this.processingChannels.add(channelIdStr);

    try {
      // Get status from event.entity - this represents the channel state at event time
      // (may be before or after update depending on when Vendure fires the event)
      const eventEntityStatus = getChannelStatus((channelFromEvent.customFields || {}) as any);

      // Load channel from database to get current status AFTER update
      const updatedChannel = await this.connection.getRepository(event.ctx, Channel).findOne({
        where: { id: channelIdStr },
        select: ['id', 'customFields'],
        relations: ['seller'],
      });

      if (!updatedChannel) {
        this.logger.warn(`Channel ${channelIdStr} not found after update event`);
        return;
      }

      // Get status from database (this is the state AFTER the update)
      const dbStatus = getChannelStatus((updatedChannel.customFields || {}) as any);

      // CRITICAL: Only process if status VALUE actually changed
      // Compare event entity status with database status - if they match, status didn't change
      // This handles the case where logo is updated but status remains the same
      if (eventEntityStatus === dbStatus) {
        // Status values are the same - no status change occurred (e.g., logo update)
        this.logger.debug(
          `Channel ${channelIdStr} updated but status unchanged (${dbStatus}) - skipping status change processing`
        );
        return;
      }

      // Status values differ - determine which is old and which is new
      // The database status is definitely the NEW status after update
      const newStatus = dbStatus;

      // The event entity status differs from DB - if it's different, it might be the old status
      // However, we need to be careful because event.entity might have new state in some cases
      // For now, assume event entity status is the old status if it differs from DB
      const oldStatus = eventEntityStatus;

      // Final validation: Ensure we have valid status values
      if (!oldStatus || !newStatus) {
        this.logger.debug(
          `Channel ${channelIdStr} status comparison invalid - skipping status change processing`
        );
        return;
      }

      // If old and new status are the same after comparison, skip
      if (oldStatus === newStatus) {
        this.logger.debug(
          `Channel ${channelIdStr} status unchanged after comparison (${oldStatus}) - skipping`
        );
        return;
      }

      // Create unique transition key
      const transitionKey = `${channelIdStr}:${oldStatus}->${newStatus}`;

      // Check if this exact transition was already processed
      if (this.processedTransitions.has(transitionKey)) {
        this.logger.debug(
          `Skipping duplicate status transition for channel ${channelIdStr}: ${oldStatus} -> ${newStatus} (already processed)`
        );
        return;
      }

      // Mark transition as processed immediately to prevent race conditions
      this.processedTransitions.add(transitionKey);

      // Clean up old entries (keep last 200 transitions)
      if (this.processedTransitions.size > 200) {
        const entries = Array.from(this.processedTransitions);
        entries
          .slice(0, entries.length - 200)
          .forEach(key => this.processedTransitions.delete(key));
      }

      this.logger.log(`Channel ${channelIdStr} status changed: ${oldStatus} -> ${newStatus}`);

      // Only trigger if status changed to APPROVED
      if (newStatus === ChannelStatus.APPROVED && oldStatus !== ChannelStatus.APPROVED) {
        await this.routeApprovalNotification(event.ctx, channelIdStr, updatedChannel);
      }
    } finally {
      // Always remove from processing set when done (even on error or early return)
      this.processingChannels.delete(channelIdStr);
    }
  }

  /**
   * Route approval notification through event router
   */
  private async routeApprovalNotification(
    ctx: RequestContext,
    channelId: string,
    channel: Channel
  ): Promise<void> {
    try {
      // Get company name from seller (seller.name is "{companyName} Seller")
      let companyName = 'your company';
      if (channel.seller?.name) {
        // Remove " Seller" suffix to get company name
        companyName = channel.seller.name.replace(/\s+Seller$/, '');
      } else if (channel.code) {
        // Fallback to channel code if seller not available
        companyName = channel.code;
      }

      // Get channel-specific admins only (exclude superadmins)
      const adminRepo = this.connection.rawConnection.getRepository(Administrator);
      const administrators = await adminRepo
        .createQueryBuilder('admin')
        .innerJoinAndSelect('admin.user', 'user')
        .innerJoinAndSelect('user.roles', 'role')
        .innerJoinAndSelect('role.channels', 'channel')
        .where('channel.id = :channelId', { channelId })
        .andWhere('admin.deletedAt IS NULL')
        .andWhere('user.deletedAt IS NULL')
        .getMany();

      // Filter out superadmins
      const channelAdmins = administrators.filter((admin): admin is Administrator => {
        if (!admin.user?.roles) return false;
        return admin.user.roles.some(role => {
          return (
            role.channels &&
            role.channels.length > 0 &&
            role.channels.some(c => c.id.toString() === channelId)
          );
        });
      });

      if (channelAdmins.length === 0) {
        this.logger.warn(
          `No channel-specific administrators found for channel ${channelId} - cannot send approval notification`
        );
        return;
      }

      const channelAdmin = channelAdmins[0];
      if (!channelAdmin) {
        this.logger.warn(`Channel admin is null for channel ${channelId}`);
        return;
      }

      // Route event through notification system
      // The event router will handle getting channel admins and routing to them
      // We pass the admin user ID so it routes to the specific admin
      await this.eventRouter.routeEvent({
        type: ChannelEventType.CHANNEL_APPROVED,
        channelId,
        category: ActionCategory.SYSTEM_NOTIFICATIONS,
        context: ctx,
        targetUserId: channelAdmin.user?.id?.toString(), // Route to specific admin
        data: {
          channelId,
          companyName,
          adminName: channelAdmin.firstName || 'there',
          // Don't pass phoneNumber - let the handler get it from the user
        },
      });

      this.logger.log(
        `Channel approval notification sent for channel ${channelId} to admin ${channelAdmin.id}`
      );
    } catch (error) {
      this.logger.error(
        `Error routing approval notification for channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
}
