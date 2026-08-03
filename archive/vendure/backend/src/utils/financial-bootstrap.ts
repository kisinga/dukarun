import { INestApplicationContext } from '@nestjs/common';
import { ChannelService, Logger, RequestContextService } from '@vendure/core';
import { ChartOfAccountsService } from '../services/financial/chart-of-accounts.service';

const LOGGER_CTX = 'FinancialBootstrap';

export async function ensureChannelFinancialDefaults(app: INestApplicationContext): Promise<void> {
  const chartService = app.get(ChartOfAccountsService);
  const channelService = app.get(ChannelService);
  const requestContextService = app.get(RequestContextService);

  const defaultChannel = await channelService.getDefaultChannel();
  const adminCtx = await requestContextService.create({
    apiType: 'admin',
    languageCode: defaultChannel.defaultLanguageCode,
    channelOrToken: defaultChannel,
  });

  const pageSize = 100;
  let skip = 0;

  let processed = 0;

  while (true) {
    const { items, totalItems } = await channelService.findAll(adminCtx, {
      take: pageSize,
      skip,
    });

    for (const channel of items) {
      await chartService.initializeForChannel(adminCtx, Number(channel.id));
    }
    processed += items.length;

    if (skip + items.length >= totalItems) {
      break;
    }
    skip += items.length;
  }

  Logger.info(
    `Chart of accounts verified for ${processed} channel${processed === 1 ? '' : 's'}.`,
    LOGGER_CTX
  );
}
