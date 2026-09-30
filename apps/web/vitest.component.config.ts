import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each spec needs fresh modules so its idb mock owns the cached offline DB.
    // Angular's shared-module default otherwise makes full-suite runs order-dependent.
    isolate: true,
  },
});
