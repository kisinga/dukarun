# Plugin Development Guide

This guide covers best practices for developing custom Vendure plugins in the Dukarun codebase.

## Table of Contents

- [Plugin Compatibility Ranges](#plugin-compatibility-ranges)
- [Creating a New Plugin](#creating-a-new-plugin)
- [Plugin Checklist](#plugin-checklist)
- [Common Patterns](#common-patterns)

## Plugin Compatibility Ranges

### Why Compatibility Ranges Matter

Vendure requires all plugins to declare a compatibility range to ensure they work correctly with the installed Vendure version. Without this declaration, Vendure will log warnings at startup:

```
[Vendure Server] The plugin "YourPlugin" does not specify a compatibility range,
so it is not guaranteed to be compatible with this version of Vendure.
```

### How to Add Compatibility Range

All plugins **must** include a `compatibility` property in the `@VendurePlugin` decorator. Use the centralized constant from `constants/vendure-version.constants.ts`:

```typescript
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';

@VendurePlugin({
  // ... plugin configuration
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class YourPlugin {}
```

### Centralized Version Management

The Vendure compatibility version is centrally managed in:

- **File**: `backend/src/constants/vendure-version.constants.ts`
- **Constant**: `VENDURE_COMPATIBILITY_VERSION`
- **Current Value**: `^3.4.0` (compatible with Vendure 3.4.0 and above, but below 4.0.0)

**Important**: When upgrading Vendure, update the constant in this file rather than individual plugins. This ensures all plugins use the same compatibility range.

### Version Range Format

The version range follows semantic versioning (semver) format:

- `^3.4.0` - Compatible with 3.4.0 and above, but below 4.0.0 (allows patch and minor updates)
- `~3.4.0` - Compatible with 3.4.0 and above, but below 3.5.0 (allows only patch updates)
- `3.4.3` - Exact version match only

For most cases, use `^major.minor.0` to allow patch updates while maintaining compatibility.

### Plugin-Specific Versions

If a plugin requires a different compatibility range (e.g., it uses features from a newer Vendure version), you can override the constant:

```typescript
export class AdvancedPlugin {
  static defineCompatibility() {
    return '^3.5.0'; // Requires newer features
  }
}
```

However, this should be rare. Most plugins should use the centralized constant.

## Creating a New Plugin

### Step 1: Generate Plugin Structure

Use the Vendure CLI to create a new plugin:

```bash
npx vendure add
```

Select `[Plugin] Create a new Vendure plugin` and follow the prompts.

### Step 2: Add Compatibility Range

Immediately after creating the plugin, add the compatibility range:

```typescript
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';

@VendurePlugin({
  imports: [PluginCommonModule],
  // ... your plugin configuration
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class YourNewPlugin {}
```

### Step 3: Register in vendure-config.ts

Add your plugin to the `plugins` array in `backend/src/vendure-config.ts`:

```typescript
import { YourNewPlugin } from './plugins/your-plugin/your-plugin.plugin';

export const config: VendureConfig = {
  // ...
  plugins: [
    // ... other plugins
    YourNewPlugin,
  ],
};
```

## Plugin Checklist

Use this checklist when creating or updating a plugin:

### Required Elements

- [ ] Plugin class decorated with `@VendurePlugin()`
- [ ] `compatibility` property in the `@VendurePlugin` decorator set to `VENDURE_COMPATIBILITY_VERSION`
- [ ] Import statement for `VENDURE_COMPATIBILITY_VERSION` from constants
- [ ] Plugin registered in `vendure-config.ts`
- [ ] Plugin imports `PluginCommonModule` (unless it's a core infrastructure plugin)

### Recommended Elements

- [ ] JSDoc comment describing the plugin's purpose
- [ ] Proper TypeScript types for all providers and resolvers
- [ ] Error handling for plugin-specific operations
- [ ] Unit tests for plugin functionality
- [ ] Documentation in plugin file or separate README

### When Upgrading Vendure

- [ ] Update `VENDURE_COMPATIBILITY_VERSION` in `constants/vendure-version.constants.ts`
- [ ] Test all plugins after upgrade
- [ ] Update plugin-specific compatibility ranges if needed (rare)
- [ ] Review Vendure changelog for breaking changes

## Common Patterns

### Basic Plugin Structure

```typescript
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { YourService } from '../../services/your-service';
import { YourResolver } from './your.resolver';

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [YourService, YourResolver],
  adminApiExtensions: {
    schema: yourSchema,
    resolvers: [YourResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class YourPlugin {}
```

### Plugin with Entities

```typescript
@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [YourEntity],
  providers: [YourService],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class YourPlugin {}
```

### Plugin with Configuration

```typescript
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [YourService],
  configuration: config => {
    // Modify Vendure config
    config.customOptions = {
      /* ... */
    };
    return config;
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class YourPlugin {}
```

## Troubleshooting

### Warning: Plugin does not specify a compatibility range

**Solution**: Add the `compatibility` property to your `@VendurePlugin` decorator:

```typescript
@VendurePlugin({
  // ... other configuration
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class YourPlugin {}
```

### Plugin not loading

**Check**:

1. Plugin is registered in `vendure-config.ts`
2. All imports are correct
3. No circular dependencies
4. All required dependencies are installed

### Compatibility range mismatch

**Solution**: Update `VENDURE_COMPATIBILITY_VERSION` in `constants/vendure-version.constants.ts` to match your Vendure version, or use a plugin-specific range if the plugin requires different features.

## References

- [Vendure Plugin Documentation](https://www.vendure.io/docs/plugins/)
- [Vendure Plugin API Reference](https://www.vendure.io/docs/typescript-api/plugins/vendure-plugin/)
- [Semantic Versioning](https://semver.org/)
