import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { Channel, ChannelService, RequestContext } from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ChannelEventRouterService } from '../../infrastructure/events/channel-event-router.service';
import { ChannelEvent } from '../../infrastructure/events/types/channel-event.interface';
import {
  ChannelStatus,
  ChannelCustomFields,
  getChannelStatus,
} from '../../domain/channel-custom-fields';

/**
 * Options for channel customFields updates
 */
export interface UpdateChannelCustomFieldsOptions {
  /**
   * Audit event type to log (e.g., 'channel.settings.updated')
   * If provided, will log audit event with the update
   */
  auditEvent?: string;

  /**
   * Channel event to route after update
   * If provided, will route the event through ChannelEventRouterService
   */
  routeEvent?: ChannelEvent;

  /**
   * Whether to detect changes before updating
   * If true, only updates if values actually changed
   * Default: false
   */
  detectChanges?: boolean;

  /**
   * Hook called when status field changes
   * Receives old and new status values
   */
  onStatusChange?: (oldStatus: ChannelStatus, newStatus: ChannelStatus) => Promise<void>;
}

/**
 * Channel Update Helper
 *
 * Single source of truth for updating channel customFields.
 * Provides composable cross-cutting concerns:
 * - Change detection
 * - Audit logging
 * - Event routing
 * - Status change hooks
 *
 * All channel customFields updates should go through this helper for consistency.
 */
@Injectable()
export class ChannelUpdateHelper {
  private readonly logger = new Logger(ChannelUpdateHelper.name);

  constructor(
    private readonly channelService: ChannelService,
    private readonly auditService: AuditService,
    @Optional()
    @Inject(forwardRef(() => ChannelEventRouterService))
    private readonly eventRouter?: ChannelEventRouterService
  ) {}

  /**
   * Update channel customFields with optional cross-cutting concerns
   *
   * @param ctx Request context
   * @param channelId Channel ID to update
   * @param updates Partial customFields to update
   * @param options Optional cross-cutting concerns
   * @returns Updated channel
   */
  async updateChannelCustomFields(
    ctx: RequestContext,
    channelId: string,
    updates: Partial<ChannelCustomFields>,
    options: UpdateChannelCustomFieldsOptions = {}
  ): Promise<Channel> {
    // Load current channel
    const currentChannel = await this.channelService.findOne(ctx, channelId);
    if (!currentChannel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const currentCustomFields = (currentChannel.customFields || {}) as any;
    const currentStatus = getChannelStatus(currentCustomFields);

    // Detect changes if requested
    if (options.detectChanges) {
      const hasChanges = this.hasChanges(currentCustomFields, updates);
      if (!hasChanges) {
        this.logger.debug(`No changes detected for channel ${channelId}, skipping update`);
        return currentChannel;
      }
    }

    // Merge updates safely (preserves unrelated fields)
    const mergedCustomFields = {
      ...currentCustomFields,
      ...updates,
    };

    // Check if status changed for hook
    // Only consider status changed if status field is explicitly in updates
    const newStatus = updates.status !== undefined ? updates.status : currentStatus;
    const statusChanged = updates.status !== undefined && newStatus !== currentStatus;

    // Log status change for debugging
    if (statusChanged) {
      this.logger.log(`Channel ${channelId} status changing from ${currentStatus} to ${newStatus}`);
    }

    // Update channel
    const updateResult = await this.channelService.update(ctx, {
      id: channelId,
      customFields: mergedCustomFields,
    });

    // Handle error result
    if ('errorCode' in updateResult) {
      throw new Error(`Failed to update channel: ${updateResult.errorCode}`);
    }

    const updatedChannel = updateResult;

    // Log audit if requested
    if (options.auditEvent) {
      await this.auditService
        .log(ctx, options.auditEvent, {
          entityType: 'Channel',
          entityId: channelId,
          data: {
            fields: Object.keys(updates),
            changes: updates,
          },
        })
        .catch(err => {
          this.logger.warn(
            `Failed to log audit event ${options.auditEvent}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    // Route event if requested
    if (options.routeEvent) {
      await this.eventRouter?.routeEvent(options.routeEvent).catch(err => {
        this.logger.warn(
          `Failed to route event ${options.routeEvent?.type}: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }

    // Call status change hook if status changed
    if (statusChanged && options.onStatusChange) {
      await options.onStatusChange(currentStatus, newStatus).catch(err => {
        this.logger.warn(
          `Failed to execute status change hook: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }

    // Note: SMS notifications are now handled by ChannelStatusSubscriber
    // which listens to Vendure ChannelEvent, so we don't need to handle it here

    return updatedChannel;
  }

  /**
   * Check if updates contain actual changes
   */
  private hasChanges(current: any, updates: Partial<ChannelCustomFields>): boolean {
    for (const key in updates) {
      if (updates.hasOwnProperty(key)) {
        const currentValue = current[key];
        const newValue = updates[key as keyof ChannelCustomFields];

        // Deep comparison for objects/arrays
        if (typeof currentValue === 'object' && typeof newValue === 'object') {
          if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
            return true;
          }
        } else if (currentValue !== newValue) {
          return true;
        }
      }
    }
    return false;
  }
}
