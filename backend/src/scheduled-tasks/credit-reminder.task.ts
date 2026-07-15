import { Logger } from '@nestjs/common';
import { ChannelService, RequestContext, ScheduledTask } from '@vendure/core';
import { CreditNotificationService } from '../services/credit/credit-notification.service';

const logger = new Logger('CreditReminderTask');

/**
 * Daily credit-reminder scan.
 *
 * Runs at 09:00 EAT (06:00 UTC). Iterates over all channels and sends
 * period-elapsed / limit-reached reminders for customers with outstanding AR.
 */
export const creditReminderTask = new ScheduledTask({
  id: 'credit-reminder',
  description: 'Send credit period/limit reminders and freeze overdue accounts',
  schedule: '0 6 * * *',
  execute: async ({ injector }) => {
    logger.log('Starting daily credit reminder scan');

    const channelService = injector.get(ChannelService);
    const creditNotificationService = injector.get(CreditNotificationService);

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
        const result = await creditNotificationService.runDailyScan(ctx);
        logger.log(
          `Credit reminder scan completed for channel ${channel.id}: ${JSON.stringify(result)}`
        );
      } catch (error) {
        logger.error(
          `Credit reminder scan failed for channel ${channel.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    logger.log('Daily credit reminder scan finished');
  },
});
