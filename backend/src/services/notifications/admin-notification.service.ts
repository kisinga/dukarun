import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { env } from '../../infrastructure/config/environment.config';
import { OutboundDeliveryService } from './outbound-delivery.service';

/**
 * Company registration details for admin notification
 */
export interface CompanyRegistrationDetails {
  companyName: string;
  companyCode: string;
  channelId: string;
  adminName: string;
  adminPhone: string;
  adminEmail?: string;
  storeName: string;
}

/**
 * Admin Notification Service
 *
 * Sends notifications to platform administrators for important events
 * like new company registrations. Delegates to OutboundDeliveryService (company_registered trigger).
 *
 * Configuration via environment variables:
 * - ADMIN_NOTIFICATION_EMAIL, ADMIN_NOTIFICATION_PHONE, ADMIN_NOTIFICATION_CHANNELS
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(private readonly outboundDelivery: OutboundDeliveryService) {}

  private getEnabledChannels(): { email: boolean; sms: boolean } {
    const channelsStr = env.adminNotifications.channels.toLowerCase();
    return {
      email: channelsStr.includes('email'),
      sms: channelsStr.includes('sms'),
    };
  }

  isConfigured(): boolean {
    const channels = this.getEnabledChannels();
    const hasEmail = channels.email && !!env.adminNotifications.email;
    const hasSms = channels.sms && !!env.adminNotifications.phone;
    return hasEmail || hasSms;
  }

  /**
   * Send notification about new company registration via outbound deliver.
   */
  async sendCompanyRegisteredNotification(
    ctx: RequestContext,
    details: CompanyRegistrationDetails
  ): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Admin notifications not configured. Set ADMIN_NOTIFICATION_EMAIL/PHONE to receive registration alerts.'
      );
      return;
    }
    await this.outboundDelivery.deliver(ctx, 'company_registered', {
      ...details,
      channelId: details.channelId,
    });
  }
}
