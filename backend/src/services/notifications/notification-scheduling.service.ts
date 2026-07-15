import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { getNextWhatsAppFlushTime, isWithinWhatsAppWindow } from './whatsapp-quiet-hours.util';
import { PendingNotificationService } from './pending-notification.service';

export interface WhatsAppSendRequest {
  channelId: string | undefined;
  triggerKey: string;
  recipient: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Centralizes scheduling decisions for system-generated WhatsApp messages.
 *
 * - Messages generated outside 08:00–19:00 EAT are persisted and flushed the
 *   next morning.
 * - Messages generated inside the window are sent immediately.
 */
@Injectable()
export class NotificationSchedulingService {
  private readonly logger = new Logger(NotificationSchedulingService.name);

  constructor(
    private readonly pendingNotificationService: PendingNotificationService,
    private readonly communicationService: CommunicationService
  ) {}

  /**
   * Send a system-generated WhatsApp message now if we are inside the allowed
   * window; otherwise queue it for the next flush.
   */
  async deferOrSendWhatsApp(ctx: RequestContext, request: WhatsAppSendRequest): Promise<void> {
    const now = new Date();
    if (isWithinWhatsAppWindow(now)) {
      await this.sendWhatsAppNow(ctx, request);
      return;
    }

    const scheduledAt = getNextWhatsAppFlushTime(now);
    await this.pendingNotificationService.create(ctx, {
      channelId: request.channelId ?? '',
      triggerKey: request.triggerKey,
      recipient: request.recipient,
      body: request.body,
      metadata: request.metadata ?? {},
      scheduledAt,
    });

    this.logger.log(
      `Deferred WhatsApp ${request.triggerKey} to ${scheduledAt.toISOString()} for ${request.recipient}`
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
        await this.pendingNotificationService.markError(
          ctx,
          pending.id,
          result.error ?? 'unknown error'
        );
        failed++;
        this.logger.warn(
          `Failed to flush pending WhatsApp ${pending.triggerKey} to ${pending.recipient}: ${result.error}`
        );
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
