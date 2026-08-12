import { defineConfig } from 'vitest/config';

export default defineConfig({
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
