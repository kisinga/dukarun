import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { EnvironmentConfig } from '../../infrastructure/config/environment.config';

/**
 * Environment Configuration Plugin
 *
 * Registers the EnvironmentConfig service to make it available
 * throughout the application via Dependency Injection.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [EnvironmentConfig],
  exports: [EnvironmentConfig],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class EnvironmentPlugin {}
