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
   * event.entity contains the channel entity (may be old or new state depending on when event fires)
   * event.input contains the update input with new values
   * We need to determine old and new status correctly
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
      // Get current status from database (this is the NEW state after update)
      // Include seller relation for company name
      const newChannel = await this.connection.getRepository(event.ctx, Channel).findOne({
        where: { id: channelIdStr },
        select: ['id', 'customFields'],
        relations: ['seller'],
      });

      if (!newChannel) {
        this.logger.warn(`Channel ${channelIdStr} not found after update event`);
        return;
      }

      const dbStatus = getChannelStatus((newChannel.customFields || {}) as any);
      const eventEntityStatus = getChannelStatus((channelFromEvent.customFields || {}) as any);

      // Determine old and new status
      // Based on user feedback: event.entity contains NEW state when they differ
      let oldStatus: ChannelStatus;
      let newStatus: ChannelStatus;

      if (eventEntityStatus !== dbStatus) {
        // They differ - event.entity is NEW state (was updated), db might be OLD (before commit)
        newStatus = eventEntityStatus;
        oldStatus = dbStatus;
      } else {
        // They match - both have same status
        // If status is in input, that's what's being set (NEW)
        const inputCustomFields = (event.input as any)?.customFields;
        if (inputCustomFields?.status && inputCustomFields.status !== eventEntityStatus) {
          // Input has different status - this is the NEW status being set
          newStatus = inputCustomFields.status as ChannelStatus;
          oldStatus = eventEntityStatus; // Current status is OLD
        } else {
          // No status change detected - status unchanged
          return;
        }
      }

      // Only process if status actually changed
      if (oldStatus === newStatus) {
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
        await this.routeApprovalNotification(event.ctx, channelIdStr, newChannel);
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
