import { Injectable, Logger } from '@nestjs/common';
import {
  Customer,
  GlobalSettingsService,
  RequestContext,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { env } from '../../infrastructure/config/environment.config';
import { validatePhoneNumber } from '../../utils/phone.utils';
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

interface PhoneRecipient {
  phone: string;
  userId?: string;
}

/**
 * Single entry point for server-initiated communication.
 * Uses outbound config + render; delegates to NotificationService (in-app) and CommunicationService (SMS/email/WhatsApp).
 */
@Injectable()
export class OutboundDeliveryService {
  private readonly logger = new Logger(OutboundDeliveryService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly communicationService: CommunicationService,
    private readonly channelUserService: ChannelUserService,
    private readonly connection: TransactionalConnection,
    private readonly globalSettingsService: GlobalSettingsService
  ) {}

  /**
   * Deliver a trigger: resolve audience, render content, send in-app and/or SMS/email/WhatsApp.
   */
  async deliver(ctx: RequestContext, triggerKey: string, payload: OutboundPayload): Promise<void> {
    const config = OUTBOUND_CONFIG[triggerKey];
    if (!config) {
      this.logger.warn(`No outbound config for trigger "${triggerKey}", skipping`);
      return;
    }

    const channelId = payload.channelId ?? ctx.channelId?.toString();
    if (
      config.category &&
      channelId &&
      !(await this.notificationService.isChannelNotificationCategoryEnabled(
        ctx,
        channelId,
        config.category
      ))
    ) {
      this.logger.debug(
        `Notification category "${config.category}" disabled for channel ${channelId}; skipping ${triggerKey}`
      );
      return;
    }

    if (config.audience === 'customer') {
      const canSend = await this.canNotifyCustomer(ctx, payload.customerId);
      if (!canSend) {
        this.logger.debug(
          `Customer notifications disabled (global or per-customer); skipping ${triggerKey}`
        );
        return;
      }
    }

    const rendered = renderOutbound(triggerKey, payload);

    if (config.channels.inApp) {
      const userIds = await this.resolveInAppRecipients(
        ctx,
        config.audience,
        channelId,
        payload,
        triggerKey
      );
      for (const userId of userIds) {
        if (!(await this.isShiftChannelEnabled(ctx, userId, channelId, triggerKey, 'inApp'))) {
          continue;
        }
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
      const recipients = await this.resolvePhoneRecipients(
        ctx,
        config.audience,
        channelId,
        payload,
        triggerKey
      );
      const smsBody = rendered.smsBody;
      if (smsBody && recipients.length > 0) {
        const purpose =
          triggerKey === 'company_registered' ? 'admin_notification' : 'account_notification';
        for (const { phone, userId } of recipients) {
          if (!(await this.isShiftChannelEnabled(ctx, userId, channelId, triggerKey, 'sms'))) {
            continue;
          }
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
      const emails = await this.resolveEmailRecipients(ctx, config.audience, payload, triggerKey);
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

    if (config.channels.whatsapp) {
      const recipients = await this.resolvePhoneRecipients(
        ctx,
        config.audience,
        channelId,
        payload,
        triggerKey
      );
      const whatsappBody = rendered.whatsappBody ?? rendered.smsBody;
      if (whatsappBody && recipients.length > 0) {
        for (const { phone, userId } of recipients) {
          if (!(await this.isShiftChannelEnabled(ctx, userId, channelId, triggerKey, 'whatsapp'))) {
            continue;
          }
          const result = await this.communicationService.send({
            channel: 'whatsapp',
            recipient: phone,
            body: whatsappBody,
            ctx,
            channelId: config.audience === 'platform_admin' ? undefined : channelId,
            metadata: { purpose: 'account_notification' },
          });
          if (!result.success) {
            this.logger.warn(`Outbound WhatsApp failed for ${triggerKey}: ${result.error}`);
          }
        }
      }
    }
  }

  private isShiftTrigger(triggerKey: string): triggerKey is 'shift_opened' | 'shift_closed' {
    return triggerKey === 'shift_opened' || triggerKey === 'shift_closed';
  }

  private async canNotifyCustomer(
    ctx: RequestContext,
    customerId: string | undefined
  ): Promise<boolean> {
    if (!customerId) {
      return false;
    }

    try {
      const settings = await this.globalSettingsService.getSettings(ctx);
      const globalEnabled = (settings as any).customFields?.customerNotificationsEnabled === true;
      if (!globalEnabled) {
        return false;
      }
    } catch (error) {
      this.logger.warn('Failed to read global customer notification setting', error);
      return false;
    }

    try {
      const customer = await this.connection.getRepository(ctx, Customer).findOne({
        where: { id: customerId },
      });
      if (!customer) {
        return false;
      }
      const cf = (customer as any).customFields || {};
      return cf.notificationsEnabled === true;
    } catch (error) {
      this.logger.warn(`Failed to read customer notification preference: ${customerId}`, error);
      return false;
    }
  }

  private async isShiftChannelEnabled(
    ctx: RequestContext,
    userId: string | undefined,
    channelId: string | undefined,
    triggerKey: string,
    channel: 'whatsapp' | 'inApp' | 'sms' | 'email'
  ): Promise<boolean> {
    if (!userId || !channelId || !this.isShiftTrigger(triggerKey)) {
      return true;
    }
    const trigger = triggerKey === 'shift_opened' ? 'opened' : 'closed';
    return this.notificationService.isShiftNotificationEnabled(
      ctx,
      userId,
      channelId,
      trigger,
      channel
    );
  }

  private async resolveInAppRecipients(
    ctx: RequestContext,
    audience: OutboundAudience,
    channelId: string | undefined,
    payload: OutboundPayload,
    triggerKey: string
  ): Promise<string[]> {
    if (payload.targetUserIds && payload.targetUserIds.length > 0) {
      return payload.targetUserIds;
    }
    if (audience === 'channel_admins' && channelId) {
      if (this.isShiftTrigger(triggerKey)) {
        return this.channelUserService.getChannelFinancialAdminUserIds(ctx, channelId, {
          includeSuperAdmins: true,
        });
      }
      return this.channelUserService.getChannelAdminUserIds(ctx, channelId, {
        includeSuperAdmins: true,
      });
    }
    if (audience === 'customer' || audience === 'platform_admin') {
      return [];
    }
    return [];
  }

  private async resolvePhoneRecipients(
    ctx: RequestContext,
    audience: OutboundAudience,
    _channelId: string | undefined,
    payload: OutboundPayload,
    triggerKey: string
  ): Promise<PhoneRecipient[]> {
    if (audience === 'customer' && payload.customerId) {
      const customer = await this.connection.getRepository(ctx, Customer).findOne({
        where: { id: payload.customerId },
        relations: ['user'],
      });
      if (!customer) return [];
      const cf = (customer as any).customFields || {};
      const phone = cf.phoneNumber ?? (customer as any).user?.identifier ?? null;
      if (phone && typeof phone === 'string' && phone.trim() && validatePhoneNumber(phone.trim())) {
        return [{ phone: phone.trim() }];
      }
      return [];
    }
    if (audience === 'platform_admin' && env.adminNotifications.phone) {
      return [{ phone: env.adminNotifications.phone }];
    }
    if (audience === 'channel_admins' && _channelId) {
      const adminIds = this.isShiftTrigger(triggerKey)
        ? await this.channelUserService.getChannelFinancialAdminUserIds(ctx, _channelId, {
            includeSuperAdmins: true,
          })
        : await this.channelUserService.getChannelAdminUserIds(ctx, _channelId, {
            includeSuperAdmins: true,
          });
      const recipients: PhoneRecipient[] = [];
      for (const userId of adminIds) {
        const user = await this.connection.rawConnection
          .getRepository(User)
          .findOne({ where: { id: userId } });
        const phone = (user?.customFields as Record<string, unknown> | undefined)?.phoneNumber;
        if (typeof phone === 'string' && phone.trim() && validatePhoneNumber(phone.trim())) {
          recipients.push({ phone: phone.trim(), userId });
        }
      }
      return recipients;
    }
    return [];
  }

  private async resolveEmailRecipients(
    ctx: RequestContext,
    audience: OutboundAudience,
    payload: OutboundPayload,
    triggerKey: string
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
      const adminIds = this.isShiftTrigger(triggerKey)
        ? await this.channelUserService.getChannelFinancialAdminUserIds(
            ctx,
            String(payload.channelId),
            { includeSuperAdmins: false }
          )
        : await this.channelUserService.getChannelAdminUserIds(ctx, String(payload.channelId), {
            includeSuperAdmins: false,
          });
      for (const userId of adminIds) {
        if (
          this.isShiftTrigger(triggerKey) &&
          !(await this.isShiftChannelEnabled(ctx, userId, payload.channelId, triggerKey, 'email'))
        ) {
          continue;
        }
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
