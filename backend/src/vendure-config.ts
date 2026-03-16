import { AdminUiPlugin } from '@vendure/admin-ui-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import {
  configureDefaultOrderProcess,
  DefaultJobQueuePlugin,
  DefaultSchedulerPlugin,
  DefaultSearchPlugin,
  manualFulfillmentHandler,
  VendureConfig,
} from '@vendure/core';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { otpEmailHandler } from './config/email/otp-email-handler';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import { Request, Response } from 'express';
import path from 'path';
import { env } from './infrastructure/config/environment.config';
import { ApprovalPlugin } from './plugins/approval/approval.plugin';
import { AuditCorePlugin } from './plugins/audit/audit-core.plugin';
import { AuditPlugin } from './plugins/audit/audit.plugin';
import { PhoneAuthPlugin } from './plugins/auth/phone-auth.plugin';
import { ChannelEventsPlugin } from './plugins/channels/channel-events.plugin';
import { ChannelSettingsPlugin } from './plugins/channels/channel-settings.plugin';
import { EnvironmentPlugin } from './plugins/core/environment.plugin';
import { CreditPlugin } from './plugins/credit/credit.plugin';
import { CustomerPlugin } from './plugins/customers/customer.plugin';
import {
  ApproveCustomerCreditPermission,
  ManageCustomerCreditLimitPermission,
  ReverseOrderPermission,
} from './plugins/credit/permissions';
import { FractionalQuantityPlugin } from './plugins/inventory/fractional-quantity.plugin';
import { LedgerPlugin } from './plugins/ledger/ledger.plugin';
import { MlModelPlugin } from './plugins/ml/ml-model.plugin';
import { AnalyticsPlugin } from './plugins/analytics/analytics.plugin';
import { SuperAdminPlugin } from './plugins/super-admin/super-admin.plugin';
import { CacheSyncPlugin } from './plugins/cache-sync/cache-sync.plugin';
import { NotificationPlugin } from './plugins/notifications/notification.plugin';
import { OverridePricePermission } from './plugins/pricing/price-override.permission';
import { PriceOverridePlugin } from './plugins/pricing/price-override.plugin';
import { ManageStockAdjustmentsPermission } from './plugins/stock/permissions';
import { StockPlugin } from './plugins/stock/stock.plugin';
import { SubscriptionPlugin } from './plugins/subscriptions/subscription.plugin';
import { cashPaymentHandler, mpesaPaymentHandler } from './services/payments/payment-handlers';
import {
  channelCustomFields,
  customerCustomFields,
  productCustomFields,
  orderCustomFields,
  paymentCustomFields,
  paymentMethodCustomFields,
  orderLineCustomFields,
  productVariantCustomFields,
  userCustomFields,
  administratorCustomFields,
  globalSettingsCustomFields,
} from './config/custom-fields';

// Environment variables are now loaded centrally via EnvironmentConfig
// See: infrastructure/config/environment.config.ts
const IS_PRODUCTION = env.app.nodeEnv === 'production';
const serverPort = env.app.port;
const COOKIE_SECURE = env.app.cookieSecure;

// Configure order process to disable shipping requirements for POS
const customOrderProcess = configureDefaultOrderProcess({
  arrangingPaymentRequiresShipping: false, // Disable shipping requirement for POS
  arrangingPaymentRequiresCustomer: true, // Keep customer requirement
});

// Allowed CORS origins — single source of truth for both shop-api and admin-api.
// Always include localhost dev ports so super-admin works regardless of NODE_ENV.
const CORS_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4201',
  'http://127.0.0.1:4201',
  'http://localhost:4202',
  'http://127.0.0.1:4202',
  ...(env.app.frontendUrl
    ?.split(',')
    .map(u => u.trim())
    .filter(Boolean) || []),
  ...(env.app.superAdminUrl
    ?.split(',')
    .map(u => u.trim())
    .filter(Boolean) || []),
];

export const config: VendureConfig = {
  apiOptions: {
    port: serverPort,
    adminApiPath: 'admin-api',
    shopApiPath: 'shop-api',
    channelTokenKey: 'vendure-token',
    trustProxy: IS_PRODUCTION ? 1 : false,
    cors: {
      origin: (
        requestOrigin: string | undefined,
        callback: (err: Error | null, allow?: boolean | string) => void
      ) => {
        if (!requestOrigin || CORS_ALLOWED_ORIGINS.includes(requestOrigin)) {
          return callback(null, requestOrigin || true);
        }
        callback(null, false);
      },
      credentials: true,
    },
    // Debug modes enabled only in development
    ...(!IS_PRODUCTION
      ? {
          adminApiDebug: true,
          shopApiDebug: true,
        }
      : {}),
    // Custom middleware
    middleware: [
      // Health check endpoint
      {
        handler: (req: Request, res: Response) => {
          res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        },
        route: 'health',
      },
    ],
  },
  assetOptions: {
    permittedFileTypes: [
      // Images
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.svg',
      '.webp',
      'image/*',
      // Documents
      '.pdf',
      'application/pdf',
      // ML Model files
      '.json',
      'application/json',
      '.bin',
      'application/octet-stream',
      '.pb', // TensorFlow
      '.h5', // Keras
      '.onnx', // ONNX
      '.tflite', // TensorFlow Lite
    ],
    uploadMaxFileSize: 52428800, // 50MB for large model files
  },
  authOptions: {
    // Cookie-first: app uses cookie only (EventSource/SSE cannot send headers). Bearer kept for scripts (e.g. deploy-ml-model.js).
    // Vendure applies cookie-session to admin/shop only when cookieOptions.name is an object, so req.session is set and AuthGuard sees the token.
    tokenMethod: ['cookie', 'bearer'],
    superadminCredentials: {
      identifier: env.superadmin.username,
      password: env.superadmin.password,
    },
    cookieOptions: {
      secret: env.app.cookieSecret,
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE, // false for localhost (http); true for production https
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
      name: { shop: 'session', admin: 'session' }, // Required so Vendure mounts cookie-session middleware and populates req.session
    },
    customPermissions: [
      OverridePricePermission,
      ApproveCustomerCreditPermission,
      ManageCustomerCreditLimitPermission,
      ReverseOrderPermission,
      ManageStockAdjustmentsPermission,
    ],
    // OTP token auth strategy will be registered by PhoneAuthPlugin before bootstrap
    // It must be first in the array to be found by getAuthenticationStrategy (which uses find())
  },
  // --- Auth transport (tokenMethod) pros/cons ---
  // Cookie-only: Single path for browser (GraphQL + SSE). No header/cookie sync. EventSource works. Scripts/CLI cannot use admin-api without a cookie jar.
  // Bearer-only: Scripts/CLI/mobile easy. SSE cannot send headers, so cache-sync would need a separate workaround.
  // Cookie + bearer (current): App uses cookie; scripts (e.g. deploy-ml-model.js) keep using Bearer. Cookie-first order so browser requests use session cookie when present.
  dbConnectionOptions: {
    type: 'postgres',
    synchronize: false, // Never use in production
    migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
    migrationsRun: true, // Auto-run pending migrations on startup
    logging: false,
    database: env.db.name,
    schema: env.db.schema,
    host: env.db.host,
    port: env.db.port,
    username: env.db.username,
    password: env.db.password,
  },
  paymentOptions: {
    paymentMethodHandlers: [
      cashPaymentHandler,
      mpesaPaymentHandler,
      // Credit handler is now created via factory with DI.
      // It will be replaced at runtime in the CreditPlugin configuration hook.
      // A temporary placeholder is registered here to satisfy the type system;
      // the real handler will be supplied once the DI container is available.
    ],
  },
  // Custom field definitions extracted to config/custom-fields/ for maintainability.
  // ML Model Management: Tag-based versioning + custom field activation
  // - Assets tagged: ml-model, channel-{id}, v{version}, trained-{date}
  // - Active model: Asset IDs in Channel.customFields
  // - Deploy: backend/scripts/deploy-ml-model.js
  customFields: {
    Product: productCustomFields!,
    Channel: channelCustomFields!,
    Order: orderCustomFields!,
    Payment: paymentCustomFields!,
    Customer: customerCustomFields!,
    PaymentMethod: paymentMethodCustomFields!,
    OrderLine: orderLineCustomFields!,
    StockLocation: [],
    ProductVariant: productVariantCustomFields!,
    User: userCustomFields!,
    Administrator: administratorCustomFields!,
    // Schema only; runtime value is in DB (super-admin Platform data, channel provisioning, shop API getPublicPlatformConfig).
    GlobalSettings: globalSettingsCustomFields!,
  },
  orderOptions: {
    process: [customOrderProcess],
  },
  shippingOptions: {
    fulfillmentHandlers: [manualFulfillmentHandler],
  },
  plugins: [
    EnvironmentPlugin, // Must be first to ensure env config is available
    GraphiqlPlugin.init(),
    MlModelPlugin,
    PriceOverridePlugin,
    ChannelSettingsPlugin,
    FractionalQuantityPlugin,
    NotificationPlugin,
    CacheSyncPlugin,
    ApprovalPlugin,
    AuditCorePlugin, // AuditService only (no GraphQL). Required by LedgerPlugin and AuditPlugin.
    LedgerPlugin, // Load before CreditPlugin - provides PostingService
    AnalyticsPlugin, // Product-level analytics via materialized views
    AuditPlugin, // Adds auditLogs query and AuditLog/AuditLogOptions types. Must be before SuperAdminPlugin.
    SuperAdminPlugin, // Platform operator API (platformChannels, platformStats, auditLogsForChannel, etc.)
    StockPlugin, // Load before CreditPlugin so StockPurchase type is available
    CreditPlugin, // Depends on LedgerPlugin
    CustomerPlugin, // Customer duplicate prevention
    SubscriptionPlugin,
    ChannelEventsPlugin,
    // PhoneAuthPlugin must be registered early so its strategy can be added to adminAuthenticationStrategy
    PhoneAuthPlugin,
    AssetServerPlugin.init({
      route: 'assets',
      assetUploadDir: env.app.assetUploadDir,
      assetUrlPrefix: env.app.assetUrlPrefix || undefined,
    }),
    DefaultSchedulerPlugin.init(),
    DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
    DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    EmailPlugin.init({
      devMode: (env.communication.devMode ||
        (!IS_PRODUCTION && env.email.transport !== 'smtp')) as any,
      outputPath: path.join(process.cwd(), 'static/email/test-emails'),
      route: 'mailbox',
      handlers: [...defaultEmailHandlers, otpEmailHandler],
      templateLoader: new FileBasedTemplateLoader(
        path.join(process.cwd(), 'static/email/templates')
      ),
      transport:
        IS_PRODUCTION || env.email.transport === 'smtp'
          ? {
              type: 'smtp',
              host: env.email.smtpHost,
              port: env.email.smtpPort,
              secure: env.email.smtpPort === 465,
              auth: {
                user: env.email.smtpUser,
                pass: env.email.smtpPass,
              },
            }
          : {
              type: 'file',
              outputPath: path.join(process.cwd(), 'static/email/test-emails'),
            },
      globalTemplateVars: {
        // The following variables will change depending on your storefront implementation.
        // Here we are assuming a storefront running at http://localhost:8080.
        fromAddress: '"DukaRun" <hello@dukarun.com>',
        verifyEmailAddressUrl: 'http://localhost:8080/verify',
        passwordResetUrl: 'http://localhost:8080/password-reset',
        changeEmailAddressUrl: 'http://localhost:8080/verify-email-address-change',
      },
    }),
    AdminUiPlugin.init({
      route: 'admin',
      port: serverPort,
      adminUiConfig: {
        apiPort: serverPort,
      },
    }),
  ],
};
