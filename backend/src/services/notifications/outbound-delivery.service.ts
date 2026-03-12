import { Injectable, Logger } from '@nestjs/common';
import { Customer, RequestContext, TransactionalConnection, User } from '@vendure/core';
import { env } from '../../infrastructure/config/environment.config';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { ChannelUserService } from '../../services/auth/channel-user.service';
import { OUTBOUND_CONFIG, type OutboundAudience } from './outbound.config';
import { renderOutbound } from './outbound.render';
import { CreateNotificationInput, NotificationService } from './notification.service';

export type OutboundPayload = Record<string, unknown> & {
  channelId?: string;
  /** Override in-app recipients (e.g. for approval_resolved -> requester only). */
  targetUserIds?: string[];
  /** For customer audience: customer entity id. */
  customerId?: string;
};

/**
 * Single entry point for server-initiated communication.
 * Uses outbound config + render; delegates to NotificationService (in-app) and CommunicationService (SMS/email).
 */
@Injectable()
export class OutboundDeliveryService {
  private readonly logger = new Logger(OutboundDeliveryService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly communicationService: CommunicationService,
    private readonly channelUserService: ChannelUserService,
    private readonly connection: TransactionalConnection
  ) {}

  /**
   * Deliver a trigger: resolve audience, render content, send in-app and/or SMS/email.
   */
  async deliver(ctx: RequestContext, triggerKey: string, payload: OutboundPayload): Promise<void> {
    const config = OUTBOUND_CONFIG[triggerKey];
    if (!config) {
      this.logger.warn(`No outbound config for trigger "${triggerKey}", skipping`);
      return;
    }

    const channelId = payload.channelId ?? ctx.channelId?.toString();
    const rendered = renderOutbound(triggerKey, payload);

    if (config.channels.inApp) {
      const userIds = await this.resolveInAppRecipients(ctx, config.audience, channelId, payload);
      for (const userId of userIds) {
        await this.notificationService.createNotificationIfEnabled(ctx, {
          userId,
          channelId: channelId ?? '',
          type: config.inAppType,
          title: rendered.inAppTitle,
          message: rendered.inAppMessage,
          data: payload,
        } as CreateNotificationInput);
      }
    }

    if (config.channels.sms) {
      const phones = await this.resolveSmsRecipients(ctx, config.audience, channelId, payload);
      const smsBody = rendered.smsBody;
      if (smsBody && phones.length > 0) {
        const purpose =
          triggerKey === 'company_registered' ? 'admin_notification' : 'account_notification';
        for (const phone of phones) {
          const result = await this.communicationService.send({
            channel: 'sms',
            recipient: phone,
            body: smsBody,
            ctx,
            channelId: config.audience === 'platform_admin' ? undefined : channelId,
            metadata: { purpose },
            smsCategory: config.smsCategory,
          });
          if (!result.success) {
            this.logger.warn(`Outbound SMS failed for ${triggerKey}: ${result.error}`);
          }
        }
      }
    }

    if (config.channels.email) {
      const emails = await this.resolveEmailRecipients(ctx, config.audience, payload);
      const subject = rendered.emailSubject;
      const body = rendered.emailBody;
      if (subject && body && emails.length > 0) {
        for (const email of emails) {
          const result = await this.communicationService.send({
            channel: 'email',
            recipient: email,
            body: { subject, body },
            ctx,
            metadata: { purpose: 'admin_notification' },
          });
          if (!result.success) {
            this.logger.warn(`Outbound email failed for ${triggerKey}: ${result.error}`);
          }
        }
      }
    }
  }

  private async resolveInAppRecipients(
    ctx: RequestContext,
    audience: OutboundAudience,
    channelId: string | undefined,
    payload: OutboundPayload
  ): Promise<string[]> {
    if (payload.targetUserIds && payload.targetUserIds.length > 0) {
      return payload.targetUserIds;
    }
    if (audience === 'channel_admins' && channelId) {
      return this.channelUserService.getChannelAdminUserIds(ctx, channelId, {
        includeSuperAdmins: true,
      });
    }
    if (audience === 'customer' || audience === 'platform_admin') {
      return [];
    }
    return [];
  }

  private async resolveSmsRecipients(
    ctx: RequestContext,
    audience: OutboundAudience,
    _channelId: string | undefined,
    payload: OutboundPayload
  ): Promise<string[]> {
    if (audience === 'customer' && payload.customerId) {
      const customer = await this.connection.getRepository(ctx, Customer).findOne({
        where: { id: payload.customerId },
        relations: ['user'],
      });
      if (!customer) return [];
      const cf = (customer as any).customFields || {};
      const phone = cf.phoneNumber ?? (customer as any).user?.identifier ?? null;
      if (phone && typeof phone === 'string' && phone.trim()) return [phone.trim()];
      return [];
    }
    if (audience === 'platform_admin' && env.adminNotifications.phone) {
      return [env.adminNotifications.phone];
    }
    return [];
  }

  private async resolveEmailRecipients(
    ctx: RequestContext,
    audience: OutboundAudience,
    payload: OutboundPayload
  ): Promise<string[]> {
    if (audience === 'platform_admin' && env.adminNotifications.email) {
      return [env.adminNotifications.email];
    }
    if (audience === 'customer' && payload.customerId) {
      const customer = await this.connection.getRepository(ctx, Customer).findOne({
        where: { id: payload.customerId },
        relations: ['user'],
      });
      if (!customer?.user?.identifier) return [];
      const id = customer.user.identifier;
      if (typeof id === 'string' && id.includes('@')) return [id];
      return [];
    }
    if (audience === 'channel_admins' && payload.channelId) {
      // Send to the first channel admin with a valid email (single admin per notification).
      const adminIds = await this.channelUserService.getChannelAdminUserIds(
        ctx,
        String(payload.channelId),
        { includeSuperAdmins: false }
      );
      for (const userId of adminIds) {
        const user = await this.connection.rawConnection
          .getRepository(User)
          .findOne({ where: { id: userId } });
        const identifier = user?.identifier;
        if (typeof identifier === 'string' && identifier.includes('@')) {
          return [identifier];
        }
      }
      return [];
    }
    return [];
  }
}
