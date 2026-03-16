import { Asset, CustomFields, LanguageCode, User } from '@vendure/core';

/**
 * Custom fields for smaller entities:
 * Product, Order, Payment, PaymentMethod, OrderLine, ProductVariant,
 * StockLocation, User, Administrator, GlobalSettings
 */

export const productCustomFields: CustomFields['Product'] = [
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
];

export const orderCustomFields: CustomFields['Order'] = [
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
    description: [{ languageCode: LanguageCode.en, value: 'User who last modified this order' }],
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
  {
    name: 'cogsStatus',
    type: 'string',
    label: [{ languageCode: LanguageCode.en, value: 'COGS Status' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value:
          'Tracks whether cost-of-goods-sold was recorded for this order. Values: recorded | skipped. Null means not yet processed.',
      },
    ],
    public: false,
    nullable: true,
    ui: { tab: 'Inventory' },
  },
];

export const paymentCustomFields: CustomFields['Payment'] = [
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
];

export const paymentMethodCustomFields: CustomFields['PaymentMethod'] = [
  {
    name: 'imageAsset',
    type: 'relation',
    entity: Asset,
    label: [{ languageCode: LanguageCode.en, value: 'Payment Method Image Asset' }],
    description: [{ languageCode: LanguageCode.en, value: 'Asset for payment method image/logo' }],
    public: true,
    nullable: true,
    ui: {
      tab: 'Display',
      component: 'asset-selector',
      props: {
        acceptedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
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
];

export const orderLineCustomFields: CustomFields['OrderLine'] = [
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
];

export const productVariantCustomFields: CustomFields['ProductVariant'] = [
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
];

export const userCustomFields: CustomFields['User'] = [
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
];

export const administratorCustomFields: CustomFields['Administrator'] = [
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
];

export const globalSettingsCustomFields: CustomFields['GlobalSettings'] = [
  {
    name: 'trialDays',
    type: 'int',
    label: [{ languageCode: LanguageCode.en, value: 'Default trial duration (days)' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Days for new business trial. Used when creating channels.',
      },
    ],
    defaultValue: 30,
    nullable: false,
  },
];
