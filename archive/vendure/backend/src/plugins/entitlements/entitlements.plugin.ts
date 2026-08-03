import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { EntitlementService } from '../../services/entitlements/entitlement.service';

/**
 * Entitlements Plugin
 *
 * Provides EntitlementService as a shared dependency for subscription-tier limit
 * checks across communication, channel, and subscription plugins without creating
 * circular module dependencies.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [EntitlementService],
  exports: [EntitlementService],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class EntitlementsPlugin {}
