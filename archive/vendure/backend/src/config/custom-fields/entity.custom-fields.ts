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
  {
    // On-device image-recognition fingerprint(s) for this product.
    // JSON-encoded array of per-image embeddings (number[][], each 512-dim, fp32, L2-normalized),
    // produced on the client by the MobileCLIP-S0 embedder at enrollment time. The client reads
    // these to do offline nearest-match recognition; the backend never computes or interprets them.
    name: 'mlEmbedding',
    type: 'text',
    label: [{ languageCode: LanguageCode.en, value: 'ML Recognition Fingerprint' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value:
          'JSON array of on-device image-recognition embeddings (set by the app; do not edit).',
      },
    ],
    // NOT public: the shop API is internet-facing (public storefronts). These fingerprints are
    // proprietary and only read by the authenticated app via the admin API, which exposes all
    // custom fields regardless of this flag.
    public: false,
    nullable: true,
    ui: { readonly: true },
  },
  {
    // The embedder version the fingerprints above were produced with (e.g. mobileclip-s0-fp32-v1).
    // The client ignores fingerprints whose version != its current embedder, so a model change
    // can never produce confident-wrong matches across embedding spaces.
    name: 'mlEmbeddingVersion',
    type: 'string',
    label: [{ languageCode: LanguageCode.en, value: 'ML Fingerprint Version' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Embedder version the recognition fingerprint was produced with (set by the app).',
      },
    ],
    // NOT public — see mlEmbedding above (shop API is internet-facing).
    public: false,
    nullable: true,
    ui: { readonly: true },
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
  {
    // Marks an order parked at the cashier: rung up by a salesperson, fulfilled and
    // owing (DR AR / CR SALES), awaiting collection at the cashier counter. Set when the
    // order is created with isCashierFlow; cleared (null) once the order is fully settled.
    // Drives the cashier settlement queue (pendingCashierOrders). Distinguishes a
    // cashier-park from a long-term credit sale, which are otherwise ledger-identical.
    name: 'cashierPendingAt',
    type: 'datetime',
    label: [{ languageCode: LanguageCode.en, value: 'Cashier Pending Since' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value:
          'When this order was sent to the cashier for payment; null once fully settled or if not a cashier-flow order.',
      },
    ],
    public: false,
    nullable: true,
  },
  {
    name: 'reconciliationStrategy',
    type: 'string',
    label: [{ languageCode: LanguageCode.en, value: 'Reconciliation Strategy' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Strategy used by superadmin to reconcile this order (e.g., ledger, model).',
      },
    ],
    public: false,
    nullable: true,
  },
  {
    name: 'reconciliationNote',
    type: 'text',
    label: [{ languageCode: LanguageCode.en, value: 'Reconciliation Note' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Human-readable note recorded when this order was reconciled.',
      },
    ],
    public: false,
    nullable: true,
  },
  {
    name: 'reconciledAt',
    type: 'datetime',
    label: [{ languageCode: LanguageCode.en, value: 'Reconciled At' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Timestamp when a superadmin last reconciled this order.',
      },
    ],
    public: false,
    nullable: true,
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
    // NOT public: wholesale/cost data must not leak to the internet-facing shop API. The
    // authenticated app reads it via the admin API (which ignores this flag).
    public: false,
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
    name: 'phoneNumber',
    type: 'string',
    label: [{ languageCode: LanguageCode.en, value: 'Mobile Phone Number' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Mobile number for WhatsApp and SMS notifications (e.g. 0712345678).',
      },
    ],
    public: false,
    nullable: true,
    ui: { tab: 'Notifications' },
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
  {
    name: 'customerNotificationsEnabled',
    type: 'boolean',
    label: [{ languageCode: LanguageCode.en, value: 'Customer notifications enabled' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value:
          'Master switch for customer-facing WhatsApp/SMS/email notifications. Off by default.',
      },
    ],
    defaultValue: false,
    nullable: false,
  },
  {
    name: 'communicationChannels',
    type: 'text',
    label: [{ languageCode: LanguageCode.en, value: 'Enabled communication channels' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value:
          'JSON object {sms, email, whatsapp} controlling which outbound channels are globally active. Defaults to all enabled.',
      },
    ],
    nullable: true,
  },
];
