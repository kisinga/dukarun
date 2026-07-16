// Shared barrel — @dukarun/shared
//
// Re-exports app-wide utilities, models, constants, pipes, icons, and
// infrastructure services that are safe for domains, pages, and shell to use.
// Deliberately does NOT export Angular components or testing utilities; those
// stay deep-imported to avoid accidental eager-loading of UI code.

// GraphQL
export { graphql } from './graphql/generated';
export * from './graphql/fractional-quantity.graphql';
export * from './graphql/notification.types';

// Models
export * from './models/company.model';
export * from './models/stats.model';
export * from './models/user.model';

// Constants
export * from './constants/brand.constants';
export * from './constants/expense-categories';

// Icons
export * from './icons/app-icons';

// Pipes
export * from './pipes/money.pipe';

// Services (infrastructure)
export * from './services/apollo-test-client.token';
export * from './services/apollo.service';
export * from './services/app-context.tokens';
export * from './services/background-state.service';
export * from './services/barcode-scanner.service';
export * from './services/camera.service';
export * from './services/contact-picker.service';
export * from './services/currency.service';
export * from './services/deep-link.service';
export * from './services/print-preferences.service';
export * from './services/print.service';
export * from './services/public-pricing.service';
export * from './services/registration.service';
export * from './services/sales-sync-guard.service';
export * from './services/scanner-beep.service';
export * from './services/seo.service';
export * from './services/toast.service';
export * from './services/tracing.service';
export * from './services/cache/app-cache.service';
export * from './services/cache/cache-primitives';
export * from './services/cache/cache-sync-handler.interface';
export * from './services/cache/cache-sync.service';
export * from './services/cache/storage-adapter.interface';
export * from './services/draft/draft-base.service';
export * from './services/link-preview/link-preview-data-provider.token';
export * from './services/link-preview/link-preview-payload.service';
export * from './services/link-preview/link-preview-registry.service';
export * from './services/link-preview/link-preview.types';
export * from './services/ml-model/embedder.service';
export * from './services/ml-model/embedding-match';
export * from './services/ml-model/frame-roi';
export { calculateProductStats, isLowStock, LOW_STOCK_THRESHOLD } from './services/stats/product-stats.util';

// Utils
export * from './utils/beep.utils';
export * from './utils/customer-merge.utils';
export * from './utils/data-extractors';
export * from './utils/date.util';
export * from './utils/deep-link.util';
export * from './utils/email-filter.utils';
export * from './utils/email.utils';
export * from './utils/expiry-days.util';
export * from './utils/phone.utils';
export * from './utils/period.utils';
