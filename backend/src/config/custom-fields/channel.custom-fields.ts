import { Asset, CustomFields, LanguageCode } from '@vendure/core';
import { SubscriptionTier } from '../../plugins/subscriptions/subscription.entity';

/**
 * Custom fields for the Channel entity.
 *
 * Grouped by tab/domain:
 * - ML Model: model assets, training state
 * - Branding: company logo
 * - Settings: cashier flow, cash control, printer
 * - Subscription: tier, billing, paystack, SMS
 * - Events: event configuration
 */
export const channelCustomFields: CustomFields['Channel'] = [
  // ─── ML Model ──────────────────────────────────────────────
  {
    name: 'mlModelJsonAsset',
    type: 'relation',
    entity: Asset,
    eager: true,
    label: [{ languageCode: LanguageCode.en, value: 'ML Model JSON Asset' }],
    description: [{ languageCode: LanguageCode.en, value: 'Asset for model.json file' }],
    public: true,
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
    eager: true,
    label: [{ languageCode: LanguageCode.en, value: 'ML Model Weights Asset' }],
    description: [{ languageCode: LanguageCode.en, value: 'Asset for weights.bin file' }],
    public: true,
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
    eager: true,
    label: [{ languageCode: LanguageCode.en, value: 'ML Metadata Asset' }],
    description: [{ languageCode: LanguageCode.en, value: 'Asset for metadata.json file' }],
    public: true,
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

  // ─── Branding ──────────────────────────────────────────────
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
        acceptedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        multiple: false,
      },
    },
  },

  // ─── Settings ──────────────────────────────────────────────
  {
    name: 'cashierFlowEnabled',
    type: 'boolean',
    label: [{ languageCode: LanguageCode.en, value: 'Enable Cashier Flow' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'When enabled, orders in this channel require cashier approval before completion',
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
        value: 'Minimum variance (in cents) to trigger manager notification. Default 100 = 1 KES',
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
    name: 'stockValueCache',
    type: 'text',
    label: [{ languageCode: LanguageCode.en, value: 'Stock Value Cache' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Cached stock value stats (retail, wholesale, cost) as JSON; internal use only',
      },
    ],
    public: false,
    nullable: true,
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

  // ─── Subscription ──────────────────────────────────────────
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
    description: [{ languageCode: LanguageCode.en, value: 'When the paid subscription started' }],
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
    description: [{ languageCode: LanguageCode.en, value: 'Paystack subscription reference code' }],
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

  // ─── Events ────────────────────────────────────────────────
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

  // ─── SMS Credits ───────────────────────────────────────────
  {
    name: 'smsUsedThisPeriod',
    type: 'int',
    label: [{ languageCode: LanguageCode.en, value: 'SMS Used This Period' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Number of SMS sent in the current 30-day period (resets with subscription)',
      },
    ],
    defaultValue: 0,
    public: false,
    nullable: false,
    ui: { tab: 'Subscription' },
  },
  {
    name: 'smsPeriodEnd',
    type: 'datetime',
    label: [{ languageCode: LanguageCode.en, value: 'SMS Period End' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'End of current SMS credit period (aligned with subscriptionExpiresAt)',
      },
    ],
    public: false,
    nullable: true,
    ui: { tab: 'Subscription' },
  },
  {
    name: 'smsUsageByCategory',
    type: 'text',
    label: [{ languageCode: LanguageCode.en, value: 'SMS Usage By Category' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value:
          'JSON object of SMS counts per category (e.g. ACCOUNT_NOTIFICATION, WELCOME) for current period',
      },
    ],
    public: false,
    nullable: true,
    ui: { tab: 'Subscription' },
  },
];
