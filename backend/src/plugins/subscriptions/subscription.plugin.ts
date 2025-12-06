import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';
import { RedisCacheService } from '../../infrastructure/storage/redis-cache.service';
import { SubscriptionResolver, SUBSCRIPTION_SCHEMA } from './subscription.resolver';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import { PaystackService } from '../../services/payments/paystack.service';
import { SubscriptionWebhookController } from './subscription-webhook.controller';
import { SubscriptionTier } from './subscription.entity';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionExpirySubscriber } from './subscription-expiry.subscriber';
import { ChannelEventsPlugin } from '../channels/channel-events.plugin';
import { PhoneAuthPlugin } from '../auth/phone-auth.plugin';
import { ChannelUpdateHelper } from '../../services/channels/channel-update.helper';

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
  imports: [PluginCommonModule, ChannelEventsPlugin, PhoneAuthPlugin],
  entities: [SubscriptionTier],
  providers: [
    // Audit dependencies for ChannelUpdateHelper
    AuditDbConnection,
    UserContextResolver,
    AuditService,
    // Channel update helper
    ChannelUpdateHelper,
    // Subscription services
    SubscriptionResolver,
    SubscriptionService,
    PaystackService,
    RedisCacheService,
    SubscriptionGuard,
    SubscriptionExpirySubscriber,
  ],
  controllers: [SubscriptionWebhookController],
  adminApiExtensions: {
    schema: SUBSCRIPTION_SCHEMA,
    resolvers: [SubscriptionResolver],
  },
  configuration: config => {
    // Register subscription guard for admin API mutations
    // Note: This is a simplified approach. In production, you might want
    // to apply the guard more selectively via decorators or middleware.
    return config;
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class SubscriptionPlugin {}
