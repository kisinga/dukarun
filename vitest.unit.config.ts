import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Unlike type-only imports, the shared pack helpers need runtime resolution.
  resolve: {
    alias: {
      '@dukarun/pack-types': new URL('./packages/shared-types/pack.types.ts', import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: [
      'apps/web/src/**/*.unit.spec.ts',
      'apps/site/src/**/*.unit.spec.ts',
      'apps/storefront/src/**/*.unit.spec.ts',
      'apps/super-admin/src/**/*.unit.spec.ts',
    ],
  },
});
