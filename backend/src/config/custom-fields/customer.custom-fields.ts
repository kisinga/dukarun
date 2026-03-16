import { CustomFields, LanguageCode, User } from '@vendure/core';

/**
 * Custom fields for the Customer entity.
 *
 * Grouped by domain:
 * - Business Type: isSupplier flag
 * - Supplier Info: supplier-specific metadata
 * - Financial: credit settings for customers and suppliers
 */
export const customerCustomFields: CustomFields['Customer'] = [
  // ─── Audit ─────────────────────────────────────────────────
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

  // ─── Business Type ─────────────────────────────────────────
  {
    name: 'isSupplier',
    type: 'boolean',
    label: [{ languageCode: LanguageCode.en, value: 'Is Supplier' }],
    description: [{ languageCode: LanguageCode.en, value: 'Marks this customer as a supplier' }],
    defaultValue: false,
    public: false,
    nullable: false,
    ui: { tab: 'Business Type' },
  },

  // ─── Supplier Info ─────────────────────────────────────────
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
    description: [{ languageCode: LanguageCode.en, value: 'Additional notes about this supplier' }],
    public: true,
    nullable: true,
    ui: { tab: 'Supplier Info' },
  },

  // ─── Customer Financial ────────────────────────────────────
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

  // ─── Supplier Financial ────────────────────────────────────
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
];
