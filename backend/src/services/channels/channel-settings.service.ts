import { Injectable, Logger } from '@nestjs/common';
import {
  Administrator,
  Asset,
  Channel,
  ChannelService,
  EventBus,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ChannelStatusEvent } from '../../infrastructure/events/custom-events';
import { getChannelStatus } from '../../domain/channel-custom-fields';

export interface ChannelSettings {
  cashierFlowEnabled: boolean;
  cashierOpen: boolean;
  enablePrinter: boolean;
  companyLogoAsset?: Asset | null;
}

export interface UpdateChannelSettingsInput {
  cashierFlowEnabled?: boolean;
  cashierOpen?: boolean;
  enablePrinter?: boolean;
  companyLogoAssetId?: string | null;
}

@Injectable()
export class ChannelSettingsService {
  private readonly logger = new Logger(ChannelSettingsService.name);

  constructor(
    private readonly channelService: ChannelService,
    private readonly connection: TransactionalConnection,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Helper to safely update channel custom fields while preserving relations.
   * Loads the entity with relation fields (companyLogoAsset) to prevent overwriting them.
   */
  async updateChannelLogo(ctx: RequestContext, logoAssetId?: string): Promise<ChannelSettings> {
    const channelId = ctx.channelId;
    let logoAsset: any = null;

    if (logoAssetId) {
      logoAsset = await this.connection.getEntityOrThrow(ctx, Asset, logoAssetId);
    }

    this.logger.log(`Updating channel logo for ${channelId} to ${logoAssetId || 'null'}`);

    // Direct save for Logo (Relation)
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const entity = await channelRepo.findOne({
      where: { id: channelId },
      relations: ['customFields.companyLogoAsset'],
    });

    if (!entity) throw new Error(`Channel ${channelId} not found`);

    entity.customFields = {
      ...entity.customFields,
      companyLogoAsset: logoAsset,
    } as any;

    await channelRepo.save(entity);

    await this.auditService.log(ctx, 'channel.settings.updated', {
      entityType: 'Channel',
      entityId: channelId.toString(),
      data: { fields: ['companyLogoAsset'] },
    });

    return this.mapChannelSettings(entity);
  }

  async updateCashierSettings(
    ctx: RequestContext,
    cashierFlowEnabled?: boolean,
    cashierOpen?: boolean
  ): Promise<ChannelSettings> {
    const channelId = ctx.channelId!;
    // Validate
    if (cashierFlowEnabled === false && cashierOpen === true) {
      throw new UserInputError('error.cashier-cannot-be-open-when-flow-disabled');
    }

    const updates: any = {};
    if (cashierFlowEnabled !== undefined) updates.cashierFlowEnabled = cashierFlowEnabled;
    if (cashierOpen !== undefined) updates.cashierOpen = cashierOpen;

    if (Object.keys(updates).length > 0) {
      // Use channelService.update for scalar fields (handles column mapping correctly)
      await this.channelService.update(ctx, {
        id: channelId,
        customFields: updates,
      });

      await this.auditService.log(ctx, 'channel.settings.updated', {
        entityType: 'Channel',
        entityId: channelId.toString(),
        data: { fields: Object.keys(updates) },
      });
    }

    return this.getSettings(ctx);
  }

  async updatePrinterSettings(
    ctx: RequestContext,
    enablePrinter: boolean
  ): Promise<ChannelSettings> {
    const channelId = ctx.channelId!;

    // Use channelService.update for scalar fields
    await this.channelService.update(ctx, {
      id: channelId,
      customFields: { enablePrinter },
    });

    await this.auditService.log(ctx, 'channel.settings.updated', {
      entityType: 'Channel',
      entityId: channelId.toString(),
      data: { fields: ['enablePrinter'] },
    });

    return this.getSettings(ctx);
  }

  /**
   * Get current channel settings.
   */
  async getSettings(ctx: RequestContext): Promise<ChannelSettings> {
    const channelId = ctx.channelId!;
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }
    return this.mapChannelSettings(channel);
  }

  /**
   * Update channel status (UNAPPROVED/APPROVED/DISABLED/BANNED)
   * Handles approval notifications directly when status changes to APPROVED
   */
  async updateChannelStatus(
    ctx: RequestContext,
    channelId: string,
    status: 'UNAPPROVED' | 'APPROVED' | 'DISABLED' | 'BANNED'
  ): Promise<Channel> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const currentStatus = getChannelStatus(channel.customFields);
    const isBeingApproved = currentStatus !== 'APPROVED' && status === 'APPROVED';

    // Direct Vendure update for status
    await this.channelService.update(ctx, {
      id: channelId,
      customFields: { status },
    });

    // Audit log
    await this.auditService.log(ctx, 'channel.status.updated', {
      entityType: 'Channel',
      entityId: channelId.toString(),
      data: { status },
    });

    const updatedChannel = await this.channelService.findOne(ctx, channelId);
    if (!updatedChannel) {
      throw new Error('Channel not found after update');
    }

    // Send approval notification if status changed to APPROVED
    if (isBeingApproved) {
      await this.sendApprovalNotification(ctx, channelId, updatedChannel);
    }

    return updatedChannel;
  }

  /**
   * Send approval notification to channel administrators
   * Routes CHANNEL_APPROVED event via eventRouter to send SMS
   */
  private async sendApprovalNotification(
    ctx: RequestContext,
    channelId: string,
    channel: Channel
  ): Promise<void> {
    try {
      // Get company name from seller (seller.name is "{companyName} Seller")
      let companyName = 'your company';
      if (channel.seller?.name) {
        companyName = channel.seller.name.replace(/\s+Seller$/, '');
      } else if (channel.code) {
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

      // Filter out superadmins (keep only admins with channel-specific roles)
      const channelAdmins = administrators.filter((admin): admin is Administrator => {
        if (!admin.user?.roles) return false;
        return admin.user.roles.some(
          role =>
            role.channels?.length > 0 && role.channels.some(c => c.id.toString() === channelId)
        );
      });

      if (channelAdmins.length === 0) {
        this.logger.warn(
          `No channel-specific administrators found for channel ${channelId} - cannot send approval notification`
        );
        return;
      }

      const channelAdmin = channelAdmins[0];

      // Publish channel approved event
      this.eventBus.publish(
        new ChannelStatusEvent(ctx, channelId, 'approved', {
          channelId,
          companyName,
          adminName: channelAdmin.firstName || 'there',
          targetUserId: channelAdmin.user?.id?.toString(),
        })
      );

      this.logger.log(
        `Channel approval notification sent for channel ${channelId} to admin ${channelAdmin.id}`
      );
    } catch (error) {
      this.logger.error(
        `Error sending approval notification for channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  private mapChannelSettings(channel: Channel): ChannelSettings {
    const customFields = (channel.customFields ?? {}) as {
      cashierFlowEnabled?: boolean;
      cashierOpen?: boolean;
      enablePrinter?: boolean;
      companyLogoAsset?: Asset | null;
    };

    return {
      cashierFlowEnabled: customFields.cashierFlowEnabled ?? false,
      cashierOpen: customFields.cashierOpen ?? false,
      enablePrinter: customFields.enablePrinter ?? true,
      companyLogoAsset: customFields.companyLogoAsset ?? null,
    };
  }
}
