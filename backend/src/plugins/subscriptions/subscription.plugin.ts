import { APP_GUARD } from '@nestjs/core';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditCorePlugin } from '../audit/audit-core.plugin';
import { RedisCacheService } from '../../infrastructure/storage/redis-cache.service';
import { SubscriptionResolver, SUBSCRIPTION_SCHEMA } from './subscription.resolver';
import {
  SubscriptionPublicResolver,
  SUBSCRIPTION_PUBLIC_SCHEMA,
} from './subscription-public.resolver';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import { PaystackService } from '../../services/payments/paystack.service';
import { SubscriptionWebhookController } from './subscription-webhook.controller';
import { SubscriptionTier } from './subscription.entity';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionExpirySubscriber } from './subscription-expiry.subscriber';
import { ChannelEventsPlugin } from '../channels/channel-events.plugin';
import { PhoneAuthPlugin } from '../auth/phone-auth.plugin';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * Subscription Plugin
 *
 * Provides subscription management with Paystack integration:
 * - Trial period management (30 days)
 * - Subscription tier definitions
 * - Paystack STK push payment integration
 * - Webhook handling for payment events
 * - Read-only mode enforcement for expired subscriptions
 */
@VendurePlugin({
  imports: [PluginCommonModule, ChannelEventsPlugin, PhoneAuthPlugin, AuditCorePlugin],
  entities: [SubscriptionTier],
  providers: [
    // Worker context service (required for background tasks)
    WorkerContextService,
    // SubscriptionResolver is only in adminApiExtensions.resolvers so it is not discovered for shop API
    SubscriptionService,
    PaystackService,
    RedisCacheService,
    SubscriptionGuard,
    SubscriptionExpirySubscriber,
    // Apply SubscriptionGuard globally to all admin API mutations
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
  ],
  exports: [
    SubscriptionService, // Export for use by ChannelEventRouterService
  ],
  controllers: [SubscriptionWebhookController],
  adminApiExtensions: {
    schema: SUBSCRIPTION_SCHEMA,
    resolvers: [SubscriptionResolver],
  },
  shopApiExtensions: {
    schema: SUBSCRIPTION_PUBLIC_SCHEMA,
    resolvers: [SubscriptionPublicResolver],
  },
  configuration: config => {
    // SubscriptionGuard is applied globally via APP_GUARD provider above
    // It checks all mutations and blocks expired subscriptions from performing actions
    return config;
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class SubscriptionPlugin {}
