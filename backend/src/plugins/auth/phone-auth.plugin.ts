import { NativeAuthenticationStrategy, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditCorePlugin } from '../audit/audit-core.plugin';
import { CommunicationPlugin } from '../communication/communication.plugin';
import { RegistrationStorageService } from '../../infrastructure/storage/registration-storage.service';
import { ChannelAccessGuardService } from '../../services/auth/channel-access-guard.service';
import { OtpService } from '../../services/auth/otp.service';
import { PhoneAuthService } from '../../services/auth/phone-auth.service';
import { RegistrationService } from '../../services/auth/registration.service';
import { OtpTokenAuthStrategy } from './otp-token-auth.strategy';
import {
  PhoneAuthAdminResolver,
  PhoneAuthCommonResolver,
  phoneAuthAdminSchema,
  phoneAuthShopSchema,
} from './phone-auth.resolvers';
// Registration Provisioning Services
import { AccessProvisionerService } from '../../services/auth/provisioning/access-provisioner.service';
import { ChannelAssignmentService } from '../../services/auth/provisioning/channel-assignment.service';
import { ChannelProvisionerService } from '../../services/auth/provisioning/channel-provisioner.service';
import { PaymentProvisionerService } from '../../services/auth/provisioning/payment-provisioner.service';
import { RegistrationAuditorService } from '../../services/auth/provisioning/registration-auditor.service';
import { RegistrationErrorService } from '../../services/auth/provisioning/registration-error.service';
import { RegistrationValidatorService } from '../../services/auth/provisioning/registration-validator.service';
import { RoleProvisionerService } from '../../services/auth/provisioning/role-provisioner.service';
import { SellerProvisionerService } from '../../services/auth/provisioning/seller-provisioner.service';
import { StoreProvisionerService } from '../../services/auth/provisioning/store-provisioner.service';
import { ChartOfAccountsService } from '../../services/financial/chart-of-accounts.service';
import { ProvisioningContextAdapter } from '../../services/provisioning/context-adapter.service';

@VendurePlugin({
  imports: [PluginCommonModule, AuditCorePlugin, CommunicationPlugin],
  providers: [
    // Registration Infrastructure
    RegistrationService,
    RegistrationStorageService,
    // Provisioning Context Adapter (shared utility for context management)
    ProvisioningContextAdapter,
    // Registration Provisioning Services (composable)
    RegistrationValidatorService,
    RegistrationErrorService,
    RegistrationAuditorService,
    SellerProvisionerService,
    ChannelAssignmentService,
    ChannelProvisionerService,
    StoreProvisionerService,
    PaymentProvisionerService,
    RoleProvisionerService,
    AccessProvisionerService,
    ChartOfAccountsService,
    // Phone Auth Infrastructure
    PhoneAuthCommonResolver,
    // Note: PhoneAuthAdminResolver is NOT in providers - only in adminApiExtensions.resolvers
    // to prevent NestJS from discovering its mutations globally (shop API doesn't have updateAdminProfile)
    PhoneAuthService,
    ChannelAccessGuardService,
    OtpService,
    // Note: Authentication strategies are configured via config.authOptions.adminAuthenticationStrategy
    // in the configuration() hook below, not via DI providers, to keep the source of truth in one place.
  ],
  exports: [OtpService], // Export OtpService for use by other plugins (e.g., RedisCacheService)
  configuration: (config: any) => {
    const existingStrategies = config.authOptions.adminAuthenticationStrategy ?? [];

    const hasOtp = existingStrategies.some(
      (strategy: any) => strategy instanceof OtpTokenAuthStrategy
    );
    const hasNative = existingStrategies.some(
      (strategy: any) => strategy instanceof NativeAuthenticationStrategy
    );

    const strategies: any[] = [];

    // Create a single NativeAuthenticationStrategy instance that will be shared
    // between OtpTokenAuthStrategy (for delegation) and the strategy array (for direct use)
    const nativeStrategy = hasNative
      ? existingStrategies.find((strategy: any) => strategy instanceof NativeAuthenticationStrategy)
      : new NativeAuthenticationStrategy();

    // OtpTokenAuthStrategy wraps native auth and logs both OTP and non-OTP admin logins.
    // It must appear before the plain NativeAuthenticationStrategy so it can inspect the
    // password and delegate appropriately.
    // Pass the native strategy instance to the OTP wrapper so it can delegate non-OTP logins.
    if (!hasOtp) {
      strategies.push(new OtpTokenAuthStrategy(undefined, nativeStrategy));
    }

    // Add the native strategy to the array if it doesn't already exist
    if (!hasNative) {
      strategies.push(nativeStrategy);
    }

    config.authOptions.adminAuthenticationStrategy = [...strategies, ...existingStrategies];

    return config;
  },
  adminApiExtensions: {
    resolvers: [PhoneAuthCommonResolver, PhoneAuthAdminResolver],
    schema: phoneAuthAdminSchema,
  },
  shopApiExtensions: {
    resolvers: [PhoneAuthCommonResolver],
    schema: phoneAuthShopSchema,
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class PhoneAuthPlugin {}
