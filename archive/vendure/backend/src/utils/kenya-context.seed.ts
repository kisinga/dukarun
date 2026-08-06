import { INestApplicationContext } from '@nestjs/common';
import { CurrencyCode } from '@vendure/common/lib/generated-types';
import {
  Channel,
  ChannelService,
  CountryService,
  InitialData,
  LanguageCode,
  Logger,
  Populator,
  RequestContext,
  RequestContextService,
  Zone,
  ZoneService,
} from '@vendure/core';

const LOGGER_CTX = 'KenyaSeed';
const DEFAULT_KENYAN_ZONE_NAME = 'Kenya';
const DEFAULT_TAX_CATEGORY_NAME = 'Kenya VAT';
const DEFAULT_TAX_PERCENTAGE = 16;
const DEFAULT_CURRENCY_CODE = CurrencyCode.KES;

/**
 * Seeds the minimal Kenya context (country, zone, tax rate, and channel defaults)
 * using Vendure services rather than raw SQL.
 *
 * This mirrors Vendure's populate helper so we stay aligned with upstream schema changes.
 */
export async function ensureKenyaContext(app: INestApplicationContext): Promise<void> {
  if (process.env.AUTO_SEED_KENYA === 'false') {
    Logger.info('AUTO_SEED_KENYA=false detected. Skipping Kenya context seed.', LOGGER_CTX);
    return;
  }

  const requestContextService = app.get(RequestContextService);
  const channelService = app.get(ChannelService);
  const countryService = app.get(CountryService);
  const zoneService = app.get(ZoneService);
  const populator = app.get(Populator);

  const defaultChannel = await channelService.getDefaultChannel();
  const adminCtx = await buildAdminContext(requestContextService, defaultChannel);

  let kenyaCountry = await safeFindKenyaCountry(adminCtx, countryService);
  let kenyaZone = await safeFindKenyaZone(adminCtx, zoneService);

  if (!kenyaCountry || !kenyaZone) {
    Logger.info('Kenya context incomplete – running populator seed...', LOGGER_CTX);
    await seedKenyaDefaults(populator, defaultChannel);
    kenyaCountry = await safeFindKenyaCountry(adminCtx, countryService);
    kenyaZone = await safeFindKenyaZone(adminCtx, zoneService);
  }

  if (!kenyaCountry || !kenyaZone) {
    Logger.error(
      'Unable to ensure Kenya country/zone even after seeding. Please inspect the database state.',
      LOGGER_CTX
    );
    return;
  }

  await ensureZoneMember(adminCtx, zoneService, kenyaZone, kenyaCountry);
  await ensureChannelsHaveZones(adminCtx, channelService, kenyaZone);
  await ensureDefaultChannelCurrency(channelService, defaultChannel);

  Logger.info('Kenya regional defaults verified.', LOGGER_CTX);
}

async function buildAdminContext(
  requestContextService: RequestContextService,
  channel: Channel
): Promise<RequestContext> {
  return requestContextService.create({
    apiType: 'admin',
    languageCode: LanguageCode.en,
    channelOrToken: channel,
  });
}

async function safeFindKenyaCountry(ctx: RequestContext, service: CountryService) {
  try {
    return await service.findOneByCode(ctx, 'KE');
  } catch {
    return undefined;
  }
}

async function safeFindKenyaZone(
  ctx: RequestContext,
  zoneService: ZoneService
): Promise<Zone | undefined> {
  const zones = await zoneService.findAll(ctx);
  return zones.items.find(z => z.name === DEFAULT_KENYAN_ZONE_NAME);
}

async function seedKenyaDefaults(populator: Populator, defaultChannel: Channel): Promise<void> {
  const initialData: InitialData = {
    defaultLanguage: LanguageCode.en,
    defaultZone: DEFAULT_KENYAN_ZONE_NAME,
    countries: [
      {
        name: 'Kenya',
        code: 'KE',
        zone: DEFAULT_KENYAN_ZONE_NAME,
      },
    ],
    taxRates: [
      {
        name: DEFAULT_TAX_CATEGORY_NAME,
        percentage: DEFAULT_TAX_PERCENTAGE,
      },
    ],
    shippingMethods: [],
    paymentMethods: [],
    collections: [],
    roles: [],
  };

  await populator.populateInitialData(initialData, defaultChannel);
}

async function ensureZoneMember(
  ctx: RequestContext,
  zoneService: ZoneService,
  kenyaZone: Zone,
  kenyaCountry: any
): Promise<void> {
  if (kenyaZone.members?.some(member => member.id === kenyaCountry.id)) {
    return;
  }

  await zoneService.addMembersToZone(ctx, {
    zoneId: kenyaZone.id,
    memberIds: [kenyaCountry.id],
  });
  Logger.info('Added Kenya as a member of the Kenya zone.', LOGGER_CTX);
}

async function ensureChannelsHaveZones(
  ctx: RequestContext,
  channelService: ChannelService,
  kenyaZone: Zone
): Promise<void> {
  const pageSize = 100;
  let skip = 0;

  while (true) {
    const { items, totalItems } = await channelService.findAll(ctx, {
      take: pageSize,
      skip,
    });

    for (const channel of items) {
      const needsShipping = !channel.defaultShippingZone;
      const needsTax = !channel.defaultTaxZone;

      if (needsShipping || needsTax) {
        await channelService.update(ctx, {
          id: channel.id,
          ...(needsShipping ? { defaultShippingZoneId: kenyaZone.id } : {}),
          ...(needsTax ? { defaultTaxZoneId: kenyaZone.id } : {}),
        });
        Logger.info(
          `Backfilled missing zone configuration for channel ${channel.code}`,
          LOGGER_CTX
        );
      }
    }

    if (skip + items.length >= totalItems) {
      break;
    }
    skip += items.length;
  }
}

async function ensureDefaultChannelCurrency(
  channelService: ChannelService,
  defaultChannel: Channel
) {
  if (defaultChannel.defaultCurrencyCode === DEFAULT_CURRENCY_CODE) {
    return;
  }

  await channelService.update(RequestContext.empty(), {
    id: defaultChannel.id,
    defaultCurrencyCode: DEFAULT_CURRENCY_CODE,
  });
  Logger.info('Updated default channel currency to KES.', LOGGER_CTX);
}
