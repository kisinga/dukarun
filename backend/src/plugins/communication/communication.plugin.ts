import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { SmsProviderFactory } from '../../infrastructure/sms/sms-provider.factory';
import { SmsService } from '../../infrastructure/sms/sms.service';

/**
 * Communication Plugin
 *
 * Provides the single entry point for all delivery (SMS, email). CommunicationService
 * applies one dev gate (log payload first, optionally skip send) and delegates to
 * SmsService / EventBus. Other plugins (PhoneAuth, Notification, ChannelSettings)
 * depend on this plugin for CommunicationService.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [SmsProviderFactory, SmsService, CommunicationService],
  exports: [CommunicationService, SmsService],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class CommunicationPlugin {}
