import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { SmsProviderFactory } from '../../infrastructure/sms/sms-provider.factory';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { SmsUsageService } from '../../services/sms/sms-usage.service';

/**
 * Communication Plugin
 *
 * Provides the single entry point for all delivery (SMS, email). CommunicationService
 * applies one dev gate (log payload first, optionally skip send) and delegates to
 * SmsService / EventBus. Channel-scoped SMS is subject to per-tier limits via SmsUsageService.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [SmsProviderFactory, SmsService, SmsUsageService, CommunicationService],
  exports: [CommunicationService, SmsService, SmsUsageService],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class CommunicationPlugin {}
