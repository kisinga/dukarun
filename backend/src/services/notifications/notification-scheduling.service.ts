import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { NotificationCalendarService } from './notification-calendar.service';
import { PendingNotificationService } from './pending-notification.service';

export interface WhatsAppSendRequest {
  channelId: string | undefined;
  triggerKey: string;
  recipient: string;
  body: string;
  metadata?: Record<string, unknown>;
}

const MAX_WHATSAPP_ATTEMPTS = 3;

/**
 * Centralizes scheduling decisions for system-generated WhatsApp messages.
 *
 * - Messages generated outside 08:00–19:00 EAT are persisted and flushed the
 *   next morning.
 * - Messages generated inside the window are sent immediately.
 * - Persistent failures are dropped after MAX_WHATSAPP_ATTEMPTS attempts.
 *
 * Calendar rules live in NotificationCalendarService; this class handles
 * persistence, retry policy, and delivery orchestration.
 */
@Injectable()
export class NotificationSchedulingService {
  private readonly logger = new Logger(NotificationSchedulingService.name);

  constructor(
    private readonly pendingNotificationService: PendingNotificationService,
    private readonly communicationService: CommunicationService,
    private readonly notificationCalendarService: NotificationCalendarService
  ) {}

  /**
   * Send a system-generated WhatsApp message now if we are inside the allowed
   * window; otherwise queue it for the next flush.
   */
  async deferOrSendWhatsApp(ctx: RequestContext, request: WhatsAppSendRequest): Promise<void> {
    const now = new Date();
    if (this.notificationCalendarService.isWhatsAppWindowOpen(now)) {
      await this.sendWhatsAppNow(ctx, request);
      return;
    }

    const scheduledAt = this.notificationCalendarService.nextWhatsAppFlushTime(now);
    await this.pendingNotificationService.create(ctx, {
      channelId: request.channelId ?? '',
      triggerKey: request.triggerKey,
      recipient: request.recipient,
      body: request.body,
      metadata: request.metadata ?? {},
      scheduledAt,
    });

    this.logger.log(
      `Deferred WhatsApp ${request.triggerKey} to ${scheduledAt.toISOString()} for ${request.recipient} (${this.notificationCalendarService.whatsAppWindowDescription(now)})`
    );
  }

  /**
   * Flush all pending WhatsApp messages whose scheduled time has arrived.
   * Called by the morning scheduled task.
   */
  async flushPendingWhatsApp(ctx: RequestContext): Promise<{ sent: number; failed: number }> {
    const due = await this.pendingNotificationService.findDue(ctx);
    let sent = 0;
    let failed = 0;

    for (const pending of due) {
      const attemptsAfterThis = pending.attempts + 1;
      await this.pendingNotificationService.incrementAttempts(ctx, pending.id);
      const result = await this.communicationService.send({
        channel: 'whatsapp',
        recipient: pending.recipient,
        body: pending.body,
        ctx,
        channelId: pending.channelId || undefined,
        metadata: { ...(pending.metadata ?? {}), purpose: 'account_notification' },
      });

      if (result.success) {
        await this.pendingNotificationService.markSent(ctx, pending.id);
        sent++;
      } else {
        failed++;
        if (attemptsAfterThis >= MAX_WHATSAPP_ATTEMPTS) {
          await this.pendingNotificationService.delete(ctx, pending.id);
          this.logger.warn(
            `Giving up on pending WhatsApp ${pending.triggerKey} to ${pending.recipient} after ${MAX_WHATSAPP_ATTEMPTS} attempts: ${result.error}`
          );
        } else {
          await this.pendingNotificationService.markError(
            ctx,
            pending.id,
            result.error ?? 'unknown error'
          );
          this.logger.warn(
            `Failed to flush pending WhatsApp ${pending.triggerKey} to ${pending.recipient}: ${result.error}`
          );
        }
      }
    }

    await this.pendingNotificationService.deleteOldSent(ctx);
    return { sent, failed };
  }

  private async sendWhatsAppNow(ctx: RequestContext, request: WhatsAppSendRequest): Promise<void> {
    const result = await this.communicationService.send({
      channel: 'whatsapp',
      recipient: request.recipient,
      body: request.body,
      ctx,
      channelId: request.channelId,
      metadata: { ...(request.metadata ?? {}), purpose: 'account_notification' },
    });

    if (!result.success) {
      this.logger.warn(
        `WhatsApp ${request.triggerKey} to ${request.recipient} failed: ${result.error}`
      );
    }
  }
}
