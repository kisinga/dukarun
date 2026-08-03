import { Logger } from '@nestjs/common';
import { ChannelService, RequestContext, ScheduledTask } from '@vendure/core';
import { NotificationSchedulingService } from '../services/notifications/notification-scheduling.service';

const logger = new Logger('WhatsAppFlushTask');

/**
 * Morning flush of deferred WhatsApp messages.
 *
 * Runs at 08:00 EAT (05:00 UTC) so system-generated messages generated
 * outside the 08:00–19:00 EAT window are delivered at a civilised hour.
 */
export const whatsappFlushTask = new ScheduledTask({
  id: 'whatsapp-flush',
  description: 'Flush deferred WhatsApp messages at the start of the send window',
  schedule: '0 5 * * *',
  execute: async ({ injector }) => {
    logger.log('Starting WhatsApp deferred-message flush');

    const channelService = injector.get(ChannelService);
    const notificationSchedulingService = injector.get(NotificationSchedulingService);

    const emptyCtx = RequestContext.empty();
    const channels = await channelService.findAll(emptyCtx);

    for (const channel of channels.items) {
      const ctx = new RequestContext({
        channel,
        apiType: 'admin',
        isAuthorized: true,
        authorizedAsOwnerOnly: false,
      });

      try {
        const result = await notificationSchedulingService.flushPendingWhatsApp(ctx);
        logger.log(
          `WhatsApp flush completed for channel ${channel.id}: sent=${result.sent}, failed=${result.failed}`
        );
      } catch (error) {
        logger.error(
          `WhatsApp flush failed for channel ${channel.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    logger.log('WhatsApp deferred-message flush finished');
  },
});
