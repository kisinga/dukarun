/**
 * Vendure Version Compatibility Constant
 *
 * This constant defines the Vendure version compatibility range for all custom plugins.
 * Update this value when upgrading Vendure to ensure all plugins declare the correct
 * compatibility range.
 *
 * The version range follows semantic versioning (semver) format:
 * - ^3.4.0 means compatible with 3.4.0 and above, but below 4.0.0
 * - Use ^major.minor.0 to allow patch updates
 *
 * Current Vendure version: 3.4.3
 */
export const VENDURE_COMPATIBILITY_VERSION = '^3.4.0';
