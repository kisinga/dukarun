import { Injectable, Logger } from '@nestjs/common';
import { EventBus, RequestContext } from '@vendure/core';
import { env } from '../../infrastructure/config/environment.config';
import { SmsProviderFactory } from '../../infrastructure/sms/sms-provider.factory';

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
 * like new company registrations. Supports configurable channels (email, SMS).
 *
 * Configuration via environment variables:
 * - ADMIN_NOTIFICATION_EMAIL: Email to receive alerts
 * - ADMIN_NOTIFICATION_PHONE: Phone to receive SMS alerts
 * - ADMIN_NOTIFICATION_CHANNELS: Comma-separated list (email,sms)
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);
  private readonly smsProviderFactory = new SmsProviderFactory();

  constructor(private readonly eventBus: EventBus) {}

  /**
   * Get configured notification channels
   */
  private getEnabledChannels(): { email: boolean; sms: boolean } {
    const channelsStr = env.adminNotifications.channels.toLowerCase();
    return {
      email: channelsStr.includes('email'),
      sms: channelsStr.includes('sms'),
    };
  }

  /**
   * Check if admin notifications are configured
   */
  isConfigured(): boolean {
    const channels = this.getEnabledChannels();
    const hasEmail = channels.email && !!env.adminNotifications.email;
    const hasSms = channels.sms && !!env.adminNotifications.phone;
    return hasEmail || hasSms;
  }

  /**
   * Send notification about new company registration
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

    const channels = this.getEnabledChannels();
    const timestamp = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });

    // Send via enabled channels
    if (channels.email && env.adminNotifications.email) {
      await this.sendEmailNotification(details, timestamp);
    }

    if (channels.sms && env.adminNotifications.phone) {
      await this.sendSmsNotification(details, timestamp);
    }
  }

  /**
   * Send email notification to admin
   * Uses a simple direct approach - logs for now, can be enhanced with Vendure's EmailPlugin
   */
  private async sendEmailNotification(
    details: CompanyRegistrationDetails,
    timestamp: string
  ): Promise<void> {
    const adminEmail = env.adminNotifications.email;

    // For now, log the email content. In production, this would use Vendure's EmailPlugin
    // or a direct SMTP service. The email handler can be added later.
    const subject = `New Company Registration: ${details.companyName}`;
    const body = this.formatEmailBody(details, timestamp);

    this.logger.log(`📧 Sending registration notification email to: ${adminEmail}`);
    this.logger.log(`Subject: ${subject}`);
    this.logger.debug(`Email body:\n${body}`);

    // TODO: Integrate with Vendure EmailPlugin by creating an email handler
    // For now, the log serves as confirmation that notification would be sent
    this.logger.log(`✅ Email notification logged for: ${details.companyName}`);
  }

  /**
   * Send SMS notification to admin
   */
  private async sendSmsNotification(
    details: CompanyRegistrationDetails,
    timestamp: string
  ): Promise<void> {
    const adminPhone = env.adminNotifications.phone;
    const message = this.formatSmsMessage(details);

    this.logger.log(`📱 Sending registration notification SMS to: ${adminPhone}`);

    try {
      const provider = this.smsProviderFactory.getProvider();
      const result = await provider.sendSms(adminPhone, message);

      if (result.success) {
        this.logger.log(`✅ SMS notification sent for: ${details.companyName}`);
      } else {
        this.logger.warn(`⚠️ SMS notification failed: ${result.error}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send SMS notification: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Format email body for company registration notification
   */
  private formatEmailBody(details: CompanyRegistrationDetails, timestamp: string): string {
    return `
New Company Registration Alert

A new company has registered on DukaRun and requires approval.

Company Details:
- Company Name: ${details.companyName}
- Company Code: ${details.companyCode}
- Store Name: ${details.storeName}

Administrator Details:
- Name: ${details.adminName}
- Phone: ${details.adminPhone}
- Email: ${details.adminEmail || 'Not provided'}

Registration Time: ${timestamp}
Channel ID: ${details.channelId}

Please log in to the admin panel to review and approve this registration.
    `.trim();
  }

  /**
   * Format SMS message for company registration notification
   */
  private formatSmsMessage(details: CompanyRegistrationDetails): string {
    return `DukaRun: New company "${details.companyName}" registered. Admin: ${details.adminName} (${details.adminPhone}). Please review and approve.`;
  }
}
