import { AdminUiPlugin } from '@vendure/admin-ui-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import {
  Asset,
  configureDefaultOrderProcess,
  DefaultJobQueuePlugin,
  DefaultSchedulerPlugin,
  DefaultSearchPlugin,
  LanguageCode,
  manualFulfillmentHandler,
  User,
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
import { NotificationPlugin } from './plugins/notifications/notification.plugin';
import { OverridePricePermission } from './plugins/pricing/price-override.permission';
import { PriceOverridePlugin } from './plugins/pricing/price-override.plugin';
import { ManageStockAdjustmentsPermission } from './plugins/stock/permissions';
import { StockPlugin } from './plugins/stock/stock.plugin';
import { SubscriptionTier } from './plugins/subscriptions/subscription.entity';
import { SubscriptionPlugin } from './plugins/subscriptions/subscription.plugin';
import { cashPaymentHandler, mpesaPaymentHandler } from './services/payments/payment-handlers';

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

export const config: VendureConfig = {
  apiOptions: {
    port: serverPort,
    adminApiPath: 'admin-api',
    shopApiPath: 'shop-api',
    channelTokenKey: 'vendure-token',
    trustProxy: IS_PRODUCTION ? 1 : false,
    cors: {
      origin: IS_PRODUCTION
        ? env.app.frontendUrl?.split(',') || true
        : ['http://localhost:4200', 'http://127.0.0.1:4200'],
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
    tokenMethod: ['bearer', 'cookie'],
    superadminCredentials: {
      identifier: env.superadmin.username,
      password: env.superadmin.password,
    },
    cookieOptions: {
      secret: env.app.cookieSecret,
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
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
  // ML Model Management: Tag-based versioning + custom field activation
  // - Assets tagged: ml-model, channel-{id}, v{version}, trained-{date}
  // - Active model: Asset IDs in Channel.customFields below
  // - Deploy: backend/scripts/deploy-ml-model.js
  customFields: {
    Product: [
      {
        name: 'barcode',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Product Barcode' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Barcode for the entire product (shared across all variants)',
          },
        ],
        public: true,
        nullable: true,
      },
    ],
    Channel: [
      {
        name: 'mlModelJsonAsset',
        type: 'relation',
        entity: Asset,
        eager: true, // Auto-load relation to avoid resolver permission issues
        label: [{ languageCode: LanguageCode.en, value: 'ML Model JSON Asset' }],
        description: [{ languageCode: LanguageCode.en, value: 'Asset for model.json file' }],
        public: true, // Accessible to Shop API for frontend ML predictions
        nullable: true,
        ui: {
          tab: 'ML Model',
          component: 'asset-selector',
          props: {
            acceptedFileTypes: ['application/json', 'text/json', '.json'],
            multiple: false,
          },
        },
      },
      {
        name: 'mlModelBinAsset',
        type: 'relation',
        entity: Asset,
        eager: true, // Auto-load relation to avoid resolver permission issues
        label: [{ languageCode: LanguageCode.en, value: 'ML Model Weights Asset' }],
        description: [{ languageCode: LanguageCode.en, value: 'Asset for weights.bin file' }],
        public: true, // Accessible to Shop API for frontend ML predictions
        nullable: true,
        ui: {
          tab: 'ML Model',
          component: 'asset-selector',
          props: {
            acceptedFileTypes: ['application/octet-stream', 'application/binary', '.bin'],
            multiple: false,
          },
        },
      },
      {
        name: 'mlMetadataAsset',
        type: 'relation',
        entity: Asset,
        eager: true, // Auto-load relation to avoid resolver permission issues
        label: [{ languageCode: LanguageCode.en, value: 'ML Metadata Asset' }],
        description: [{ languageCode: LanguageCode.en, value: 'Asset for metadata.json file' }],
        public: true, // Accessible to Shop API for frontend ML predictions
        nullable: true,
        ui: {
          tab: 'ML Model',
          component: 'asset-selector',
          props: {
            acceptedFileTypes: ['application/json', 'text/json', '.json'],
            multiple: false,
          },
        },
      },
      {
        name: 'companyLogoAsset',
        type: 'relation',
        entity: Asset,
        label: [{ languageCode: LanguageCode.en, value: 'Company Logo Asset' }],
        description: [{ languageCode: LanguageCode.en, value: 'Asset for the company logo image' }],
        public: true,
        nullable: true,
        ui: {
          tab: 'Branding',
          component: 'asset-selector',
          props: {
            acceptedFileTypes: [
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
              'image/svg+xml',
            ],
            multiple: false,
          },
        },
      },
      {
        name: 'cashierFlowEnabled',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Enable Cashier Flow' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value:
              'When enabled, orders in this channel require cashier approval before completion',
          },
        ],
        defaultValue: false,
        public: true,
        nullable: false,
        ui: { tab: 'Settings' },
      },
      {
        name: 'maxAdminCount',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Maximum Admin Count' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Maximum number of administrators allowed for this channel',
          },
        ],
        defaultValue: 5,
        public: false,
        nullable: false,
        ui: { tab: 'Settings' },
      },
      {
        name: 'cashControlEnabled',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Enable Cash Control' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'When enabled, cashiers must perform blind cash counts during sessions',
          },
        ],
        defaultValue: true,
        public: true,
        nullable: false,
        ui: { tab: 'Settings' },
      },
      {
        name: 'requireOpeningCount',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Require Opening Count' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Require a cash count when opening a cashier session',
          },
        ],
        defaultValue: true,
        public: true,
        nullable: false,
        ui: { tab: 'Settings' },
      },
      {
        name: 'varianceNotificationThreshold',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Variance Notification Threshold' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value:
              'Minimum variance (in cents) to trigger manager notification. Default 100 = 1 KES',
          },
        ],
        defaultValue: 100,
        public: false,
        nullable: false,
        ui: { tab: 'Settings' },
      },
      {
        name: 'enablePrinter',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Enable Printer' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'When enabled, shows "Complete & Print" button at checkout',
          },
        ],
        defaultValue: true,
        public: true,
        nullable: false,
        ui: { tab: 'Settings' },
      },
      {
        name: 'status',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Channel Status' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value:
              'Channel status controls user access: UNAPPROVED (read-only), APPROVED (full access), DISABLED/BANNED (no access)',
          },
        ],
        defaultValue: 'UNAPPROVED',
        public: true,
        nullable: false,
        readonly: false,
        ui: { tab: 'Settings' },
        options: [
          {
            value: 'UNAPPROVED',
            label: [{ languageCode: LanguageCode.en, value: 'Unapproved' }],
          },
          {
            value: 'APPROVED',
            label: [{ languageCode: LanguageCode.en, value: 'Approved' }],
          },
          {
            value: 'DISABLED',
            label: [{ languageCode: LanguageCode.en, value: 'Disabled' }],
          },
          {
            value: 'BANNED',
            label: [{ languageCode: LanguageCode.en, value: 'Banned' }],
          },
        ],
      },
      {
        name: 'mlTrainingStatus',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'ML Training Status' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Current status: idle, extracting, ready, training, active, failed',
          },
        ],
        defaultValue: 'idle',
        public: true,
        nullable: false,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'mlTrainingProgress',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Training Progress %' }],
        description: [{ languageCode: LanguageCode.en, value: 'Progress percentage (0-100)' }],
        defaultValue: 0,
        public: true,
        nullable: false,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'mlTrainingStartedAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Training Started At' }],
        public: true,
        nullable: true,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'mlTrainingError',
        type: 'text',
        label: [{ languageCode: LanguageCode.en, value: 'Last Training Error' }],
        public: false,
        nullable: true,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'mlTrainingQueuedAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Training Queued At' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Timestamp when training was queued (set after photo extraction)',
          },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'mlLastTrainedAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Last Training Completed At' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Timestamp when training last completed successfully (used for rate limiting)',
          },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'mlProductCount',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Product Count in Model' }],
        defaultValue: 0,
        public: true,
        nullable: false,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'mlImageCount',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Image Count in Model' }],
        defaultValue: 0,
        public: true,
        nullable: false,
        ui: { tab: 'ML Model' },
      },
      {
        name: 'subscriptionTier',
        type: 'relation',
        entity: SubscriptionTier,
        label: [{ languageCode: LanguageCode.en, value: 'Subscription Tier' }],
        description: [{ languageCode: LanguageCode.en, value: 'Current subscription tier' }],
        public: false,
        nullable: true,
        ui: {
          tab: 'Subscription',
        },
      },
      {
        name: 'subscriptionStatus',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Subscription Status' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Current subscription status: trial, active, expired, or cancelled',
          },
        ],
        defaultValue: 'trial',
        public: true,
        nullable: false,
        ui: { tab: 'Subscription' },
        options: [
          {
            value: 'trial',
            label: [{ languageCode: LanguageCode.en, value: 'Trial' }],
          },
          {
            value: 'active',
            label: [{ languageCode: LanguageCode.en, value: 'Active' }],
          },
          {
            value: 'expired',
            label: [{ languageCode: LanguageCode.en, value: 'Expired' }],
          },
          {
            value: 'cancelled',
            label: [{ languageCode: LanguageCode.en, value: 'Cancelled' }],
          },
        ],
      },
      {
        name: 'trialEndsAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Trial Ends At' }],
        description: [{ languageCode: LanguageCode.en, value: 'When the trial period ends' }],
        public: true,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'subscriptionStartedAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Subscription Started At' }],
        description: [
          { languageCode: LanguageCode.en, value: 'When the paid subscription started' },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'subscriptionExpiresAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Subscription Expires At' }],
        description: [{ languageCode: LanguageCode.en, value: 'Next billing date' }],
        public: true,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'billingCycle',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Billing Cycle' }],
        description: [{ languageCode: LanguageCode.en, value: 'Billing cycle: monthly or yearly' }],
        public: true,
        nullable: true,
        ui: { tab: 'Subscription' },
        options: [
          {
            value: 'monthly',
            label: [{ languageCode: LanguageCode.en, value: 'Monthly' }],
          },
          {
            value: 'yearly',
            label: [{ languageCode: LanguageCode.en, value: 'Yearly' }],
          },
        ],
      },
      {
        name: 'paystackCustomerCode',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Paystack Customer Code' }],
        description: [{ languageCode: LanguageCode.en, value: 'Paystack customer reference code' }],
        public: false,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'paystackSubscriptionCode',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Paystack Subscription Code' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Paystack subscription reference code' },
        ],
        public: false,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'lastPaymentDate',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Last Payment Date' }],
        description: [{ languageCode: LanguageCode.en, value: 'Date of last successful payment' }],
        public: true,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'lastPaymentAmount',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Last Payment Amount' }],
        description: [{ languageCode: LanguageCode.en, value: 'Amount of last payment in cents' }],
        public: true,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'subscriptionExpiredReminderSentAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Subscription Expired Reminder Sent At' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Timestamp when the last subscription expired reminder was sent',
          },
        ],
        public: false,
        nullable: true,
        ui: { tab: 'Subscription' },
      },
      {
        name: 'eventConfig',
        type: 'text',
        label: [{ languageCode: LanguageCode.en, value: 'Event Configuration' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'JSON configuration for channel events and actions',
          },
        ],
        public: false,
        nullable: true,
        ui: { tab: 'Events' },
      },
      // Action Tracking - AUTHENTICATION
      {
        name: 'actionCountAuthOtp',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Auth OTP Count' }],
        description: [{ languageCode: LanguageCode.en, value: 'Count of OTP SMS sent' }],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountAuthTotal',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Auth Total Count' }],
        description: [{ languageCode: LanguageCode.en, value: 'Total authentication actions' }],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      // Action Tracking - CUSTOMER_COMMUNICATION
      {
        name: 'actionCountCommCustomerCreated',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Comm Customer Created Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of customer created notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountCommCreditApproved',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Comm Credit Approved Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of credit approved notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountCommBalanceChanged',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Comm Balance Changed Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of balance changed notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountCommRepaymentDeadline',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Comm Repayment Deadline Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of repayment deadline notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountCommTotal',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Comm Total Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Total customer communication actions' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      // Action Tracking - SYSTEM_NOTIFICATIONS
      {
        name: 'actionCountSysOrderPaymentSettled',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Order Payment Settled Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of order payment settled notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysOrderFulfilled',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Order Fulfilled Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of order fulfilled notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysOrderCancelled',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Order Cancelled Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of order cancelled notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysStockLowAlert',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Stock Low Alert Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of stock low alert notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysMlTrainingStarted',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys ML Training Started Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of ML training started notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysMlTrainingProgress',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys ML Training Progress Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of ML training progress notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysMlTrainingCompleted',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys ML Training Completed Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of ML training completed notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysMlTrainingFailed',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys ML Training Failed Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of ML training failed notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysPaymentConfirmed',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Payment Confirmed Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of payment confirmed notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysAdminCreated',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Admin Created Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of admin created notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysAdminUpdated',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Admin Updated Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of admin updated notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysUserCreated',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys User Created Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of user created notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysUserUpdated',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys User Updated Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Count of user updated notifications' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionCountSysTotal',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Sys Total Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Total system notification actions' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      // Global Tracking
      {
        name: 'actionCountTotal',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Total Action Count' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Total actions across all categories' },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionTrackingLastResetDate',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Action Tracking Last Reset Date' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Last date action counts were reset' },
        ],
        public: false,
        nullable: true,
        ui: { tab: 'Events' },
      },
      {
        name: 'actionTrackingResetType',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Action Tracking Reset Type' }],
        description: [{ languageCode: LanguageCode.en, value: 'Reset type: daily or monthly' }],
        defaultValue: 'monthly',
        public: false,
        nullable: false,
        ui: { tab: 'Events' },
      },
    ],
    Order: [
      {
        name: 'createdByUserId',
        type: 'relation',
        entity: User,
        label: [{ languageCode: LanguageCode.en, value: 'Created By User' }],
        description: [{ languageCode: LanguageCode.en, value: 'User who created this order' }],
        public: false,
        nullable: true,
      },
      {
        name: 'lastModifiedByUserId',
        type: 'relation',
        entity: User,
        label: [{ languageCode: LanguageCode.en, value: 'Last Modified By User' }],
        description: [
          { languageCode: LanguageCode.en, value: 'User who last modified this order' },
        ],
        public: false,
        nullable: true,
      },
      {
        name: 'auditCreatedAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Audit Created At' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Timestamp when audit tracking was enabled for this order',
          },
        ],
        public: false,
        nullable: true,
      },
      {
        name: 'reversedAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Reversed At' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'When this order was reversed (ledger reversal); null if not reversed',
          },
        ],
        public: false,
        nullable: true,
      },
      {
        name: 'reversedByUserId',
        type: 'relation',
        entity: User,
        label: [{ languageCode: LanguageCode.en, value: 'Reversed By User' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'User who performed the order reversal',
          },
        ],
        public: false,
        nullable: true,
      },
    ],
    Payment: [
      {
        name: 'addedByUserId',
        type: 'relation',
        entity: User,
        label: [{ languageCode: LanguageCode.en, value: 'Added By User' }],
        description: [{ languageCode: LanguageCode.en, value: 'User who added this payment' }],
        public: false,
        nullable: true,
      },
      {
        name: 'auditCreatedAt',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Audit Created At' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Timestamp when audit tracking was enabled for this payment',
          },
        ],
        public: false,
        nullable: true,
      },
    ],
    Customer: [
      {
        name: 'creditApprovedByUserId',
        type: 'relation',
        entity: User,
        label: [{ languageCode: LanguageCode.en, value: 'Credit Approved By User' }],
        description: [
          { languageCode: LanguageCode.en, value: 'User who approved credit for this customer' },
        ],
        public: false,
        nullable: true,
      },
      {
        name: 'isSupplier',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Is Supplier' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Marks this customer as a supplier' },
        ],
        defaultValue: false,
        public: false,
        nullable: false,
        ui: { tab: 'Business Type' },
      },
      {
        name: 'supplierType',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Type' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Type of supplier (e.g., Manufacturer, Distributor, etc.)',
          },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
      },
      {
        name: 'contactPerson',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Contact Person' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Primary contact person for this supplier' },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
      },
      {
        name: 'taxId',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Tax ID' }],
        description: [{ languageCode: LanguageCode.en, value: 'Tax identification number' }],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
      },
      {
        name: 'paymentTerms',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Payment Terms' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Payment terms for this supplier (e.g., Net 30, COD, etc.)',
          },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
      },
      {
        name: 'notes',
        type: 'text',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Notes' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Additional notes about this supplier' },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
      },
      {
        name: 'isCreditApproved',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Credit Approved' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Indicates whether the customer is eligible for credit purchases',
          },
        ],
        defaultValue: false,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
      {
        name: 'creditLimit',
        type: 'float',
        label: [{ languageCode: LanguageCode.en, value: 'Credit Limit' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Maximum credit balance allowed for this customer',
          },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
      // outstandingAmount removed - now calculated dynamically from the ledger
      // See FinancialService.getCustomerBalance() for implementation
      {
        name: 'lastRepaymentDate',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Last Repayment Date' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Date of the last credit repayment made by this customer',
          },
        ],
        public: false,
        nullable: true,
        ui: { tab: 'Financial' },
      },
      {
        name: 'lastRepaymentAmount',
        type: 'float',
        label: [{ languageCode: LanguageCode.en, value: 'Last Repayment Amount' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Amount of the last credit repayment made by this customer',
          },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
      {
        name: 'creditDuration',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Credit Duration (days)' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Number of days credit is extended to this customer before repayment is due',
          },
        ],
        defaultValue: 30,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
      {
        name: 'isSupplierCreditApproved',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Credit Approved' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Indicates whether the supplier is eligible for credit purchases',
          },
        ],
        defaultValue: false,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
      {
        name: 'supplierCreditLimit',
        type: 'float',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Credit Limit' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Maximum credit balance allowed for this supplier',
          },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
      {
        name: 'supplierCreditDuration',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Credit Duration (days)' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Number of days credit is extended to this supplier before repayment is due',
          },
        ],
        defaultValue: 30,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
      {
        name: 'supplierLastRepaymentDate',
        type: 'datetime',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Last Repayment Date' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Date of the last credit repayment made to this supplier',
          },
        ],
        public: false,
        nullable: true,
        ui: { tab: 'Financial' },
      },
      {
        name: 'supplierLastRepaymentAmount',
        type: 'float',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Last Repayment Amount' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Amount of the last credit repayment made to this supplier',
          },
        ],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
      },
    ],
    PaymentMethod: [
      {
        name: 'imageAsset',
        type: 'relation',
        entity: Asset,
        label: [{ languageCode: LanguageCode.en, value: 'Payment Method Image Asset' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Asset for payment method image/logo' },
        ],
        public: true,
        nullable: true,
        ui: {
          tab: 'Display',
          component: 'asset-selector',
          props: {
            acceptedFileTypes: [
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
              'image/svg+xml',
            ],
            multiple: false,
          },
        },
      },
      {
        name: 'isActive',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Is Active' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Whether this payment method is active' },
        ],
        public: true,
        nullable: true,
        defaultValue: true,
        ui: { tab: 'Display' },
      },
      // Reconciliation Configuration
      {
        name: 'reconciliationType',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Reconciliation Type' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value:
              'How this payment method should be reconciled: blind_count (cash), transaction_verification (mobile money), statement_match (bank), none',
          },
        ],
        defaultValue: 'none',
        public: true,
        nullable: false,
        options: [
          { value: 'blind_count' },
          { value: 'transaction_verification' },
          { value: 'statement_match' },
          { value: 'none' },
        ],
        ui: { tab: 'Reconciliation' },
      },
      {
        name: 'ledgerAccountCode',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Ledger Account Code' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value:
              'Account code for ledger postings (e.g., CASH_ON_HAND, CLEARING_MPESA). Auto-derived from handler if empty.',
          },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'Reconciliation' },
      },
      {
        name: 'isCashierControlled',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Cashier Controlled' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Include this payment method in cashier session reconciliation',
          },
        ],
        defaultValue: false,
        public: true,
        nullable: false,
        ui: { tab: 'Reconciliation' },
      },
      {
        name: 'requiresReconciliation',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Requires Reconciliation' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Must be reconciled before accounting period close',
          },
        ],
        defaultValue: true,
        public: true,
        nullable: false,
        ui: { tab: 'Reconciliation' },
      },
    ],
    OrderLine: [
      {
        name: 'customLinePrice',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Custom Line Price' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Total custom price for this line in cents (overrides variant price)',
          },
        ],
        public: true,
        nullable: true,
      },
      {
        name: 'priceOverrideReason',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Price Override Reason' }],
        description: [{ languageCode: LanguageCode.en, value: 'Reason code for price override' }],
        public: true,
        nullable: true,
      },
    ],
    StockLocation: [],
    ProductVariant: [
      {
        name: 'wholesalePrice',
        type: 'int',
        label: [{ languageCode: LanguageCode.en, value: 'Wholesale Price' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Maximum discounted price in cents (serves as discount limit)',
          },
        ],
        public: true,
        nullable: true,
        ui: { tab: 'Pricing' },
      },
      {
        name: 'allowFractionalQuantity',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Allow Fractional Sales' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'Enable fractional quantity sales (e.g., 0.5kg)',
          },
        ],
        defaultValue: false,
        public: true,
        nullable: false,
        ui: { tab: 'Pricing' },
      },
    ],
    User: [
      {
        name: 'authorizationStatus',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Authorization Status' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value:
              'User authorization status: PENDING (can login), APPROVED (can login), REJECTED (blocks login)',
          },
        ],
        defaultValue: 'PENDING',
        public: true,
        nullable: false,
        ui: { tab: 'Settings' },
        options: [
          {
            value: 'PENDING',
            label: [{ languageCode: LanguageCode.en, value: 'Pending' }],
          },
          {
            value: 'APPROVED',
            label: [{ languageCode: LanguageCode.en, value: 'Approved' }],
          },
          {
            value: 'REJECTED',
            label: [{ languageCode: LanguageCode.en, value: 'Rejected' }],
          },
        ],
      },
      {
        name: 'notificationPreferences',
        type: 'text',
        label: [{ languageCode: LanguageCode.en, value: 'Notification Preferences' }],
        description: [
          {
            languageCode: LanguageCode.en,
            value: 'JSON preferences for subscribable event notifications',
          },
        ],
        public: false,
        nullable: true,
        ui: { tab: 'Notifications' },
      },
    ],
    Administrator: [
      {
        name: 'profilePicture',
        type: 'relation',
        entity: Asset,
        label: [{ languageCode: LanguageCode.en, value: 'Profile Picture' }],
        description: [
          { languageCode: LanguageCode.en, value: 'Profile picture for the administrator' },
        ],
        public: true,
        nullable: true,
        ui: {
          tab: 'Profile',
          component: 'asset-selector',
          props: {
            acceptedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            multiple: false,
          },
        },
      },
    ],
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
    ApprovalPlugin,
    AuditCorePlugin, // AuditService only (no GraphQL). Required by LedgerPlugin and AuditPlugin.
    LedgerPlugin, // Load before CreditPlugin - provides PostingService
    StockPlugin, // Load before CreditPlugin so StockPurchase type is available
    CreditPlugin, // Depends on LedgerPlugin
    CustomerPlugin, // Customer duplicate prevention
    SubscriptionPlugin,
    ChannelEventsPlugin,
    AuditPlugin, // Adds auditLogs query and event subscriber
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
