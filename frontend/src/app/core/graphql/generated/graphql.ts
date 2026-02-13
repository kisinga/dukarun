/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: { input: any; output: any };
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: any; output: any };
  /** The `Money` scalar type represents monetary values and supports signed double-precision fractional values as specified by [IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point). */
  Money: { input: number; output: number };
  /** The `Upload` scalar type represents a file upload. */
  Upload: { input: any; output: any };
};

export type AccountAmountInput = {
  accountCode: Scalars['String']['input'];
  amountCents: Scalars['Int']['input'];
};

export type AccountBalanceAsOfItem = {
  __typename?: 'AccountBalanceAsOfItem';
  accountCode: Scalars['String']['output'];
  accountId: Scalars['ID']['output'];
  accountName: Scalars['String']['output'];
  balanceCents: Scalars['String']['output'];
};

export type AccountBreakdown = {
  __typename?: 'AccountBreakdown';
  icon: Scalars['String']['output'];
  label: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type AccountingPeriod = {
  __typename?: 'AccountingPeriod';
  channelId: Scalars['Int']['output'];
  closedAt?: Maybe<Scalars['DateTime']['output']>;
  closedBy?: Maybe<Scalars['Int']['output']>;
  endDate: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  startDate: Scalars['DateTime']['output'];
  status: Scalars['String']['output'];
};

export type AddFulfillmentToOrderResult =
  | CreateFulfillmentError
  | EmptyOrderLineSelectionError
  | Fulfillment
  | FulfillmentStateTransitionError
  | InsufficientStockOnHandError
  | InvalidFulfillmentHandlerError
  | ItemsAlreadyFulfilledError;

export type AddItemInput = {
  customFields?: InputMaybe<OrderLineCustomFieldsInput>;
  productVariantId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type AddItemToDraftOrderInput = {
  customFields?: InputMaybe<OrderLineCustomFieldsInput>;
  productVariantId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type AddManualPaymentToOrderResult = ManualPaymentStateError | Order;

export type AddNoteToCustomerInput = {
  id: Scalars['ID']['input'];
  isPublic: Scalars['Boolean']['input'];
  note: Scalars['String']['input'];
};

export type AddNoteToOrderInput = {
  id: Scalars['ID']['input'];
  isPublic: Scalars['Boolean']['input'];
  note: Scalars['String']['input'];
};

export type Address = Node & {
  __typename?: 'Address';
  city?: Maybe<Scalars['String']['output']>;
  company?: Maybe<Scalars['String']['output']>;
  country: Country;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  defaultBillingAddress?: Maybe<Scalars['Boolean']['output']>;
  defaultShippingAddress?: Maybe<Scalars['Boolean']['output']>;
  fullName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  phoneNumber?: Maybe<Scalars['String']['output']>;
  postalCode?: Maybe<Scalars['String']['output']>;
  province?: Maybe<Scalars['String']['output']>;
  streetLine1: Scalars['String']['output'];
  streetLine2?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type AdjustDraftOrderLineInput = {
  customFields?: InputMaybe<OrderLineCustomFieldsInput>;
  orderLineId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type Adjustment = {
  __typename?: 'Adjustment';
  adjustmentSource: Scalars['String']['output'];
  amount: Scalars['Money']['output'];
  data?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  type: AdjustmentType;
};

export enum AdjustmentType {
  DISTRIBUTED_ORDER_PROMOTION = 'DISTRIBUTED_ORDER_PROMOTION',
  OTHER = 'OTHER',
  PROMOTION = 'PROMOTION',
}

export type Administrator = Node & {
  __typename?: 'Administrator';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<AdministratorCustomFields>;
  emailAddress: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  user: User;
};

export type AdministratorCustomFields = {
  __typename?: 'AdministratorCustomFields';
  profilePicture?: Maybe<Asset>;
};

export type AdministratorFilterParameter = {
  _and?: InputMaybe<Array<AdministratorFilterParameter>>;
  _or?: InputMaybe<Array<AdministratorFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  emailAddress?: InputMaybe<StringOperators>;
  firstName?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  lastName?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type AdministratorList = PaginatedList & {
  __typename?: 'AdministratorList';
  items: Array<Administrator>;
  totalItems: Scalars['Int']['output'];
};

export type AdministratorListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<AdministratorFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<AdministratorSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type AdministratorPaymentInput = {
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
};

export type AdministratorRefundInput = {
  /**
   * The amount to be refunded to this particular Payment. This was introduced in
   * v2.2.0 as the preferred way to specify the refund amount. The `lines`, `shipping` and `adjustment`
   * fields will be removed in a future version.
   */
  amount?: InputMaybe<Scalars['Money']['input']>;
  paymentId: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type AdministratorSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  emailAddress?: InputMaybe<SortOrder>;
  firstName?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastName?: InputMaybe<SortOrder>;
  profilePicture?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type Allocation = Node &
  StockMovement & {
    __typename?: 'Allocation';
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    orderLine: OrderLine;
    productVariant: ProductVariant;
    quantity: Scalars['Int']['output'];
    type: StockMovementType;
    updatedAt: Scalars['DateTime']['output'];
  };

/** Returned if an attempting to refund an OrderItem which has already been refunded */
export type AlreadyRefundedError = ErrorResult & {
  __typename?: 'AlreadyRefundedError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  refundId: Scalars['ID']['output'];
};

export type ApplyCouponCodeResult =
  | CouponCodeExpiredError
  | CouponCodeInvalidError
  | CouponCodeLimitError
  | Order;

export type ApprovalRequest = {
  __typename?: 'ApprovalRequest';
  channelId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  entityId?: Maybe<Scalars['String']['output']>;
  entityType?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  message?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  requestedById: Scalars['ID']['output'];
  reviewedAt?: Maybe<Scalars['DateTime']['output']>;
  reviewedById?: Maybe<Scalars['ID']['output']>;
  status: Scalars['String']['output'];
  type: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ApprovalRequestList = {
  __typename?: 'ApprovalRequestList';
  items: Array<ApprovalRequest>;
  totalItems: Scalars['Int']['output'];
};

export type ApprovalRequestListOptions = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type ApproveCustomerCreditInput = {
  approved: Scalars['Boolean']['input'];
  creditDuration?: InputMaybe<Scalars['Int']['input']>;
  creditLimit?: InputMaybe<Scalars['Float']['input']>;
  customerId: Scalars['ID']['input'];
};

export type ApproveSupplierCreditInput = {
  approved: Scalars['Boolean']['input'];
  supplierCreditDuration?: InputMaybe<Scalars['Int']['input']>;
  supplierCreditLimit?: InputMaybe<Scalars['Float']['input']>;
  supplierId: Scalars['ID']['input'];
};

export type Asset = Node & {
  __typename?: 'Asset';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  fileSize: Scalars['Int']['output'];
  focalPoint?: Maybe<Coordinate>;
  height: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  name: Scalars['String']['output'];
  preview: Scalars['String']['output'];
  source: Scalars['String']['output'];
  tags: Array<Tag>;
  type: AssetType;
  updatedAt: Scalars['DateTime']['output'];
  width: Scalars['Int']['output'];
};

export type AssetFilterParameter = {
  _and?: InputMaybe<Array<AssetFilterParameter>>;
  _or?: InputMaybe<Array<AssetFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  fileSize?: InputMaybe<NumberOperators>;
  height?: InputMaybe<NumberOperators>;
  id?: InputMaybe<IdOperators>;
  mimeType?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  preview?: InputMaybe<StringOperators>;
  source?: InputMaybe<StringOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  width?: InputMaybe<NumberOperators>;
};

export type AssetList = PaginatedList & {
  __typename?: 'AssetList';
  items: Array<Asset>;
  totalItems: Scalars['Int']['output'];
};

export type AssetListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<AssetFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<AssetSortParameter>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  tagsOperator?: InputMaybe<LogicalOperator>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type AssetSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  fileSize?: InputMaybe<SortOrder>;
  height?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  mimeType?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  preview?: InputMaybe<SortOrder>;
  source?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  width?: InputMaybe<SortOrder>;
};

export enum AssetType {
  BINARY = 'BINARY',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

export type AssignAssetsToChannelInput = {
  assetIds: Array<Scalars['ID']['input']>;
  channelId: Scalars['ID']['input'];
};

export type AssignCollectionsToChannelInput = {
  channelId: Scalars['ID']['input'];
  collectionIds: Array<Scalars['ID']['input']>;
};

export type AssignFacetsToChannelInput = {
  channelId: Scalars['ID']['input'];
  facetIds: Array<Scalars['ID']['input']>;
};

export type AssignPaymentMethodsToChannelInput = {
  channelId: Scalars['ID']['input'];
  paymentMethodIds: Array<Scalars['ID']['input']>;
};

export type AssignProductVariantsToChannelInput = {
  channelId: Scalars['ID']['input'];
  priceFactor?: InputMaybe<Scalars['Float']['input']>;
  productVariantIds: Array<Scalars['ID']['input']>;
};

export type AssignProductsToChannelInput = {
  channelId: Scalars['ID']['input'];
  priceFactor?: InputMaybe<Scalars['Float']['input']>;
  productIds: Array<Scalars['ID']['input']>;
};

export type AssignPromotionsToChannelInput = {
  channelId: Scalars['ID']['input'];
  promotionIds: Array<Scalars['ID']['input']>;
};

export type AssignShippingMethodsToChannelInput = {
  channelId: Scalars['ID']['input'];
  shippingMethodIds: Array<Scalars['ID']['input']>;
};

export type AssignStockLocationsToChannelInput = {
  channelId: Scalars['ID']['input'];
  stockLocationIds: Array<Scalars['ID']['input']>;
};

export type AuditLog = {
  __typename?: 'AuditLog';
  channelId: Scalars['ID']['output'];
  data: Scalars['JSON']['output'];
  entityId?: Maybe<Scalars['String']['output']>;
  entityType?: Maybe<Scalars['String']['output']>;
  eventType: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  ipAddress?: Maybe<Scalars['String']['output']>;
  source: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  userId?: Maybe<Scalars['ID']['output']>;
};

export type AuditLogOptions = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  entityId?: InputMaybe<Scalars['String']['input']>;
  entityType?: InputMaybe<Scalars['String']['input']>;
  eventType?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type AuthenticationInput = {
  native?: InputMaybe<NativeAuthInput>;
};

export type AuthenticationMethod = Node & {
  __typename?: 'AuthenticationMethod';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  strategy: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AuthenticationResult = CurrentUser | InvalidCredentialsError;

export type AuthorizationStatus = {
  __typename?: 'AuthorizationStatus';
  message: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type BooleanCustomFieldConfig = CustomField & {
  __typename?: 'BooleanCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

/** Operators for filtering on a list of Boolean fields */
export type BooleanListOperators = {
  inList: Scalars['Boolean']['input'];
};

/** Operators for filtering on a Boolean field */
export type BooleanOperators = {
  eq?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type BooleanStructFieldConfig = StructField & {
  __typename?: 'BooleanStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

/** Returned if an attempting to cancel lines from an Order which is still active */
export type CancelActiveOrderError = ErrorResult & {
  __typename?: 'CancelActiveOrderError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  orderState: Scalars['String']['output'];
};

export type CancelOrderInput = {
  /** Specify whether the shipping charges should also be cancelled. Defaults to false */
  cancelShipping?: InputMaybe<Scalars['Boolean']['input']>;
  /** Optionally specify which OrderLines to cancel. If not provided, all OrderLines will be cancelled */
  lines?: InputMaybe<Array<OrderLineInput>>;
  /** The id of the order to be cancelled */
  orderId: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type CancelOrderResult =
  | CancelActiveOrderError
  | EmptyOrderLineSelectionError
  | MultipleOrderError
  | Order
  | OrderStateTransitionError
  | QuantityTooGreatError;

/** Returned if the Payment cancellation fails */
export type CancelPaymentError = ErrorResult & {
  __typename?: 'CancelPaymentError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  paymentErrorMessage: Scalars['String']['output'];
};

export type CancelPaymentResult = CancelPaymentError | Payment | PaymentStateTransitionError;

export type Cancellation = Node &
  StockMovement & {
    __typename?: 'Cancellation';
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    orderLine: OrderLine;
    productVariant: ProductVariant;
    quantity: Scalars['Int']['output'];
    type: StockMovementType;
    updatedAt: Scalars['DateTime']['output'];
  };

export type CartItemInput = {
  customLinePrice?: InputMaybe<Scalars['Int']['input']>;
  priceOverrideReason?: InputMaybe<Scalars['String']['input']>;
  quantity: Scalars['Float']['input'];
  variantId: Scalars['ID']['input'];
};

export type CashCountResult = {
  __typename?: 'CashCountResult';
  count: CashDrawerCount;
  hasVariance: Scalars['Boolean']['output'];
  varianceHidden: Scalars['Boolean']['output'];
};

export type CashDrawerCount = {
  __typename?: 'CashDrawerCount';
  channelId: Scalars['Int']['output'];
  countType: Scalars['String']['output'];
  countedByUserId: Scalars['Int']['output'];
  declaredCash: Scalars['String']['output'];
  expectedCash?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  reviewNotes?: Maybe<Scalars['String']['output']>;
  reviewedAt?: Maybe<Scalars['DateTime']['output']>;
  reviewedByUserId?: Maybe<Scalars['Int']['output']>;
  sessionId: Scalars['ID']['output'];
  takenAt: Scalars['DateTime']['output'];
  variance?: Maybe<Scalars['String']['output']>;
  varianceReason?: Maybe<Scalars['String']['output']>;
};

export type CashierSession = {
  __typename?: 'CashierSession';
  cashierUserId: Scalars['Int']['output'];
  channelId: Scalars['Int']['output'];
  closedAt?: Maybe<Scalars['DateTime']['output']>;
  closingDeclared: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  openedAt: Scalars['DateTime']['output'];
  status: Scalars['String']['output'];
};

export type CashierSessionLedgerTotals = {
  __typename?: 'CashierSessionLedgerTotals';
  cashTotal: Scalars['String']['output'];
  mpesaTotal: Scalars['String']['output'];
  totalCollected: Scalars['String']['output'];
};

export type CashierSessionList = {
  __typename?: 'CashierSessionList';
  items: Array<CashierSession>;
  totalItems: Scalars['Int']['output'];
};

export type CashierSessionListOptions = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type CashierSessionSummary = {
  __typename?: 'CashierSessionSummary';
  cashierUserId: Scalars['Int']['output'];
  closedAt?: Maybe<Scalars['DateTime']['output']>;
  closingDeclared: Scalars['String']['output'];
  ledgerTotals: CashierSessionLedgerTotals;
  openedAt: Scalars['DateTime']['output'];
  openingFloat: Scalars['String']['output'];
  sessionId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  variance: Scalars['String']['output'];
};

export type Channel = Node & {
  __typename?: 'Channel';
  availableCurrencyCodes: Array<CurrencyCode>;
  availableLanguageCodes?: Maybe<Array<LanguageCode>>;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  /** @deprecated Use defaultCurrencyCode instead */
  currencyCode: CurrencyCode;
  customFields?: Maybe<ChannelCustomFields>;
  defaultCurrencyCode: CurrencyCode;
  defaultLanguageCode: LanguageCode;
  defaultShippingZone?: Maybe<Zone>;
  defaultTaxZone?: Maybe<Zone>;
  id: Scalars['ID']['output'];
  /** Not yet used - will be implemented in a future release. */
  outOfStockThreshold?: Maybe<Scalars['Int']['output']>;
  pricesIncludeTax: Scalars['Boolean']['output'];
  seller?: Maybe<Seller>;
  token: Scalars['String']['output'];
  /** Not yet used - will be implemented in a future release. */
  trackInventory?: Maybe<Scalars['Boolean']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ChannelCustomFields = {
  __typename?: 'ChannelCustomFields';
  actionCountAuthOtp?: Maybe<Scalars['Int']['output']>;
  actionCountAuthTotal?: Maybe<Scalars['Int']['output']>;
  actionCountCommBalanceChanged?: Maybe<Scalars['Int']['output']>;
  actionCountCommCreditApproved?: Maybe<Scalars['Int']['output']>;
  actionCountCommCustomerCreated?: Maybe<Scalars['Int']['output']>;
  actionCountCommRepaymentDeadline?: Maybe<Scalars['Int']['output']>;
  actionCountCommTotal?: Maybe<Scalars['Int']['output']>;
  actionCountSysAdminCreated?: Maybe<Scalars['Int']['output']>;
  actionCountSysAdminUpdated?: Maybe<Scalars['Int']['output']>;
  actionCountSysMlTrainingCompleted?: Maybe<Scalars['Int']['output']>;
  actionCountSysMlTrainingFailed?: Maybe<Scalars['Int']['output']>;
  actionCountSysMlTrainingProgress?: Maybe<Scalars['Int']['output']>;
  actionCountSysMlTrainingStarted?: Maybe<Scalars['Int']['output']>;
  actionCountSysOrderCancelled?: Maybe<Scalars['Int']['output']>;
  actionCountSysOrderFulfilled?: Maybe<Scalars['Int']['output']>;
  actionCountSysOrderPaymentSettled?: Maybe<Scalars['Int']['output']>;
  actionCountSysPaymentConfirmed?: Maybe<Scalars['Int']['output']>;
  actionCountSysStockLowAlert?: Maybe<Scalars['Int']['output']>;
  actionCountSysTotal?: Maybe<Scalars['Int']['output']>;
  actionCountSysUserCreated?: Maybe<Scalars['Int']['output']>;
  actionCountSysUserUpdated?: Maybe<Scalars['Int']['output']>;
  actionCountTotal?: Maybe<Scalars['Int']['output']>;
  actionTrackingLastResetDate?: Maybe<Scalars['DateTime']['output']>;
  actionTrackingResetType?: Maybe<Scalars['String']['output']>;
  billingCycle?: Maybe<Scalars['String']['output']>;
  cashControlEnabled?: Maybe<Scalars['Boolean']['output']>;
  cashierFlowEnabled?: Maybe<Scalars['Boolean']['output']>;
  companyLogoAsset?: Maybe<Asset>;
  enablePrinter?: Maybe<Scalars['Boolean']['output']>;
  eventConfig?: Maybe<Scalars['String']['output']>;
  lastPaymentAmount?: Maybe<Scalars['Int']['output']>;
  lastPaymentDate?: Maybe<Scalars['DateTime']['output']>;
  maxAdminCount?: Maybe<Scalars['Int']['output']>;
  mlImageCount?: Maybe<Scalars['Int']['output']>;
  mlLastTrainedAt?: Maybe<Scalars['DateTime']['output']>;
  mlMetadataAsset?: Maybe<Asset>;
  mlModelBinAsset?: Maybe<Asset>;
  mlModelJsonAsset?: Maybe<Asset>;
  mlProductCount?: Maybe<Scalars['Int']['output']>;
  mlTrainingError?: Maybe<Scalars['String']['output']>;
  mlTrainingProgress?: Maybe<Scalars['Int']['output']>;
  mlTrainingQueuedAt?: Maybe<Scalars['DateTime']['output']>;
  mlTrainingStartedAt?: Maybe<Scalars['DateTime']['output']>;
  mlTrainingStatus?: Maybe<Scalars['String']['output']>;
  paystackCustomerCode?: Maybe<Scalars['String']['output']>;
  paystackSubscriptionCode?: Maybe<Scalars['String']['output']>;
  requireOpeningCount?: Maybe<Scalars['Boolean']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  subscriptionExpiredReminderSentAt?: Maybe<Scalars['DateTime']['output']>;
  subscriptionExpiresAt?: Maybe<Scalars['DateTime']['output']>;
  subscriptionStartedAt?: Maybe<Scalars['DateTime']['output']>;
  subscriptionStatus?: Maybe<Scalars['String']['output']>;
  subscriptionTier?: Maybe<SubscriptionTier>;
  trialEndsAt?: Maybe<Scalars['DateTime']['output']>;
  varianceNotificationThreshold?: Maybe<Scalars['Int']['output']>;
};

/**
 * Returned when the default LanguageCode of a Channel is no longer found in the `availableLanguages`
 * of the GlobalSettings
 */
export type ChannelDefaultLanguageError = ErrorResult & {
  __typename?: 'ChannelDefaultLanguageError';
  channelCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  language: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ChannelFilterParameter = {
  _and?: InputMaybe<Array<ChannelFilterParameter>>;
  _or?: InputMaybe<Array<ChannelFilterParameter>>;
  actionCountAuthOtp?: InputMaybe<NumberOperators>;
  actionCountAuthTotal?: InputMaybe<NumberOperators>;
  actionCountCommBalanceChanged?: InputMaybe<NumberOperators>;
  actionCountCommCreditApproved?: InputMaybe<NumberOperators>;
  actionCountCommCustomerCreated?: InputMaybe<NumberOperators>;
  actionCountCommRepaymentDeadline?: InputMaybe<NumberOperators>;
  actionCountCommTotal?: InputMaybe<NumberOperators>;
  actionCountSysAdminCreated?: InputMaybe<NumberOperators>;
  actionCountSysAdminUpdated?: InputMaybe<NumberOperators>;
  actionCountSysMlTrainingCompleted?: InputMaybe<NumberOperators>;
  actionCountSysMlTrainingFailed?: InputMaybe<NumberOperators>;
  actionCountSysMlTrainingProgress?: InputMaybe<NumberOperators>;
  actionCountSysMlTrainingStarted?: InputMaybe<NumberOperators>;
  actionCountSysOrderCancelled?: InputMaybe<NumberOperators>;
  actionCountSysOrderFulfilled?: InputMaybe<NumberOperators>;
  actionCountSysOrderPaymentSettled?: InputMaybe<NumberOperators>;
  actionCountSysPaymentConfirmed?: InputMaybe<NumberOperators>;
  actionCountSysStockLowAlert?: InputMaybe<NumberOperators>;
  actionCountSysTotal?: InputMaybe<NumberOperators>;
  actionCountSysUserCreated?: InputMaybe<NumberOperators>;
  actionCountSysUserUpdated?: InputMaybe<NumberOperators>;
  actionCountTotal?: InputMaybe<NumberOperators>;
  actionTrackingLastResetDate?: InputMaybe<DateOperators>;
  actionTrackingResetType?: InputMaybe<StringOperators>;
  billingCycle?: InputMaybe<StringOperators>;
  cashControlEnabled?: InputMaybe<BooleanOperators>;
  cashierFlowEnabled?: InputMaybe<BooleanOperators>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  currencyCode?: InputMaybe<StringOperators>;
  defaultCurrencyCode?: InputMaybe<StringOperators>;
  defaultLanguageCode?: InputMaybe<StringOperators>;
  enablePrinter?: InputMaybe<BooleanOperators>;
  eventConfig?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  lastPaymentAmount?: InputMaybe<NumberOperators>;
  lastPaymentDate?: InputMaybe<DateOperators>;
  maxAdminCount?: InputMaybe<NumberOperators>;
  mlImageCount?: InputMaybe<NumberOperators>;
  mlLastTrainedAt?: InputMaybe<DateOperators>;
  mlProductCount?: InputMaybe<NumberOperators>;
  mlTrainingError?: InputMaybe<StringOperators>;
  mlTrainingProgress?: InputMaybe<NumberOperators>;
  mlTrainingQueuedAt?: InputMaybe<DateOperators>;
  mlTrainingStartedAt?: InputMaybe<DateOperators>;
  mlTrainingStatus?: InputMaybe<StringOperators>;
  outOfStockThreshold?: InputMaybe<NumberOperators>;
  paystackCustomerCode?: InputMaybe<StringOperators>;
  paystackSubscriptionCode?: InputMaybe<StringOperators>;
  pricesIncludeTax?: InputMaybe<BooleanOperators>;
  requireOpeningCount?: InputMaybe<BooleanOperators>;
  status?: InputMaybe<StringOperators>;
  subscriptionExpiredReminderSentAt?: InputMaybe<DateOperators>;
  subscriptionExpiresAt?: InputMaybe<DateOperators>;
  subscriptionStartedAt?: InputMaybe<DateOperators>;
  subscriptionStatus?: InputMaybe<StringOperators>;
  token?: InputMaybe<StringOperators>;
  trackInventory?: InputMaybe<BooleanOperators>;
  trialEndsAt?: InputMaybe<DateOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  varianceNotificationThreshold?: InputMaybe<NumberOperators>;
};

export type ChannelList = PaginatedList & {
  __typename?: 'ChannelList';
  items: Array<Channel>;
  totalItems: Scalars['Int']['output'];
};

export type ChannelListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ChannelFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ChannelSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ChannelSettings = {
  __typename?: 'ChannelSettings';
  cashierFlowEnabled: Scalars['Boolean']['output'];
  companyLogoAsset?: Maybe<Asset>;
  enablePrinter: Scalars['Boolean']['output'];
};

export type ChannelSortParameter = {
  actionCountAuthOtp?: InputMaybe<SortOrder>;
  actionCountAuthTotal?: InputMaybe<SortOrder>;
  actionCountCommBalanceChanged?: InputMaybe<SortOrder>;
  actionCountCommCreditApproved?: InputMaybe<SortOrder>;
  actionCountCommCustomerCreated?: InputMaybe<SortOrder>;
  actionCountCommRepaymentDeadline?: InputMaybe<SortOrder>;
  actionCountCommTotal?: InputMaybe<SortOrder>;
  actionCountSysAdminCreated?: InputMaybe<SortOrder>;
  actionCountSysAdminUpdated?: InputMaybe<SortOrder>;
  actionCountSysMlTrainingCompleted?: InputMaybe<SortOrder>;
  actionCountSysMlTrainingFailed?: InputMaybe<SortOrder>;
  actionCountSysMlTrainingProgress?: InputMaybe<SortOrder>;
  actionCountSysMlTrainingStarted?: InputMaybe<SortOrder>;
  actionCountSysOrderCancelled?: InputMaybe<SortOrder>;
  actionCountSysOrderFulfilled?: InputMaybe<SortOrder>;
  actionCountSysOrderPaymentSettled?: InputMaybe<SortOrder>;
  actionCountSysPaymentConfirmed?: InputMaybe<SortOrder>;
  actionCountSysStockLowAlert?: InputMaybe<SortOrder>;
  actionCountSysTotal?: InputMaybe<SortOrder>;
  actionCountSysUserCreated?: InputMaybe<SortOrder>;
  actionCountSysUserUpdated?: InputMaybe<SortOrder>;
  actionCountTotal?: InputMaybe<SortOrder>;
  actionTrackingLastResetDate?: InputMaybe<SortOrder>;
  actionTrackingResetType?: InputMaybe<SortOrder>;
  billingCycle?: InputMaybe<SortOrder>;
  cashControlEnabled?: InputMaybe<SortOrder>;
  cashierFlowEnabled?: InputMaybe<SortOrder>;
  code?: InputMaybe<SortOrder>;
  companyLogoAsset?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  enablePrinter?: InputMaybe<SortOrder>;
  eventConfig?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastPaymentAmount?: InputMaybe<SortOrder>;
  lastPaymentDate?: InputMaybe<SortOrder>;
  maxAdminCount?: InputMaybe<SortOrder>;
  mlImageCount?: InputMaybe<SortOrder>;
  mlLastTrainedAt?: InputMaybe<SortOrder>;
  mlMetadataAsset?: InputMaybe<SortOrder>;
  mlModelBinAsset?: InputMaybe<SortOrder>;
  mlModelJsonAsset?: InputMaybe<SortOrder>;
  mlProductCount?: InputMaybe<SortOrder>;
  mlTrainingError?: InputMaybe<SortOrder>;
  mlTrainingProgress?: InputMaybe<SortOrder>;
  mlTrainingQueuedAt?: InputMaybe<SortOrder>;
  mlTrainingStartedAt?: InputMaybe<SortOrder>;
  mlTrainingStatus?: InputMaybe<SortOrder>;
  outOfStockThreshold?: InputMaybe<SortOrder>;
  paystackCustomerCode?: InputMaybe<SortOrder>;
  paystackSubscriptionCode?: InputMaybe<SortOrder>;
  requireOpeningCount?: InputMaybe<SortOrder>;
  status?: InputMaybe<SortOrder>;
  subscriptionExpiredReminderSentAt?: InputMaybe<SortOrder>;
  subscriptionExpiresAt?: InputMaybe<SortOrder>;
  subscriptionStartedAt?: InputMaybe<SortOrder>;
  subscriptionStatus?: InputMaybe<SortOrder>;
  subscriptionTier?: InputMaybe<SortOrder>;
  token?: InputMaybe<SortOrder>;
  trialEndsAt?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  varianceNotificationThreshold?: InputMaybe<SortOrder>;
};

export type ChannelSubscription = {
  __typename?: 'ChannelSubscription';
  billingCycle?: Maybe<Scalars['String']['output']>;
  lastPaymentAmount?: Maybe<Scalars['Int']['output']>;
  lastPaymentDate?: Maybe<Scalars['DateTime']['output']>;
  status: Scalars['String']['output'];
  subscriptionExpiresAt?: Maybe<Scalars['DateTime']['output']>;
  subscriptionStartedAt?: Maybe<Scalars['DateTime']['output']>;
  tier?: Maybe<SubscriptionTier>;
  trialEndsAt?: Maybe<Scalars['DateTime']['output']>;
};

export type CloseCashierSessionInput = {
  channelId?: InputMaybe<Scalars['Int']['input']>;
  closingBalances: Array<AccountAmountInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  sessionId: Scalars['ID']['input'];
};

export type ClosedSessionMissingReconciliation = {
  __typename?: 'ClosedSessionMissingReconciliation';
  closedAt: Scalars['DateTime']['output'];
  sessionId: Scalars['ID']['output'];
};

export type Collection = Node & {
  __typename?: 'Collection';
  assets: Array<Asset>;
  breadcrumbs: Array<CollectionBreadcrumb>;
  children?: Maybe<Array<Collection>>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  featuredAsset?: Maybe<Asset>;
  filters: Array<ConfigurableOperation>;
  id: Scalars['ID']['output'];
  inheritFilters: Scalars['Boolean']['output'];
  isPrivate: Scalars['Boolean']['output'];
  languageCode?: Maybe<LanguageCode>;
  name: Scalars['String']['output'];
  parent?: Maybe<Collection>;
  parentId: Scalars['ID']['output'];
  position: Scalars['Int']['output'];
  productVariants: ProductVariantList;
  slug: Scalars['String']['output'];
  translations: Array<CollectionTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type CollectionProductVariantsArgs = {
  options?: InputMaybe<ProductVariantListOptions>;
};

export type CollectionBreadcrumb = {
  __typename?: 'CollectionBreadcrumb';
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type CollectionFilterParameter = {
  _and?: InputMaybe<Array<CollectionFilterParameter>>;
  _or?: InputMaybe<Array<CollectionFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  inheritFilters?: InputMaybe<BooleanOperators>;
  isPrivate?: InputMaybe<BooleanOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  parentId?: InputMaybe<IdOperators>;
  position?: InputMaybe<NumberOperators>;
  slug?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CollectionList = PaginatedList & {
  __typename?: 'CollectionList';
  items: Array<Collection>;
  totalItems: Scalars['Int']['output'];
};

export type CollectionListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CollectionFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CollectionSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
  topLevelOnly?: InputMaybe<Scalars['Boolean']['input']>;
};

/**
 * Which Collections are present in the products returned
 * by the search, and in what quantity.
 */
export type CollectionResult = {
  __typename?: 'CollectionResult';
  collection: Collection;
  count: Scalars['Int']['output'];
};

export type CollectionSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  parentId?: InputMaybe<SortOrder>;
  position?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type CollectionTranslation = {
  __typename?: 'CollectionTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ConfigArg = {
  __typename?: 'ConfigArg';
  name: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type ConfigArgDefinition = {
  __typename?: 'ConfigArgDefinition';
  defaultValue?: Maybe<Scalars['JSON']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  label?: Maybe<Scalars['String']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  required: Scalars['Boolean']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type ConfigArgInput = {
  name: Scalars['String']['input'];
  /** A JSON stringified representation of the actual value */
  value: Scalars['String']['input'];
};

export type ConfigurableOperation = {
  __typename?: 'ConfigurableOperation';
  args: Array<ConfigArg>;
  code: Scalars['String']['output'];
};

export type ConfigurableOperationDefinition = {
  __typename?: 'ConfigurableOperationDefinition';
  args: Array<ConfigArgDefinition>;
  code: Scalars['String']['output'];
  description: Scalars['String']['output'];
};

export type ConfigurableOperationInput = {
  arguments: Array<ConfigArgInput>;
  code: Scalars['String']['input'];
};

export type Coordinate = {
  __typename?: 'Coordinate';
  x: Scalars['Float']['output'];
  y: Scalars['Float']['output'];
};

export type CoordinateInput = {
  x: Scalars['Float']['input'];
  y: Scalars['Float']['input'];
};

/**
 * A Country of the world which your shop operates in.
 *
 * The `code` field is typically a 2-character ISO code such as "GB", "US", "DE" etc. This code is used in certain inputs such as
 * `UpdateAddressInput` and `CreateAddressInput` to specify the country.
 */
export type Country = Node &
  Region & {
    __typename?: 'Country';
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    enabled: Scalars['Boolean']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    parent?: Maybe<Region>;
    parentId?: Maybe<Scalars['ID']['output']>;
    translations: Array<RegionTranslation>;
    type: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
  };

export type CountryFilterParameter = {
  _and?: InputMaybe<Array<CountryFilterParameter>>;
  _or?: InputMaybe<Array<CountryFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  parentId?: InputMaybe<IdOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CountryList = PaginatedList & {
  __typename?: 'CountryList';
  items: Array<Country>;
  totalItems: Scalars['Int']['output'];
};

export type CountryListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CountryFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CountrySortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type CountrySortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  parentId?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type CountryTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeExpiredError = ErrorResult & {
  __typename?: 'CouponCodeExpiredError';
  couponCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeInvalidError = ErrorResult & {
  __typename?: 'CouponCodeInvalidError';
  couponCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeLimitError = ErrorResult & {
  __typename?: 'CouponCodeLimitError';
  couponCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  limit: Scalars['Int']['output'];
  message: Scalars['String']['output'];
};

/**
 * Input used to create an Address.
 *
 * The countryCode must correspond to a `code` property of a Country that has been defined in the
 * Vendure server. The `code` property is typically a 2-character ISO code such as "GB", "US", "DE" etc.
 * If an invalid code is passed, the mutation will fail.
 */
export type CreateAddressInput = {
  city?: InputMaybe<Scalars['String']['input']>;
  company?: InputMaybe<Scalars['String']['input']>;
  countryCode: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  defaultBillingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  defaultShippingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  fullName?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  province?: InputMaybe<Scalars['String']['input']>;
  streetLine1: Scalars['String']['input'];
  streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type CreateAdministratorCustomFieldsInput = {
  profilePictureId?: InputMaybe<Scalars['ID']['input']>;
};

export type CreateAdministratorInput = {
  customFields?: InputMaybe<CreateAdministratorCustomFieldsInput>;
  emailAddress: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  password: Scalars['String']['input'];
  roleIds: Array<Scalars['ID']['input']>;
};

export type CreateApprovalRequestInput = {
  entityId?: InputMaybe<Scalars['String']['input']>;
  entityType?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  type: Scalars['String']['input'];
};

export type CreateAssetInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  file: Scalars['Upload']['input'];
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateAssetResult = Asset | MimeTypeError;

export type CreateChannelAdminInput = {
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  permissionOverrides?: InputMaybe<Array<Scalars['String']['input']>>;
  phoneNumber: Scalars['String']['input'];
  roleTemplateCode: Scalars['String']['input'];
};

export type CreateChannelCustomFieldsInput = {
  actionCountAuthOtp?: InputMaybe<Scalars['Int']['input']>;
  actionCountAuthTotal?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommBalanceChanged?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommCreditApproved?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommCustomerCreated?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommRepaymentDeadline?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommTotal?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysAdminCreated?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysAdminUpdated?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingCompleted?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingFailed?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingProgress?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingStarted?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysOrderCancelled?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysOrderFulfilled?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysOrderPaymentSettled?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysPaymentConfirmed?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysStockLowAlert?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysTotal?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysUserCreated?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysUserUpdated?: InputMaybe<Scalars['Int']['input']>;
  actionCountTotal?: InputMaybe<Scalars['Int']['input']>;
  actionTrackingLastResetDate?: InputMaybe<Scalars['DateTime']['input']>;
  actionTrackingResetType?: InputMaybe<Scalars['String']['input']>;
  billingCycle?: InputMaybe<Scalars['String']['input']>;
  cashControlEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  cashierFlowEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  companyLogoAssetId?: InputMaybe<Scalars['ID']['input']>;
  enablePrinter?: InputMaybe<Scalars['Boolean']['input']>;
  eventConfig?: InputMaybe<Scalars['String']['input']>;
  lastPaymentAmount?: InputMaybe<Scalars['Int']['input']>;
  lastPaymentDate?: InputMaybe<Scalars['DateTime']['input']>;
  maxAdminCount?: InputMaybe<Scalars['Int']['input']>;
  mlImageCount?: InputMaybe<Scalars['Int']['input']>;
  mlLastTrainedAt?: InputMaybe<Scalars['DateTime']['input']>;
  mlMetadataAssetId?: InputMaybe<Scalars['ID']['input']>;
  mlModelBinAssetId?: InputMaybe<Scalars['ID']['input']>;
  mlModelJsonAssetId?: InputMaybe<Scalars['ID']['input']>;
  mlProductCount?: InputMaybe<Scalars['Int']['input']>;
  mlTrainingError?: InputMaybe<Scalars['String']['input']>;
  mlTrainingProgress?: InputMaybe<Scalars['Int']['input']>;
  mlTrainingQueuedAt?: InputMaybe<Scalars['DateTime']['input']>;
  mlTrainingStartedAt?: InputMaybe<Scalars['DateTime']['input']>;
  mlTrainingStatus?: InputMaybe<Scalars['String']['input']>;
  paystackCustomerCode?: InputMaybe<Scalars['String']['input']>;
  paystackSubscriptionCode?: InputMaybe<Scalars['String']['input']>;
  requireOpeningCount?: InputMaybe<Scalars['Boolean']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  subscriptionExpiredReminderSentAt?: InputMaybe<Scalars['DateTime']['input']>;
  subscriptionExpiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  subscriptionStartedAt?: InputMaybe<Scalars['DateTime']['input']>;
  subscriptionStatus?: InputMaybe<Scalars['String']['input']>;
  subscriptionTierId?: InputMaybe<Scalars['ID']['input']>;
  trialEndsAt?: InputMaybe<Scalars['DateTime']['input']>;
  varianceNotificationThreshold?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateChannelInput = {
  availableCurrencyCodes?: InputMaybe<Array<CurrencyCode>>;
  availableLanguageCodes?: InputMaybe<Array<LanguageCode>>;
  code: Scalars['String']['input'];
  customFields?: InputMaybe<CreateChannelCustomFieldsInput>;
  defaultCurrencyCode?: InputMaybe<CurrencyCode>;
  defaultLanguageCode: LanguageCode;
  defaultShippingZoneId: Scalars['ID']['input'];
  defaultTaxZoneId: Scalars['ID']['input'];
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  pricesIncludeTax: Scalars['Boolean']['input'];
  sellerId?: InputMaybe<Scalars['ID']['input']>;
  token: Scalars['String']['input'];
  trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateChannelResult = Channel | LanguageNotAvailableError;

export type CreateCollectionInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  filters: Array<ConfigurableOperationInput>;
  inheritFilters?: InputMaybe<Scalars['Boolean']['input']>;
  isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  translations: Array<CreateCollectionTranslationInput>;
};

export type CreateCollectionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description: Scalars['String']['input'];
  languageCode: LanguageCode;
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};

export type CreateCountryInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled: Scalars['Boolean']['input'];
  translations: Array<CountryTranslationInput>;
};

export type CreateCustomerCustomFieldsInput = {
  contactPerson?: InputMaybe<Scalars['String']['input']>;
  creditApprovedByUserIdId?: InputMaybe<Scalars['ID']['input']>;
  creditDuration?: InputMaybe<Scalars['Int']['input']>;
  creditLimit?: InputMaybe<Scalars['Float']['input']>;
  isCreditApproved?: InputMaybe<Scalars['Boolean']['input']>;
  isSupplier?: InputMaybe<Scalars['Boolean']['input']>;
  isSupplierCreditApproved?: InputMaybe<Scalars['Boolean']['input']>;
  lastRepaymentAmount?: InputMaybe<Scalars['Float']['input']>;
  lastRepaymentDate?: InputMaybe<Scalars['DateTime']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  paymentTerms?: InputMaybe<Scalars['String']['input']>;
  supplierCreditDuration?: InputMaybe<Scalars['Int']['input']>;
  supplierCreditLimit?: InputMaybe<Scalars['Float']['input']>;
  supplierLastRepaymentAmount?: InputMaybe<Scalars['Float']['input']>;
  supplierLastRepaymentDate?: InputMaybe<Scalars['DateTime']['input']>;
  supplierType?: InputMaybe<Scalars['String']['input']>;
  taxId?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCustomerGroupInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  customerIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  name: Scalars['String']['input'];
};

export type CreateCustomerInput = {
  customFields?: InputMaybe<CreateCustomerCustomFieldsInput>;
  emailAddress: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCustomerResult = Customer | EmailAddressConflictError;

export type CreateFacetInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  isPrivate: Scalars['Boolean']['input'];
  translations: Array<FacetTranslationInput>;
  values?: InputMaybe<Array<CreateFacetValueWithFacetInput>>;
};

export type CreateFacetValueInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  facetId: Scalars['ID']['input'];
  translations: Array<FacetValueTranslationInput>;
};

export type CreateFacetValueWithFacetInput = {
  code: Scalars['String']['input'];
  translations: Array<FacetValueTranslationInput>;
};

/** Returned if an error is thrown in a FulfillmentHandler's createFulfillment method */
export type CreateFulfillmentError = ErrorResult & {
  __typename?: 'CreateFulfillmentError';
  errorCode: ErrorCode;
  fulfillmentHandlerError: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CreateGroupOptionInput = {
  code: Scalars['String']['input'];
  translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreateInventoryReconciliationInput = {
  actualBalance: Scalars['String']['input'];
  channelId: Scalars['Int']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  periodEndDate: Scalars['DateTime']['input'];
  stockLocationId?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateOrderCustomFieldsInput = {
  auditCreatedAt?: InputMaybe<Scalars['DateTime']['input']>;
  createdByUserIdId?: InputMaybe<Scalars['ID']['input']>;
  lastModifiedByUserIdId?: InputMaybe<Scalars['ID']['input']>;
  reversedAt?: InputMaybe<Scalars['DateTime']['input']>;
  reversedByUserIdId?: InputMaybe<Scalars['ID']['input']>;
};

export type CreateOrderInput = {
  cartItems: Array<CartItemInput>;
  customFields?: InputMaybe<CreateOrderCustomFieldsInput>;
  customerId?: InputMaybe<Scalars['ID']['input']>;
  isCashierFlow?: InputMaybe<Scalars['Boolean']['input']>;
  isCreditSale?: InputMaybe<Scalars['Boolean']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  paymentMethodCode: Scalars['String']['input'];
};

export type CreatePaymentMethodCustomFieldsInput = {
  imageAssetId?: InputMaybe<Scalars['ID']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  isCashierControlled?: InputMaybe<Scalars['Boolean']['input']>;
  ledgerAccountCode?: InputMaybe<Scalars['String']['input']>;
  reconciliationType?: InputMaybe<Scalars['String']['input']>;
  requiresReconciliation?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreatePaymentMethodInput = {
  checker?: InputMaybe<ConfigurableOperationInput>;
  code: Scalars['String']['input'];
  customFields?: InputMaybe<CreatePaymentMethodCustomFieldsInput>;
  enabled: Scalars['Boolean']['input'];
  handler: ConfigurableOperationInput;
  translations: Array<PaymentMethodTranslationInput>;
};

export type CreateProductCustomFieldsInput = {
  barcode?: InputMaybe<Scalars['String']['input']>;
};

export type CreateProductInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<CreateProductCustomFieldsInput>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  translations: Array<ProductTranslationInput>;
};

export type CreateProductOptionGroupInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  options: Array<CreateGroupOptionInput>;
  translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreateProductOptionInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  productOptionGroupId: Scalars['ID']['input'];
  translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreateProductVariantCustomFieldsInput = {
  allowFractionalQuantity?: InputMaybe<Scalars['Boolean']['input']>;
  wholesalePrice?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateProductVariantInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<CreateProductVariantCustomFieldsInput>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  optionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  price?: InputMaybe<Scalars['Money']['input']>;
  prices?: InputMaybe<Array<InputMaybe<CreateProductVariantPriceInput>>>;
  productId: Scalars['ID']['input'];
  sku: Scalars['String']['input'];
  stockLevels?: InputMaybe<Array<StockLevelInput>>;
  stockOnHand?: InputMaybe<Scalars['Int']['input']>;
  taxCategoryId?: InputMaybe<Scalars['ID']['input']>;
  trackInventory?: InputMaybe<GlobalFlag>;
  translations: Array<ProductVariantTranslationInput>;
  useGlobalOutOfStockThreshold?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateProductVariantOptionInput = {
  code: Scalars['String']['input'];
  optionGroupId: Scalars['ID']['input'];
  translations: Array<ProductOptionTranslationInput>;
};

export type CreateProductVariantPriceInput = {
  currencyCode: CurrencyCode;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  price: Scalars['Money']['input'];
};

export type CreatePromotionInput = {
  actions: Array<ConfigurableOperationInput>;
  conditions: Array<ConfigurableOperationInput>;
  couponCode?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled: Scalars['Boolean']['input'];
  endsAt?: InputMaybe<Scalars['DateTime']['input']>;
  perCustomerUsageLimit?: InputMaybe<Scalars['Int']['input']>;
  startsAt?: InputMaybe<Scalars['DateTime']['input']>;
  translations: Array<PromotionTranslationInput>;
  usageLimit?: InputMaybe<Scalars['Int']['input']>;
};

export type CreatePromotionResult = MissingConditionsError | Promotion;

export type CreateProvinceInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled: Scalars['Boolean']['input'];
  translations: Array<ProvinceTranslationInput>;
};

export type CreateReconciliationInput = {
  actualBalance: Scalars['String']['input'];
  channelId: Scalars['Int']['input'];
  declaredAmounts: Array<DeclaredAmountInput>;
  expectedBalance?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  rangeEnd: Scalars['DateTime']['input'];
  rangeStart: Scalars['DateTime']['input'];
  scope: Scalars['String']['input'];
  scopeRefId: Scalars['String']['input'];
};

export type CreateRoleInput = {
  channelIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  code: Scalars['String']['input'];
  description: Scalars['String']['input'];
  permissions: Array<Permission>;
};

export type CreateSellerInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  name: Scalars['String']['input'];
};

export type CreateShippingMethodInput = {
  calculator: ConfigurableOperationInput;
  checker: ConfigurableOperationInput;
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  fulfillmentHandler: Scalars['String']['input'];
  translations: Array<ShippingMethodTranslationInput>;
};

export type CreateStockLocationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateTagInput = {
  value: Scalars['String']['input'];
};

export type CreateTaxCategoryInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
};

export type CreateTaxRateInput = {
  categoryId: Scalars['ID']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  customerGroupId?: InputMaybe<Scalars['ID']['input']>;
  enabled: Scalars['Boolean']['input'];
  name: Scalars['String']['input'];
  value: Scalars['Float']['input'];
  zoneId: Scalars['ID']['input'];
};

export type CreateZoneInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  memberIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  name: Scalars['String']['input'];
};

/** All monetary amounts in CreditSummary are in smallest currency unit (cents) */
export type CreditSummary = {
  __typename?: 'CreditSummary';
  availableCredit: Scalars['Float']['output'];
  creditDuration: Scalars['Int']['output'];
  creditFrozen: Scalars['Boolean']['output'];
  creditLimit: Scalars['Float']['output'];
  customerId: Scalars['ID']['output'];
  isCreditApproved: Scalars['Boolean']['output'];
  lastRepaymentAmount: Scalars['Float']['output'];
  lastRepaymentDate?: Maybe<Scalars['DateTime']['output']>;
  outstandingAmount: Scalars['Float']['output'];
};

export type CreditValidationResult = {
  __typename?: 'CreditValidationResult';
  availableCredit: Scalars['Float']['output'];
  error?: Maybe<Scalars['String']['output']>;
  estimatedOrderTotal: Scalars['Float']['output'];
  isValid: Scalars['Boolean']['output'];
  wouldExceedLimit: Scalars['Boolean']['output'];
};

/**
 * @description
 * ISO 4217 currency code
 *
 * @docsCategory common
 */
export enum CurrencyCode {
  /** United Arab Emirates dirham */
  AED = 'AED',
  /** Afghan afghani */
  AFN = 'AFN',
  /** Albanian lek */
  ALL = 'ALL',
  /** Armenian dram */
  AMD = 'AMD',
  /** Netherlands Antillean guilder */
  ANG = 'ANG',
  /** Angolan kwanza */
  AOA = 'AOA',
  /** Argentine peso */
  ARS = 'ARS',
  /** Australian dollar */
  AUD = 'AUD',
  /** Aruban florin */
  AWG = 'AWG',
  /** Azerbaijani manat */
  AZN = 'AZN',
  /** Bosnia and Herzegovina convertible mark */
  BAM = 'BAM',
  /** Barbados dollar */
  BBD = 'BBD',
  /** Bangladeshi taka */
  BDT = 'BDT',
  /** Bulgarian lev */
  BGN = 'BGN',
  /** Bahraini dinar */
  BHD = 'BHD',
  /** Burundian franc */
  BIF = 'BIF',
  /** Bermudian dollar */
  BMD = 'BMD',
  /** Brunei dollar */
  BND = 'BND',
  /** Boliviano */
  BOB = 'BOB',
  /** Brazilian real */
  BRL = 'BRL',
  /** Bahamian dollar */
  BSD = 'BSD',
  /** Bhutanese ngultrum */
  BTN = 'BTN',
  /** Botswana pula */
  BWP = 'BWP',
  /** Belarusian ruble */
  BYN = 'BYN',
  /** Belize dollar */
  BZD = 'BZD',
  /** Canadian dollar */
  CAD = 'CAD',
  /** Congolese franc */
  CDF = 'CDF',
  /** Swiss franc */
  CHF = 'CHF',
  /** Chilean peso */
  CLP = 'CLP',
  /** Renminbi (Chinese) yuan */
  CNY = 'CNY',
  /** Colombian peso */
  COP = 'COP',
  /** Costa Rican colon */
  CRC = 'CRC',
  /** Cuban convertible peso */
  CUC = 'CUC',
  /** Cuban peso */
  CUP = 'CUP',
  /** Cape Verde escudo */
  CVE = 'CVE',
  /** Czech koruna */
  CZK = 'CZK',
  /** Djiboutian franc */
  DJF = 'DJF',
  /** Danish krone */
  DKK = 'DKK',
  /** Dominican peso */
  DOP = 'DOP',
  /** Algerian dinar */
  DZD = 'DZD',
  /** Egyptian pound */
  EGP = 'EGP',
  /** Eritrean nakfa */
  ERN = 'ERN',
  /** Ethiopian birr */
  ETB = 'ETB',
  /** Euro */
  EUR = 'EUR',
  /** Fiji dollar */
  FJD = 'FJD',
  /** Falkland Islands pound */
  FKP = 'FKP',
  /** Pound sterling */
  GBP = 'GBP',
  /** Georgian lari */
  GEL = 'GEL',
  /** Ghanaian cedi */
  GHS = 'GHS',
  /** Gibraltar pound */
  GIP = 'GIP',
  /** Gambian dalasi */
  GMD = 'GMD',
  /** Guinean franc */
  GNF = 'GNF',
  /** Guatemalan quetzal */
  GTQ = 'GTQ',
  /** Guyanese dollar */
  GYD = 'GYD',
  /** Hong Kong dollar */
  HKD = 'HKD',
  /** Honduran lempira */
  HNL = 'HNL',
  /** Croatian kuna */
  HRK = 'HRK',
  /** Haitian gourde */
  HTG = 'HTG',
  /** Hungarian forint */
  HUF = 'HUF',
  /** Indonesian rupiah */
  IDR = 'IDR',
  /** Israeli new shekel */
  ILS = 'ILS',
  /** Indian rupee */
  INR = 'INR',
  /** Iraqi dinar */
  IQD = 'IQD',
  /** Iranian rial */
  IRR = 'IRR',
  /** Icelandic króna */
  ISK = 'ISK',
  /** Jamaican dollar */
  JMD = 'JMD',
  /** Jordanian dinar */
  JOD = 'JOD',
  /** Japanese yen */
  JPY = 'JPY',
  /** Kenyan shilling */
  KES = 'KES',
  /** Kyrgyzstani som */
  KGS = 'KGS',
  /** Cambodian riel */
  KHR = 'KHR',
  /** Comoro franc */
  KMF = 'KMF',
  /** North Korean won */
  KPW = 'KPW',
  /** South Korean won */
  KRW = 'KRW',
  /** Kuwaiti dinar */
  KWD = 'KWD',
  /** Cayman Islands dollar */
  KYD = 'KYD',
  /** Kazakhstani tenge */
  KZT = 'KZT',
  /** Lao kip */
  LAK = 'LAK',
  /** Lebanese pound */
  LBP = 'LBP',
  /** Sri Lankan rupee */
  LKR = 'LKR',
  /** Liberian dollar */
  LRD = 'LRD',
  /** Lesotho loti */
  LSL = 'LSL',
  /** Libyan dinar */
  LYD = 'LYD',
  /** Moroccan dirham */
  MAD = 'MAD',
  /** Moldovan leu */
  MDL = 'MDL',
  /** Malagasy ariary */
  MGA = 'MGA',
  /** Macedonian denar */
  MKD = 'MKD',
  /** Myanmar kyat */
  MMK = 'MMK',
  /** Mongolian tögrög */
  MNT = 'MNT',
  /** Macanese pataca */
  MOP = 'MOP',
  /** Mauritanian ouguiya */
  MRU = 'MRU',
  /** Mauritian rupee */
  MUR = 'MUR',
  /** Maldivian rufiyaa */
  MVR = 'MVR',
  /** Malawian kwacha */
  MWK = 'MWK',
  /** Mexican peso */
  MXN = 'MXN',
  /** Malaysian ringgit */
  MYR = 'MYR',
  /** Mozambican metical */
  MZN = 'MZN',
  /** Namibian dollar */
  NAD = 'NAD',
  /** Nigerian naira */
  NGN = 'NGN',
  /** Nicaraguan córdoba */
  NIO = 'NIO',
  /** Norwegian krone */
  NOK = 'NOK',
  /** Nepalese rupee */
  NPR = 'NPR',
  /** New Zealand dollar */
  NZD = 'NZD',
  /** Omani rial */
  OMR = 'OMR',
  /** Panamanian balboa */
  PAB = 'PAB',
  /** Peruvian sol */
  PEN = 'PEN',
  /** Papua New Guinean kina */
  PGK = 'PGK',
  /** Philippine peso */
  PHP = 'PHP',
  /** Pakistani rupee */
  PKR = 'PKR',
  /** Polish złoty */
  PLN = 'PLN',
  /** Paraguayan guaraní */
  PYG = 'PYG',
  /** Qatari riyal */
  QAR = 'QAR',
  /** Romanian leu */
  RON = 'RON',
  /** Serbian dinar */
  RSD = 'RSD',
  /** Russian ruble */
  RUB = 'RUB',
  /** Rwandan franc */
  RWF = 'RWF',
  /** Saudi riyal */
  SAR = 'SAR',
  /** Solomon Islands dollar */
  SBD = 'SBD',
  /** Seychelles rupee */
  SCR = 'SCR',
  /** Sudanese pound */
  SDG = 'SDG',
  /** Swedish krona/kronor */
  SEK = 'SEK',
  /** Singapore dollar */
  SGD = 'SGD',
  /** Saint Helena pound */
  SHP = 'SHP',
  /** Sierra Leonean leone */
  SLL = 'SLL',
  /** Somali shilling */
  SOS = 'SOS',
  /** Surinamese dollar */
  SRD = 'SRD',
  /** South Sudanese pound */
  SSP = 'SSP',
  /** São Tomé and Príncipe dobra */
  STN = 'STN',
  /** Salvadoran colón */
  SVC = 'SVC',
  /** Syrian pound */
  SYP = 'SYP',
  /** Swazi lilangeni */
  SZL = 'SZL',
  /** Thai baht */
  THB = 'THB',
  /** Tajikistani somoni */
  TJS = 'TJS',
  /** Turkmenistan manat */
  TMT = 'TMT',
  /** Tunisian dinar */
  TND = 'TND',
  /** Tongan paʻanga */
  TOP = 'TOP',
  /** Turkish lira */
  TRY = 'TRY',
  /** Trinidad and Tobago dollar */
  TTD = 'TTD',
  /** New Taiwan dollar */
  TWD = 'TWD',
  /** Tanzanian shilling */
  TZS = 'TZS',
  /** Ukrainian hryvnia */
  UAH = 'UAH',
  /** Ugandan shilling */
  UGX = 'UGX',
  /** United States dollar */
  USD = 'USD',
  /** Uruguayan peso */
  UYU = 'UYU',
  /** Uzbekistan som */
  UZS = 'UZS',
  /** Venezuelan bolívar soberano */
  VES = 'VES',
  /** Vietnamese đồng */
  VND = 'VND',
  /** Vanuatu vatu */
  VUV = 'VUV',
  /** Samoan tala */
  WST = 'WST',
  /** CFA franc BEAC */
  XAF = 'XAF',
  /** East Caribbean dollar */
  XCD = 'XCD',
  /** CFA franc BCEAO */
  XOF = 'XOF',
  /** CFP franc (franc Pacifique) */
  XPF = 'XPF',
  /** Yemeni rial */
  YER = 'YER',
  /** South African rand */
  ZAR = 'ZAR',
  /** Zambian kwacha */
  ZMW = 'ZMW',
  /** Zimbabwean dollar */
  ZWL = 'ZWL',
}

export type CurrentUser = {
  __typename?: 'CurrentUser';
  channels: Array<CurrentUserChannel>;
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
};

export type CurrentUserChannel = {
  __typename?: 'CurrentUserChannel';
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  permissions: Array<Permission>;
  token: Scalars['String']['output'];
};

export type CustomField = {
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type CustomFieldConfig =
  | BooleanCustomFieldConfig
  | DateTimeCustomFieldConfig
  | FloatCustomFieldConfig
  | IntCustomFieldConfig
  | LocaleStringCustomFieldConfig
  | LocaleTextCustomFieldConfig
  | RelationCustomFieldConfig
  | StringCustomFieldConfig
  | StructCustomFieldConfig
  | TextCustomFieldConfig;

/**
 * This type is deprecated in v2.2 in favor of the EntityCustomFields type,
 * which allows custom fields to be defined on user-supplied entities.
 */
export type CustomFields = {
  __typename?: 'CustomFields';
  Address: Array<CustomFieldConfig>;
  Administrator: Array<CustomFieldConfig>;
  Asset: Array<CustomFieldConfig>;
  Channel: Array<CustomFieldConfig>;
  Collection: Array<CustomFieldConfig>;
  Customer: Array<CustomFieldConfig>;
  CustomerGroup: Array<CustomFieldConfig>;
  Facet: Array<CustomFieldConfig>;
  FacetValue: Array<CustomFieldConfig>;
  Fulfillment: Array<CustomFieldConfig>;
  GlobalSettings: Array<CustomFieldConfig>;
  HistoryEntry: Array<CustomFieldConfig>;
  Order: Array<CustomFieldConfig>;
  OrderLine: Array<CustomFieldConfig>;
  Payment: Array<CustomFieldConfig>;
  PaymentMethod: Array<CustomFieldConfig>;
  Product: Array<CustomFieldConfig>;
  ProductOption: Array<CustomFieldConfig>;
  ProductOptionGroup: Array<CustomFieldConfig>;
  ProductVariant: Array<CustomFieldConfig>;
  ProductVariantPrice: Array<CustomFieldConfig>;
  Promotion: Array<CustomFieldConfig>;
  Refund: Array<CustomFieldConfig>;
  Region: Array<CustomFieldConfig>;
  Seller: Array<CustomFieldConfig>;
  Session: Array<CustomFieldConfig>;
  ShippingLine: Array<CustomFieldConfig>;
  ShippingMethod: Array<CustomFieldConfig>;
  StockLevel: Array<CustomFieldConfig>;
  StockLocation: Array<CustomFieldConfig>;
  StockMovement: Array<CustomFieldConfig>;
  TaxCategory: Array<CustomFieldConfig>;
  TaxRate: Array<CustomFieldConfig>;
  User: Array<CustomFieldConfig>;
  Zone: Array<CustomFieldConfig>;
};

export type Customer = Node & {
  __typename?: 'Customer';
  addresses?: Maybe<Array<Address>>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<CustomerCustomFields>;
  emailAddress: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  groups: Array<CustomerGroup>;
  history: HistoryEntryList;
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
  orders: OrderList;
  outstandingAmount: Scalars['Float']['output'];
  phoneNumber?: Maybe<Scalars['String']['output']>;
  /** Supplier balance (AP). Only non-zero when customer is a supplier. Cents. */
  supplierOutstandingAmount: Scalars['Float']['output'];
  title?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  user?: Maybe<User>;
};

export type CustomerHistoryArgs = {
  options?: InputMaybe<HistoryEntryListOptions>;
};

export type CustomerOrdersArgs = {
  options?: InputMaybe<OrderListOptions>;
};

export type CustomerCustomFields = {
  __typename?: 'CustomerCustomFields';
  contactPerson?: Maybe<Scalars['String']['output']>;
  creditApprovedByUserId?: Maybe<User>;
  creditDuration?: Maybe<Scalars['Int']['output']>;
  creditLimit?: Maybe<Scalars['Float']['output']>;
  isCreditApproved?: Maybe<Scalars['Boolean']['output']>;
  isSupplier?: Maybe<Scalars['Boolean']['output']>;
  isSupplierCreditApproved?: Maybe<Scalars['Boolean']['output']>;
  lastRepaymentAmount?: Maybe<Scalars['Float']['output']>;
  lastRepaymentDate?: Maybe<Scalars['DateTime']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  paymentTerms?: Maybe<Scalars['String']['output']>;
  supplierCreditDuration?: Maybe<Scalars['Int']['output']>;
  supplierCreditLimit?: Maybe<Scalars['Float']['output']>;
  supplierLastRepaymentAmount?: Maybe<Scalars['Float']['output']>;
  supplierLastRepaymentDate?: Maybe<Scalars['DateTime']['output']>;
  supplierType?: Maybe<Scalars['String']['output']>;
  taxId?: Maybe<Scalars['String']['output']>;
};

export type CustomerFilterParameter = {
  _and?: InputMaybe<Array<CustomerFilterParameter>>;
  _or?: InputMaybe<Array<CustomerFilterParameter>>;
  contactPerson?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  creditDuration?: InputMaybe<NumberOperators>;
  creditLimit?: InputMaybe<NumberOperators>;
  emailAddress?: InputMaybe<StringOperators>;
  firstName?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  isCreditApproved?: InputMaybe<BooleanOperators>;
  isSupplier?: InputMaybe<BooleanOperators>;
  isSupplierCreditApproved?: InputMaybe<BooleanOperators>;
  lastName?: InputMaybe<StringOperators>;
  lastRepaymentAmount?: InputMaybe<NumberOperators>;
  lastRepaymentDate?: InputMaybe<DateOperators>;
  notes?: InputMaybe<StringOperators>;
  outstandingAmount?: InputMaybe<NumberOperators>;
  paymentTerms?: InputMaybe<StringOperators>;
  phoneNumber?: InputMaybe<StringOperators>;
  postalCode?: InputMaybe<StringOperators>;
  supplierCreditDuration?: InputMaybe<NumberOperators>;
  supplierCreditLimit?: InputMaybe<NumberOperators>;
  supplierLastRepaymentAmount?: InputMaybe<NumberOperators>;
  supplierLastRepaymentDate?: InputMaybe<DateOperators>;
  supplierOutstandingAmount?: InputMaybe<NumberOperators>;
  supplierType?: InputMaybe<StringOperators>;
  taxId?: InputMaybe<StringOperators>;
  title?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CustomerGroup = Node & {
  __typename?: 'CustomerGroup';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  customers: CustomerList;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CustomerGroupCustomersArgs = {
  options?: InputMaybe<CustomerListOptions>;
};

export type CustomerGroupFilterParameter = {
  _and?: InputMaybe<Array<CustomerGroupFilterParameter>>;
  _or?: InputMaybe<Array<CustomerGroupFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CustomerGroupList = PaginatedList & {
  __typename?: 'CustomerGroupList';
  items: Array<CustomerGroup>;
  totalItems: Scalars['Int']['output'];
};

export type CustomerGroupListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CustomerGroupFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CustomerGroupSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type CustomerGroupSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type CustomerList = PaginatedList & {
  __typename?: 'CustomerList';
  items: Array<Customer>;
  totalItems: Scalars['Int']['output'];
};

export type CustomerListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CustomerFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CustomerSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type CustomerSortParameter = {
  contactPerson?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  creditApprovedByUserId?: InputMaybe<SortOrder>;
  creditDuration?: InputMaybe<SortOrder>;
  creditLimit?: InputMaybe<SortOrder>;
  emailAddress?: InputMaybe<SortOrder>;
  firstName?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  isCreditApproved?: InputMaybe<SortOrder>;
  isSupplier?: InputMaybe<SortOrder>;
  isSupplierCreditApproved?: InputMaybe<SortOrder>;
  lastName?: InputMaybe<SortOrder>;
  lastRepaymentAmount?: InputMaybe<SortOrder>;
  lastRepaymentDate?: InputMaybe<SortOrder>;
  notes?: InputMaybe<SortOrder>;
  outstandingAmount?: InputMaybe<SortOrder>;
  paymentTerms?: InputMaybe<SortOrder>;
  phoneNumber?: InputMaybe<SortOrder>;
  supplierCreditDuration?: InputMaybe<SortOrder>;
  supplierCreditLimit?: InputMaybe<SortOrder>;
  supplierLastRepaymentAmount?: InputMaybe<SortOrder>;
  supplierLastRepaymentDate?: InputMaybe<SortOrder>;
  supplierOutstandingAmount?: InputMaybe<SortOrder>;
  supplierType?: InputMaybe<SortOrder>;
  taxId?: InputMaybe<SortOrder>;
  title?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type DashboardStats = {
  __typename?: 'DashboardStats';
  expenses: PeriodStats;
  purchases: PeriodStats;
  sales: PeriodStats;
};

/** Operators for filtering on a list of Date fields */
export type DateListOperators = {
  inList: Scalars['DateTime']['input'];
};

/** Operators for filtering on a DateTime field */
export type DateOperators = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
  between?: InputMaybe<DateRange>;
  eq?: InputMaybe<Scalars['DateTime']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DateRange = {
  end: Scalars['DateTime']['input'];
  start: Scalars['DateTime']['input'];
};

/**
 * Expects the same validation formats as the `<input type="datetime-local">` HTML element.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#Additional_attributes
 */
export type DateTimeCustomFieldConfig = CustomField & {
  __typename?: 'DateTimeCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['String']['output']>;
  min?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

/**
 * Expects the same validation formats as the `<input type="datetime-local">` HTML element.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#Additional_attributes
 */
export type DateTimeStructFieldConfig = StructField & {
  __typename?: 'DateTimeStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['String']['output']>;
  min?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type DeclaredAmountInput = {
  accountCode: Scalars['String']['input'];
  amountCents: Scalars['String']['input'];
};

export type DeleteAssetInput = {
  assetId: Scalars['ID']['input'];
  deleteFromAllChannels?: InputMaybe<Scalars['Boolean']['input']>;
  force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DeleteAssetsInput = {
  assetIds: Array<Scalars['ID']['input']>;
  deleteFromAllChannels?: InputMaybe<Scalars['Boolean']['input']>;
  force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DeleteStockLocationInput = {
  id: Scalars['ID']['input'];
  transferToLocationId?: InputMaybe<Scalars['ID']['input']>;
};

export type DeletionResponse = {
  __typename?: 'DeletionResponse';
  message?: Maybe<Scalars['String']['output']>;
  result: DeletionResult;
};

export enum DeletionResult {
  /** The entity was successfully deleted */
  DELETED = 'DELETED',
  /** Deletion did not take place, reason given in message */
  NOT_DELETED = 'NOT_DELETED',
}

export type DisableChannelAdminResponse = {
  __typename?: 'DisableChannelAdminResponse';
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type Discount = {
  __typename?: 'Discount';
  adjustmentSource: Scalars['String']['output'];
  amount: Scalars['Money']['output'];
  amountWithTax: Scalars['Money']['output'];
  description: Scalars['String']['output'];
  type: AdjustmentType;
};

export type DuplicateEntityError = ErrorResult & {
  __typename?: 'DuplicateEntityError';
  duplicationError: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type DuplicateEntityInput = {
  duplicatorInput: ConfigurableOperationInput;
  entityId: Scalars['ID']['input'];
  entityName: Scalars['String']['input'];
};

export type DuplicateEntityResult = DuplicateEntityError | DuplicateEntitySuccess;

export type DuplicateEntitySuccess = {
  __typename?: 'DuplicateEntitySuccess';
  newEntityId: Scalars['ID']['output'];
};

/** Returned when attempting to create a Customer with an email address already registered to an existing User. */
export type EmailAddressConflictError = ErrorResult & {
  __typename?: 'EmailAddressConflictError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if no OrderLines have been specified for the operation */
export type EmptyOrderLineSelectionError = ErrorResult & {
  __typename?: 'EmptyOrderLineSelectionError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type EntityCustomFields = {
  __typename?: 'EntityCustomFields';
  customFields: Array<CustomFieldConfig>;
  entityName: Scalars['String']['output'];
};

export type EntityDuplicatorDefinition = {
  __typename?: 'EntityDuplicatorDefinition';
  args: Array<ConfigArgDefinition>;
  code: Scalars['String']['output'];
  description: Scalars['String']['output'];
  forEntities: Array<Scalars['String']['output']>;
  requiresPermission: Array<Permission>;
};

export type Error = {
  __typename?: 'Error';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export enum ErrorCode {
  ALREADY_REFUNDED_ERROR = 'ALREADY_REFUNDED_ERROR',
  CANCEL_ACTIVE_ORDER_ERROR = 'CANCEL_ACTIVE_ORDER_ERROR',
  CANCEL_PAYMENT_ERROR = 'CANCEL_PAYMENT_ERROR',
  CHANNEL_DEFAULT_LANGUAGE_ERROR = 'CHANNEL_DEFAULT_LANGUAGE_ERROR',
  COUPON_CODE_EXPIRED_ERROR = 'COUPON_CODE_EXPIRED_ERROR',
  COUPON_CODE_INVALID_ERROR = 'COUPON_CODE_INVALID_ERROR',
  COUPON_CODE_LIMIT_ERROR = 'COUPON_CODE_LIMIT_ERROR',
  CREATE_FULFILLMENT_ERROR = 'CREATE_FULFILLMENT_ERROR',
  DUPLICATE_ENTITY_ERROR = 'DUPLICATE_ENTITY_ERROR',
  EMAIL_ADDRESS_CONFLICT_ERROR = 'EMAIL_ADDRESS_CONFLICT_ERROR',
  EMPTY_ORDER_LINE_SELECTION_ERROR = 'EMPTY_ORDER_LINE_SELECTION_ERROR',
  FACET_IN_USE_ERROR = 'FACET_IN_USE_ERROR',
  FULFILLMENT_STATE_TRANSITION_ERROR = 'FULFILLMENT_STATE_TRANSITION_ERROR',
  GUEST_CHECKOUT_ERROR = 'GUEST_CHECKOUT_ERROR',
  INELIGIBLE_SHIPPING_METHOD_ERROR = 'INELIGIBLE_SHIPPING_METHOD_ERROR',
  INSUFFICIENT_STOCK_ERROR = 'INSUFFICIENT_STOCK_ERROR',
  INSUFFICIENT_STOCK_ON_HAND_ERROR = 'INSUFFICIENT_STOCK_ON_HAND_ERROR',
  INVALID_CREDENTIALS_ERROR = 'INVALID_CREDENTIALS_ERROR',
  INVALID_FULFILLMENT_HANDLER_ERROR = 'INVALID_FULFILLMENT_HANDLER_ERROR',
  ITEMS_ALREADY_FULFILLED_ERROR = 'ITEMS_ALREADY_FULFILLED_ERROR',
  LANGUAGE_NOT_AVAILABLE_ERROR = 'LANGUAGE_NOT_AVAILABLE_ERROR',
  MANUAL_PAYMENT_STATE_ERROR = 'MANUAL_PAYMENT_STATE_ERROR',
  MIME_TYPE_ERROR = 'MIME_TYPE_ERROR',
  MISSING_CONDITIONS_ERROR = 'MISSING_CONDITIONS_ERROR',
  MULTIPLE_ORDER_ERROR = 'MULTIPLE_ORDER_ERROR',
  NATIVE_AUTH_STRATEGY_ERROR = 'NATIVE_AUTH_STRATEGY_ERROR',
  NEGATIVE_QUANTITY_ERROR = 'NEGATIVE_QUANTITY_ERROR',
  NOTHING_TO_REFUND_ERROR = 'NOTHING_TO_REFUND_ERROR',
  NO_ACTIVE_ORDER_ERROR = 'NO_ACTIVE_ORDER_ERROR',
  NO_CHANGES_SPECIFIED_ERROR = 'NO_CHANGES_SPECIFIED_ERROR',
  ORDER_INTERCEPTOR_ERROR = 'ORDER_INTERCEPTOR_ERROR',
  ORDER_LIMIT_ERROR = 'ORDER_LIMIT_ERROR',
  ORDER_MODIFICATION_ERROR = 'ORDER_MODIFICATION_ERROR',
  ORDER_MODIFICATION_STATE_ERROR = 'ORDER_MODIFICATION_STATE_ERROR',
  ORDER_STATE_TRANSITION_ERROR = 'ORDER_STATE_TRANSITION_ERROR',
  PAYMENT_METHOD_MISSING_ERROR = 'PAYMENT_METHOD_MISSING_ERROR',
  PAYMENT_ORDER_MISMATCH_ERROR = 'PAYMENT_ORDER_MISMATCH_ERROR',
  PAYMENT_STATE_TRANSITION_ERROR = 'PAYMENT_STATE_TRANSITION_ERROR',
  PRODUCT_OPTION_IN_USE_ERROR = 'PRODUCT_OPTION_IN_USE_ERROR',
  QUANTITY_TOO_GREAT_ERROR = 'QUANTITY_TOO_GREAT_ERROR',
  REFUND_AMOUNT_ERROR = 'REFUND_AMOUNT_ERROR',
  REFUND_ORDER_STATE_ERROR = 'REFUND_ORDER_STATE_ERROR',
  REFUND_PAYMENT_ID_MISSING_ERROR = 'REFUND_PAYMENT_ID_MISSING_ERROR',
  REFUND_STATE_TRANSITION_ERROR = 'REFUND_STATE_TRANSITION_ERROR',
  SETTLE_PAYMENT_ERROR = 'SETTLE_PAYMENT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export type ErrorResult = {
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type ExpectedClosingBalance = {
  __typename?: 'ExpectedClosingBalance';
  accountCode: Scalars['String']['output'];
  accountName: Scalars['String']['output'];
  expectedBalanceCents: Scalars['String']['output'];
};

export type Facet = Node & {
  __typename?: 'Facet';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  isPrivate: Scalars['Boolean']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<FacetTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  /** Returns a paginated, sortable, filterable list of the Facet's values. Added in v2.1.0. */
  valueList: FacetValueList;
  values: Array<FacetValue>;
};

export type FacetValueListArgs = {
  options?: InputMaybe<FacetValueListOptions>;
};

export type FacetFilterParameter = {
  _and?: InputMaybe<Array<FacetFilterParameter>>;
  _or?: InputMaybe<Array<FacetFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  isPrivate?: InputMaybe<BooleanOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type FacetInUseError = ErrorResult & {
  __typename?: 'FacetInUseError';
  errorCode: ErrorCode;
  facetCode: Scalars['String']['output'];
  message: Scalars['String']['output'];
  productCount: Scalars['Int']['output'];
  variantCount: Scalars['Int']['output'];
};

export type FacetList = PaginatedList & {
  __typename?: 'FacetList';
  items: Array<Facet>;
  totalItems: Scalars['Int']['output'];
};

export type FacetListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<FacetFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<FacetSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type FacetSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type FacetTranslation = {
  __typename?: 'FacetTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type FacetTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type FacetValue = Node & {
  __typename?: 'FacetValue';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  facet: Facet;
  facetId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<FacetValueTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

/**
 * Used to construct boolean expressions for filtering search results
 * by FacetValue ID. Examples:
 *
 * * ID=1 OR ID=2: `{ facetValueFilters: [{ or: [1,2] }] }`
 * * ID=1 AND ID=2: `{ facetValueFilters: [{ and: 1 }, { and: 2 }] }`
 * * ID=1 AND (ID=2 OR ID=3): `{ facetValueFilters: [{ and: 1 }, { or: [2,3] }] }`
 */
export type FacetValueFilterInput = {
  and?: InputMaybe<Scalars['ID']['input']>;
  or?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type FacetValueFilterParameter = {
  _and?: InputMaybe<Array<FacetValueFilterParameter>>;
  _or?: InputMaybe<Array<FacetValueFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  facetId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type FacetValueList = PaginatedList & {
  __typename?: 'FacetValueList';
  items: Array<FacetValue>;
  totalItems: Scalars['Int']['output'];
};

export type FacetValueListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<FacetValueFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<FacetValueSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Which FacetValues are present in the products returned
 * by the search, and in what quantity.
 */
export type FacetValueResult = {
  __typename?: 'FacetValueResult';
  count: Scalars['Int']['output'];
  facetValue: FacetValue;
};

export type FacetValueSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  facetId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type FacetValueTranslation = {
  __typename?: 'FacetValueTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type FacetValueTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type FloatCustomFieldConfig = CustomField & {
  __typename?: 'FloatCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Float']['output']>;
  min?: Maybe<Scalars['Float']['output']>;
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  step?: Maybe<Scalars['Float']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type FloatStructFieldConfig = StructField & {
  __typename?: 'FloatStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Float']['output']>;
  min?: Maybe<Scalars['Float']['output']>;
  name: Scalars['String']['output'];
  step?: Maybe<Scalars['Float']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type FulfillOrderInput = {
  handler: ConfigurableOperationInput;
  lines: Array<OrderLineInput>;
};

export type Fulfillment = Node & {
  __typename?: 'Fulfillment';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  lines: Array<FulfillmentLine>;
  method: Scalars['String']['output'];
  nextStates: Array<Scalars['String']['output']>;
  state: Scalars['String']['output'];
  /** @deprecated Use the `lines` field instead */
  summary: Array<FulfillmentLine>;
  trackingCode?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type FulfillmentLine = {
  __typename?: 'FulfillmentLine';
  fulfillment: Fulfillment;
  fulfillmentId: Scalars['ID']['output'];
  orderLine: OrderLine;
  orderLineId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
};

/** Returned when there is an error in transitioning the Fulfillment state */
export type FulfillmentStateTransitionError = ErrorResult & {
  __typename?: 'FulfillmentStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

export enum GlobalFlag {
  FALSE = 'FALSE',
  INHERIT = 'INHERIT',
  TRUE = 'TRUE',
}

export type GlobalSettings = {
  __typename?: 'GlobalSettings';
  availableLanguages: Array<LanguageCode>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  outOfStockThreshold: Scalars['Int']['output'];
  serverConfig: ServerConfig;
  trackInventory: Scalars['Boolean']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned when attempting to set the Customer on a guest checkout when the configured GuestCheckoutStrategy does not allow it. */
export type GuestCheckoutError = ErrorResult & {
  __typename?: 'GuestCheckoutError';
  errorCode: ErrorCode;
  errorDetail: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type HistoryEntry = Node & {
  __typename?: 'HistoryEntry';
  administrator?: Maybe<Administrator>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  data: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  isPublic: Scalars['Boolean']['output'];
  type: HistoryEntryType;
  updatedAt: Scalars['DateTime']['output'];
};

export type HistoryEntryFilterParameter = {
  _and?: InputMaybe<Array<HistoryEntryFilterParameter>>;
  _or?: InputMaybe<Array<HistoryEntryFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  isPublic?: InputMaybe<BooleanOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type HistoryEntryList = PaginatedList & {
  __typename?: 'HistoryEntryList';
  items: Array<HistoryEntry>;
  totalItems: Scalars['Int']['output'];
};

export type HistoryEntryListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<HistoryEntryFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<HistoryEntrySortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type HistoryEntrySortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export enum HistoryEntryType {
  CUSTOMER_ADDED_TO_GROUP = 'CUSTOMER_ADDED_TO_GROUP',
  CUSTOMER_ADDRESS_CREATED = 'CUSTOMER_ADDRESS_CREATED',
  CUSTOMER_ADDRESS_DELETED = 'CUSTOMER_ADDRESS_DELETED',
  CUSTOMER_ADDRESS_UPDATED = 'CUSTOMER_ADDRESS_UPDATED',
  CUSTOMER_DETAIL_UPDATED = 'CUSTOMER_DETAIL_UPDATED',
  CUSTOMER_EMAIL_UPDATE_REQUESTED = 'CUSTOMER_EMAIL_UPDATE_REQUESTED',
  CUSTOMER_EMAIL_UPDATE_VERIFIED = 'CUSTOMER_EMAIL_UPDATE_VERIFIED',
  CUSTOMER_NOTE = 'CUSTOMER_NOTE',
  CUSTOMER_PASSWORD_RESET_REQUESTED = 'CUSTOMER_PASSWORD_RESET_REQUESTED',
  CUSTOMER_PASSWORD_RESET_VERIFIED = 'CUSTOMER_PASSWORD_RESET_VERIFIED',
  CUSTOMER_PASSWORD_UPDATED = 'CUSTOMER_PASSWORD_UPDATED',
  CUSTOMER_REGISTERED = 'CUSTOMER_REGISTERED',
  CUSTOMER_REMOVED_FROM_GROUP = 'CUSTOMER_REMOVED_FROM_GROUP',
  CUSTOMER_VERIFIED = 'CUSTOMER_VERIFIED',
  ORDER_CANCELLATION = 'ORDER_CANCELLATION',
  ORDER_COUPON_APPLIED = 'ORDER_COUPON_APPLIED',
  ORDER_COUPON_REMOVED = 'ORDER_COUPON_REMOVED',
  ORDER_CUSTOMER_UPDATED = 'ORDER_CUSTOMER_UPDATED',
  ORDER_FULFILLMENT = 'ORDER_FULFILLMENT',
  ORDER_FULFILLMENT_TRANSITION = 'ORDER_FULFILLMENT_TRANSITION',
  ORDER_MODIFIED = 'ORDER_MODIFIED',
  ORDER_NOTE = 'ORDER_NOTE',
  ORDER_PAYMENT_TRANSITION = 'ORDER_PAYMENT_TRANSITION',
  ORDER_REFUND_TRANSITION = 'ORDER_REFUND_TRANSITION',
  ORDER_STATE_TRANSITION = 'ORDER_STATE_TRANSITION',
}

/** Operators for filtering on a list of ID fields */
export type IdListOperators = {
  inList: Scalars['ID']['input'];
};

/** Operators for filtering on an ID field */
export type IdOperators = {
  eq?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  notEq?: InputMaybe<Scalars['String']['input']>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ImageManifestEntry = {
  __typename?: 'ImageManifestEntry';
  assetId: Scalars['String']['output'];
  filename: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type ImportInfo = {
  __typename?: 'ImportInfo';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  imported: Scalars['Int']['output'];
  processed: Scalars['Int']['output'];
};

/** Returned when attempting to set a ShippingMethod for which the Order is not eligible */
export type IneligibleShippingMethodError = ErrorResult & {
  __typename?: 'IneligibleShippingMethodError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type InitiatePurchaseResult = {
  __typename?: 'InitiatePurchaseResult';
  authorizationUrl?: Maybe<Scalars['String']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  reference?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type InlinePaymentInput = {
  amount: Scalars['Int']['input'];
  debitAccountCode?: InputMaybe<Scalars['String']['input']>;
  reference?: InputMaybe<Scalars['String']['input']>;
};

/** Returned when attempting to add more items to the Order than are available */
export type InsufficientStockError = ErrorResult & {
  __typename?: 'InsufficientStockError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  order: Order;
  quantityAvailable: Scalars['Int']['output'];
};

/**
 * Returned if attempting to create a Fulfillment when there is insufficient
 * stockOnHand of a ProductVariant to satisfy the requested quantity.
 */
export type InsufficientStockOnHandError = ErrorResult & {
  __typename?: 'InsufficientStockOnHandError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  productVariantId: Scalars['ID']['output'];
  productVariantName: Scalars['String']['output'];
  stockOnHand: Scalars['Int']['output'];
};

export type IntCustomFieldConfig = CustomField & {
  __typename?: 'IntCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Int']['output']>;
  min?: Maybe<Scalars['Int']['output']>;
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type IntStructFieldConfig = StructField & {
  __typename?: 'IntStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Int']['output']>;
  min?: Maybe<Scalars['Int']['output']>;
  name: Scalars['String']['output'];
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type InterAccountTransferInput = {
  amount: Scalars['String']['input'];
  channelId: Scalars['Int']['input'];
  entryDate: Scalars['DateTime']['input'];
  expenseTag?: InputMaybe<Scalars['String']['input']>;
  feeAmount?: InputMaybe<Scalars['String']['input']>;
  fromAccountCode: Scalars['String']['input'];
  memo?: InputMaybe<Scalars['String']['input']>;
  toAccountCode: Scalars['String']['input'];
  transferId: Scalars['String']['input'];
};

/** Returned if the user authentication credentials are not valid */
export type InvalidCredentialsError = ErrorResult & {
  __typename?: 'InvalidCredentialsError';
  authenticationError: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if the specified FulfillmentHandler code is not valid */
export type InvalidFulfillmentHandlerError = ErrorResult & {
  __typename?: 'InvalidFulfillmentHandlerError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type InventoryStockAdjustment = {
  __typename?: 'InventoryStockAdjustment';
  adjustedBy?: Maybe<User>;
  adjustedByUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  lines: Array<InventoryStockAdjustmentLine>;
  notes?: Maybe<Scalars['String']['output']>;
  reason: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type InventoryStockAdjustmentLine = {
  __typename?: 'InventoryStockAdjustmentLine';
  adjustmentId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  newStock: Scalars['Float']['output'];
  previousStock: Scalars['Float']['output'];
  quantityChange: Scalars['Float']['output'];
  stockLocation?: Maybe<StockLocation>;
  stockLocationId: Scalars['ID']['output'];
  variant?: Maybe<ProductVariant>;
  variantId: Scalars['ID']['output'];
};

export type InventoryStockAdjustmentList = {
  __typename?: 'InventoryStockAdjustmentList';
  items: Array<InventoryStockAdjustment>;
  totalItems: Scalars['Int']['output'];
};

export type InventoryValuation = {
  __typename?: 'InventoryValuation';
  asOfDate: Scalars['DateTime']['output'];
  batchCount: Scalars['Int']['output'];
  channelId: Scalars['Int']['output'];
  itemCount: Scalars['Int']['output'];
  stockLocationId?: Maybe<Scalars['Int']['output']>;
  totalValue: Scalars['String']['output'];
};

export type InviteAdministratorInput = {
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  permissionOverrides?: InputMaybe<Array<Scalars['String']['input']>>;
  phoneNumber: Scalars['String']['input'];
  roleTemplateCode?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if the specified items are already part of a Fulfillment */
export type ItemsAlreadyFulfilledError = ErrorResult & {
  __typename?: 'ItemsAlreadyFulfilledError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Job = Node & {
  __typename?: 'Job';
  attempts: Scalars['Int']['output'];
  createdAt: Scalars['DateTime']['output'];
  data?: Maybe<Scalars['JSON']['output']>;
  duration: Scalars['Int']['output'];
  error?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  isSettled: Scalars['Boolean']['output'];
  progress: Scalars['Float']['output'];
  queueName: Scalars['String']['output'];
  result?: Maybe<Scalars['JSON']['output']>;
  retries: Scalars['Int']['output'];
  settledAt?: Maybe<Scalars['DateTime']['output']>;
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  state: JobState;
};

export type JobBufferSize = {
  __typename?: 'JobBufferSize';
  bufferId: Scalars['String']['output'];
  size: Scalars['Int']['output'];
};

export type JobFilterParameter = {
  _and?: InputMaybe<Array<JobFilterParameter>>;
  _or?: InputMaybe<Array<JobFilterParameter>>;
  attempts?: InputMaybe<NumberOperators>;
  createdAt?: InputMaybe<DateOperators>;
  duration?: InputMaybe<NumberOperators>;
  id?: InputMaybe<IdOperators>;
  isSettled?: InputMaybe<BooleanOperators>;
  progress?: InputMaybe<NumberOperators>;
  queueName?: InputMaybe<StringOperators>;
  retries?: InputMaybe<NumberOperators>;
  settledAt?: InputMaybe<DateOperators>;
  startedAt?: InputMaybe<DateOperators>;
  state?: InputMaybe<StringOperators>;
};

export type JobList = PaginatedList & {
  __typename?: 'JobList';
  items: Array<Job>;
  totalItems: Scalars['Int']['output'];
};

export type JobListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<JobFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<JobSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type JobQueue = {
  __typename?: 'JobQueue';
  name: Scalars['String']['output'];
  running: Scalars['Boolean']['output'];
};

export type JobSortParameter = {
  attempts?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  duration?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  progress?: InputMaybe<SortOrder>;
  queueName?: InputMaybe<SortOrder>;
  retries?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrder>;
  startedAt?: InputMaybe<SortOrder>;
};

/**
 * @description
 * The state of a Job in the JobQueue
 *
 * @docsCategory common
 */
export enum JobState {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  RETRYING = 'RETRYING',
  RUNNING = 'RUNNING',
}

export type JournalEntriesOptions = {
  accountCode?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sourceType?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type JournalEntriesResult = {
  __typename?: 'JournalEntriesResult';
  items: Array<JournalEntry>;
  totalItems: Scalars['Int']['output'];
};

export type JournalEntry = {
  __typename?: 'JournalEntry';
  channelId: Scalars['Int']['output'];
  entryDate: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lines: Array<JournalLine>;
  memo?: Maybe<Scalars['String']['output']>;
  postedAt: Scalars['DateTime']['output'];
  sourceId: Scalars['String']['output'];
  sourceType: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type JournalLine = {
  __typename?: 'JournalLine';
  accountCode: Scalars['String']['output'];
  accountName: Scalars['String']['output'];
  credit: Scalars['Float']['output'];
  debit: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  meta?: Maybe<Scalars['JSON']['output']>;
};

/**
 * @description
 * Languages in the form of a ISO 639-1 language code with optional
 * region or script modifier (e.g. de_AT). The selection available is based
 * on the [Unicode CLDR summary list](https://unicode-org.github.io/cldr-staging/charts/37/summary/root.html)
 * and includes the major spoken languages of the world and any widely-used variants.
 *
 * @docsCategory common
 */
export enum LanguageCode {
  /** Afrikaans */
  af = 'af',
  /** Akan */
  ak = 'ak',
  /** Amharic */
  am = 'am',
  /** Arabic */
  ar = 'ar',
  /** Assamese */
  as = 'as',
  /** Azerbaijani */
  az = 'az',
  /** Belarusian */
  be = 'be',
  /** Bulgarian */
  bg = 'bg',
  /** Bambara */
  bm = 'bm',
  /** Bangla */
  bn = 'bn',
  /** Tibetan */
  bo = 'bo',
  /** Breton */
  br = 'br',
  /** Bosnian */
  bs = 'bs',
  /** Catalan */
  ca = 'ca',
  /** Chechen */
  ce = 'ce',
  /** Corsican */
  co = 'co',
  /** Czech */
  cs = 'cs',
  /** Church Slavic */
  cu = 'cu',
  /** Welsh */
  cy = 'cy',
  /** Danish */
  da = 'da',
  /** German */
  de = 'de',
  /** Austrian German */
  de_AT = 'de_AT',
  /** Swiss High German */
  de_CH = 'de_CH',
  /** Dzongkha */
  dz = 'dz',
  /** Ewe */
  ee = 'ee',
  /** Greek */
  el = 'el',
  /** English */
  en = 'en',
  /** Australian English */
  en_AU = 'en_AU',
  /** Canadian English */
  en_CA = 'en_CA',
  /** British English */
  en_GB = 'en_GB',
  /** American English */
  en_US = 'en_US',
  /** Esperanto */
  eo = 'eo',
  /** Spanish */
  es = 'es',
  /** European Spanish */
  es_ES = 'es_ES',
  /** Mexican Spanish */
  es_MX = 'es_MX',
  /** Estonian */
  et = 'et',
  /** Basque */
  eu = 'eu',
  /** Persian */
  fa = 'fa',
  /** Dari */
  fa_AF = 'fa_AF',
  /** Fulah */
  ff = 'ff',
  /** Finnish */
  fi = 'fi',
  /** Faroese */
  fo = 'fo',
  /** French */
  fr = 'fr',
  /** Canadian French */
  fr_CA = 'fr_CA',
  /** Swiss French */
  fr_CH = 'fr_CH',
  /** Western Frisian */
  fy = 'fy',
  /** Irish */
  ga = 'ga',
  /** Scottish Gaelic */
  gd = 'gd',
  /** Galician */
  gl = 'gl',
  /** Gujarati */
  gu = 'gu',
  /** Manx */
  gv = 'gv',
  /** Hausa */
  ha = 'ha',
  /** Hebrew */
  he = 'he',
  /** Hindi */
  hi = 'hi',
  /** Croatian */
  hr = 'hr',
  /** Haitian Creole */
  ht = 'ht',
  /** Hungarian */
  hu = 'hu',
  /** Armenian */
  hy = 'hy',
  /** Interlingua */
  ia = 'ia',
  /** Indonesian */
  id = 'id',
  /** Igbo */
  ig = 'ig',
  /** Sichuan Yi */
  ii = 'ii',
  /** Icelandic */
  is = 'is',
  /** Italian */
  it = 'it',
  /** Japanese */
  ja = 'ja',
  /** Javanese */
  jv = 'jv',
  /** Georgian */
  ka = 'ka',
  /** Kikuyu */
  ki = 'ki',
  /** Kazakh */
  kk = 'kk',
  /** Kalaallisut */
  kl = 'kl',
  /** Khmer */
  km = 'km',
  /** Kannada */
  kn = 'kn',
  /** Korean */
  ko = 'ko',
  /** Kashmiri */
  ks = 'ks',
  /** Kurdish */
  ku = 'ku',
  /** Cornish */
  kw = 'kw',
  /** Kyrgyz */
  ky = 'ky',
  /** Latin */
  la = 'la',
  /** Luxembourgish */
  lb = 'lb',
  /** Ganda */
  lg = 'lg',
  /** Lingala */
  ln = 'ln',
  /** Lao */
  lo = 'lo',
  /** Lithuanian */
  lt = 'lt',
  /** Luba-Katanga */
  lu = 'lu',
  /** Latvian */
  lv = 'lv',
  /** Malagasy */
  mg = 'mg',
  /** Maori */
  mi = 'mi',
  /** Macedonian */
  mk = 'mk',
  /** Malayalam */
  ml = 'ml',
  /** Mongolian */
  mn = 'mn',
  /** Marathi */
  mr = 'mr',
  /** Malay */
  ms = 'ms',
  /** Maltese */
  mt = 'mt',
  /** Burmese */
  my = 'my',
  /** Norwegian Bokmål */
  nb = 'nb',
  /** North Ndebele */
  nd = 'nd',
  /** Nepali */
  ne = 'ne',
  /** Dutch */
  nl = 'nl',
  /** Flemish */
  nl_BE = 'nl_BE',
  /** Norwegian Nynorsk */
  nn = 'nn',
  /** Nyanja */
  ny = 'ny',
  /** Oromo */
  om = 'om',
  /** Odia */
  or = 'or',
  /** Ossetic */
  os = 'os',
  /** Punjabi */
  pa = 'pa',
  /** Polish */
  pl = 'pl',
  /** Pashto */
  ps = 'ps',
  /** Portuguese */
  pt = 'pt',
  /** Brazilian Portuguese */
  pt_BR = 'pt_BR',
  /** European Portuguese */
  pt_PT = 'pt_PT',
  /** Quechua */
  qu = 'qu',
  /** Romansh */
  rm = 'rm',
  /** Rundi */
  rn = 'rn',
  /** Romanian */
  ro = 'ro',
  /** Moldavian */
  ro_MD = 'ro_MD',
  /** Russian */
  ru = 'ru',
  /** Kinyarwanda */
  rw = 'rw',
  /** Sanskrit */
  sa = 'sa',
  /** Sindhi */
  sd = 'sd',
  /** Northern Sami */
  se = 'se',
  /** Sango */
  sg = 'sg',
  /** Sinhala */
  si = 'si',
  /** Slovak */
  sk = 'sk',
  /** Slovenian */
  sl = 'sl',
  /** Samoan */
  sm = 'sm',
  /** Shona */
  sn = 'sn',
  /** Somali */
  so = 'so',
  /** Albanian */
  sq = 'sq',
  /** Serbian */
  sr = 'sr',
  /** Southern Sotho */
  st = 'st',
  /** Sundanese */
  su = 'su',
  /** Swedish */
  sv = 'sv',
  /** Swahili */
  sw = 'sw',
  /** Congo Swahili */
  sw_CD = 'sw_CD',
  /** Tamil */
  ta = 'ta',
  /** Telugu */
  te = 'te',
  /** Tajik */
  tg = 'tg',
  /** Thai */
  th = 'th',
  /** Tigrinya */
  ti = 'ti',
  /** Turkmen */
  tk = 'tk',
  /** Tongan */
  to = 'to',
  /** Turkish */
  tr = 'tr',
  /** Tatar */
  tt = 'tt',
  /** Uyghur */
  ug = 'ug',
  /** Ukrainian */
  uk = 'uk',
  /** Urdu */
  ur = 'ur',
  /** Uzbek */
  uz = 'uz',
  /** Vietnamese */
  vi = 'vi',
  /** Volapük */
  vo = 'vo',
  /** Wolof */
  wo = 'wo',
  /** Xhosa */
  xh = 'xh',
  /** Yiddish */
  yi = 'yi',
  /** Yoruba */
  yo = 'yo',
  /** Chinese */
  zh = 'zh',
  /** Simplified Chinese */
  zh_Hans = 'zh_Hans',
  /** Traditional Chinese */
  zh_Hant = 'zh_Hant',
  /** Zulu */
  zu = 'zu',
}

/** Returned if attempting to set a Channel's defaultLanguageCode to a language which is not enabled in GlobalSettings */
export type LanguageNotAvailableError = ErrorResult & {
  __typename?: 'LanguageNotAvailableError';
  errorCode: ErrorCode;
  languageCode: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type LastClosingBalance = {
  __typename?: 'LastClosingBalance';
  accountCode: Scalars['String']['output'];
  accountName: Scalars['String']['output'];
  balanceCents: Scalars['String']['output'];
};

export type LedgerAccount = {
  __typename?: 'LedgerAccount';
  balance: Scalars['Float']['output'];
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  isParent: Scalars['Boolean']['output'];
  isSystemAccount: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  parentAccountId?: Maybe<Scalars['ID']['output']>;
  type: Scalars['String']['output'];
};

export type LedgerAccountsResult = {
  __typename?: 'LedgerAccountsResult';
  items: Array<LedgerAccount>;
};

export type LocaleStringCustomFieldConfig = CustomField & {
  __typename?: 'LocaleStringCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  length?: Maybe<Scalars['Int']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  pattern?: Maybe<Scalars['String']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type LocaleTextCustomFieldConfig = CustomField & {
  __typename?: 'LocaleTextCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type LocalizedString = {
  __typename?: 'LocalizedString';
  languageCode: LanguageCode;
  value: Scalars['String']['output'];
};

export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR',
}

export type LoginResult = {
  __typename?: 'LoginResult';
  authorizationStatus?: Maybe<Scalars['String']['output']>;
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
  token?: Maybe<Scalars['String']['output']>;
  user?: Maybe<UserInfo>;
};

export type ManualPaymentInput = {
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  method: Scalars['String']['input'];
  orderId: Scalars['ID']['input'];
  transactionId?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Returned when a call to addManualPaymentToOrder is made but the Order
 * is not in the required state.
 */
export type ManualPaymentStateError = ErrorResult & {
  __typename?: 'ManualPaymentStateError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export enum MetricInterval {
  Daily = 'Daily',
}

export type MetricSummary = {
  __typename?: 'MetricSummary';
  entries: Array<MetricSummaryEntry>;
  interval: MetricInterval;
  title: Scalars['String']['output'];
  type: MetricType;
};

export type MetricSummaryEntry = {
  __typename?: 'MetricSummaryEntry';
  label: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type MetricSummaryInput = {
  interval: MetricInterval;
  refresh?: InputMaybe<Scalars['Boolean']['input']>;
  types: Array<MetricType>;
};

export enum MetricType {
  AverageOrderValue = 'AverageOrderValue',
  OrderCount = 'OrderCount',
  OrderTotal = 'OrderTotal',
}

export type MimeTypeError = ErrorResult & {
  __typename?: 'MimeTypeError';
  errorCode: ErrorCode;
  fileName: Scalars['String']['output'];
  message: Scalars['String']['output'];
  mimeType: Scalars['String']['output'];
};

/** Returned if a PromotionCondition has neither a couponCode nor any conditions set */
export type MissingConditionsError = ErrorResult & {
  __typename?: 'MissingConditionsError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type MlModelInfo = {
  __typename?: 'MlModelInfo';
  hasModel: Scalars['Boolean']['output'];
  metadataId?: Maybe<Scalars['String']['output']>;
  modelBinId?: Maybe<Scalars['String']['output']>;
  modelJsonId?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  version?: Maybe<Scalars['String']['output']>;
};

export type MlTrainingInfo = {
  __typename?: 'MlTrainingInfo';
  error?: Maybe<Scalars['String']['output']>;
  hasActiveModel: Scalars['Boolean']['output'];
  imageCount: Scalars['Int']['output'];
  lastTrainedAt?: Maybe<Scalars['DateTime']['output']>;
  productCount: Scalars['Int']['output'];
  progress: Scalars['Int']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  status: Scalars['String']['output'];
};

export type MlTrainingManifest = {
  __typename?: 'MlTrainingManifest';
  channelId: Scalars['String']['output'];
  extractedAt: Scalars['DateTime']['output'];
  products: Array<ProductManifestEntry>;
  version: Scalars['String']['output'];
};

export type ModifyOrderInput = {
  addItems?: InputMaybe<Array<AddItemInput>>;
  adjustOrderLines?: InputMaybe<Array<OrderLineInput>>;
  couponCodes?: InputMaybe<Array<Scalars['String']['input']>>;
  customFields?: InputMaybe<UpdateOrderCustomFieldsInput>;
  dryRun: Scalars['Boolean']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<ModifyOrderOptions>;
  orderId: Scalars['ID']['input'];
  /**
   * Deprecated in v2.2.0. Use `refunds` instead to allow multiple refunds to be
   * applied in the case that multiple payment methods have been used on the order.
   */
  refund?: InputMaybe<AdministratorRefundInput>;
  refunds?: InputMaybe<Array<AdministratorRefundInput>>;
  /** Added in v2.2 */
  shippingMethodIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  surcharges?: InputMaybe<Array<SurchargeInput>>;
  updateBillingAddress?: InputMaybe<UpdateOrderAddressInput>;
  updateShippingAddress?: InputMaybe<UpdateOrderAddressInput>;
};

export type ModifyOrderOptions = {
  freezePromotions?: InputMaybe<Scalars['Boolean']['input']>;
  recalculateShipping?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ModifyOrderResult =
  | CouponCodeExpiredError
  | CouponCodeInvalidError
  | CouponCodeLimitError
  | IneligibleShippingMethodError
  | InsufficientStockError
  | NegativeQuantityError
  | NoChangesSpecifiedError
  | Order
  | OrderLimitError
  | OrderModificationStateError
  | PaymentMethodMissingError
  | RefundPaymentIdMissingError;

export type MoveCollectionInput = {
  collectionId: Scalars['ID']['input'];
  index: Scalars['Int']['input'];
  parentId: Scalars['ID']['input'];
};

export type MpesaVerification = {
  __typename?: 'MpesaVerification';
  allConfirmed: Scalars['Boolean']['output'];
  channelId: Scalars['Int']['output'];
  flaggedTransactionIds?: Maybe<Array<Scalars['String']['output']>>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  sessionId: Scalars['ID']['output'];
  transactionCount: Scalars['Int']['output'];
  verifiedAt: Scalars['DateTime']['output'];
  verifiedByUserId: Scalars['Int']['output'];
};

/** Returned if an operation has specified OrderLines from multiple Orders */
export type MultipleOrderError = ErrorResult & {
  __typename?: 'MultipleOrderError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Add Customers to a CustomerGroup */
  addCustomersToGroup: CustomerGroup;
  addFulfillmentToOrder: AddFulfillmentToOrderResult;
  /** Adds an item to the draft Order. */
  addItemToDraftOrder: UpdateOrderItemsResult;
  /**
   * Used to manually create a new Payment against an Order.
   * This can be used by an Administrator when an Order is in the ArrangingPayment state.
   *
   * It is also used when a completed Order
   * has been modified (using `modifyOrder`) and the price has increased. The extra payment
   * can then be manually arranged by the administrator, and the details used to create a new
   * Payment.
   */
  addManualPaymentToOrder: AddManualPaymentToOrderResult;
  /** Add members to a Zone */
  addMembersToZone: Zone;
  addNoteToCustomer: Customer;
  addNoteToOrder: Order;
  /** Add an OptionGroup to a Product */
  addOptionGroupToProduct: Product;
  /** Adjusts a draft OrderLine. If custom fields are defined on the OrderLine entity, a third argument 'customFields' of type `OrderLineCustomFieldsInput` will be available. */
  adjustDraftOrderLine: UpdateOrderItemsResult;
  allocateBulkPayment: PaymentAllocationResult;
  allocateBulkSupplierPayment: SupplierPaymentAllocationResult;
  /** Applies the given coupon code to the draft Order */
  applyCouponCodeToDraftOrder: ApplyCouponCodeResult;
  approveCustomerCredit: CreditSummary;
  approveSupplierCredit: SupplierCreditSummary;
  /** Assign assets to channel */
  assignAssetsToChannel: Array<Asset>;
  /** Assigns Collections to the specified Channel */
  assignCollectionsToChannel: Array<Collection>;
  /** Assigns Facets to the specified Channel */
  assignFacetsToChannel: Array<Facet>;
  /** Assigns PaymentMethods to the specified Channel */
  assignPaymentMethodsToChannel: Array<PaymentMethod>;
  /** Assigns ProductVariants to the specified Channel */
  assignProductVariantsToChannel: Array<ProductVariant>;
  /** Assigns all ProductVariants of Product to the specified Channel */
  assignProductsToChannel: Array<Product>;
  /** Assigns Promotions to the specified Channel */
  assignPromotionsToChannel: Array<Promotion>;
  /** Assign a Role to an Administrator */
  assignRoleToAdministrator: Administrator;
  /** Assigns ShippingMethods to the specified Channel */
  assignShippingMethodsToChannel: Array<ShippingMethod>;
  /** Assigns StockLocations to the specified Channel */
  assignStockLocationsToChannel: Array<StockLocation>;
  /** Authenticates the user using a named authentication strategy */
  authenticate: AuthenticationResult;
  cancelJob: Job;
  cancelOrder: CancelOrderResult;
  cancelPayment: CancelPaymentResult;
  /** Cancel subscription auto-renewal */
  cancelSubscription: Scalars['Boolean']['output'];
  /** Clear all ML model files for a channel */
  clearMlModel: Scalars['Boolean']['output'];
  closeAccountingPeriod: PeriodEndCloseResult;
  closeCashierSession: CashierSessionSummary;
  /** Complete training and upload model files (multipart) */
  completeTraining: Scalars['Boolean']['output'];
  /** Create a new Administrator */
  createAdministrator: Administrator;
  createApprovalRequest: ApprovalRequest;
  /** Create a new Asset */
  createAssets: Array<CreateAssetResult>;
  createCashierSessionReconciliation: Reconciliation;
  /** Create a new Channel */
  createChannel: CreateChannelResult;
  createChannelAdmin: Administrator;
  createChannelPaymentMethod: PaymentMethod;
  /** Create a new Collection */
  createCollection: Collection;
  /** Create a new Country */
  createCountry: Country;
  /** Create a new Customer. If a password is provided, a new User will also be created an linked to the Customer. */
  createCustomer: CreateCustomerResult;
  /** Create a new Address and associate it with the Customer specified by customerId */
  createCustomerAddress: Address;
  /** Create a new CustomerGroup */
  createCustomerGroup: CustomerGroup;
  /**
   * Create a customer with duplicate prevention by phone number.
   * If a customer with the same phone number exists, returns the existing customer.
   * This is a safety net - the frontend should also check for duplicates.
   */
  createCustomerSafe: Customer;
  /** Creates a draft Order */
  createDraftOrder: Order;
  /** Create a new Facet */
  createFacet: Facet;
  /** Create a single FacetValue */
  createFacetValue: FacetValue;
  /** Create one or more FacetValues */
  createFacetValues: Array<FacetValue>;
  createInterAccountTransfer: JournalEntry;
  createInventoryReconciliation: Reconciliation;
  createOrder: Order;
  /** Create existing PaymentMethod */
  createPaymentMethod: PaymentMethod;
  /** Create a new Product */
  createProduct: Product;
  /** Create a new ProductOption within a ProductOptionGroup */
  createProductOption: ProductOption;
  /** Create a new ProductOptionGroup */
  createProductOptionGroup: ProductOptionGroup;
  /** Create a set of ProductVariants based on the OptionGroups assigned to the given Product */
  createProductVariants: Array<Maybe<ProductVariant>>;
  createPromotion: CreatePromotionResult;
  /** Create a new Province */
  createProvince: Province;
  createReconciliation: Reconciliation;
  /** Create a new Role */
  createRole: Role;
  /** Create a new Seller */
  createSeller: Seller;
  /** Create a new ShippingMethod */
  createShippingMethod: ShippingMethod;
  createStockLocation: StockLocation;
  /** Create a new Tag */
  createTag: Tag;
  /** Create a new TaxCategory */
  createTaxCategory: TaxCategory;
  /** Create a new TaxRate */
  createTaxRate: TaxRate;
  /** Create a new Zone */
  createZone: Zone;
  /** Delete an Administrator */
  deleteAdministrator: DeletionResponse;
  /** Delete multiple Administrators */
  deleteAdministrators: Array<DeletionResponse>;
  /** Delete an Asset */
  deleteAsset: DeletionResponse;
  /** Delete multiple Assets */
  deleteAssets: DeletionResponse;
  /** Delete a Channel */
  deleteChannel: DeletionResponse;
  /** Delete multiple Channels */
  deleteChannels: Array<DeletionResponse>;
  /** Delete a Collection and all of its descendants */
  deleteCollection: DeletionResponse;
  /** Delete multiple Collections and all of their descendants */
  deleteCollections: Array<DeletionResponse>;
  /** Delete multiple Countries */
  deleteCountries: Array<DeletionResponse>;
  /** Delete a Country */
  deleteCountry: DeletionResponse;
  /** Delete a Customer */
  deleteCustomer: DeletionResponse;
  /** Update an existing Address */
  deleteCustomerAddress: Success;
  /** Delete a CustomerGroup */
  deleteCustomerGroup: DeletionResponse;
  /** Delete multiple CustomerGroups */
  deleteCustomerGroups: Array<DeletionResponse>;
  deleteCustomerNote: DeletionResponse;
  /** Deletes Customers */
  deleteCustomers: Array<DeletionResponse>;
  /** Deletes a draft Order */
  deleteDraftOrder: DeletionResponse;
  /** Delete an existing Facet */
  deleteFacet: DeletionResponse;
  /** Delete one or more FacetValues */
  deleteFacetValues: Array<DeletionResponse>;
  /** Delete multiple existing Facets */
  deleteFacets: Array<DeletionResponse>;
  deleteOrderNote: DeletionResponse;
  /** Delete a PaymentMethod */
  deletePaymentMethod: DeletionResponse;
  /** Delete multiple PaymentMethods */
  deletePaymentMethods: Array<DeletionResponse>;
  /** Delete a Product */
  deleteProduct: DeletionResponse;
  /** Delete a ProductOption */
  deleteProductOption: DeletionResponse;
  /** Delete a ProductVariant */
  deleteProductVariant: DeletionResponse;
  /** Delete multiple ProductVariants */
  deleteProductVariants: Array<DeletionResponse>;
  /** Delete multiple Products */
  deleteProducts: Array<DeletionResponse>;
  deletePromotion: DeletionResponse;
  deletePromotions: Array<DeletionResponse>;
  /** Delete a Province */
  deleteProvince: DeletionResponse;
  /** Delete an existing Role */
  deleteRole: DeletionResponse;
  /** Delete multiple Roles */
  deleteRoles: Array<DeletionResponse>;
  /** Delete a Seller */
  deleteSeller: DeletionResponse;
  /** Delete multiple Sellers */
  deleteSellers: Array<DeletionResponse>;
  /** Delete a ShippingMethod */
  deleteShippingMethod: DeletionResponse;
  /** Delete multiple ShippingMethods */
  deleteShippingMethods: Array<DeletionResponse>;
  deleteStockLocation: DeletionResponse;
  deleteStockLocations: Array<DeletionResponse>;
  /** Delete an existing Tag */
  deleteTag: DeletionResponse;
  /** Deletes multiple TaxCategories */
  deleteTaxCategories: Array<DeletionResponse>;
  /** Deletes a TaxCategory */
  deleteTaxCategory: DeletionResponse;
  /** Delete a TaxRate */
  deleteTaxRate: DeletionResponse;
  /** Delete multiple TaxRates */
  deleteTaxRates: Array<DeletionResponse>;
  /** Delete a Zone */
  deleteZone: DeletionResponse;
  /** Delete a Zone */
  deleteZones: Array<DeletionResponse>;
  disableChannelAdmin: DisableChannelAdminResponse;
  /**
   * Duplicate an existing entity using a specific EntityDuplicator.
   * Since v2.2.0.
   */
  duplicateEntity: DuplicateEntityResult;
  explainVariance: CashDrawerCount;
  /** Manually trigger photo extraction */
  extractPhotosForTraining: Scalars['Boolean']['output'];
  flushBufferedJobs: Success;
  importProducts?: Maybe<ImportInfo>;
  /** Initiate subscription purchase */
  initiateSubscriptionPurchase: InitiatePurchaseResult;
  inviteChannelAdministrator: Administrator;
  /** Link existing Asset IDs to channel (simpler than file upload) */
  linkMlModelAssets: Scalars['Boolean']['output'];
  /**
   * Authenticates the user using the native authentication strategy. This mutation is an alias for authenticate({ native: { ... }})
   *
   * The `rememberMe` option applies when using cookie-based sessions, and if `true` it will set the maxAge of the session cookie
   * to 1 year.
   */
  login: NativeAuthenticationResult;
  logout: Success;
  markAllAsRead: Scalars['Int']['output'];
  markNotificationAsRead: Scalars['Boolean']['output'];
  /**
   * Allows an Order to be modified after it has been completed by the Customer. The Order must first
   * be in the `Modifying` state.
   */
  modifyOrder: ModifyOrderResult;
  /** Move a Collection to a different parent or index */
  moveCollection: Collection;
  openAccountingPeriod: AccountingPeriod;
  openCashierSession: CashierSession;
  paySingleOrder: PaymentAllocationResult;
  paySinglePurchase: SupplierPaymentAllocationResult;
  recordCashCount: CashCountResult;
  recordExpense: RecordExpenseResult;
  recordPurchase: StockPurchase;
  recordStockAdjustment: InventoryStockAdjustment;
  refundOrder: RefundOrderResult;
  reindex: Job;
  /** Removes Collections from the specified Channel */
  removeCollectionsFromChannel: Array<Collection>;
  /** Removes the given coupon code from the draft Order */
  removeCouponCodeFromDraftOrder?: Maybe<Order>;
  /** Remove Customers from a CustomerGroup */
  removeCustomersFromGroup: CustomerGroup;
  /** Remove an OrderLine from the draft Order */
  removeDraftOrderLine: RemoveOrderItemsResult;
  /** Removes Facets from the specified Channel */
  removeFacetsFromChannel: Array<RemoveFacetFromChannelResult>;
  /** Remove members from a Zone */
  removeMembersFromZone: Zone;
  /**
   * Remove an OptionGroup from a Product. If the OptionGroup is in use by any ProductVariants
   * the mutation will return a ProductOptionInUseError, and the OptionGroup will not be removed.
   * Setting the `force` argument to `true` will override this and remove the OptionGroup anyway,
   * as well as removing any of the group's options from the Product's ProductVariants.
   */
  removeOptionGroupFromProduct: RemoveOptionGroupFromProductResult;
  /** Removes PaymentMethods from the specified Channel */
  removePaymentMethodsFromChannel: Array<PaymentMethod>;
  /** Removes ProductVariants from the specified Channel */
  removeProductVariantsFromChannel: Array<ProductVariant>;
  /** Removes all ProductVariants of Product from the specified Channel */
  removeProductsFromChannel: Array<Product>;
  /** Removes Promotions from the specified Channel */
  removePromotionsFromChannel: Array<Promotion>;
  /** Remove all settled jobs in the given queues older than the given date. Returns the number of jobs deleted. */
  removeSettledJobs: Scalars['Int']['output'];
  /** Removes ShippingMethods from the specified Channel */
  removeShippingMethodsFromChannel: Array<ShippingMethod>;
  /** Removes StockLocations from the specified Channel */
  removeStockLocationsFromChannel: Array<StockLocation>;
  requestEmailRegistrationOTP: OtpResponse;
  requestLoginOTP: OtpResponse;
  requestRegistrationOTP: OtpResponse;
  requestUpdateOTP: OtpResponse;
  reverseOrder: OrderReversalResult;
  reviewApprovalRequest: ApprovalRequest;
  reviewCashCount: CashDrawerCount;
  runPendingSearchIndexUpdates: Success;
  runScheduledTask: Success;
  setCustomerForDraftOrder: SetCustomerForDraftOrderResult;
  /** Sets the billing address for a draft Order */
  setDraftOrderBillingAddress: Order;
  /** Allows any custom fields to be set for the active order */
  setDraftOrderCustomFields: Order;
  /** Sets the shipping address for a draft Order */
  setDraftOrderShippingAddress: Order;
  /** Sets the shipping method by id, which can be obtained with the `eligibleShippingMethodsForDraftOrder` query */
  setDraftOrderShippingMethod: SetOrderShippingMethodResult;
  /** Set ML model status (active/inactive/training) */
  setMlModelStatus: Scalars['Boolean']['output'];
  setOrderCustomFields?: Maybe<Order>;
  /** Allows a different Customer to be assigned to an Order. Added in v2.2.0. */
  setOrderCustomer?: Maybe<Order>;
  setOrderLineCustomPrice: SetOrderLineCustomPriceResult;
  /** Set a single key-value pair (automatically scoped based on field configuration) */
  setSettingsStoreValue: SetSettingsStoreValueResult;
  /** Set multiple key-value pairs in a transaction (each automatically scoped) */
  setSettingsStoreValues: Array<SetSettingsStoreValueResult>;
  settlePayment: SettlePaymentResult;
  settleRefund: SettleRefundResult;
  /**
   * Start in-process model training for a channel.
   * Requires 'ready' status (photos extracted) or will trigger extraction.
   */
  startTraining: Scalars['Boolean']['output'];
  subscribeToPush: Scalars['Boolean']['output'];
  transitionFulfillmentToState: TransitionFulfillmentToStateResult;
  transitionOrderToState?: Maybe<TransitionOrderToStateResult>;
  transitionPaymentToState: TransitionPaymentToStateResult;
  /** Unsets the billing address for a draft Order */
  unsetDraftOrderBillingAddress: Order;
  /** Unsets the shipping address for a draft Order */
  unsetDraftOrderShippingAddress: Order;
  unsubscribeToPush: Scalars['Boolean']['output'];
  /** Update the active (currently logged-in) Administrator */
  updateActiveAdministrator: Administrator;
  updateAdminProfile: Administrator;
  /** Update an existing Administrator */
  updateAdministrator: Administrator;
  /** Update an existing Asset */
  updateAsset: Asset;
  updateCashierSettings: ChannelSettings;
  /** Update an existing Channel */
  updateChannel: UpdateChannelResult;
  updateChannelAdmin: Administrator;
  updateChannelLogo: ChannelSettings;
  updateChannelPaymentMethod: PaymentMethod;
  updateChannelStatus: Channel;
  /** Update an existing Collection */
  updateCollection: Collection;
  /** Update an existing Country */
  updateCountry: Country;
  updateCreditDuration: CreditSummary;
  /** Update an existing Customer */
  updateCustomer: UpdateCustomerResult;
  /** Update an existing Address */
  updateCustomerAddress: Address;
  updateCustomerCreditLimit: CreditSummary;
  /** Update an existing CustomerGroup */
  updateCustomerGroup: CustomerGroup;
  updateCustomerNote: HistoryEntry;
  /** Update an existing Facet */
  updateFacet: Facet;
  /** Update a single FacetValue */
  updateFacetValue: FacetValue;
  /** Update one or more FacetValues */
  updateFacetValues: Array<FacetValue>;
  updateGlobalSettings: UpdateGlobalSettingsResult;
  updateOrderLineQuantity: UpdateOrderItemsResult;
  updateOrderNote: HistoryEntry;
  /** Update an existing PaymentMethod */
  updatePaymentMethod: PaymentMethod;
  updatePrinterSettings: ChannelSettings;
  /** Update an existing Product */
  updateProduct: Product;
  /** Create a new ProductOption within a ProductOptionGroup */
  updateProductOption: ProductOption;
  /** Update an existing ProductOptionGroup */
  updateProductOptionGroup: ProductOptionGroup;
  /** Update an existing ProductVariant */
  updateProductVariant: ProductVariant;
  /** Update existing ProductVariants */
  updateProductVariants: Array<Maybe<ProductVariant>>;
  /** Update multiple existing Products */
  updateProducts: Array<Product>;
  updatePromotion: UpdatePromotionResult;
  /** Update an existing Province */
  updateProvince: Province;
  /** Update an existing Role */
  updateRole: Role;
  updateScheduledTask: ScheduledTask;
  /** Update an existing Seller */
  updateSeller: Seller;
  /** Update an existing ShippingMethod */
  updateShippingMethod: ShippingMethod;
  updateStockLocation: StockLocation;
  updateSupplierCreditDuration: SupplierCreditSummary;
  updateSupplierCreditLimit: SupplierCreditSummary;
  /** Update an existing Tag */
  updateTag: Tag;
  /** Update an existing TaxCategory */
  updateTaxCategory: TaxCategory;
  /** Update an existing TaxRate */
  updateTaxRate: TaxRate;
  /** Update training status (for external training services) */
  updateTrainingStatus: Scalars['Boolean']['output'];
  /** Update an existing Zone */
  updateZone: Zone;
  verifyEmailRegistrationOTP: RegistrationResult;
  verifyLoginOTP: LoginResult;
  verifyMpesaTransactions: MpesaVerification;
  verifyReconciliation: Reconciliation;
  verifyRegistrationOTP: RegistrationResult;
  /** Verify subscription payment */
  verifySubscriptionPayment: Scalars['Boolean']['output'];
};

export type MutationAddCustomersToGroupArgs = {
  customerGroupId: Scalars['ID']['input'];
  customerIds: Array<Scalars['ID']['input']>;
};

export type MutationAddFulfillmentToOrderArgs = {
  input: FulfillOrderInput;
};

export type MutationAddItemToDraftOrderArgs = {
  input: AddItemToDraftOrderInput;
  orderId: Scalars['ID']['input'];
};

export type MutationAddManualPaymentToOrderArgs = {
  input: ManualPaymentInput;
};

export type MutationAddMembersToZoneArgs = {
  memberIds: Array<Scalars['ID']['input']>;
  zoneId: Scalars['ID']['input'];
};

export type MutationAddNoteToCustomerArgs = {
  input: AddNoteToCustomerInput;
};

export type MutationAddNoteToOrderArgs = {
  input: AddNoteToOrderInput;
};

export type MutationAddOptionGroupToProductArgs = {
  optionGroupId: Scalars['ID']['input'];
  productId: Scalars['ID']['input'];
};

export type MutationAdjustDraftOrderLineArgs = {
  input: AdjustDraftOrderLineInput;
  orderId: Scalars['ID']['input'];
};

export type MutationAllocateBulkPaymentArgs = {
  input: PaymentAllocationInput;
};

export type MutationAllocateBulkSupplierPaymentArgs = {
  input: SupplierPaymentAllocationInput;
};

export type MutationApplyCouponCodeToDraftOrderArgs = {
  couponCode: Scalars['String']['input'];
  orderId: Scalars['ID']['input'];
};

export type MutationApproveCustomerCreditArgs = {
  input: ApproveCustomerCreditInput;
};

export type MutationApproveSupplierCreditArgs = {
  input: ApproveSupplierCreditInput;
};

export type MutationAssignAssetsToChannelArgs = {
  input: AssignAssetsToChannelInput;
};

export type MutationAssignCollectionsToChannelArgs = {
  input: AssignCollectionsToChannelInput;
};

export type MutationAssignFacetsToChannelArgs = {
  input: AssignFacetsToChannelInput;
};

export type MutationAssignPaymentMethodsToChannelArgs = {
  input: AssignPaymentMethodsToChannelInput;
};

export type MutationAssignProductVariantsToChannelArgs = {
  input: AssignProductVariantsToChannelInput;
};

export type MutationAssignProductsToChannelArgs = {
  input: AssignProductsToChannelInput;
};

export type MutationAssignPromotionsToChannelArgs = {
  input: AssignPromotionsToChannelInput;
};

export type MutationAssignRoleToAdministratorArgs = {
  administratorId: Scalars['ID']['input'];
  roleId: Scalars['ID']['input'];
};

export type MutationAssignShippingMethodsToChannelArgs = {
  input: AssignShippingMethodsToChannelInput;
};

export type MutationAssignStockLocationsToChannelArgs = {
  input: AssignStockLocationsToChannelInput;
};

export type MutationAuthenticateArgs = {
  input: AuthenticationInput;
  rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationCancelJobArgs = {
  jobId: Scalars['ID']['input'];
};

export type MutationCancelOrderArgs = {
  input: CancelOrderInput;
};

export type MutationCancelPaymentArgs = {
  id: Scalars['ID']['input'];
};

export type MutationCancelSubscriptionArgs = {
  channelId: Scalars['ID']['input'];
};

export type MutationClearMlModelArgs = {
  channelId: Scalars['ID']['input'];
};

export type MutationCloseAccountingPeriodArgs = {
  channelId: Scalars['Int']['input'];
  periodEndDate: Scalars['DateTime']['input'];
};

export type MutationCloseCashierSessionArgs = {
  input: CloseCashierSessionInput;
};

export type MutationCompleteTrainingArgs = {
  channelId: Scalars['ID']['input'];
  metadata: Scalars['Upload']['input'];
  modelJson: Scalars['Upload']['input'];
  weightsFile: Scalars['Upload']['input'];
};

export type MutationCreateAdministratorArgs = {
  input: CreateAdministratorInput;
};

export type MutationCreateApprovalRequestArgs = {
  input: CreateApprovalRequestInput;
};

export type MutationCreateAssetsArgs = {
  input: Array<CreateAssetInput>;
};

export type MutationCreateCashierSessionReconciliationArgs = {
  notes?: InputMaybe<Scalars['String']['input']>;
  sessionId: Scalars['ID']['input'];
};

export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
};

export type MutationCreateChannelAdminArgs = {
  input: CreateChannelAdminInput;
};

export type MutationCreateChannelPaymentMethodArgs = {
  input: CreatePaymentMethodInput;
};

export type MutationCreateCollectionArgs = {
  input: CreateCollectionInput;
};

export type MutationCreateCountryArgs = {
  input: CreateCountryInput;
};

export type MutationCreateCustomerArgs = {
  input: CreateCustomerInput;
  password?: InputMaybe<Scalars['String']['input']>;
};

export type MutationCreateCustomerAddressArgs = {
  customerId: Scalars['ID']['input'];
  input: CreateAddressInput;
};

export type MutationCreateCustomerGroupArgs = {
  input: CreateCustomerGroupInput;
};

export type MutationCreateCustomerSafeArgs = {
  input: CreateCustomerInput;
  isWalkIn?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationCreateFacetArgs = {
  input: CreateFacetInput;
};

export type MutationCreateFacetValueArgs = {
  input: CreateFacetValueInput;
};

export type MutationCreateFacetValuesArgs = {
  input: Array<CreateFacetValueInput>;
};

export type MutationCreateInterAccountTransferArgs = {
  input: InterAccountTransferInput;
};

export type MutationCreateInventoryReconciliationArgs = {
  input: CreateInventoryReconciliationInput;
};

export type MutationCreateOrderArgs = {
  input: CreateOrderInput;
};

export type MutationCreatePaymentMethodArgs = {
  input: CreatePaymentMethodInput;
};

export type MutationCreateProductArgs = {
  input: CreateProductInput;
};

export type MutationCreateProductOptionArgs = {
  input: CreateProductOptionInput;
};

export type MutationCreateProductOptionGroupArgs = {
  input: CreateProductOptionGroupInput;
};

export type MutationCreateProductVariantsArgs = {
  input: Array<CreateProductVariantInput>;
};

export type MutationCreatePromotionArgs = {
  input: CreatePromotionInput;
};

export type MutationCreateProvinceArgs = {
  input: CreateProvinceInput;
};

export type MutationCreateReconciliationArgs = {
  input: CreateReconciliationInput;
};

export type MutationCreateRoleArgs = {
  input: CreateRoleInput;
};

export type MutationCreateSellerArgs = {
  input: CreateSellerInput;
};

export type MutationCreateShippingMethodArgs = {
  input: CreateShippingMethodInput;
};

export type MutationCreateStockLocationArgs = {
  input: CreateStockLocationInput;
};

export type MutationCreateTagArgs = {
  input: CreateTagInput;
};

export type MutationCreateTaxCategoryArgs = {
  input: CreateTaxCategoryInput;
};

export type MutationCreateTaxRateArgs = {
  input: CreateTaxRateInput;
};

export type MutationCreateZoneArgs = {
  input: CreateZoneInput;
};

export type MutationDeleteAdministratorArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteAdministratorsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteAssetArgs = {
  input: DeleteAssetInput;
};

export type MutationDeleteAssetsArgs = {
  input: DeleteAssetsInput;
};

export type MutationDeleteChannelArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteChannelsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCollectionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCollectionsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCountriesArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCountryArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerAddressArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerGroupArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCustomerGroupsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteCustomerNoteArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCustomersArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteDraftOrderArgs = {
  orderId: Scalars['ID']['input'];
};

export type MutationDeleteFacetArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
};

export type MutationDeleteFacetValuesArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteFacetsArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteOrderNoteArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeletePaymentMethodArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
};

export type MutationDeletePaymentMethodsArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteProductArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteProductOptionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteProductVariantArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteProductVariantsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteProductsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeletePromotionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeletePromotionsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteProvinceArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteRoleArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteRolesArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteSellerArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteSellersArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteShippingMethodArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteShippingMethodsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteStockLocationArgs = {
  input: DeleteStockLocationInput;
};

export type MutationDeleteStockLocationsArgs = {
  input: Array<DeleteStockLocationInput>;
};

export type MutationDeleteTagArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteTaxCategoriesArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteTaxCategoryArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteTaxRateArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteTaxRatesArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDeleteZoneArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteZonesArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationDisableChannelAdminArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDuplicateEntityArgs = {
  input: DuplicateEntityInput;
};

export type MutationExplainVarianceArgs = {
  countId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};

export type MutationExtractPhotosForTrainingArgs = {
  channelId: Scalars['ID']['input'];
};

export type MutationFlushBufferedJobsArgs = {
  bufferIds?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MutationImportProductsArgs = {
  csvFile: Scalars['Upload']['input'];
};

export type MutationInitiateSubscriptionPurchaseArgs = {
  billingCycle: Scalars['String']['input'];
  channelId: Scalars['ID']['input'];
  email: Scalars['String']['input'];
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
  phoneNumber: Scalars['String']['input'];
  tierId: Scalars['String']['input'];
};

export type MutationInviteChannelAdministratorArgs = {
  input: InviteAdministratorInput;
};

export type MutationLinkMlModelAssetsArgs = {
  channelId: Scalars['ID']['input'];
  metadataId: Scalars['ID']['input'];
  modelBinId: Scalars['ID']['input'];
  modelJsonId: Scalars['ID']['input'];
};

export type MutationLoginArgs = {
  password: Scalars['String']['input'];
  rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
  username: Scalars['String']['input'];
};

export type MutationMarkNotificationAsReadArgs = {
  id: Scalars['ID']['input'];
};

export type MutationModifyOrderArgs = {
  input: ModifyOrderInput;
};

export type MutationMoveCollectionArgs = {
  input: MoveCollectionInput;
};

export type MutationOpenAccountingPeriodArgs = {
  channelId: Scalars['Int']['input'];
  periodStartDate: Scalars['DateTime']['input'];
};

export type MutationOpenCashierSessionArgs = {
  input: OpenCashierSessionInput;
};

export type MutationPaySingleOrderArgs = {
  input: PaySingleOrderInput;
};

export type MutationPaySinglePurchaseArgs = {
  input: PaySinglePurchaseInput;
};

export type MutationRecordCashCountArgs = {
  input: RecordCashCountInput;
};

export type MutationRecordExpenseArgs = {
  input: RecordExpenseInput;
};

export type MutationRecordPurchaseArgs = {
  input: RecordPurchaseInput;
};

export type MutationRecordStockAdjustmentArgs = {
  input: RecordStockAdjustmentInput;
};

export type MutationRefundOrderArgs = {
  input: RefundOrderInput;
};

export type MutationRemoveCollectionsFromChannelArgs = {
  input: RemoveCollectionsFromChannelInput;
};

export type MutationRemoveCouponCodeFromDraftOrderArgs = {
  couponCode: Scalars['String']['input'];
  orderId: Scalars['ID']['input'];
};

export type MutationRemoveCustomersFromGroupArgs = {
  customerGroupId: Scalars['ID']['input'];
  customerIds: Array<Scalars['ID']['input']>;
};

export type MutationRemoveDraftOrderLineArgs = {
  orderId: Scalars['ID']['input'];
  orderLineId: Scalars['ID']['input'];
};

export type MutationRemoveFacetsFromChannelArgs = {
  input: RemoveFacetsFromChannelInput;
};

export type MutationRemoveMembersFromZoneArgs = {
  memberIds: Array<Scalars['ID']['input']>;
  zoneId: Scalars['ID']['input'];
};

export type MutationRemoveOptionGroupFromProductArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  optionGroupId: Scalars['ID']['input'];
  productId: Scalars['ID']['input'];
};

export type MutationRemovePaymentMethodsFromChannelArgs = {
  input: RemovePaymentMethodsFromChannelInput;
};

export type MutationRemoveProductVariantsFromChannelArgs = {
  input: RemoveProductVariantsFromChannelInput;
};

export type MutationRemoveProductsFromChannelArgs = {
  input: RemoveProductsFromChannelInput;
};

export type MutationRemovePromotionsFromChannelArgs = {
  input: RemovePromotionsFromChannelInput;
};

export type MutationRemoveSettledJobsArgs = {
  olderThan?: InputMaybe<Scalars['DateTime']['input']>;
  queueNames?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MutationRemoveShippingMethodsFromChannelArgs = {
  input: RemoveShippingMethodsFromChannelInput;
};

export type MutationRemoveStockLocationsFromChannelArgs = {
  input: RemoveStockLocationsFromChannelInput;
};

export type MutationRequestEmailRegistrationOtpArgs = {
  email: Scalars['String']['input'];
  registrationData: RegistrationInput;
};

export type MutationRequestLoginOtpArgs = {
  phoneNumber: Scalars['String']['input'];
};

export type MutationRequestRegistrationOtpArgs = {
  phoneNumber: Scalars['String']['input'];
  registrationData: RegistrationInput;
};

export type MutationRequestUpdateOtpArgs = {
  identifier: Scalars['String']['input'];
};

export type MutationReverseOrderArgs = {
  orderId: Scalars['ID']['input'];
};

export type MutationReviewApprovalRequestArgs = {
  input: ReviewApprovalRequestInput;
};

export type MutationReviewCashCountArgs = {
  countId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};

export type MutationRunScheduledTaskArgs = {
  id: Scalars['String']['input'];
};

export type MutationSetCustomerForDraftOrderArgs = {
  customerId?: InputMaybe<Scalars['ID']['input']>;
  input?: InputMaybe<CreateCustomerInput>;
  orderId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderBillingAddressArgs = {
  input: CreateAddressInput;
  orderId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderCustomFieldsArgs = {
  input: UpdateOrderInput;
  orderId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderShippingAddressArgs = {
  input: CreateAddressInput;
  orderId: Scalars['ID']['input'];
};

export type MutationSetDraftOrderShippingMethodArgs = {
  orderId: Scalars['ID']['input'];
  shippingMethodId: Scalars['ID']['input'];
};

export type MutationSetMlModelStatusArgs = {
  channelId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};

export type MutationSetOrderCustomFieldsArgs = {
  input: UpdateOrderInput;
};

export type MutationSetOrderCustomerArgs = {
  input: SetOrderCustomerInput;
};

export type MutationSetOrderLineCustomPriceArgs = {
  input: SetOrderLineCustomPriceInput;
};

export type MutationSetSettingsStoreValueArgs = {
  input: SettingsStoreInput;
};

export type MutationSetSettingsStoreValuesArgs = {
  inputs: Array<SettingsStoreInput>;
};

export type MutationSettlePaymentArgs = {
  id: Scalars['ID']['input'];
};

export type MutationSettleRefundArgs = {
  input: SettleRefundInput;
};

export type MutationStartTrainingArgs = {
  channelId: Scalars['ID']['input'];
};

export type MutationSubscribeToPushArgs = {
  subscription: PushSubscriptionInput;
};

export type MutationTransitionFulfillmentToStateArgs = {
  id: Scalars['ID']['input'];
  state: Scalars['String']['input'];
};

export type MutationTransitionOrderToStateArgs = {
  id: Scalars['ID']['input'];
  state: Scalars['String']['input'];
};

export type MutationTransitionPaymentToStateArgs = {
  id: Scalars['ID']['input'];
  state: Scalars['String']['input'];
};

export type MutationUnsetDraftOrderBillingAddressArgs = {
  orderId: Scalars['ID']['input'];
};

export type MutationUnsetDraftOrderShippingAddressArgs = {
  orderId: Scalars['ID']['input'];
};

export type MutationUpdateActiveAdministratorArgs = {
  input: UpdateActiveAdministratorInput;
};

export type MutationUpdateAdminProfileArgs = {
  input: UpdateAdminProfileInput;
};

export type MutationUpdateAdministratorArgs = {
  input: UpdateAdministratorInput;
};

export type MutationUpdateAssetArgs = {
  input: UpdateAssetInput;
};

export type MutationUpdateCashierSettingsArgs = {
  cashierFlowEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationUpdateChannelArgs = {
  input: UpdateChannelInput;
};

export type MutationUpdateChannelAdminArgs = {
  id: Scalars['ID']['input'];
  permissions: Array<Scalars['String']['input']>;
};

export type MutationUpdateChannelLogoArgs = {
  logoAssetId?: InputMaybe<Scalars['ID']['input']>;
};

export type MutationUpdateChannelPaymentMethodArgs = {
  input: UpdatePaymentMethodInput;
};

export type MutationUpdateChannelStatusArgs = {
  channelId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};

export type MutationUpdateCollectionArgs = {
  input: UpdateCollectionInput;
};

export type MutationUpdateCountryArgs = {
  input: UpdateCountryInput;
};

export type MutationUpdateCreditDurationArgs = {
  input: UpdateCreditDurationInput;
};

export type MutationUpdateCustomerArgs = {
  input: UpdateCustomerInput;
};

export type MutationUpdateCustomerAddressArgs = {
  input: UpdateAddressInput;
};

export type MutationUpdateCustomerCreditLimitArgs = {
  input: UpdateCustomerCreditLimitInput;
};

export type MutationUpdateCustomerGroupArgs = {
  input: UpdateCustomerGroupInput;
};

export type MutationUpdateCustomerNoteArgs = {
  input: UpdateCustomerNoteInput;
};

export type MutationUpdateFacetArgs = {
  input: UpdateFacetInput;
};

export type MutationUpdateFacetValueArgs = {
  input: UpdateFacetValueInput;
};

export type MutationUpdateFacetValuesArgs = {
  input: Array<UpdateFacetValueInput>;
};

export type MutationUpdateGlobalSettingsArgs = {
  input: UpdateGlobalSettingsInput;
};

export type MutationUpdateOrderLineQuantityArgs = {
  orderLineId: Scalars['ID']['input'];
  quantity: Scalars['Float']['input'];
};

export type MutationUpdateOrderNoteArgs = {
  input: UpdateOrderNoteInput;
};

export type MutationUpdatePaymentMethodArgs = {
  input: UpdatePaymentMethodInput;
};

export type MutationUpdatePrinterSettingsArgs = {
  enablePrinter: Scalars['Boolean']['input'];
};

export type MutationUpdateProductArgs = {
  input: UpdateProductInput;
};

export type MutationUpdateProductOptionArgs = {
  input: UpdateProductOptionInput;
};

export type MutationUpdateProductOptionGroupArgs = {
  input: UpdateProductOptionGroupInput;
};

export type MutationUpdateProductVariantArgs = {
  input: UpdateProductVariantInput;
};

export type MutationUpdateProductVariantsArgs = {
  input: Array<UpdateProductVariantInput>;
};

export type MutationUpdateProductsArgs = {
  input: Array<UpdateProductInput>;
};

export type MutationUpdatePromotionArgs = {
  input: UpdatePromotionInput;
};

export type MutationUpdateProvinceArgs = {
  input: UpdateProvinceInput;
};

export type MutationUpdateRoleArgs = {
  input: UpdateRoleInput;
};

export type MutationUpdateScheduledTaskArgs = {
  input: UpdateScheduledTaskInput;
};

export type MutationUpdateSellerArgs = {
  input: UpdateSellerInput;
};

export type MutationUpdateShippingMethodArgs = {
  input: UpdateShippingMethodInput;
};

export type MutationUpdateStockLocationArgs = {
  input: UpdateStockLocationInput;
};

export type MutationUpdateSupplierCreditDurationArgs = {
  input: UpdateSupplierCreditDurationInput;
};

export type MutationUpdateSupplierCreditLimitArgs = {
  input: UpdateSupplierCreditLimitInput;
};

export type MutationUpdateTagArgs = {
  input: UpdateTagInput;
};

export type MutationUpdateTaxCategoryArgs = {
  input: UpdateTaxCategoryInput;
};

export type MutationUpdateTaxRateArgs = {
  input: UpdateTaxRateInput;
};

export type MutationUpdateTrainingStatusArgs = {
  channelId: Scalars['ID']['input'];
  error?: InputMaybe<Scalars['String']['input']>;
  progress?: InputMaybe<Scalars['Int']['input']>;
  status: Scalars['String']['input'];
};

export type MutationUpdateZoneArgs = {
  input: UpdateZoneInput;
};

export type MutationVerifyEmailRegistrationOtpArgs = {
  email: Scalars['String']['input'];
  otp: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
};

export type MutationVerifyLoginOtpArgs = {
  otp: Scalars['String']['input'];
  phoneNumber: Scalars['String']['input'];
};

export type MutationVerifyMpesaTransactionsArgs = {
  input: VerifyMpesaInput;
};

export type MutationVerifyReconciliationArgs = {
  reconciliationId: Scalars['ID']['input'];
};

export type MutationVerifyRegistrationOtpArgs = {
  otp: Scalars['String']['input'];
  phoneNumber: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
};

export type MutationVerifySubscriptionPaymentArgs = {
  channelId: Scalars['ID']['input'];
  reference: Scalars['String']['input'];
};

export type NativeAuthInput = {
  password: Scalars['String']['input'];
  username: Scalars['String']['input'];
};

/** Returned when attempting an operation that relies on the NativeAuthStrategy, if that strategy is not configured. */
export type NativeAuthStrategyError = ErrorResult & {
  __typename?: 'NativeAuthStrategyError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type NativeAuthenticationResult =
  | CurrentUser
  | InvalidCredentialsError
  | NativeAuthStrategyError;

/** Returned when attempting to set a negative OrderLine quantity. */
export type NegativeQuantityError = ErrorResult & {
  __typename?: 'NegativeQuantityError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/**
 * Returned when invoking a mutation which depends on there being an active Order on the
 * current session.
 */
export type NoActiveOrderError = ErrorResult & {
  __typename?: 'NoActiveOrderError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned when a call to modifyOrder fails to specify any changes */
export type NoChangesSpecifiedError = ErrorResult & {
  __typename?: 'NoChangesSpecifiedError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Node = {
  id: Scalars['ID']['output'];
};

/** Returned if an attempting to refund an Order but neither items nor shipping refund was specified */
export type NothingToRefundError = ErrorResult & {
  __typename?: 'NothingToRefundError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Notification = {
  __typename?: 'Notification';
  channelId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  data?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  message: Scalars['String']['output'];
  read: Scalars['Boolean']['output'];
  title: Scalars['String']['output'];
  type: NotificationType;
  userId: Scalars['ID']['output'];
};

export type NotificationList = {
  __typename?: 'NotificationList';
  items: Array<Notification>;
  totalItems: Scalars['Int']['output'];
};

export type NotificationListOptions = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<NotificationType>;
};

export enum NotificationType {
  APPROVAL = 'APPROVAL',
  CASH_VARIANCE = 'CASH_VARIANCE',
  ML_TRAINING = 'ML_TRAINING',
  ORDER = 'ORDER',
  PAYMENT = 'PAYMENT',
  STOCK = 'STOCK',
}

/** Operators for filtering on a list of Number fields */
export type NumberListOperators = {
  inList: Scalars['Float']['input'];
};

/** Operators for filtering on a Int or Float field */
export type NumberOperators = {
  between?: InputMaybe<NumberRange>;
  eq?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
};

export type NumberRange = {
  end: Scalars['Float']['input'];
  start: Scalars['Float']['input'];
};

export type OtpResponse = {
  __typename?: 'OTPResponse';
  expiresAt?: Maybe<Scalars['Int']['output']>;
  message: Scalars['String']['output'];
  sessionId?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type OpenCashierSessionInput = {
  channelId: Scalars['Int']['input'];
  openingBalances: Array<AccountAmountInput>;
};

export type Order = Node & {
  __typename?: 'Order';
  /** An order is active as long as the payment process has not been completed */
  active: Scalars['Boolean']['output'];
  aggregateOrder?: Maybe<Order>;
  aggregateOrderId?: Maybe<Scalars['ID']['output']>;
  billingAddress?: Maybe<OrderAddress>;
  channels: Array<Channel>;
  /** A unique code for the Order */
  code: Scalars['String']['output'];
  /** An array of all coupon codes applied to the Order */
  couponCodes: Array<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  currencyCode: CurrencyCode;
  customFields?: Maybe<OrderCustomFields>;
  customer?: Maybe<Customer>;
  discounts: Array<Discount>;
  fulfillments?: Maybe<Array<Fulfillment>>;
  history: HistoryEntryList;
  id: Scalars['ID']['output'];
  lines: Array<OrderLine>;
  modifications: Array<OrderModification>;
  nextStates: Array<Scalars['String']['output']>;
  /**
   * The date & time that the Order was placed, i.e. the Customer
   * completed the checkout and the Order is no longer "active"
   */
  orderPlacedAt?: Maybe<Scalars['DateTime']['output']>;
  payments?: Maybe<Array<Payment>>;
  /** Promotions applied to the order. Only gets populated after the payment process has completed. */
  promotions: Array<Promotion>;
  sellerOrders?: Maybe<Array<Order>>;
  shipping: Scalars['Money']['output'];
  shippingAddress?: Maybe<OrderAddress>;
  shippingLines: Array<ShippingLine>;
  shippingWithTax: Scalars['Money']['output'];
  state: Scalars['String']['output'];
  /**
   * The subTotal is the total of all OrderLines in the Order. This figure also includes any Order-level
   * discounts which have been prorated (proportionally distributed) amongst the items of each OrderLine.
   * To get a total of all OrderLines which does not account for prorated discounts, use the
   * sum of `OrderLine.discountedLinePrice` values.
   */
  subTotal: Scalars['Money']['output'];
  /** Same as subTotal, but inclusive of tax */
  subTotalWithTax: Scalars['Money']['output'];
  /**
   * Surcharges are arbitrary modifications to the Order total which are neither
   * ProductVariants nor discounts resulting from applied Promotions. For example,
   * one-off discounts based on customer interaction, or surcharges based on payment
   * methods.
   */
  surcharges: Array<Surcharge>;
  /** A summary of the taxes being applied to this Order */
  taxSummary: Array<OrderTaxSummary>;
  /** Equal to subTotal plus shipping */
  total: Scalars['Money']['output'];
  totalQuantity: Scalars['Int']['output'];
  /** The final payable amount. Equal to subTotalWithTax plus shippingWithTax */
  totalWithTax: Scalars['Money']['output'];
  type: OrderType;
  updatedAt: Scalars['DateTime']['output'];
};

export type OrderHistoryArgs = {
  options?: InputMaybe<HistoryEntryListOptions>;
};

export type OrderAddress = {
  __typename?: 'OrderAddress';
  city?: Maybe<Scalars['String']['output']>;
  company?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  countryCode?: Maybe<Scalars['String']['output']>;
  customFields?: Maybe<Scalars['JSON']['output']>;
  fullName?: Maybe<Scalars['String']['output']>;
  phoneNumber?: Maybe<Scalars['String']['output']>;
  postalCode?: Maybe<Scalars['String']['output']>;
  province?: Maybe<Scalars['String']['output']>;
  streetLine1?: Maybe<Scalars['String']['output']>;
  streetLine2?: Maybe<Scalars['String']['output']>;
};

export type OrderCustomFields = {
  __typename?: 'OrderCustomFields';
  auditCreatedAt?: Maybe<Scalars['DateTime']['output']>;
  createdByUserId?: Maybe<User>;
  lastModifiedByUserId?: Maybe<User>;
  reversedAt?: Maybe<Scalars['DateTime']['output']>;
  reversedByUserId?: Maybe<User>;
};

export type OrderFilterParameter = {
  _and?: InputMaybe<Array<OrderFilterParameter>>;
  _or?: InputMaybe<Array<OrderFilterParameter>>;
  active?: InputMaybe<BooleanOperators>;
  aggregateOrderId?: InputMaybe<IdOperators>;
  auditCreatedAt?: InputMaybe<DateOperators>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  currencyCode?: InputMaybe<StringOperators>;
  customerLastName?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  orderPlacedAt?: InputMaybe<DateOperators>;
  reversedAt?: InputMaybe<DateOperators>;
  shipping?: InputMaybe<NumberOperators>;
  shippingWithTax?: InputMaybe<NumberOperators>;
  state?: InputMaybe<StringOperators>;
  subTotal?: InputMaybe<NumberOperators>;
  subTotalWithTax?: InputMaybe<NumberOperators>;
  total?: InputMaybe<NumberOperators>;
  totalQuantity?: InputMaybe<NumberOperators>;
  totalWithTax?: InputMaybe<NumberOperators>;
  transactionId?: InputMaybe<StringOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

/** Returned when an order operation is rejected by an OrderInterceptor method. */
export type OrderInterceptorError = ErrorResult & {
  __typename?: 'OrderInterceptorError';
  errorCode: ErrorCode;
  interceptorError: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** Returned when the maximum order size limit has been reached. */
export type OrderLimitError = ErrorResult & {
  __typename?: 'OrderLimitError';
  errorCode: ErrorCode;
  maxItems: Scalars['Int']['output'];
  message: Scalars['String']['output'];
};

export type OrderLine = Node & {
  __typename?: 'OrderLine';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<OrderLineCustomFields>;
  /** The price of the line including discounts, excluding tax */
  discountedLinePrice: Scalars['Money']['output'];
  /** The price of the line including discounts and tax */
  discountedLinePriceWithTax: Scalars['Money']['output'];
  /**
   * The price of a single unit including discounts, excluding tax.
   *
   * If Order-level discounts have been applied, this will not be the
   * actual taxable unit price (see `proratedUnitPrice`), but is generally the
   * correct price to display to customers to avoid confusion
   * about the internal handling of distributed Order-level discounts.
   */
  discountedUnitPrice: Scalars['Money']['output'];
  /** The price of a single unit including discounts and tax */
  discountedUnitPriceWithTax: Scalars['Money']['output'];
  discounts: Array<Discount>;
  featuredAsset?: Maybe<Asset>;
  fulfillmentLines?: Maybe<Array<FulfillmentLine>>;
  id: Scalars['ID']['output'];
  /** The total price of the line excluding tax and discounts. */
  linePrice: Scalars['Money']['output'];
  /** The total price of the line including tax but excluding discounts. */
  linePriceWithTax: Scalars['Money']['output'];
  /** The total tax on this line */
  lineTax: Scalars['Money']['output'];
  order: Order;
  /** The quantity at the time the Order was placed */
  orderPlacedQuantity: Scalars['Int']['output'];
  productVariant: ProductVariant;
  /**
   * The actual line price, taking into account both item discounts _and_ prorated (proportionally-distributed)
   * Order-level discounts. This value is the true economic value of the OrderLine, and is used in tax
   * and refund calculations.
   */
  proratedLinePrice: Scalars['Money']['output'];
  /** The proratedLinePrice including tax */
  proratedLinePriceWithTax: Scalars['Money']['output'];
  /**
   * The actual unit price, taking into account both item discounts _and_ prorated (proportionally-distributed)
   * Order-level discounts. This value is the true economic value of the OrderItem, and is used in tax
   * and refund calculations.
   */
  proratedUnitPrice: Scalars['Money']['output'];
  /** The proratedUnitPrice including tax */
  proratedUnitPriceWithTax: Scalars['Money']['output'];
  /** The quantity of items purchased */
  quantity: Scalars['Int']['output'];
  taxLines: Array<TaxLine>;
  taxRate: Scalars['Float']['output'];
  /** The price of a single unit, excluding tax and discounts */
  unitPrice: Scalars['Money']['output'];
  /** Non-zero if the unitPrice has changed since it was initially added to Order */
  unitPriceChangeSinceAdded: Scalars['Money']['output'];
  /** The price of a single unit, including tax but excluding discounts */
  unitPriceWithTax: Scalars['Money']['output'];
  /** Non-zero if the unitPriceWithTax has changed since it was initially added to Order */
  unitPriceWithTaxChangeSinceAdded: Scalars['Money']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type OrderLineCustomFields = {
  __typename?: 'OrderLineCustomFields';
  customLinePrice?: Maybe<Scalars['Int']['output']>;
  priceOverrideReason?: Maybe<Scalars['String']['output']>;
};

export type OrderLineCustomFieldsInput = {
  customLinePrice?: InputMaybe<Scalars['Int']['input']>;
  priceOverrideReason?: InputMaybe<Scalars['String']['input']>;
};

export type OrderLineInput = {
  customFields?: InputMaybe<OrderLineCustomFieldsInput>;
  orderLineId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type OrderList = PaginatedList & {
  __typename?: 'OrderList';
  items: Array<Order>;
  totalItems: Scalars['Int']['output'];
};

export type OrderListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<OrderFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<OrderSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type OrderModification = Node & {
  __typename?: 'OrderModification';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  isSettled: Scalars['Boolean']['output'];
  lines: Array<OrderModificationLine>;
  note: Scalars['String']['output'];
  payment?: Maybe<Payment>;
  priceChange: Scalars['Money']['output'];
  refund?: Maybe<Refund>;
  surcharges?: Maybe<Array<Surcharge>>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned when attempting to modify the contents of an Order that is not in the `AddingItems` state. */
export type OrderModificationError = ErrorResult & {
  __typename?: 'OrderModificationError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type OrderModificationLine = {
  __typename?: 'OrderModificationLine';
  modification: OrderModification;
  modificationId: Scalars['ID']['output'];
  orderLine: OrderLine;
  orderLineId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
};

/** Returned when attempting to modify the contents of an Order that is not in the `Modifying` state. */
export type OrderModificationStateError = ErrorResult & {
  __typename?: 'OrderModificationStateError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type OrderPayment = {
  __typename?: 'OrderPayment';
  amountPaid: Scalars['Float']['output'];
  orderCode: Scalars['String']['output'];
  orderId: Scalars['ID']['output'];
};

export type OrderProcessState = {
  __typename?: 'OrderProcessState';
  name: Scalars['String']['output'];
  to: Array<Scalars['String']['output']>;
};

export type OrderReversalResult = {
  __typename?: 'OrderReversalResult';
  /** True if the order had settled payments before reversal (refund is not automatic). */
  hadPayments: Scalars['Boolean']['output'];
  order: Order;
};

export type OrderSortParameter = {
  aggregateOrderId?: InputMaybe<SortOrder>;
  auditCreatedAt?: InputMaybe<SortOrder>;
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  createdByUserId?: InputMaybe<SortOrder>;
  customerLastName?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastModifiedByUserId?: InputMaybe<SortOrder>;
  orderPlacedAt?: InputMaybe<SortOrder>;
  reversedAt?: InputMaybe<SortOrder>;
  reversedByUserId?: InputMaybe<SortOrder>;
  shipping?: InputMaybe<SortOrder>;
  shippingWithTax?: InputMaybe<SortOrder>;
  state?: InputMaybe<SortOrder>;
  subTotal?: InputMaybe<SortOrder>;
  subTotalWithTax?: InputMaybe<SortOrder>;
  total?: InputMaybe<SortOrder>;
  totalQuantity?: InputMaybe<SortOrder>;
  totalWithTax?: InputMaybe<SortOrder>;
  transactionId?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

/** Returned if there is an error in transitioning the Order state */
export type OrderStateTransitionError = ErrorResult & {
  __typename?: 'OrderStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

/**
 * A summary of the taxes being applied to this order, grouped
 * by taxRate.
 */
export type OrderTaxSummary = {
  __typename?: 'OrderTaxSummary';
  /** A description of this tax */
  description: Scalars['String']['output'];
  /** The total net price of OrderLines to which this taxRate applies */
  taxBase: Scalars['Money']['output'];
  /** The taxRate as a percentage */
  taxRate: Scalars['Float']['output'];
  /** The total tax being applied to the Order at this taxRate */
  taxTotal: Scalars['Money']['output'];
};

export enum OrderType {
  Aggregate = 'Aggregate',
  Regular = 'Regular',
  Seller = 'Seller',
}

export type PaginatedList = {
  items: Array<Node>;
  totalItems: Scalars['Int']['output'];
};

/** paymentAmount in smallest currency unit (cents) */
export type PaySingleOrderInput = {
  debitAccountCode?: InputMaybe<Scalars['String']['input']>;
  orderId: Scalars['ID']['input'];
  paymentAmount?: InputMaybe<Scalars['Float']['input']>;
  paymentMethodCode?: InputMaybe<Scalars['String']['input']>;
  referenceNumber?: InputMaybe<Scalars['String']['input']>;
};

export type PaySinglePurchaseInput = {
  debitAccountCode?: InputMaybe<Scalars['String']['input']>;
  paymentAmount?: InputMaybe<Scalars['Float']['input']>;
  purchaseId: Scalars['ID']['input'];
};

export type Payment = Node & {
  __typename?: 'Payment';
  amount: Scalars['Money']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<PaymentCustomFields>;
  errorMessage?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  method: Scalars['String']['output'];
  nextStates: Array<Scalars['String']['output']>;
  refunds: Array<Refund>;
  state: Scalars['String']['output'];
  transactionId?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/** paymentAmount in smallest currency unit (cents) */
export type PaymentAllocationInput = {
  customerId: Scalars['ID']['input'];
  orderIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  paymentAmount: Scalars['Float']['input'];
};

/** All monetary amounts in PaymentAllocationResult are in smallest currency unit (cents) */
export type PaymentAllocationResult = {
  __typename?: 'PaymentAllocationResult';
  excessPayment: Scalars['Float']['output'];
  ordersPaid: Array<OrderPayment>;
  remainingBalance: Scalars['Float']['output'];
  totalAllocated: Scalars['Float']['output'];
};

export type PaymentCustomFields = {
  __typename?: 'PaymentCustomFields';
  addedByUserId?: Maybe<User>;
  auditCreatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type PaymentMethod = Node & {
  __typename?: 'PaymentMethod';
  checker?: Maybe<ConfigurableOperation>;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<PaymentMethodCustomFields>;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  handler: ConfigurableOperation;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  translations: Array<PaymentMethodTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethodCustomFields = {
  __typename?: 'PaymentMethodCustomFields';
  imageAsset?: Maybe<Asset>;
  isActive?: Maybe<Scalars['Boolean']['output']>;
  isCashierControlled?: Maybe<Scalars['Boolean']['output']>;
  ledgerAccountCode?: Maybe<Scalars['String']['output']>;
  reconciliationType?: Maybe<Scalars['String']['output']>;
  requiresReconciliation?: Maybe<Scalars['Boolean']['output']>;
};

export type PaymentMethodFilterParameter = {
  _and?: InputMaybe<Array<PaymentMethodFilterParameter>>;
  _or?: InputMaybe<Array<PaymentMethodFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  isActive?: InputMaybe<BooleanOperators>;
  isCashierControlled?: InputMaybe<BooleanOperators>;
  ledgerAccountCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  reconciliationType?: InputMaybe<StringOperators>;
  requiresReconciliation?: InputMaybe<BooleanOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type PaymentMethodList = PaginatedList & {
  __typename?: 'PaymentMethodList';
  items: Array<PaymentMethod>;
  totalItems: Scalars['Int']['output'];
};

export type PaymentMethodListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<PaymentMethodFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<PaymentMethodSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Returned when a call to modifyOrder fails to include a paymentMethod even
 * though the price has increased as a result of the changes.
 */
export type PaymentMethodMissingError = ErrorResult & {
  __typename?: 'PaymentMethodMissingError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type PaymentMethodQuote = {
  __typename?: 'PaymentMethodQuote';
  code: Scalars['String']['output'];
  customFields?: Maybe<PaymentMethodCustomFields>;
  description: Scalars['String']['output'];
  eligibilityMessage?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isEligible: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
};

export type PaymentMethodReconciliationConfig = {
  __typename?: 'PaymentMethodReconciliationConfig';
  isCashierControlled: Scalars['Boolean']['output'];
  ledgerAccountCode: Scalars['String']['output'];
  paymentMethodCode: Scalars['String']['output'];
  paymentMethodId: Scalars['ID']['output'];
  paymentMethodName: Scalars['String']['output'];
  reconciliationType: Scalars['String']['output'];
  requiresReconciliation: Scalars['Boolean']['output'];
};

export type PaymentMethodSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  imageAsset?: InputMaybe<SortOrder>;
  isActive?: InputMaybe<SortOrder>;
  isCashierControlled?: InputMaybe<SortOrder>;
  ledgerAccountCode?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  reconciliationType?: InputMaybe<SortOrder>;
  requiresReconciliation?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type PaymentMethodTranslation = {
  __typename?: 'PaymentMethodTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethodTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if an attempting to refund a Payment against OrderLines from a different Order */
export type PaymentOrderMismatchError = ErrorResult & {
  __typename?: 'PaymentOrderMismatchError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned when there is an error in transitioning the Payment state */
export type PaymentStateTransitionError = ErrorResult & {
  __typename?: 'PaymentStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

export type PeriodEndCloseResult = {
  __typename?: 'PeriodEndCloseResult';
  period: AccountingPeriod;
  reconciliationSummary: ReconciliationSummary;
  success: Scalars['Boolean']['output'];
};

export type PeriodStats = {
  __typename?: 'PeriodStats';
  accounts: Array<AccountBreakdown>;
  month: Scalars['Float']['output'];
  today: Scalars['Float']['output'];
  week: Scalars['Float']['output'];
};

export type PeriodStatus = {
  __typename?: 'PeriodStatus';
  canClose: Scalars['Boolean']['output'];
  currentPeriod?: Maybe<AccountingPeriod>;
  isLocked: Scalars['Boolean']['output'];
  lockEndDate?: Maybe<Scalars['DateTime']['output']>;
  missingReconciliations: Array<Scalars['String']['output']>;
};

/**
 * @description
 * Permissions for administrators and customers. Used to control access to
 * GraphQL resolvers via the {@link Allow} decorator.
 *
 * ## Understanding Permission.Owner
 *
 * `Permission.Owner` is a special permission which is used in some Vendure resolvers to indicate that that resolver should only
 * be accessible to the "owner" of that resource.
 *
 * For example, the Shop API `activeCustomer` query resolver should only return the Customer object for the "owner" of that Customer, i.e.
 * based on the activeUserId of the current session. As a result, the resolver code looks like this:
 *
 * @example
 * ```TypeScript
 * \@Query()
 * \@Allow(Permission.Owner)
 * async activeCustomer(\@Ctx() ctx: RequestContext): Promise<Customer | undefined> {
 *   const userId = ctx.activeUserId;
 *   if (userId) {
 *     return this.customerService.findOneByUserId(ctx, userId);
 *   }
 * }
 * ```
 *
 * Here we can see that the "ownership" must be enforced by custom logic inside the resolver. Since "ownership" cannot be defined generally
 * nor statically encoded at build-time, any resolvers using `Permission.Owner` **must** include logic to enforce that only the owner
 * of the resource has access. If not, then it is the equivalent of using `Permission.Public`.
 *
 *
 * @docsCategory common
 */
export enum Permission {
  /** Allows approving or revoking customer credit access. */
  ApproveCustomerCredit = 'ApproveCustomerCredit',
  /** Authenticated means simply that the user is logged in */
  Authenticated = 'Authenticated',
  /** Allows closing accounting periods after reconciliation verification. */
  CloseAccountingPeriod = 'CloseAccountingPeriod',
  /** Grants permission to create Administrator */
  CreateAdministrator = 'CreateAdministrator',
  /** Grants permission to create Asset */
  CreateAsset = 'CreateAsset',
  /** Grants permission to create Products, Facets, Assets, Collections */
  CreateCatalog = 'CreateCatalog',
  /** Grants permission to create Channel */
  CreateChannel = 'CreateChannel',
  /** Grants permission to create Collection */
  CreateCollection = 'CreateCollection',
  /** Grants permission to create Country */
  CreateCountry = 'CreateCountry',
  /** Grants permission to create Customer */
  CreateCustomer = 'CreateCustomer',
  /** Grants permission to create CustomerGroup */
  CreateCustomerGroup = 'CreateCustomerGroup',
  /** Grants permission to create Facet */
  CreateFacet = 'CreateFacet',
  /** Allows creating inter-account transfers during reconciliation sessions. */
  CreateInterAccountTransfer = 'CreateInterAccountTransfer',
  /** Grants permission to create Order */
  CreateOrder = 'CreateOrder',
  /** Grants permission to create PaymentMethod */
  CreatePaymentMethod = 'CreatePaymentMethod',
  /** Grants permission to create Product */
  CreateProduct = 'CreateProduct',
  /** Grants permission to create Promotion */
  CreatePromotion = 'CreatePromotion',
  /** Grants permission to create Seller */
  CreateSeller = 'CreateSeller',
  /** Grants permission to create PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  CreateSettings = 'CreateSettings',
  /** Grants permission to create ShippingMethod */
  CreateShippingMethod = 'CreateShippingMethod',
  /** Grants permission to create StockLocation */
  CreateStockLocation = 'CreateStockLocation',
  /** Grants permission to create System */
  CreateSystem = 'CreateSystem',
  /** Grants permission to create Tag */
  CreateTag = 'CreateTag',
  /** Grants permission to create TaxCategory */
  CreateTaxCategory = 'CreateTaxCategory',
  /** Grants permission to create TaxRate */
  CreateTaxRate = 'CreateTaxRate',
  /** Grants permission to create Zone */
  CreateZone = 'CreateZone',
  /** Grants permission to delete Administrator */
  DeleteAdministrator = 'DeleteAdministrator',
  /** Grants permission to delete Asset */
  DeleteAsset = 'DeleteAsset',
  /** Grants permission to delete Products, Facets, Assets, Collections */
  DeleteCatalog = 'DeleteCatalog',
  /** Grants permission to delete Channel */
  DeleteChannel = 'DeleteChannel',
  /** Grants permission to delete Collection */
  DeleteCollection = 'DeleteCollection',
  /** Grants permission to delete Country */
  DeleteCountry = 'DeleteCountry',
  /** Grants permission to delete Customer */
  DeleteCustomer = 'DeleteCustomer',
  /** Grants permission to delete CustomerGroup */
  DeleteCustomerGroup = 'DeleteCustomerGroup',
  /** Grants permission to delete Facet */
  DeleteFacet = 'DeleteFacet',
  /** Grants permission to delete Order */
  DeleteOrder = 'DeleteOrder',
  /** Grants permission to delete PaymentMethod */
  DeletePaymentMethod = 'DeletePaymentMethod',
  /** Grants permission to delete Product */
  DeleteProduct = 'DeleteProduct',
  /** Grants permission to delete Promotion */
  DeletePromotion = 'DeletePromotion',
  /** Grants permission to delete Seller */
  DeleteSeller = 'DeleteSeller',
  /** Grants permission to delete PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  DeleteSettings = 'DeleteSettings',
  /** Grants permission to delete ShippingMethod */
  DeleteShippingMethod = 'DeleteShippingMethod',
  /** Grants permission to delete StockLocation */
  DeleteStockLocation = 'DeleteStockLocation',
  /** Grants permission to delete System */
  DeleteSystem = 'DeleteSystem',
  /** Grants permission to delete Tag */
  DeleteTag = 'DeleteTag',
  /** Grants permission to delete TaxCategory */
  DeleteTaxCategory = 'DeleteTaxCategory',
  /** Grants permission to delete TaxRate */
  DeleteTaxRate = 'DeleteTaxRate',
  /** Grants permission to delete Zone */
  DeleteZone = 'DeleteZone',
  /** Allows reviewing (approving/rejecting) approval requests */
  ManageApprovals = 'ManageApprovals',
  /** Allows setting and adjusting customer credit limits. */
  ManageCustomerCreditLimit = 'ManageCustomerCreditLimit',
  /** Allows creating and verifying reconciliations for all scopes. */
  ManageReconciliation = 'ManageReconciliation',
  /** Allows recording stock adjustments for inventory corrections. */
  ManageStockAdjustments = 'ManageStockAdjustments',
  /** Allows managing supplier credit purchases, including approval, limit management, and bulk payments. */
  ManageSupplierCreditPurchases = 'ManageSupplierCreditPurchases',
  /** Allows overriding order line prices during order creation */
  OverridePrice = 'OverridePrice',
  /** Owner means the user owns this entity, e.g. a Customer's own Order */
  Owner = 'Owner',
  /** Public means any unauthenticated user may perform the operation */
  Public = 'Public',
  /** Grants permission to read Administrator */
  ReadAdministrator = 'ReadAdministrator',
  /** Grants permission to read Asset */
  ReadAsset = 'ReadAsset',
  /** Grants permission to read Products, Facets, Assets, Collections */
  ReadCatalog = 'ReadCatalog',
  /** Grants permission to read Channel */
  ReadChannel = 'ReadChannel',
  /** Grants permission to read Collection */
  ReadCollection = 'ReadCollection',
  /** Grants permission to read Country */
  ReadCountry = 'ReadCountry',
  /** Grants permission to read Customer */
  ReadCustomer = 'ReadCustomer',
  /** Grants permission to read CustomerGroup */
  ReadCustomerGroup = 'ReadCustomerGroup',
  /** Grants permission to read Facet */
  ReadFacet = 'ReadFacet',
  /** Grants permission to read Order */
  ReadOrder = 'ReadOrder',
  /** Grants permission to read PaymentMethod */
  ReadPaymentMethod = 'ReadPaymentMethod',
  /** Grants permission to read Product */
  ReadProduct = 'ReadProduct',
  /** Grants permission to read Promotion */
  ReadPromotion = 'ReadPromotion',
  /** Grants permission to read Seller */
  ReadSeller = 'ReadSeller',
  /** Grants permission to read PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  ReadSettings = 'ReadSettings',
  /** Grants permission to read ShippingMethod */
  ReadShippingMethod = 'ReadShippingMethod',
  /** Grants permission to read StockLocation */
  ReadStockLocation = 'ReadStockLocation',
  /** Grants permission to read System */
  ReadSystem = 'ReadSystem',
  /** Grants permission to read Tag */
  ReadTag = 'ReadTag',
  /** Grants permission to read TaxCategory */
  ReadTaxCategory = 'ReadTaxCategory',
  /** Grants permission to read TaxRate */
  ReadTaxRate = 'ReadTaxRate',
  /** Grants permission to read Zone */
  ReadZone = 'ReadZone',
  /** Allows reversing an order (ledger reversal and mark order reversed). */
  ReverseOrder = 'ReverseOrder',
  /** SuperAdmin has unrestricted access to all operations */
  SuperAdmin = 'SuperAdmin',
  /** Grants permission to update Administrator */
  UpdateAdministrator = 'UpdateAdministrator',
  /** Grants permission to update Asset */
  UpdateAsset = 'UpdateAsset',
  /** Grants permission to update Products, Facets, Assets, Collections */
  UpdateCatalog = 'UpdateCatalog',
  /** Grants permission to update Channel */
  UpdateChannel = 'UpdateChannel',
  /** Grants permission to update Collection */
  UpdateCollection = 'UpdateCollection',
  /** Grants permission to update Country */
  UpdateCountry = 'UpdateCountry',
  /** Grants permission to update Customer */
  UpdateCustomer = 'UpdateCustomer',
  /** Grants permission to update CustomerGroup */
  UpdateCustomerGroup = 'UpdateCustomerGroup',
  /** Grants permission to update Facet */
  UpdateFacet = 'UpdateFacet',
  /** Grants permission to update GlobalSettings */
  UpdateGlobalSettings = 'UpdateGlobalSettings',
  /** Grants permission to update Order */
  UpdateOrder = 'UpdateOrder',
  /** Grants permission to update PaymentMethod */
  UpdatePaymentMethod = 'UpdatePaymentMethod',
  /** Grants permission to update Product */
  UpdateProduct = 'UpdateProduct',
  /** Grants permission to update Promotion */
  UpdatePromotion = 'UpdatePromotion',
  /** Grants permission to update Seller */
  UpdateSeller = 'UpdateSeller',
  /** Grants permission to update PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  UpdateSettings = 'UpdateSettings',
  /** Grants permission to update ShippingMethod */
  UpdateShippingMethod = 'UpdateShippingMethod',
  /** Grants permission to update StockLocation */
  UpdateStockLocation = 'UpdateStockLocation',
  /** Grants permission to update System */
  UpdateSystem = 'UpdateSystem',
  /** Grants permission to update Tag */
  UpdateTag = 'UpdateTag',
  /** Grants permission to update TaxCategory */
  UpdateTaxCategory = 'UpdateTaxCategory',
  /** Grants permission to update TaxRate */
  UpdateTaxRate = 'UpdateTaxRate',
  /** Grants permission to update Zone */
  UpdateZone = 'UpdateZone',
}

export type PermissionDefinition = {
  __typename?: 'PermissionDefinition';
  assignable: Scalars['Boolean']['output'];
  description: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type PreviewCollectionVariantsInput = {
  filters: Array<ConfigurableOperationInput>;
  inheritFilters: Scalars['Boolean']['input'];
  parentId?: InputMaybe<Scalars['ID']['input']>;
};

/** The price range where the result has more than one price */
export type PriceRange = {
  __typename?: 'PriceRange';
  max: Scalars['Money']['output'];
  min: Scalars['Money']['output'];
};

export type Product = Node & {
  __typename?: 'Product';
  assets: Array<Asset>;
  channels: Array<Channel>;
  collections: Array<Collection>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<ProductCustomFields>;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  facetValues: Array<FacetValue>;
  featuredAsset?: Maybe<Asset>;
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  optionGroups: Array<ProductOptionGroup>;
  slug: Scalars['String']['output'];
  translations: Array<ProductTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  /** Returns a paginated, sortable, filterable list of ProductVariants */
  variantList: ProductVariantList;
  /** Returns all ProductVariants */
  variants: Array<ProductVariant>;
};

export type ProductVariantListArgs = {
  options?: InputMaybe<ProductVariantListOptions>;
};

export type ProductCustomFields = {
  __typename?: 'ProductCustomFields';
  barcode?: Maybe<Scalars['String']['output']>;
};

export type ProductFilterParameter = {
  _and?: InputMaybe<Array<ProductFilterParameter>>;
  _or?: InputMaybe<Array<ProductFilterParameter>>;
  barcode?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  facetValueId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  sku?: InputMaybe<StringOperators>;
  slug?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ProductList = PaginatedList & {
  __typename?: 'ProductList';
  items: Array<Product>;
  totalItems: Scalars['Int']['output'];
};

export type ProductListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProductFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProductSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductManifestEntry = {
  __typename?: 'ProductManifestEntry';
  images: Array<ImageManifestEntry>;
  productId: Scalars['String']['output'];
  productName: Scalars['String']['output'];
};

export type ProductOption = Node & {
  __typename?: 'ProductOption';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  group: ProductOptionGroup;
  groupId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<ProductOptionTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionFilterParameter = {
  _and?: InputMaybe<Array<ProductOptionFilterParameter>>;
  _or?: InputMaybe<Array<ProductOptionFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  groupId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ProductOptionGroup = Node & {
  __typename?: 'ProductOptionGroup';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  options: Array<ProductOption>;
  translations: Array<ProductOptionGroupTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroupTranslation = {
  __typename?: 'ProductOptionGroupTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroupTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type ProductOptionInUseError = ErrorResult & {
  __typename?: 'ProductOptionInUseError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  optionGroupCode: Scalars['String']['output'];
  productVariantCount: Scalars['Int']['output'];
};

export type ProductOptionList = PaginatedList & {
  __typename?: 'ProductOptionList';
  items: Array<ProductOption>;
  totalItems: Scalars['Int']['output'];
};

export type ProductOptionListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProductOptionFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProductOptionSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductOptionSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  groupId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ProductOptionTranslation = {
  __typename?: 'ProductOptionTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type ProductSortParameter = {
  barcode?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ProductTranslation = {
  __typename?: 'ProductTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type ProductVariant = Node & {
  __typename?: 'ProductVariant';
  assets: Array<Asset>;
  channels: Array<Channel>;
  createdAt: Scalars['DateTime']['output'];
  currencyCode: CurrencyCode;
  customFields?: Maybe<ProductVariantCustomFields>;
  enabled: Scalars['Boolean']['output'];
  facetValues: Array<FacetValue>;
  featuredAsset?: Maybe<Asset>;
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  options: Array<ProductOption>;
  outOfStockThreshold: Scalars['Int']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
  prices: Array<ProductVariantPrice>;
  product: Product;
  productId: Scalars['ID']['output'];
  sku: Scalars['String']['output'];
  /** @deprecated use stockLevels */
  stockAllocated: Scalars['Int']['output'];
  stockLevel: Scalars['String']['output'];
  stockLevels: Array<StockLevel>;
  stockMovements: StockMovementList;
  /** @deprecated use stockLevels */
  stockOnHand: Scalars['Int']['output'];
  taxCategory: TaxCategory;
  taxRateApplied: TaxRate;
  trackInventory: GlobalFlag;
  translations: Array<ProductVariantTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  useGlobalOutOfStockThreshold: Scalars['Boolean']['output'];
};

export type ProductVariantStockMovementsArgs = {
  options?: InputMaybe<StockMovementListOptions>;
};

export type ProductVariantCustomFields = {
  __typename?: 'ProductVariantCustomFields';
  allowFractionalQuantity?: Maybe<Scalars['Boolean']['output']>;
  wholesalePrice?: Maybe<Scalars['Int']['output']>;
};

export type ProductVariantFilterParameter = {
  _and?: InputMaybe<Array<ProductVariantFilterParameter>>;
  _or?: InputMaybe<Array<ProductVariantFilterParameter>>;
  allowFractionalQuantity?: InputMaybe<BooleanOperators>;
  createdAt?: InputMaybe<DateOperators>;
  currencyCode?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  facetValueId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  outOfStockThreshold?: InputMaybe<NumberOperators>;
  price?: InputMaybe<NumberOperators>;
  priceWithTax?: InputMaybe<NumberOperators>;
  productId?: InputMaybe<IdOperators>;
  sku?: InputMaybe<StringOperators>;
  stockAllocated?: InputMaybe<NumberOperators>;
  stockLevel?: InputMaybe<StringOperators>;
  stockOnHand?: InputMaybe<NumberOperators>;
  trackInventory?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  useGlobalOutOfStockThreshold?: InputMaybe<BooleanOperators>;
  wholesalePrice?: InputMaybe<NumberOperators>;
};

export type ProductVariantList = PaginatedList & {
  __typename?: 'ProductVariantList';
  items: Array<ProductVariant>;
  totalItems: Scalars['Int']['output'];
};

export type ProductVariantListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProductVariantFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProductVariantSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductVariantPrice = {
  __typename?: 'ProductVariantPrice';
  currencyCode: CurrencyCode;
  customFields?: Maybe<Scalars['JSON']['output']>;
  price: Scalars['Money']['output'];
};

export type ProductVariantSortParameter = {
  allowFractionalQuantity?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  outOfStockThreshold?: InputMaybe<SortOrder>;
  price?: InputMaybe<SortOrder>;
  priceWithTax?: InputMaybe<SortOrder>;
  productId?: InputMaybe<SortOrder>;
  sku?: InputMaybe<SortOrder>;
  stockAllocated?: InputMaybe<SortOrder>;
  stockLevel?: InputMaybe<SortOrder>;
  stockOnHand?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  wholesalePrice?: InputMaybe<SortOrder>;
};

export type ProductVariantTranslation = {
  __typename?: 'ProductVariantTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductVariantTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type Promotion = Node & {
  __typename?: 'Promotion';
  actions: Array<ConfigurableOperation>;
  conditions: Array<ConfigurableOperation>;
  couponCode?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  endsAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  perCustomerUsageLimit?: Maybe<Scalars['Int']['output']>;
  startsAt?: Maybe<Scalars['DateTime']['output']>;
  translations: Array<PromotionTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  usageLimit?: Maybe<Scalars['Int']['output']>;
};

export type PromotionFilterParameter = {
  _and?: InputMaybe<Array<PromotionFilterParameter>>;
  _or?: InputMaybe<Array<PromotionFilterParameter>>;
  couponCode?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  endsAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  perCustomerUsageLimit?: InputMaybe<NumberOperators>;
  startsAt?: InputMaybe<DateOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  usageLimit?: InputMaybe<NumberOperators>;
};

export type PromotionList = PaginatedList & {
  __typename?: 'PromotionList';
  items: Array<Promotion>;
  totalItems: Scalars['Int']['output'];
};

export type PromotionListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<PromotionFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<PromotionSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type PromotionSortParameter = {
  couponCode?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  endsAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  perCustomerUsageLimit?: InputMaybe<SortOrder>;
  startsAt?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  usageLimit?: InputMaybe<SortOrder>;
};

export type PromotionTranslation = {
  __typename?: 'PromotionTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type PromotionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type Province = Node &
  Region & {
    __typename?: 'Province';
    code: Scalars['String']['output'];
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    enabled: Scalars['Boolean']['output'];
    id: Scalars['ID']['output'];
    languageCode: LanguageCode;
    name: Scalars['String']['output'];
    parent?: Maybe<Region>;
    parentId?: Maybe<Scalars['ID']['output']>;
    translations: Array<RegionTranslation>;
    type: Scalars['String']['output'];
    updatedAt: Scalars['DateTime']['output'];
  };

export type ProvinceFilterParameter = {
  _and?: InputMaybe<Array<ProvinceFilterParameter>>;
  _or?: InputMaybe<Array<ProvinceFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  parentId?: InputMaybe<IdOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ProvinceList = PaginatedList & {
  __typename?: 'ProvinceList';
  items: Array<Province>;
  totalItems: Scalars['Int']['output'];
};

export type ProvinceListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProvinceFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProvinceSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProvinceSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  parentId?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ProvinceTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type PurchaseFilterInput = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  supplierId?: InputMaybe<Scalars['ID']['input']>;
};

export type PurchaseLineInput = {
  quantity: Scalars['Float']['input'];
  stockLocationId: Scalars['ID']['input'];
  unitCost: Scalars['Int']['input'];
  variantId: Scalars['ID']['input'];
};

export type PurchaseListOptions = {
  filter?: InputMaybe<PurchaseFilterInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<PurchaseSortInput>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type PurchaseSortInput = {
  createdAt?: InputMaybe<SortOrder>;
  purchaseDate?: InputMaybe<SortOrder>;
};

export type PushSubscriptionInput = {
  endpoint: Scalars['String']['input'];
  keys: Scalars['JSON']['input'];
};

/** Returned if the specified quantity of an OrderLine is greater than the number of items in that line */
export type QuantityTooGreatError = ErrorResult & {
  __typename?: 'QuantityTooGreatError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  accountBalancesAsOf: Array<AccountBalanceAsOfItem>;
  activeAdministrator?: Maybe<Administrator>;
  activeChannel: Channel;
  administrator?: Maybe<Administrator>;
  administratorByUserId?: Maybe<Administrator>;
  administrators: AdministratorList;
  /** Get a single Asset by id */
  asset?: Maybe<Asset>;
  /** Get a list of Assets */
  assets: AssetList;
  auditLogs: Array<AuditLog>;
  cashierSession?: Maybe<CashierSessionSummary>;
  cashierSessions: CashierSessionList;
  channel?: Maybe<Channel>;
  channelReconciliationConfig: Array<PaymentMethodReconciliationConfig>;
  channels: ChannelList;
  checkAuthorizationStatus: AuthorizationStatus;
  checkCompanyCodeAvailability: Scalars['Boolean']['output'];
  checkIdentifierAvailable: Scalars['Boolean']['output'];
  /** Quick subscription status check */
  checkSubscriptionStatus: SubscriptionStatus;
  closedPeriods: Array<AccountingPeriod>;
  closedSessionsMissingReconciliation: Array<ClosedSessionMissingReconciliation>;
  /** Get a Collection either by id or slug. If neither id nor slug is specified, an error will result. */
  collection?: Maybe<Collection>;
  collectionFilters: Array<ConfigurableOperationDefinition>;
  collections: CollectionList;
  countries: CountryList;
  country?: Maybe<Country>;
  creditSummary: CreditSummary;
  currentCashierSession?: Maybe<CashierSession>;
  currentPeriodStatus: PeriodStatus;
  customer?: Maybe<Customer>;
  customerGroup?: Maybe<CustomerGroup>;
  customerGroups: CustomerGroupList;
  customers: CustomerList;
  dashboardStats: DashboardStats;
  /** Ledger accounts eligible as payment/debit sources (asset, leaf, excluding AR and inventory). */
  eligibleDebitAccounts: LedgerAccountsResult;
  /** Returns a list of eligible shipping methods for the draft Order */
  eligibleShippingMethodsForDraftOrder: Array<ShippingMethodQuote>;
  /** Returns all configured EntityDuplicators. */
  entityDuplicators: Array<EntityDuplicatorDefinition>;
  expectedSessionClosingBalances: Array<ExpectedClosingBalance>;
  facet?: Maybe<Facet>;
  facetValue?: Maybe<FacetValue>;
  facetValues: FacetValueList;
  facets: FacetList;
  fulfillmentHandlers: Array<ConfigurableOperationDefinition>;
  getApprovalRequest?: Maybe<ApprovalRequest>;
  getApprovalRequests: ApprovalRequestList;
  /** Get current channel's subscription details */
  getChannelSubscription: ChannelSubscription;
  getMyApprovalRequests: ApprovalRequestList;
  /** Get value for a specific key (automatically scoped based on field configuration) */
  getSettingsStoreValue?: Maybe<Scalars['JSON']['output']>;
  /** Get multiple key-value pairs (each automatically scoped) */
  getSettingsStoreValues?: Maybe<Scalars['JSON']['output']>;
  /** Get all active subscription tiers */
  getSubscriptionTiers: Array<SubscriptionTier>;
  getUnreadCount: Scalars['Int']['output'];
  getUserNotifications: NotificationList;
  globalSettings: GlobalSettings;
  inventoryValuation: InventoryValuation;
  job?: Maybe<Job>;
  jobBufferSize: Array<JobBufferSize>;
  jobQueues: Array<JobQueue>;
  jobs: JobList;
  jobsById: Array<Job>;
  journalEntries: JournalEntriesResult;
  journalEntry?: Maybe<JournalEntry>;
  lastClosedSessionClosingBalances: Array<LastClosingBalance>;
  ledgerAccounts: LedgerAccountsResult;
  me?: Maybe<CurrentUser>;
  /** Get metrics for the given interval and metric types. */
  metricSummary: Array<MetricSummary>;
  /** Get ML model info for a specific channel */
  mlModelInfo: MlModelInfo;
  /** Get detailed training info including status and stats */
  mlTrainingInfo: MlTrainingInfo;
  /** Get photo manifest for training (JSON with URLs) */
  mlTrainingManifest: MlTrainingManifest;
  order?: Maybe<Order>;
  orders: OrderList;
  paymentMethod?: Maybe<PaymentMethod>;
  paymentMethodEligibilityCheckers: Array<ConfigurableOperationDefinition>;
  paymentMethodHandlers: Array<ConfigurableOperationDefinition>;
  paymentMethods: PaymentMethodList;
  pendingSearchIndexUpdates: Scalars['Int']['output'];
  pendingVarianceReviews: Array<CashDrawerCount>;
  periodReconciliationStatus: ReconciliationStatus;
  /** Used for real-time previews of the contents of a Collection */
  previewCollectionVariants: ProductVariantList;
  /** Get a Product either by id or slug. If neither id nor slug is specified, an error will result. */
  product?: Maybe<Product>;
  productOption?: Maybe<ProductOption>;
  productOptionGroup?: Maybe<ProductOptionGroup>;
  productOptionGroups: Array<ProductOptionGroup>;
  productOptions: ProductOptionList;
  /** Get a ProductVariant by id */
  productVariant?: Maybe<ProductVariant>;
  /** List ProductVariants either all or for the specific product. */
  productVariants: ProductVariantList;
  /** List Products */
  products: ProductList;
  promotion?: Maybe<Promotion>;
  promotionActions: Array<ConfigurableOperationDefinition>;
  promotionConditions: Array<ConfigurableOperationDefinition>;
  promotions: PromotionList;
  province?: Maybe<Province>;
  provinces: ProvinceList;
  purchases: StockPurchaseList;
  reconciliationDetails: Array<ReconciliationAccountDetail>;
  reconciliations: ReconciliationList;
  role?: Maybe<Role>;
  roleTemplates: Array<RoleTemplate>;
  roles: RoleList;
  scheduledTasks: Array<ScheduledTask>;
  search: SearchResponse;
  seller?: Maybe<Seller>;
  sellers: SellerList;
  sessionCashCounts: Array<CashDrawerCount>;
  sessionMpesaVerifications: Array<MpesaVerification>;
  sessionReconciliationDetails: Array<ReconciliationAccountDetail>;
  sessionReconciliationRequirements: SessionReconciliationRequirements;
  shiftModalPrefillData: ShiftModalPrefillData;
  shippingCalculators: Array<ConfigurableOperationDefinition>;
  shippingEligibilityCheckers: Array<ConfigurableOperationDefinition>;
  shippingMethod?: Maybe<ShippingMethod>;
  shippingMethods: ShippingMethodList;
  /** Generate slug for entity */
  slugForEntity: Scalars['String']['output'];
  stockAdjustments: InventoryStockAdjustmentList;
  stockLocation?: Maybe<StockLocation>;
  stockLocations: StockLocationList;
  supplierCreditSummary: SupplierCreditSummary;
  tag: Tag;
  tags: TagList;
  taxCategories: TaxCategoryList;
  taxCategory?: Maybe<TaxCategory>;
  taxRate?: Maybe<TaxRate>;
  taxRates: TaxRateList;
  testEligibleShippingMethods: Array<ShippingMethodQuote>;
  testShippingMethod: TestShippingMethodResult;
  unpaidOrdersForCustomer: Array<Order>;
  unpaidPurchasesForSupplier: Array<StockPurchase>;
  validateCredit: CreditValidationResult;
  zone?: Maybe<Zone>;
  zones: ZoneList;
};

export type QueryAccountBalancesAsOfArgs = {
  asOfDate: Scalars['String']['input'];
  channelId: Scalars['Int']['input'];
};

export type QueryAdministratorArgs = {
  id: Scalars['ID']['input'];
};

export type QueryAdministratorByUserIdArgs = {
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryAdministratorsArgs = {
  options?: InputMaybe<AdministratorListOptions>;
};

export type QueryAssetArgs = {
  id: Scalars['ID']['input'];
};

export type QueryAssetsArgs = {
  options?: InputMaybe<AssetListOptions>;
};

export type QueryAuditLogsArgs = {
  options?: InputMaybe<AuditLogOptions>;
};

export type QueryCashierSessionArgs = {
  sessionId: Scalars['ID']['input'];
};

export type QueryCashierSessionsArgs = {
  channelId: Scalars['Int']['input'];
  options?: InputMaybe<CashierSessionListOptions>;
};

export type QueryChannelArgs = {
  id: Scalars['ID']['input'];
};

export type QueryChannelReconciliationConfigArgs = {
  channelId: Scalars['Int']['input'];
};

export type QueryChannelsArgs = {
  options?: InputMaybe<ChannelListOptions>;
};

export type QueryCheckAuthorizationStatusArgs = {
  identifier: Scalars['String']['input'];
};

export type QueryCheckCompanyCodeAvailabilityArgs = {
  companyCode: Scalars['String']['input'];
};

export type QueryCheckIdentifierAvailableArgs = {
  identifier: Scalars['String']['input'];
};

export type QueryCheckSubscriptionStatusArgs = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryClosedPeriodsArgs = {
  channelId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryClosedSessionsMissingReconciliationArgs = {
  channelId: Scalars['Int']['input'];
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryCollectionArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCollectionsArgs = {
  options?: InputMaybe<CollectionListOptions>;
};

export type QueryCountriesArgs = {
  options?: InputMaybe<CountryListOptions>;
};

export type QueryCountryArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCreditSummaryArgs = {
  customerId: Scalars['ID']['input'];
};

export type QueryCurrentCashierSessionArgs = {
  channelId: Scalars['Int']['input'];
};

export type QueryCurrentPeriodStatusArgs = {
  channelId: Scalars['Int']['input'];
};

export type QueryCustomerArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCustomerGroupArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCustomerGroupsArgs = {
  options?: InputMaybe<CustomerGroupListOptions>;
};

export type QueryCustomersArgs = {
  options?: InputMaybe<CustomerListOptions>;
};

export type QueryDashboardStatsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};

export type QueryEligibleShippingMethodsForDraftOrderArgs = {
  orderId: Scalars['ID']['input'];
};

export type QueryExpectedSessionClosingBalancesArgs = {
  sessionId: Scalars['ID']['input'];
};

export type QueryFacetArgs = {
  id: Scalars['ID']['input'];
};

export type QueryFacetValueArgs = {
  id: Scalars['ID']['input'];
};

export type QueryFacetValuesArgs = {
  options?: InputMaybe<FacetValueListOptions>;
};

export type QueryFacetsArgs = {
  options?: InputMaybe<FacetListOptions>;
};

export type QueryGetApprovalRequestArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetApprovalRequestsArgs = {
  options?: InputMaybe<ApprovalRequestListOptions>;
};

export type QueryGetChannelSubscriptionArgs = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryGetMyApprovalRequestsArgs = {
  options?: InputMaybe<ApprovalRequestListOptions>;
};

export type QueryGetSettingsStoreValueArgs = {
  key: Scalars['String']['input'];
};

export type QueryGetSettingsStoreValuesArgs = {
  keys: Array<Scalars['String']['input']>;
};

export type QueryGetUserNotificationsArgs = {
  options?: InputMaybe<NotificationListOptions>;
};

export type QueryInventoryValuationArgs = {
  asOfDate: Scalars['DateTime']['input'];
  channelId: Scalars['Int']['input'];
  stockLocationId?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryJobArgs = {
  jobId: Scalars['ID']['input'];
};

export type QueryJobBufferSizeArgs = {
  bufferIds?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type QueryJobsArgs = {
  options?: InputMaybe<JobListOptions>;
};

export type QueryJobsByIdArgs = {
  jobIds: Array<Scalars['ID']['input']>;
};

export type QueryJournalEntriesArgs = {
  options?: InputMaybe<JournalEntriesOptions>;
};

export type QueryJournalEntryArgs = {
  id: Scalars['ID']['input'];
};

export type QueryLastClosedSessionClosingBalancesArgs = {
  channelId: Scalars['Int']['input'];
};

export type QueryMetricSummaryArgs = {
  input?: InputMaybe<MetricSummaryInput>;
};

export type QueryMlModelInfoArgs = {
  channelId: Scalars['ID']['input'];
};

export type QueryMlTrainingInfoArgs = {
  channelId: Scalars['ID']['input'];
};

export type QueryMlTrainingManifestArgs = {
  channelId: Scalars['ID']['input'];
};

export type QueryOrderArgs = {
  id: Scalars['ID']['input'];
};

export type QueryOrdersArgs = {
  options?: InputMaybe<OrderListOptions>;
};

export type QueryPaymentMethodArgs = {
  id: Scalars['ID']['input'];
};

export type QueryPaymentMethodsArgs = {
  options?: InputMaybe<PaymentMethodListOptions>;
};

export type QueryPendingVarianceReviewsArgs = {
  channelId: Scalars['Int']['input'];
};

export type QueryPeriodReconciliationStatusArgs = {
  channelId: Scalars['Int']['input'];
  periodEndDate: Scalars['DateTime']['input'];
};

export type QueryPreviewCollectionVariantsArgs = {
  input: PreviewCollectionVariantsInput;
  options?: InputMaybe<ProductVariantListOptions>;
};

export type QueryProductArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type QueryProductOptionArgs = {
  id: Scalars['ID']['input'];
};

export type QueryProductOptionGroupArgs = {
  id: Scalars['ID']['input'];
};

export type QueryProductOptionGroupsArgs = {
  filterTerm?: InputMaybe<Scalars['String']['input']>;
};

export type QueryProductOptionsArgs = {
  groupId?: InputMaybe<Scalars['ID']['input']>;
  options?: InputMaybe<ProductOptionListOptions>;
};

export type QueryProductVariantArgs = {
  id: Scalars['ID']['input'];
};

export type QueryProductVariantsArgs = {
  options?: InputMaybe<ProductVariantListOptions>;
  productId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryProductsArgs = {
  options?: InputMaybe<ProductListOptions>;
};

export type QueryPromotionArgs = {
  id: Scalars['ID']['input'];
};

export type QueryPromotionsArgs = {
  options?: InputMaybe<PromotionListOptions>;
};

export type QueryProvinceArgs = {
  id: Scalars['ID']['input'];
};

export type QueryProvincesArgs = {
  options?: InputMaybe<ProvinceListOptions>;
};

export type QueryPurchasesArgs = {
  options?: InputMaybe<PurchaseListOptions>;
};

export type QueryReconciliationDetailsArgs = {
  reconciliationId: Scalars['ID']['input'];
};

export type QueryReconciliationsArgs = {
  channelId: Scalars['Int']['input'];
  options?: InputMaybe<ReconciliationListOptions>;
};

export type QueryRoleArgs = {
  id: Scalars['ID']['input'];
};

export type QueryRolesArgs = {
  options?: InputMaybe<RoleListOptions>;
};

export type QuerySearchArgs = {
  input: SearchInput;
};

export type QuerySellerArgs = {
  id: Scalars['ID']['input'];
};

export type QuerySellersArgs = {
  options?: InputMaybe<SellerListOptions>;
};

export type QuerySessionCashCountsArgs = {
  sessionId: Scalars['ID']['input'];
};

export type QuerySessionMpesaVerificationsArgs = {
  sessionId: Scalars['ID']['input'];
};

export type QuerySessionReconciliationDetailsArgs = {
  kind?: InputMaybe<Scalars['String']['input']>;
  sessionId: Scalars['ID']['input'];
};

export type QuerySessionReconciliationRequirementsArgs = {
  sessionId: Scalars['ID']['input'];
};

export type QueryShiftModalPrefillDataArgs = {
  channelId: Scalars['Int']['input'];
};

export type QueryShippingMethodArgs = {
  id: Scalars['ID']['input'];
};

export type QueryShippingMethodsArgs = {
  options?: InputMaybe<ShippingMethodListOptions>;
};

export type QuerySlugForEntityArgs = {
  input: SlugForEntityInput;
};

export type QueryStockAdjustmentsArgs = {
  options?: InputMaybe<StockAdjustmentListOptions>;
};

export type QueryStockLocationArgs = {
  id: Scalars['ID']['input'];
};

export type QueryStockLocationsArgs = {
  options?: InputMaybe<StockLocationListOptions>;
};

export type QuerySupplierCreditSummaryArgs = {
  supplierId: Scalars['ID']['input'];
};

export type QueryTagArgs = {
  id: Scalars['ID']['input'];
};

export type QueryTagsArgs = {
  options?: InputMaybe<TagListOptions>;
};

export type QueryTaxCategoriesArgs = {
  options?: InputMaybe<TaxCategoryListOptions>;
};

export type QueryTaxCategoryArgs = {
  id: Scalars['ID']['input'];
};

export type QueryTaxRateArgs = {
  id: Scalars['ID']['input'];
};

export type QueryTaxRatesArgs = {
  options?: InputMaybe<TaxRateListOptions>;
};

export type QueryTestEligibleShippingMethodsArgs = {
  input: TestEligibleShippingMethodsInput;
};

export type QueryTestShippingMethodArgs = {
  input: TestShippingMethodInput;
};

export type QueryUnpaidOrdersForCustomerArgs = {
  customerId: Scalars['ID']['input'];
};

export type QueryUnpaidPurchasesForSupplierArgs = {
  supplierId: Scalars['ID']['input'];
};

export type QueryValidateCreditArgs = {
  input: ValidateCreditInput;
};

export type QueryZoneArgs = {
  id: Scalars['ID']['input'];
};

export type QueryZonesArgs = {
  options?: InputMaybe<ZoneListOptions>;
};

export type Reconciliation = {
  __typename?: 'Reconciliation';
  actualBalance?: Maybe<Scalars['String']['output']>;
  channelId: Scalars['Int']['output'];
  createdBy: Scalars['Int']['output'];
  expectedBalance?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  rangeEnd: Scalars['DateTime']['output'];
  rangeStart: Scalars['DateTime']['output'];
  reviewedBy?: Maybe<Scalars['Int']['output']>;
  scope: Scalars['String']['output'];
  scopeRefId: Scalars['String']['output'];
  status: Scalars['String']['output'];
  varianceAmount: Scalars['String']['output'];
};

export type ReconciliationAccountDetail = {
  __typename?: 'ReconciliationAccountDetail';
  accountCode: Scalars['String']['output'];
  accountId: Scalars['ID']['output'];
  accountName: Scalars['String']['output'];
  declaredAmountCents?: Maybe<Scalars['String']['output']>;
  expectedBalanceCents?: Maybe<Scalars['String']['output']>;
  varianceCents?: Maybe<Scalars['String']['output']>;
};

export type ReconciliationList = {
  __typename?: 'ReconciliationList';
  items: Array<Reconciliation>;
  totalItems: Scalars['Int']['output'];
};

export type ReconciliationListOptions = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  hasVariance?: InputMaybe<Scalars['Boolean']['input']>;
  scope?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ReconciliationStatus = {
  __typename?: 'ReconciliationStatus';
  periodEndDate: Scalars['DateTime']['output'];
  scopes: Array<ScopeReconciliationStatus>;
};

export type ReconciliationSummary = {
  __typename?: 'ReconciliationSummary';
  periodEndDate: Scalars['DateTime']['output'];
  scopes: Array<ScopeReconciliationStatus>;
};

export type RecordCashCountInput = {
  countType: Scalars['String']['input'];
  declaredCash: Scalars['String']['input'];
  sessionId: Scalars['ID']['input'];
};

export type RecordExpenseInput = {
  amount: Scalars['Int']['input'];
  memo?: InputMaybe<Scalars['String']['input']>;
  sourceAccountCode: Scalars['String']['input'];
};

export type RecordExpenseResult = {
  __typename?: 'RecordExpenseResult';
  sourceId: Scalars['String']['output'];
};

export type RecordPurchaseInput = {
  approvalId?: InputMaybe<Scalars['ID']['input']>;
  isCreditPurchase?: InputMaybe<Scalars['Boolean']['input']>;
  lines: Array<PurchaseLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  payment?: InputMaybe<InlinePaymentInput>;
  paymentStatus: Scalars['String']['input'];
  purchaseDate: Scalars['DateTime']['input'];
  referenceNumber?: InputMaybe<Scalars['String']['input']>;
  supplierId: Scalars['ID']['input'];
};

export type RecordStockAdjustmentInput = {
  lines: Array<StockAdjustmentLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  reason: Scalars['String']['input'];
};

export type Refund = Node & {
  __typename?: 'Refund';
  adjustment: Scalars['Money']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  items: Scalars['Money']['output'];
  lines: Array<RefundLine>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  method?: Maybe<Scalars['String']['output']>;
  paymentId: Scalars['ID']['output'];
  reason?: Maybe<Scalars['String']['output']>;
  shipping: Scalars['Money']['output'];
  state: Scalars['String']['output'];
  total: Scalars['Money']['output'];
  transactionId?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned if `amount` is greater than the maximum un-refunded amount of the Payment */
export type RefundAmountError = ErrorResult & {
  __typename?: 'RefundAmountError';
  errorCode: ErrorCode;
  maximumRefundable: Scalars['Int']['output'];
  message: Scalars['String']['output'];
};

export type RefundLine = {
  __typename?: 'RefundLine';
  orderLine: OrderLine;
  orderLineId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
  refund: Refund;
  refundId: Scalars['ID']['output'];
};

export type RefundOrderInput = {
  /**
   * The amount to be refunded to this particular payment. This was introduced in v2.2.0 as the preferred way to specify the refund amount.
   * Can be as much as the total amount of the payment minus the sum of all previous refunds.
   */
  amount?: InputMaybe<Scalars['Money']['input']>;
  paymentId: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type RefundOrderResult =
  | AlreadyRefundedError
  | MultipleOrderError
  | NothingToRefundError
  | OrderStateTransitionError
  | PaymentOrderMismatchError
  | QuantityTooGreatError
  | Refund
  | RefundAmountError
  | RefundOrderStateError
  | RefundStateTransitionError;

/** Returned if an attempting to refund an Order which is not in the expected state */
export type RefundOrderStateError = ErrorResult & {
  __typename?: 'RefundOrderStateError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  orderState: Scalars['String']['output'];
};

/**
 * Returned when a call to modifyOrder fails to include a refundPaymentId even
 * though the price has decreased as a result of the changes.
 */
export type RefundPaymentIdMissingError = ErrorResult & {
  __typename?: 'RefundPaymentIdMissingError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned when there is an error in transitioning the Refund state */
export type RefundStateTransitionError = ErrorResult & {
  __typename?: 'RefundStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

export type Region = {
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  parent?: Maybe<Region>;
  parentId?: Maybe<Scalars['ID']['output']>;
  translations: Array<RegionTranslation>;
  type: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type RegionTranslation = {
  __typename?: 'RegionTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type RegistrationInput = {
  adminEmail?: InputMaybe<Scalars['String']['input']>;
  adminFirstName: Scalars['String']['input'];
  adminLastName: Scalars['String']['input'];
  adminPhoneNumber: Scalars['String']['input'];
  companyName: Scalars['String']['input'];
  currency: Scalars['String']['input'];
  storeAddress: Scalars['String']['input'];
  storeName: Scalars['String']['input'];
};

export type RegistrationResult = {
  __typename?: 'RegistrationResult';
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
  userId?: Maybe<Scalars['ID']['output']>;
};

export type RelationCustomFieldConfig = CustomField & {
  __typename?: 'RelationCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  entity: Scalars['String']['output'];
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  scalarFields: Array<Scalars['String']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type Release = Node &
  StockMovement & {
    __typename?: 'Release';
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    productVariant: ProductVariant;
    quantity: Scalars['Int']['output'];
    type: StockMovementType;
    updatedAt: Scalars['DateTime']['output'];
  };

export type RemoveCollectionsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  collectionIds: Array<Scalars['ID']['input']>;
};

export type RemoveFacetFromChannelResult = Facet | FacetInUseError;

export type RemoveFacetsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  facetIds: Array<Scalars['ID']['input']>;
  force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type RemoveOptionGroupFromProductResult = Product | ProductOptionInUseError;

export type RemoveOrderItemsResult = Order | OrderInterceptorError | OrderModificationError;

export type RemovePaymentMethodsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  paymentMethodIds: Array<Scalars['ID']['input']>;
};

export type RemoveProductVariantsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  productVariantIds: Array<Scalars['ID']['input']>;
};

export type RemoveProductsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  productIds: Array<Scalars['ID']['input']>;
};

export type RemovePromotionsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  promotionIds: Array<Scalars['ID']['input']>;
};

export type RemoveShippingMethodsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  shippingMethodIds: Array<Scalars['ID']['input']>;
};

export type RemoveStockLocationsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  stockLocationIds: Array<Scalars['ID']['input']>;
};

export type Return = Node &
  StockMovement & {
    __typename?: 'Return';
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    productVariant: ProductVariant;
    quantity: Scalars['Int']['output'];
    type: StockMovementType;
    updatedAt: Scalars['DateTime']['output'];
  };

export type ReviewApprovalRequestInput = {
  action: Scalars['String']['input'];
  id: Scalars['ID']['input'];
  message?: InputMaybe<Scalars['String']['input']>;
};

export type Role = Node & {
  __typename?: 'Role';
  channels: Array<Channel>;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  permissions: Array<Permission>;
  updatedAt: Scalars['DateTime']['output'];
};

export type RoleFilterParameter = {
  _and?: InputMaybe<Array<RoleFilterParameter>>;
  _or?: InputMaybe<Array<RoleFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type RoleList = PaginatedList & {
  __typename?: 'RoleList';
  items: Array<Role>;
  totalItems: Scalars['Int']['output'];
};

export type RoleListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<RoleFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<RoleSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type RoleSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type RoleTemplate = {
  __typename?: 'RoleTemplate';
  code: Scalars['String']['output'];
  description: Scalars['String']['output'];
  name: Scalars['String']['output'];
  permissions: Array<Scalars['String']['output']>;
};

export type Sale = Node &
  StockMovement & {
    __typename?: 'Sale';
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    productVariant: ProductVariant;
    quantity: Scalars['Int']['output'];
    type: StockMovementType;
    updatedAt: Scalars['DateTime']['output'];
  };

export type ScheduledTask = {
  __typename?: 'ScheduledTask';
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['String']['output'];
  isRunning: Scalars['Boolean']['output'];
  lastExecutedAt?: Maybe<Scalars['DateTime']['output']>;
  lastResult?: Maybe<Scalars['JSON']['output']>;
  nextExecutionAt?: Maybe<Scalars['DateTime']['output']>;
  schedule: Scalars['String']['output'];
  scheduleDescription: Scalars['String']['output'];
};

export type ScopeReconciliationStatus = {
  __typename?: 'ScopeReconciliationStatus';
  displayName?: Maybe<Scalars['String']['output']>;
  scope: Scalars['String']['output'];
  scopeRefId: Scalars['String']['output'];
  status: Scalars['String']['output'];
  varianceAmount?: Maybe<Scalars['String']['output']>;
};

export type SearchInput = {
  collectionId?: InputMaybe<Scalars['ID']['input']>;
  collectionSlug?: InputMaybe<Scalars['String']['input']>;
  facetValueFilters?: InputMaybe<Array<FacetValueFilterInput>>;
  groupByProduct?: InputMaybe<Scalars['Boolean']['input']>;
  inStock?: InputMaybe<Scalars['Boolean']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<SearchResultSortParameter>;
  take?: InputMaybe<Scalars['Int']['input']>;
  term?: InputMaybe<Scalars['String']['input']>;
};

export type SearchReindexResponse = {
  __typename?: 'SearchReindexResponse';
  success: Scalars['Boolean']['output'];
};

export type SearchResponse = {
  __typename?: 'SearchResponse';
  collections: Array<CollectionResult>;
  facetValues: Array<FacetValueResult>;
  items: Array<SearchResult>;
  totalItems: Scalars['Int']['output'];
};

export type SearchResult = {
  __typename?: 'SearchResult';
  /** An array of ids of the Channels in which this result appears */
  channelIds: Array<Scalars['ID']['output']>;
  /** An array of ids of the Collections in which this result appears */
  collectionIds: Array<Scalars['ID']['output']>;
  currencyCode: CurrencyCode;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  facetIds: Array<Scalars['ID']['output']>;
  facetValueIds: Array<Scalars['ID']['output']>;
  inStock: Scalars['Boolean']['output'];
  price: SearchResultPrice;
  priceWithTax: SearchResultPrice;
  productAsset?: Maybe<SearchResultAsset>;
  productId: Scalars['ID']['output'];
  productName: Scalars['String']['output'];
  productVariantAsset?: Maybe<SearchResultAsset>;
  productVariantId: Scalars['ID']['output'];
  productVariantName: Scalars['String']['output'];
  /** A relevance score for the result. Differs between database implementations */
  score: Scalars['Float']['output'];
  sku: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type SearchResultAsset = {
  __typename?: 'SearchResultAsset';
  focalPoint?: Maybe<Coordinate>;
  id: Scalars['ID']['output'];
  preview: Scalars['String']['output'];
};

/** The price of a search result product, either as a range or as a single price */
export type SearchResultPrice = PriceRange | SinglePrice;

export type SearchResultSortParameter = {
  name?: InputMaybe<SortOrder>;
  price?: InputMaybe<SortOrder>;
};

export type Seller = Node & {
  __typename?: 'Seller';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type SellerFilterParameter = {
  _and?: InputMaybe<Array<SellerFilterParameter>>;
  _or?: InputMaybe<Array<SellerFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type SellerList = PaginatedList & {
  __typename?: 'SellerList';
  items: Array<Seller>;
  totalItems: Scalars['Int']['output'];
};

export type SellerListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<SellerFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<SellerSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type SellerSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ServerConfig = {
  __typename?: 'ServerConfig';
  /**
   * This field is deprecated in v2.2 in favor of the entityCustomFields field,
   * which allows custom fields to be defined on user-supplies entities.
   */
  customFieldConfig: CustomFields;
  entityCustomFields: Array<EntityCustomFields>;
  moneyStrategyPrecision: Scalars['Int']['output'];
  orderProcess: Array<OrderProcessState>;
  permissions: Array<PermissionDefinition>;
  permittedAssetTypes: Array<Scalars['String']['output']>;
};

export type SessionReconciliationRequirements = {
  __typename?: 'SessionReconciliationRequirements';
  blindCountRequired: Scalars['Boolean']['output'];
  paymentMethods: Array<PaymentMethodReconciliationConfig>;
  verificationRequired: Scalars['Boolean']['output'];
};

export type SetCustomerForDraftOrderResult = EmailAddressConflictError | Order;

export type SetOrderCustomerInput = {
  customerId: Scalars['ID']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  orderId: Scalars['ID']['input'];
};

export type SetOrderLineCustomPriceInput = {
  customLinePrice: Scalars['Int']['input'];
  orderLineId: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type SetOrderLineCustomPriceResult = Error | OrderLine;

export type SetOrderShippingMethodResult =
  | IneligibleShippingMethodError
  | NoActiveOrderError
  | Order
  | OrderModificationError;

export type SetSettingsStoreValueResult = {
  __typename?: 'SetSettingsStoreValueResult';
  error?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  result: Scalars['Boolean']['output'];
};

export type SettingsStoreInput = {
  key: Scalars['String']['input'];
  value: Scalars['JSON']['input'];
};

/** Returned if the Payment settlement fails */
export type SettlePaymentError = ErrorResult & {
  __typename?: 'SettlePaymentError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  paymentErrorMessage: Scalars['String']['output'];
};

export type SettlePaymentResult =
  | OrderStateTransitionError
  | Payment
  | PaymentStateTransitionError
  | SettlePaymentError;

export type SettleRefundInput = {
  id: Scalars['ID']['input'];
  transactionId: Scalars['String']['input'];
};

export type SettleRefundResult = Refund | RefundStateTransitionError;

export type ShiftModalPrefillData = {
  __typename?: 'ShiftModalPrefillData';
  balances: Array<LastClosingBalance>;
  config: Array<PaymentMethodReconciliationConfig>;
};

export type ShippingLine = {
  __typename?: 'ShippingLine';
  customFields?: Maybe<Scalars['JSON']['output']>;
  discountedPrice: Scalars['Money']['output'];
  discountedPriceWithTax: Scalars['Money']['output'];
  discounts: Array<Discount>;
  id: Scalars['ID']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
  shippingMethod: ShippingMethod;
};

export type ShippingMethod = Node & {
  __typename?: 'ShippingMethod';
  calculator: ConfigurableOperation;
  checker: ConfigurableOperation;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  fulfillmentHandlerCode: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<ShippingMethodTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ShippingMethodFilterParameter = {
  _and?: InputMaybe<Array<ShippingMethodFilterParameter>>;
  _or?: InputMaybe<Array<ShippingMethodFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  fulfillmentHandlerCode?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ShippingMethodList = PaginatedList & {
  __typename?: 'ShippingMethodList';
  items: Array<ShippingMethod>;
  totalItems: Scalars['Int']['output'];
};

export type ShippingMethodListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ShippingMethodFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ShippingMethodSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ShippingMethodQuote = {
  __typename?: 'ShippingMethodQuote';
  code: Scalars['String']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Any optional metadata returned by the ShippingCalculator in the ShippingCalculationResult */
  metadata?: Maybe<Scalars['JSON']['output']>;
  name: Scalars['String']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
};

export type ShippingMethodSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  fulfillmentHandlerCode?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ShippingMethodTranslation = {
  __typename?: 'ShippingMethodTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ShippingMethodTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** The price value where the result has a single price */
export type SinglePrice = {
  __typename?: 'SinglePrice';
  value: Scalars['Money']['output'];
};

export type SlugForEntityInput = {
  entityId?: InputMaybe<Scalars['ID']['input']>;
  entityName: Scalars['String']['input'];
  fieldName: Scalars['String']['input'];
  inputValue: Scalars['String']['input'];
};

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export type StockAdjustment = Node &
  StockMovement & {
    __typename?: 'StockAdjustment';
    createdAt: Scalars['DateTime']['output'];
    customFields?: Maybe<Scalars['JSON']['output']>;
    id: Scalars['ID']['output'];
    productVariant: ProductVariant;
    quantity: Scalars['Int']['output'];
    type: StockMovementType;
    updatedAt: Scalars['DateTime']['output'];
  };

export type StockAdjustmentFilterInput = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  reason?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};

export type StockAdjustmentLineInput = {
  quantityChange: Scalars['Float']['input'];
  stockLocationId: Scalars['ID']['input'];
  variantId: Scalars['ID']['input'];
};

export type StockAdjustmentListOptions = {
  filter?: InputMaybe<StockAdjustmentFilterInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<StockAdjustmentSortInput>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type StockAdjustmentSortInput = {
  createdAt?: InputMaybe<SortOrder>;
};

export type StockLevel = Node & {
  __typename?: 'StockLevel';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  stockAllocated: Scalars['Int']['output'];
  stockLocation: StockLocation;
  stockLocationId: Scalars['ID']['output'];
  stockOnHand: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type StockLevelInput = {
  stockLocationId: Scalars['ID']['input'];
  stockOnHand: Scalars['Int']['input'];
};

export type StockLocation = Node & {
  __typename?: 'StockLocation';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type StockLocationFilterParameter = {
  _and?: InputMaybe<Array<StockLocationFilterParameter>>;
  _or?: InputMaybe<Array<StockLocationFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type StockLocationList = PaginatedList & {
  __typename?: 'StockLocationList';
  items: Array<StockLocation>;
  totalItems: Scalars['Int']['output'];
};

export type StockLocationListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<StockLocationFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<StockLocationSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type StockLocationSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type StockMovement = {
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

export type StockMovementItem =
  | Allocation
  | Cancellation
  | Release
  | Return
  | Sale
  | StockAdjustment;

export type StockMovementList = {
  __typename?: 'StockMovementList';
  items: Array<StockMovementItem>;
  totalItems: Scalars['Int']['output'];
};

export type StockMovementListOptions = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<StockMovementType>;
};

export enum StockMovementType {
  ADJUSTMENT = 'ADJUSTMENT',
  ALLOCATION = 'ALLOCATION',
  CANCELLATION = 'CANCELLATION',
  RELEASE = 'RELEASE',
  RETURN = 'RETURN',
  SALE = 'SALE',
}

export type StockPurchase = {
  __typename?: 'StockPurchase';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  isCreditPurchase: Scalars['Boolean']['output'];
  lines: Array<StockPurchaseLine>;
  notes?: Maybe<Scalars['String']['output']>;
  paymentStatus: Scalars['String']['output'];
  purchaseDate: Scalars['DateTime']['output'];
  referenceNumber?: Maybe<Scalars['String']['output']>;
  supplier?: Maybe<Customer>;
  supplierId: Scalars['ID']['output'];
  totalCost: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type StockPurchaseLine = {
  __typename?: 'StockPurchaseLine';
  id: Scalars['ID']['output'];
  purchaseId: Scalars['ID']['output'];
  quantity: Scalars['Float']['output'];
  stockLocation?: Maybe<StockLocation>;
  stockLocationId: Scalars['ID']['output'];
  totalCost: Scalars['Int']['output'];
  unitCost: Scalars['Int']['output'];
  variant?: Maybe<ProductVariant>;
  variantId: Scalars['ID']['output'];
};

export type StockPurchaseList = {
  __typename?: 'StockPurchaseList';
  items: Array<StockPurchase>;
  totalItems: Scalars['Int']['output'];
};

export type StringCustomFieldConfig = CustomField & {
  __typename?: 'StringCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  length?: Maybe<Scalars['Int']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  options?: Maybe<Array<StringFieldOption>>;
  pattern?: Maybe<Scalars['String']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StringFieldOption = {
  __typename?: 'StringFieldOption';
  label?: Maybe<Array<LocalizedString>>;
  value: Scalars['String']['output'];
};

/** Operators for filtering on a list of String fields */
export type StringListOperators = {
  inList: Scalars['String']['input'];
};

/** Operators for filtering on a String field */
export type StringOperators = {
  contains?: InputMaybe<Scalars['String']['input']>;
  eq?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  notContains?: InputMaybe<Scalars['String']['input']>;
  notEq?: InputMaybe<Scalars['String']['input']>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  regex?: InputMaybe<Scalars['String']['input']>;
};

export type StringStructFieldConfig = StructField & {
  __typename?: 'StringStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  length?: Maybe<Scalars['Int']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  options?: Maybe<Array<StringFieldOption>>;
  pattern?: Maybe<Scalars['String']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructCustomFieldConfig = CustomField & {
  __typename?: 'StructCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  fields: Array<StructFieldConfig>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructField = {
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list?: Maybe<Scalars['Boolean']['output']>;
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructFieldConfig =
  | BooleanStructFieldConfig
  | DateTimeStructFieldConfig
  | FloatStructFieldConfig
  | IntStructFieldConfig
  | StringStructFieldConfig
  | TextStructFieldConfig;

export type SubscriptionStatus = {
  __typename?: 'SubscriptionStatus';
  canPerformAction: Scalars['Boolean']['output'];
  daysRemaining?: Maybe<Scalars['Int']['output']>;
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  isValid: Scalars['Boolean']['output'];
  status: Scalars['String']['output'];
  trialEndsAt?: Maybe<Scalars['DateTime']['output']>;
};

export type SubscriptionTier = {
  __typename?: 'SubscriptionTier';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  features?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  priceMonthly: Scalars['Int']['output'];
  priceYearly: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Indicates that an operation succeeded, where we do not want to return any more specific information. */
export type Success = {
  __typename?: 'Success';
  success: Scalars['Boolean']['output'];
};

/** All monetary amounts in SupplierCreditSummary are in smallest currency unit (cents) */
export type SupplierCreditSummary = {
  __typename?: 'SupplierCreditSummary';
  availableCredit: Scalars['Float']['output'];
  isSupplierCreditApproved: Scalars['Boolean']['output'];
  lastRepaymentAmount: Scalars['Float']['output'];
  lastRepaymentDate?: Maybe<Scalars['DateTime']['output']>;
  outstandingAmount: Scalars['Float']['output'];
  supplierCreditDuration: Scalars['Int']['output'];
  supplierCreditLimit: Scalars['Float']['output'];
  supplierId: Scalars['ID']['output'];
};

/** paymentAmount in smallest currency unit (cents) */
export type SupplierPaymentAllocationInput = {
  debitAccountCode?: InputMaybe<Scalars['String']['input']>;
  paymentAmount: Scalars['Float']['input'];
  purchaseIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  supplierId: Scalars['ID']['input'];
};

/** All monetary amounts in SupplierPaymentAllocationResult are in smallest currency unit (cents) */
export type SupplierPaymentAllocationResult = {
  __typename?: 'SupplierPaymentAllocationResult';
  excessPayment: Scalars['Float']['output'];
  purchasesPaid: Array<SupplierPurchasePayment>;
  remainingBalance: Scalars['Float']['output'];
  totalAllocated: Scalars['Float']['output'];
};

export type SupplierPurchasePayment = {
  __typename?: 'SupplierPurchasePayment';
  amountPaid: Scalars['Float']['output'];
  purchaseId: Scalars['ID']['output'];
  purchaseReference: Scalars['String']['output'];
};

export type Surcharge = Node & {
  __typename?: 'Surcharge';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  taxLines: Array<TaxLine>;
  taxRate: Scalars['Float']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type SurchargeInput = {
  description: Scalars['String']['input'];
  price: Scalars['Money']['input'];
  priceIncludesTax: Scalars['Boolean']['input'];
  sku?: InputMaybe<Scalars['String']['input']>;
  taxDescription?: InputMaybe<Scalars['String']['input']>;
  taxRate?: InputMaybe<Scalars['Float']['input']>;
};

export type Tag = Node & {
  __typename?: 'Tag';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['String']['output'];
};

export type TagFilterParameter = {
  _and?: InputMaybe<Array<TagFilterParameter>>;
  _or?: InputMaybe<Array<TagFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  value?: InputMaybe<StringOperators>;
};

export type TagList = PaginatedList & {
  __typename?: 'TagList';
  items: Array<Tag>;
  totalItems: Scalars['Int']['output'];
};

export type TagListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<TagFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<TagSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type TagSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type TaxCategory = Node & {
  __typename?: 'TaxCategory';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  isDefault: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type TaxCategoryFilterParameter = {
  _and?: InputMaybe<Array<TaxCategoryFilterParameter>>;
  _or?: InputMaybe<Array<TaxCategoryFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  isDefault?: InputMaybe<BooleanOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type TaxCategoryList = PaginatedList & {
  __typename?: 'TaxCategoryList';
  items: Array<TaxCategory>;
  totalItems: Scalars['Int']['output'];
};

export type TaxCategoryListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<TaxCategoryFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<TaxCategorySortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type TaxCategorySortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type TaxLine = {
  __typename?: 'TaxLine';
  description: Scalars['String']['output'];
  taxRate: Scalars['Float']['output'];
};

export type TaxRate = Node & {
  __typename?: 'TaxRate';
  category: TaxCategory;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  customerGroup?: Maybe<CustomerGroup>;
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['Float']['output'];
  zone: Zone;
};

export type TaxRateFilterParameter = {
  _and?: InputMaybe<Array<TaxRateFilterParameter>>;
  _or?: InputMaybe<Array<TaxRateFilterParameter>>;
  categoryId?: InputMaybe<IdOperators>;
  createdAt?: InputMaybe<DateOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  value?: InputMaybe<NumberOperators>;
  zoneId?: InputMaybe<IdOperators>;
};

export type TaxRateList = PaginatedList & {
  __typename?: 'TaxRateList';
  items: Array<TaxRate>;
  totalItems: Scalars['Int']['output'];
};

export type TaxRateListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<TaxRateFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<TaxRateSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type TaxRateSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type TestEligibleShippingMethodsInput = {
  lines: Array<TestShippingMethodOrderLineInput>;
  shippingAddress: CreateAddressInput;
};

export type TestShippingMethodInput = {
  calculator: ConfigurableOperationInput;
  checker: ConfigurableOperationInput;
  lines: Array<TestShippingMethodOrderLineInput>;
  shippingAddress: CreateAddressInput;
};

export type TestShippingMethodOrderLineInput = {
  productVariantId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type TestShippingMethodQuote = {
  __typename?: 'TestShippingMethodQuote';
  metadata?: Maybe<Scalars['JSON']['output']>;
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
};

export type TestShippingMethodResult = {
  __typename?: 'TestShippingMethodResult';
  eligible: Scalars['Boolean']['output'];
  quote?: Maybe<TestShippingMethodQuote>;
};

export type TextCustomFieldConfig = CustomField & {
  __typename?: 'TextCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type TextStructFieldConfig = StructField & {
  __typename?: 'TextStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type TransitionFulfillmentToStateResult = Fulfillment | FulfillmentStateTransitionError;

export type TransitionOrderToStateResult = Order | OrderStateTransitionError;

export type TransitionPaymentToStateResult = Payment | PaymentStateTransitionError;

export type UpdateActiveAdministratorInput = {
  customFields?: InputMaybe<UpdateAdministratorCustomFieldsInput>;
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Input used to update an Address.
 *
 * The countryCode must correspond to a `code` property of a Country that has been defined in the
 * Vendure server. The `code` property is typically a 2-character ISO code such as "GB", "US", "DE" etc.
 * If an invalid code is passed, the mutation will fail.
 */
export type UpdateAddressInput = {
  city?: InputMaybe<Scalars['String']['input']>;
  company?: InputMaybe<Scalars['String']['input']>;
  countryCode?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  defaultBillingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  defaultShippingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  fullName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  province?: InputMaybe<Scalars['String']['input']>;
  streetLine1?: InputMaybe<Scalars['String']['input']>;
  streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAdminProfileInput = {
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  profilePictureId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateAdministratorCustomFieldsInput = {
  profilePictureId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateAdministratorInput = {
  customFields?: InputMaybe<UpdateAdministratorCustomFieldsInput>;
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  lastName?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
  roleIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type UpdateAssetInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  focalPoint?: InputMaybe<CoordinateInput>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateChannelCustomFieldsInput = {
  actionCountAuthOtp?: InputMaybe<Scalars['Int']['input']>;
  actionCountAuthTotal?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommBalanceChanged?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommCreditApproved?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommCustomerCreated?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommRepaymentDeadline?: InputMaybe<Scalars['Int']['input']>;
  actionCountCommTotal?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysAdminCreated?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysAdminUpdated?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingCompleted?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingFailed?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingProgress?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysMlTrainingStarted?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysOrderCancelled?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysOrderFulfilled?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysOrderPaymentSettled?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysPaymentConfirmed?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysStockLowAlert?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysTotal?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysUserCreated?: InputMaybe<Scalars['Int']['input']>;
  actionCountSysUserUpdated?: InputMaybe<Scalars['Int']['input']>;
  actionCountTotal?: InputMaybe<Scalars['Int']['input']>;
  actionTrackingLastResetDate?: InputMaybe<Scalars['DateTime']['input']>;
  actionTrackingResetType?: InputMaybe<Scalars['String']['input']>;
  billingCycle?: InputMaybe<Scalars['String']['input']>;
  cashControlEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  cashierFlowEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  companyLogoAssetId?: InputMaybe<Scalars['ID']['input']>;
  enablePrinter?: InputMaybe<Scalars['Boolean']['input']>;
  eventConfig?: InputMaybe<Scalars['String']['input']>;
  lastPaymentAmount?: InputMaybe<Scalars['Int']['input']>;
  lastPaymentDate?: InputMaybe<Scalars['DateTime']['input']>;
  maxAdminCount?: InputMaybe<Scalars['Int']['input']>;
  mlImageCount?: InputMaybe<Scalars['Int']['input']>;
  mlLastTrainedAt?: InputMaybe<Scalars['DateTime']['input']>;
  mlMetadataAssetId?: InputMaybe<Scalars['ID']['input']>;
  mlModelBinAssetId?: InputMaybe<Scalars['ID']['input']>;
  mlModelJsonAssetId?: InputMaybe<Scalars['ID']['input']>;
  mlProductCount?: InputMaybe<Scalars['Int']['input']>;
  mlTrainingError?: InputMaybe<Scalars['String']['input']>;
  mlTrainingProgress?: InputMaybe<Scalars['Int']['input']>;
  mlTrainingQueuedAt?: InputMaybe<Scalars['DateTime']['input']>;
  mlTrainingStartedAt?: InputMaybe<Scalars['DateTime']['input']>;
  mlTrainingStatus?: InputMaybe<Scalars['String']['input']>;
  paystackCustomerCode?: InputMaybe<Scalars['String']['input']>;
  paystackSubscriptionCode?: InputMaybe<Scalars['String']['input']>;
  requireOpeningCount?: InputMaybe<Scalars['Boolean']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  subscriptionExpiredReminderSentAt?: InputMaybe<Scalars['DateTime']['input']>;
  subscriptionExpiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  subscriptionStartedAt?: InputMaybe<Scalars['DateTime']['input']>;
  subscriptionStatus?: InputMaybe<Scalars['String']['input']>;
  subscriptionTierId?: InputMaybe<Scalars['ID']['input']>;
  trialEndsAt?: InputMaybe<Scalars['DateTime']['input']>;
  varianceNotificationThreshold?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateChannelInput = {
  availableCurrencyCodes?: InputMaybe<Array<CurrencyCode>>;
  availableLanguageCodes?: InputMaybe<Array<LanguageCode>>;
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<UpdateChannelCustomFieldsInput>;
  defaultCurrencyCode?: InputMaybe<CurrencyCode>;
  defaultLanguageCode?: InputMaybe<LanguageCode>;
  defaultShippingZoneId?: InputMaybe<Scalars['ID']['input']>;
  defaultTaxZoneId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  pricesIncludeTax?: InputMaybe<Scalars['Boolean']['input']>;
  sellerId?: InputMaybe<Scalars['ID']['input']>;
  token?: InputMaybe<Scalars['String']['input']>;
  trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateChannelResult = Channel | LanguageNotAvailableError;

export type UpdateCollectionInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  filters?: InputMaybe<Array<ConfigurableOperationInput>>;
  id: Scalars['ID']['input'];
  inheritFilters?: InputMaybe<Scalars['Boolean']['input']>;
  isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  translations?: InputMaybe<Array<UpdateCollectionTranslationInput>>;
};

export type UpdateCollectionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCountryInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<CountryTranslationInput>>;
};

export type UpdateCreditDurationInput = {
  creditDuration: Scalars['Int']['input'];
  customerId: Scalars['ID']['input'];
};

export type UpdateCustomerCreditLimitInput = {
  creditDuration?: InputMaybe<Scalars['Int']['input']>;
  creditLimit: Scalars['Float']['input'];
  customerId: Scalars['ID']['input'];
};

export type UpdateCustomerCustomFieldsInput = {
  contactPerson?: InputMaybe<Scalars['String']['input']>;
  creditApprovedByUserIdId?: InputMaybe<Scalars['ID']['input']>;
  creditDuration?: InputMaybe<Scalars['Int']['input']>;
  creditLimit?: InputMaybe<Scalars['Float']['input']>;
  isCreditApproved?: InputMaybe<Scalars['Boolean']['input']>;
  isSupplier?: InputMaybe<Scalars['Boolean']['input']>;
  isSupplierCreditApproved?: InputMaybe<Scalars['Boolean']['input']>;
  lastRepaymentAmount?: InputMaybe<Scalars['Float']['input']>;
  lastRepaymentDate?: InputMaybe<Scalars['DateTime']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  paymentTerms?: InputMaybe<Scalars['String']['input']>;
  supplierCreditDuration?: InputMaybe<Scalars['Int']['input']>;
  supplierCreditLimit?: InputMaybe<Scalars['Float']['input']>;
  supplierLastRepaymentAmount?: InputMaybe<Scalars['Float']['input']>;
  supplierLastRepaymentDate?: InputMaybe<Scalars['DateTime']['input']>;
  supplierType?: InputMaybe<Scalars['String']['input']>;
  taxId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerGroupInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerInput = {
  customFields?: InputMaybe<UpdateCustomerCustomFieldsInput>;
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  lastName?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerNoteInput = {
  note: Scalars['String']['input'];
  noteId: Scalars['ID']['input'];
};

export type UpdateCustomerResult = Customer | EmailAddressConflictError;

export type UpdateFacetInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
  translations?: InputMaybe<Array<FacetTranslationInput>>;
};

export type UpdateFacetValueInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<FacetValueTranslationInput>>;
};

export type UpdateGlobalSettingsInput = {
  availableLanguages?: InputMaybe<Array<LanguageCode>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateGlobalSettingsResult = ChannelDefaultLanguageError | GlobalSettings;

export type UpdateOrderAddressInput = {
  city?: InputMaybe<Scalars['String']['input']>;
  company?: InputMaybe<Scalars['String']['input']>;
  countryCode?: InputMaybe<Scalars['String']['input']>;
  fullName?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  province?: InputMaybe<Scalars['String']['input']>;
  streetLine1?: InputMaybe<Scalars['String']['input']>;
  streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrderCustomFieldsInput = {
  auditCreatedAt?: InputMaybe<Scalars['DateTime']['input']>;
  createdByUserIdId?: InputMaybe<Scalars['ID']['input']>;
  lastModifiedByUserIdId?: InputMaybe<Scalars['ID']['input']>;
  reversedAt?: InputMaybe<Scalars['DateTime']['input']>;
  reversedByUserIdId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateOrderInput = {
  customFields?: InputMaybe<UpdateOrderCustomFieldsInput>;
  id: Scalars['ID']['input'];
};

/** Union type of all possible errors that can occur when adding or removing items from an Order. */
export type UpdateOrderItemErrorResult =
  | InsufficientStockError
  | NegativeQuantityError
  | OrderInterceptorError
  | OrderLimitError
  | OrderModificationError;

export type UpdateOrderItemsResult =
  | InsufficientStockError
  | NegativeQuantityError
  | Order
  | OrderInterceptorError
  | OrderLimitError
  | OrderModificationError;

export type UpdateOrderNoteInput = {
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  note?: InputMaybe<Scalars['String']['input']>;
  noteId: Scalars['ID']['input'];
};

export type UpdatePaymentMethodCustomFieldsInput = {
  imageAssetId?: InputMaybe<Scalars['ID']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  isCashierControlled?: InputMaybe<Scalars['Boolean']['input']>;
  ledgerAccountCode?: InputMaybe<Scalars['String']['input']>;
  reconciliationType?: InputMaybe<Scalars['String']['input']>;
  requiresReconciliation?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdatePaymentMethodInput = {
  checker?: InputMaybe<ConfigurableOperationInput>;
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<UpdatePaymentMethodCustomFieldsInput>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  handler?: InputMaybe<ConfigurableOperationInput>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<PaymentMethodTranslationInput>>;
};

export type UpdateProductCustomFieldsInput = {
  barcode?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateProductInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<UpdateProductCustomFieldsInput>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProductTranslationInput>>;
};

export type UpdateProductOptionGroupInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProductOptionGroupTranslationInput>>;
};

export type UpdateProductOptionInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProductOptionGroupTranslationInput>>;
};

export type UpdateProductVariantCustomFieldsInput = {
  allowFractionalQuantity?: InputMaybe<Scalars['Boolean']['input']>;
  wholesalePrice?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateProductVariantInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<UpdateProductVariantCustomFieldsInput>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  optionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  /** Sets the price for the ProductVariant in the Channel's default currency */
  price?: InputMaybe<Scalars['Money']['input']>;
  /** Allows multiple prices to be set for the ProductVariant in different currencies. */
  prices?: InputMaybe<Array<UpdateProductVariantPriceInput>>;
  sku?: InputMaybe<Scalars['String']['input']>;
  stockLevels?: InputMaybe<Array<StockLevelInput>>;
  stockOnHand?: InputMaybe<Scalars['Int']['input']>;
  taxCategoryId?: InputMaybe<Scalars['ID']['input']>;
  trackInventory?: InputMaybe<GlobalFlag>;
  translations?: InputMaybe<Array<ProductVariantTranslationInput>>;
  useGlobalOutOfStockThreshold?: InputMaybe<Scalars['Boolean']['input']>;
};

/**
 * Used to set up update the price of a ProductVariant in a particular Channel.
 * If the `delete` flag is `true`, the price will be deleted for the given Channel.
 */
export type UpdateProductVariantPriceInput = {
  currencyCode: CurrencyCode;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  delete?: InputMaybe<Scalars['Boolean']['input']>;
  price: Scalars['Money']['input'];
};

export type UpdatePromotionInput = {
  actions?: InputMaybe<Array<ConfigurableOperationInput>>;
  conditions?: InputMaybe<Array<ConfigurableOperationInput>>;
  couponCode?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  endsAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['ID']['input'];
  perCustomerUsageLimit?: InputMaybe<Scalars['Int']['input']>;
  startsAt?: InputMaybe<Scalars['DateTime']['input']>;
  translations?: InputMaybe<Array<PromotionTranslationInput>>;
  usageLimit?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdatePromotionResult = MissingConditionsError | Promotion;

export type UpdateProvinceInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProvinceTranslationInput>>;
};

export type UpdateRoleInput = {
  channelIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  code?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  permissions?: InputMaybe<Array<Permission>>;
};

export type UpdateScheduledTaskInput = {
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['String']['input'];
};

export type UpdateSellerInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateShippingMethodInput = {
  calculator?: InputMaybe<ConfigurableOperationInput>;
  checker?: InputMaybe<ConfigurableOperationInput>;
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  fulfillmentHandler?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  translations: Array<ShippingMethodTranslationInput>;
};

export type UpdateStockLocationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateSupplierCreditDurationInput = {
  supplierCreditDuration: Scalars['Int']['input'];
  supplierId: Scalars['ID']['input'];
};

export type UpdateSupplierCreditLimitInput = {
  supplierCreditDuration?: InputMaybe<Scalars['Int']['input']>;
  supplierCreditLimit: Scalars['Float']['input'];
  supplierId: Scalars['ID']['input'];
};

export type UpdateTagInput = {
  id: Scalars['ID']['input'];
  value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaxCategoryInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaxRateInput = {
  categoryId?: InputMaybe<Scalars['ID']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  customerGroupId?: InputMaybe<Scalars['ID']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['Float']['input']>;
  zoneId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateZoneInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type User = Node & {
  __typename?: 'User';
  authenticationMethods: Array<AuthenticationMethod>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<UserCustomFields>;
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  lastLogin?: Maybe<Scalars['DateTime']['output']>;
  roles: Array<Role>;
  updatedAt: Scalars['DateTime']['output'];
  verified: Scalars['Boolean']['output'];
};

export type UserCustomFields = {
  __typename?: 'UserCustomFields';
  authorizationStatus?: Maybe<Scalars['String']['output']>;
  notificationPreferences?: Maybe<Scalars['String']['output']>;
};

export type UserInfo = {
  __typename?: 'UserInfo';
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
};

export type ValidateCreditInput = {
  customerId: Scalars['ID']['input'];
  estimatedOrderTotal: Scalars['Float']['input'];
};

export type VerifyMpesaInput = {
  allConfirmed: Scalars['Boolean']['input'];
  flaggedTransactionIds?: InputMaybe<Array<Scalars['String']['input']>>;
  notes?: InputMaybe<Scalars['String']['input']>;
  sessionId: Scalars['ID']['input'];
};

export type Zone = Node & {
  __typename?: 'Zone';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  members: Array<Region>;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ZoneFilterParameter = {
  _and?: InputMaybe<Array<ZoneFilterParameter>>;
  _or?: InputMaybe<Array<ZoneFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ZoneList = PaginatedList & {
  __typename?: 'ZoneList';
  items: Array<Zone>;
  totalItems: Scalars['Int']['output'];
};

export type ZoneListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ZoneFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ZoneSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ZoneSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type UpdateOrderLineQuantityMutationVariables = Exact<{
  orderLineId: Scalars['ID']['input'];
  quantity: Scalars['Float']['input'];
}>;

export type UpdateOrderLineQuantityMutation = {
  __typename?: 'Mutation';
  updateOrderLineQuantity:
    | { __typename?: 'InsufficientStockError'; errorCode: ErrorCode; message: string }
    | { __typename?: 'NegativeQuantityError'; errorCode: ErrorCode; message: string }
    | {
        __typename?: 'Order';
        id: string;
        lines: Array<{
          __typename?: 'OrderLine';
          id: string;
          quantity: number;
          productVariant: {
            __typename?: 'ProductVariant';
            id: string;
            name: string;
            customFields?: {
              __typename?: 'ProductVariantCustomFields';
              allowFractionalQuantity?: boolean | null;
            } | null;
          };
        }>;
      }
    | { __typename?: 'OrderInterceptorError'; errorCode: ErrorCode; message: string }
    | { __typename?: 'OrderLimitError'; errorCode: ErrorCode; message: string }
    | { __typename?: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type GetActiveAdministratorQueryVariables = Exact<{ [key: string]: never }>;

export type GetActiveAdministratorQuery = {
  __typename?: 'Query';
  activeAdministrator?: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    user: {
      __typename?: 'User';
      id: string;
      identifier: string;
      roles: Array<{
        __typename?: 'Role';
        id: string;
        code: string;
        permissions: Array<Permission>;
      }>;
    };
    customFields?: {
      __typename?: 'AdministratorCustomFields';
      profilePicture?: { __typename?: 'Asset'; id: string; preview: string; source: string } | null;
    } | null;
  } | null;
};

export type LoginMutationVariables = Exact<{
  username: Scalars['String']['input'];
  password: Scalars['String']['input'];
  rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type LoginMutation = {
  __typename?: 'Mutation';
  login:
    | {
        __typename?: 'CurrentUser';
        id: string;
        identifier: string;
        channels: Array<{
          __typename?: 'CurrentUserChannel';
          id: string;
          code: string;
          token: string;
        }>;
      }
    | { __typename?: 'InvalidCredentialsError'; errorCode: ErrorCode; message: string }
    | { __typename?: 'NativeAuthStrategyError'; errorCode: ErrorCode; message: string };
};

export type RequestRegistrationOtpMutationVariables = Exact<{
  phoneNumber: Scalars['String']['input'];
  registrationData: RegistrationInput;
}>;

export type RequestRegistrationOtpMutation = {
  __typename?: 'Mutation';
  requestRegistrationOTP: {
    __typename?: 'OTPResponse';
    success: boolean;
    message: string;
    sessionId?: string | null;
    expiresAt?: number | null;
  };
};

export type VerifyRegistrationOtpMutationVariables = Exact<{
  phoneNumber: Scalars['String']['input'];
  otp: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
}>;

export type VerifyRegistrationOtpMutation = {
  __typename?: 'Mutation';
  verifyRegistrationOTP: {
    __typename?: 'RegistrationResult';
    success: boolean;
    userId?: string | null;
    message: string;
  };
};

export type RequestLoginOtpMutationVariables = Exact<{
  phoneNumber: Scalars['String']['input'];
}>;

export type RequestLoginOtpMutation = {
  __typename?: 'Mutation';
  requestLoginOTP: {
    __typename?: 'OTPResponse';
    success: boolean;
    message: string;
    expiresAt?: number | null;
  };
};

export type VerifyLoginOtpMutationVariables = Exact<{
  phoneNumber: Scalars['String']['input'];
  otp: Scalars['String']['input'];
}>;

export type VerifyLoginOtpMutation = {
  __typename?: 'Mutation';
  verifyLoginOTP: {
    __typename?: 'LoginResult';
    success: boolean;
    token?: string | null;
    message: string;
    user?: { __typename?: 'UserInfo'; id: string; identifier: string } | null;
  };
};

export type CheckAuthorizationStatusQueryVariables = Exact<{
  identifier: Scalars['String']['input'];
}>;

export type CheckAuthorizationStatusQuery = {
  __typename?: 'Query';
  checkAuthorizationStatus: { __typename?: 'AuthorizationStatus'; status: string; message: string };
};

export type CheckCompanyCodeAvailabilityQueryVariables = Exact<{
  companyCode: Scalars['String']['input'];
}>;

export type CheckCompanyCodeAvailabilityQuery = {
  __typename?: 'Query';
  checkCompanyCodeAvailability: boolean;
};

export type LogoutMutationVariables = Exact<{ [key: string]: never }>;

export type LogoutMutation = {
  __typename?: 'Mutation';
  logout: { __typename?: 'Success'; success: boolean };
};

export type UpdateAdministratorMutationVariables = Exact<{
  input: UpdateActiveAdministratorInput;
}>;

export type UpdateAdministratorMutation = {
  __typename?: 'Mutation';
  updateActiveAdministrator: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    customFields?: {
      __typename?: 'AdministratorCustomFields';
      profilePicture?: { __typename?: 'Asset'; id: string; preview: string; source: string } | null;
    } | null;
  };
};

export type UpdateAdminProfileMutationVariables = Exact<{
  input: UpdateAdminProfileInput;
}>;

export type UpdateAdminProfileMutation = {
  __typename?: 'Mutation';
  updateAdminProfile: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
  };
};

export type GetUserChannelsQueryVariables = Exact<{ [key: string]: never }>;

export type GetUserChannelsQuery = {
  __typename?: 'Query';
  me?: {
    __typename?: 'CurrentUser';
    id: string;
    identifier: string;
    channels: Array<{ __typename?: 'CurrentUserChannel'; id: string; code: string; token: string }>;
  } | null;
};

export type GetActiveChannelQueryVariables = Exact<{ [key: string]: never }>;

export type GetActiveChannelQuery = {
  __typename?: 'Query';
  activeChannel: {
    __typename?: 'Channel';
    id: string;
    code: string;
    token: string;
    defaultCurrencyCode: CurrencyCode;
    customFields?: {
      __typename?: 'ChannelCustomFields';
      cashierFlowEnabled?: boolean | null;
      enablePrinter?: boolean | null;
      subscriptionStatus?: string | null;
      trialEndsAt?: any | null;
      subscriptionExpiresAt?: any | null;
      mlModelJsonAsset?: { __typename?: 'Asset'; id: string; source: string; name: string } | null;
      mlModelBinAsset?: { __typename?: 'Asset'; id: string; source: string; name: string } | null;
      mlMetadataAsset?: { __typename?: 'Asset'; id: string; source: string; name: string } | null;
      companyLogoAsset?: {
        __typename?: 'Asset';
        id: string;
        source: string;
        name: string;
        preview: string;
      } | null;
    } | null;
  };
};

export type GetStockLocationsQueryVariables = Exact<{ [key: string]: never }>;

export type GetStockLocationsQuery = {
  __typename?: 'Query';
  stockLocations: {
    __typename?: 'StockLocationList';
    items: Array<{ __typename?: 'StockLocation'; id: string; name: string; description: string }>;
  };
};

export type CheckSkuExistsQueryVariables = Exact<{
  sku: Scalars['String']['input'];
}>;

export type CheckSkuExistsQuery = {
  __typename?: 'Query';
  productVariants: {
    __typename?: 'ProductVariantList';
    items: Array<{
      __typename?: 'ProductVariant';
      id: string;
      sku: string;
      product: { __typename?: 'Product'; id: string; name: string };
    }>;
  };
};

export type CheckBarcodeExistsQueryVariables = Exact<{
  barcode: Scalars['String']['input'];
}>;

export type CheckBarcodeExistsQuery = {
  __typename?: 'Query';
  products: {
    __typename?: 'ProductList';
    items: Array<{
      __typename?: 'Product';
      id: string;
      name: string;
      customFields?: { __typename?: 'ProductCustomFields'; barcode?: string | null } | null;
    }>;
  };
};

export type CreateProductMutationVariables = Exact<{
  input: CreateProductInput;
}>;

export type CreateProductMutation = {
  __typename?: 'Mutation';
  createProduct: {
    __typename?: 'Product';
    id: string;
    name: string;
    slug: string;
    description: string;
    enabled: boolean;
    featuredAsset?: { __typename?: 'Asset'; id: string; preview: string } | null;
    variants: Array<{
      __typename?: 'ProductVariant';
      id: string;
      name: string;
      sku: string;
      price: number;
      stockOnHand: number;
      customFields?: {
        __typename?: 'ProductVariantCustomFields';
        wholesalePrice?: number | null;
        allowFractionalQuantity?: boolean | null;
      } | null;
    }>;
  };
};

export type CreateProductVariantsMutationVariables = Exact<{
  input: Array<CreateProductVariantInput> | CreateProductVariantInput;
}>;

export type CreateProductVariantsMutation = {
  __typename?: 'Mutation';
  createProductVariants: Array<{
    __typename?: 'ProductVariant';
    id: string;
    name: string;
    sku: string;
    price: number;
    priceWithTax: number;
    stockOnHand: number;
    product: { __typename?: 'Product'; id: string; name: string };
  } | null>;
};

export type DeleteProductVariantsMutationVariables = Exact<{
  ids: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;

export type DeleteProductVariantsMutation = {
  __typename?: 'Mutation';
  deleteProductVariants: Array<{
    __typename?: 'DeletionResponse';
    result: DeletionResult;
    message?: string | null;
  }>;
};

export type CreateAssetsMutationVariables = Exact<{
  input: Array<CreateAssetInput> | CreateAssetInput;
}>;

export type CreateAssetsMutation = {
  __typename?: 'Mutation';
  createAssets: Array<
    | { __typename?: 'Asset'; id: string; name: string; preview: string; source: string }
    | { __typename?: 'MimeTypeError' }
  >;
};

export type AssignAssetsToProductMutationVariables = Exact<{
  productId: Scalars['ID']['input'];
  assetIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type AssignAssetsToProductMutation = {
  __typename?: 'Mutation';
  updateProduct: {
    __typename?: 'Product';
    id: string;
    assets: Array<{ __typename?: 'Asset'; id: string; name: string; preview: string }>;
    featuredAsset?: { __typename?: 'Asset'; id: string; preview: string } | null;
  };
};

export type AssignAssetsToChannelMutationVariables = Exact<{
  assetIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
  channelId: Scalars['ID']['input'];
}>;

export type AssignAssetsToChannelMutation = {
  __typename?: 'Mutation';
  assignAssetsToChannel: Array<{ __typename?: 'Asset'; id: string; name: string }>;
};

export type DeleteAssetMutationVariables = Exact<{
  input: DeleteAssetInput;
}>;

export type DeleteAssetMutation = {
  __typename?: 'Mutation';
  deleteAsset: { __typename?: 'DeletionResponse'; result: DeletionResult; message?: string | null };
};

export type UpdateProductAssetsMutationVariables = Exact<{
  productId: Scalars['ID']['input'];
  assetIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type UpdateProductAssetsMutation = {
  __typename?: 'Mutation';
  updateProduct: {
    __typename?: 'Product';
    id: string;
    assets: Array<{
      __typename?: 'Asset';
      id: string;
      name: string;
      preview: string;
      source: string;
    }>;
    featuredAsset?: { __typename?: 'Asset'; id: string; preview: string } | null;
  };
};

export type GetProductDetailQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetProductDetailQuery = {
  __typename?: 'Query';
  product?: {
    __typename?: 'Product';
    id: string;
    name: string;
    slug: string;
    description: string;
    enabled: boolean;
    customFields?: { __typename?: 'ProductCustomFields'; barcode?: string | null } | null;
    facetValues: Array<{
      __typename?: 'FacetValue';
      id: string;
      name: string;
      code: string;
      facet: { __typename?: 'Facet'; id: string; code: string };
    }>;
    assets: Array<{
      __typename?: 'Asset';
      id: string;
      name: string;
      preview: string;
      source: string;
    }>;
    featuredAsset?: { __typename?: 'Asset'; id: string; preview: string } | null;
    variants: Array<{
      __typename?: 'ProductVariant';
      id: string;
      name: string;
      sku: string;
      price: number;
      priceWithTax: number;
      stockOnHand: number;
      trackInventory: GlobalFlag;
      customFields?: {
        __typename?: 'ProductVariantCustomFields';
        wholesalePrice?: number | null;
        allowFractionalQuantity?: boolean | null;
      } | null;
      prices: Array<{
        __typename?: 'ProductVariantPrice';
        price: number;
        currencyCode: CurrencyCode;
      }>;
      stockLevels: Array<{
        __typename?: 'StockLevel';
        id: string;
        stockOnHand: number;
        stockLocation: { __typename?: 'StockLocation'; id: string; name: string };
      }>;
    }>;
  } | null;
};

export type GetProductsQueryVariables = Exact<{
  options?: InputMaybe<ProductListOptions>;
}>;

export type GetProductsQuery = {
  __typename?: 'Query';
  products: {
    __typename?: 'ProductList';
    totalItems: number;
    items: Array<{
      __typename?: 'Product';
      id: string;
      name: string;
      slug: string;
      description: string;
      enabled: boolean;
      featuredAsset?: { __typename?: 'Asset'; id: string; preview: string } | null;
      facetValues: Array<{
        __typename?: 'FacetValue';
        id: string;
        name: string;
        facet: { __typename?: 'Facet'; code: string };
      }>;
      variants: Array<{
        __typename?: 'ProductVariant';
        id: string;
        name: string;
        sku: string;
        price: number;
        priceWithTax: number;
        stockOnHand: number;
        trackInventory: GlobalFlag;
        customFields?: {
          __typename?: 'ProductVariantCustomFields';
          wholesalePrice?: number | null;
          allowFractionalQuantity?: boolean | null;
        } | null;
        prices: Array<{
          __typename?: 'ProductVariantPrice';
          price: number;
          currencyCode: CurrencyCode;
        }>;
      }>;
    }>;
  };
};

export type DeleteProductMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteProductMutation = {
  __typename?: 'Mutation';
  deleteProduct: {
    __typename?: 'DeletionResponse';
    result: DeletionResult;
    message?: string | null;
  };
};

export type CreateProductOptionGroupMutationVariables = Exact<{
  input: CreateProductOptionGroupInput;
}>;

export type CreateProductOptionGroupMutation = {
  __typename?: 'Mutation';
  createProductOptionGroup: {
    __typename?: 'ProductOptionGroup';
    id: string;
    code: string;
    name: string;
    options: Array<{ __typename?: 'ProductOption'; id: string; code: string; name: string }>;
  };
};

export type CreateProductOptionMutationVariables = Exact<{
  input: CreateProductOptionInput;
}>;

export type CreateProductOptionMutation = {
  __typename?: 'Mutation';
  createProductOption: {
    __typename?: 'ProductOption';
    id: string;
    code: string;
    name: string;
    group: { __typename?: 'ProductOptionGroup'; id: string; name: string };
  };
};

export type AddOptionGroupToProductMutationVariables = Exact<{
  productId: Scalars['ID']['input'];
  optionGroupId: Scalars['ID']['input'];
}>;

export type AddOptionGroupToProductMutation = {
  __typename?: 'Mutation';
  addOptionGroupToProduct: {
    __typename?: 'Product';
    id: string;
    name: string;
    optionGroups: Array<{
      __typename?: 'ProductOptionGroup';
      id: string;
      code: string;
      name: string;
      options: Array<{ __typename?: 'ProductOption'; id: string; code: string; name: string }>;
    }>;
  };
};

export type UpdateProductVariantMutationVariables = Exact<{
  input: UpdateProductVariantInput;
}>;

export type UpdateProductVariantMutation = {
  __typename?: 'Mutation';
  updateProductVariant: {
    __typename?: 'ProductVariant';
    id: string;
    name: string;
    sku: string;
    price: number;
    priceWithTax: number;
    stockOnHand: number;
    product: { __typename?: 'Product'; id: string; name: string };
  };
};

export type SearchProductsQueryVariables = Exact<{
  term: Scalars['String']['input'];
}>;

export type SearchProductsQuery = {
  __typename?: 'Query';
  products: {
    __typename?: 'ProductList';
    items: Array<{
      __typename?: 'Product';
      id: string;
      name: string;
      featuredAsset?: { __typename?: 'Asset'; preview: string } | null;
      facetValues: Array<{
        __typename?: 'FacetValue';
        id: string;
        name: string;
        facet: { __typename?: 'Facet'; code: string };
      }>;
      variants: Array<{
        __typename?: 'ProductVariant';
        id: string;
        name: string;
        sku: string;
        price: number;
        priceWithTax: number;
        stockOnHand: number;
        trackInventory: GlobalFlag;
        customFields?: {
          __typename?: 'ProductVariantCustomFields';
          wholesalePrice?: number | null;
          allowFractionalQuantity?: boolean | null;
        } | null;
        prices: Array<{
          __typename?: 'ProductVariantPrice';
          price: number;
          currencyCode: CurrencyCode;
        }>;
      }>;
    }>;
  };
};

export type GetProductQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetProductQuery = {
  __typename?: 'Query';
  product?: {
    __typename?: 'Product';
    id: string;
    name: string;
    featuredAsset?: { __typename?: 'Asset'; preview: string } | null;
    facetValues: Array<{
      __typename?: 'FacetValue';
      id: string;
      name: string;
      facet: { __typename?: 'Facet'; code: string };
    }>;
    variants: Array<{
      __typename?: 'ProductVariant';
      id: string;
      name: string;
      sku: string;
      price: number;
      priceWithTax: number;
      trackInventory: GlobalFlag;
      prices: Array<{
        __typename?: 'ProductVariantPrice';
        price: number;
        currencyCode: CurrencyCode;
      }>;
      stockLevels: Array<{
        __typename?: 'StockLevel';
        stockLocationId: string;
        stockOnHand: number;
      }>;
      customFields?: {
        __typename?: 'ProductVariantCustomFields';
        wholesalePrice?: number | null;
        allowFractionalQuantity?: boolean | null;
      } | null;
    }>;
  } | null;
};

export type GetVariantStockLevelQueryVariables = Exact<{
  variantId: Scalars['ID']['input'];
}>;

export type GetVariantStockLevelQuery = {
  __typename?: 'Query';
  productVariant?: {
    __typename?: 'ProductVariant';
    id: string;
    name: string;
    sku: string;
    stockOnHand: number;
    stockLevels: Array<{
      __typename?: 'StockLevel';
      id: string;
      stockOnHand: number;
      stockLocation: { __typename?: 'StockLocation'; id: string; name: string };
    }>;
  } | null;
};

export type SearchByBarcodeQueryVariables = Exact<{
  barcode: Scalars['String']['input'];
}>;

export type SearchByBarcodeQuery = {
  __typename?: 'Query';
  products: {
    __typename?: 'ProductList';
    items: Array<{
      __typename?: 'Product';
      id: string;
      name: string;
      customFields?: { __typename?: 'ProductCustomFields'; barcode?: string | null } | null;
      featuredAsset?: { __typename?: 'Asset'; preview: string } | null;
      facetValues: Array<{
        __typename?: 'FacetValue';
        id: string;
        name: string;
        facet: { __typename?: 'Facet'; code: string };
      }>;
      variants: Array<{
        __typename?: 'ProductVariant';
        id: string;
        name: string;
        sku: string;
        priceWithTax: number;
        stockOnHand: number;
        trackInventory: GlobalFlag;
        customFields?: {
          __typename?: 'ProductVariantCustomFields';
          wholesalePrice?: number | null;
          allowFractionalQuantity?: boolean | null;
        } | null;
      }>;
    }>;
  };
};

export type PrefetchProductsQueryVariables = Exact<{
  take: Scalars['Int']['input'];
}>;

export type PrefetchProductsQuery = {
  __typename?: 'Query';
  products: {
    __typename?: 'ProductList';
    totalItems: number;
    items: Array<{
      __typename?: 'Product';
      id: string;
      name: string;
      featuredAsset?: { __typename?: 'Asset'; preview: string } | null;
      facetValues: Array<{
        __typename?: 'FacetValue';
        id: string;
        name: string;
        facet: { __typename?: 'Facet'; code: string };
      }>;
      variants: Array<{
        __typename?: 'ProductVariant';
        id: string;
        name: string;
        sku: string;
        price: number;
        priceWithTax: number;
        stockOnHand: number;
        customFields?: {
          __typename?: 'ProductVariantCustomFields';
          wholesalePrice?: number | null;
          allowFractionalQuantity?: boolean | null;
        } | null;
        prices: Array<{
          __typename?: 'ProductVariantPrice';
          price: number;
          currencyCode: CurrencyCode;
        }>;
      }>;
    }>;
  };
};

export type GetFacetsByCodesQueryVariables = Exact<{
  codes: Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;

export type GetFacetsByCodesQuery = {
  __typename?: 'Query';
  facets: {
    __typename?: 'FacetList';
    items: Array<{ __typename?: 'Facet'; id: string; code: string; name: string }>;
  };
};

export type GetFacetValuesQueryVariables = Exact<{
  facetId: Scalars['String']['input'];
  term?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetFacetValuesQuery = {
  __typename?: 'Query';
  facetValues: {
    __typename?: 'FacetValueList';
    items: Array<{ __typename?: 'FacetValue'; id: string; name: string; code: string }>;
  };
};

export type CreateFacetMutationVariables = Exact<{
  input: CreateFacetInput;
}>;

export type CreateFacetMutation = {
  __typename?: 'Mutation';
  createFacet: { __typename?: 'Facet'; id: string; code: string; name: string };
};

export type CreateFacetValueMutationVariables = Exact<{
  input: CreateFacetValueInput;
}>;

export type CreateFacetValueMutation = {
  __typename?: 'Mutation';
  createFacetValue: { __typename?: 'FacetValue'; id: string; name: string; code: string };
};

export type GetOrdersForPeriodQueryVariables = Exact<{
  startDate: Scalars['DateTime']['input'];
}>;

export type GetOrdersForPeriodQuery = {
  __typename?: 'Query';
  orders: {
    __typename?: 'OrderList';
    items: Array<{
      __typename?: 'Order';
      id: string;
      total: number;
      totalWithTax: number;
      orderPlacedAt?: any | null;
      state: string;
      payments?: Array<{
        __typename?: 'Payment';
        id: string;
        amount: number;
        method: string;
        state: string;
      }> | null;
    }>;
  };
};

export type GetDashboardStatsQueryVariables = Exact<{
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
}>;

export type GetDashboardStatsQuery = {
  __typename?: 'Query';
  dashboardStats: {
    __typename?: 'DashboardStats';
    sales: {
      __typename?: 'PeriodStats';
      today: number;
      week: number;
      month: number;
      accounts: Array<{
        __typename?: 'AccountBreakdown';
        label: string;
        value: number;
        icon: string;
      }>;
    };
    purchases: {
      __typename?: 'PeriodStats';
      today: number;
      week: number;
      month: number;
      accounts: Array<{
        __typename?: 'AccountBreakdown';
        label: string;
        value: number;
        icon: string;
      }>;
    };
    expenses: {
      __typename?: 'PeriodStats';
      today: number;
      week: number;
      month: number;
      accounts: Array<{
        __typename?: 'AccountBreakdown';
        label: string;
        value: number;
        icon: string;
      }>;
    };
  };
};

export type GetProductStatsQueryVariables = Exact<{ [key: string]: never }>;

export type GetProductStatsQuery = {
  __typename?: 'Query';
  products: { __typename?: 'ProductList'; totalItems: number };
  productVariants: { __typename?: 'ProductVariantList'; totalItems: number };
};

export type GetRecentOrdersQueryVariables = Exact<{ [key: string]: never }>;

export type GetRecentOrdersQuery = {
  __typename?: 'Query';
  orders: {
    __typename?: 'OrderList';
    items: Array<{
      __typename?: 'Order';
      id: string;
      code: string;
      total: number;
      totalWithTax: number;
      state: string;
      createdAt: any;
      currencyCode: CurrencyCode;
      customer?: { __typename?: 'Customer'; firstName: string; lastName: string } | null;
      lines: Array<{
        __typename?: 'OrderLine';
        id: string;
        quantity: number;
        productVariant: {
          __typename?: 'ProductVariant';
          id: string;
          name: string;
          sku: string;
          product: { __typename?: 'Product'; id: string; name: string };
        };
      }>;
    }>;
  };
};

export type CreateDraftOrderMutationVariables = Exact<{ [key: string]: never }>;

export type CreateDraftOrderMutation = {
  __typename?: 'Mutation';
  createDraftOrder: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    total: number;
    totalWithTax: number;
  };
};

export type CreateOrderMutationVariables = Exact<{
  input: CreateOrderInput;
}>;

export type CreateOrderMutation = {
  __typename?: 'Mutation';
  createOrder: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    total: number;
    totalWithTax: number;
    customer?: {
      __typename?: 'Customer';
      id: string;
      firstName: string;
      lastName: string;
      emailAddress: string;
    } | null;
    lines: Array<{
      __typename?: 'OrderLine';
      id: string;
      quantity: number;
      linePrice: number;
      linePriceWithTax: number;
      productVariant: { __typename?: 'ProductVariant'; id: string; name: string };
    }>;
    payments?: Array<{
      __typename?: 'Payment';
      id: string;
      state: string;
      amount: number;
      method: string;
      metadata?: any | null;
    }> | null;
  };
};

export type AddItemToDraftOrderMutationVariables = Exact<{
  orderId: Scalars['ID']['input'];
  input: AddItemToDraftOrderInput;
}>;

export type AddItemToDraftOrderMutation = {
  __typename?: 'Mutation';
  addItemToDraftOrder:
    | { __typename?: 'InsufficientStockError' }
    | { __typename?: 'NegativeQuantityError' }
    | {
        __typename?: 'Order';
        id: string;
        code: string;
        state: string;
        lines: Array<{
          __typename?: 'OrderLine';
          id: string;
          quantity: number;
          linePrice: number;
          linePriceWithTax: number;
          productVariant: { __typename?: 'ProductVariant'; id: string; name: string };
        }>;
      }
    | { __typename?: 'OrderInterceptorError' }
    | { __typename?: 'OrderLimitError' }
    | { __typename?: 'OrderModificationError' };
};

export type AddManualPaymentToOrderMutationVariables = Exact<{
  input: ManualPaymentInput;
}>;

export type AddManualPaymentToOrderMutation = {
  __typename?: 'Mutation';
  addManualPaymentToOrder:
    | { __typename?: 'ManualPaymentStateError'; errorCode: ErrorCode; message: string }
    | {
        __typename?: 'Order';
        id: string;
        code: string;
        state: string;
        total: number;
        totalWithTax: number;
        payments?: Array<{
          __typename?: 'Payment';
          id: string;
          state: string;
          amount: number;
          method: string;
          metadata?: any | null;
        }> | null;
      };
};

export type SetCustomerForDraftOrderMutationVariables = Exact<{
  orderId: Scalars['ID']['input'];
  customerId: Scalars['ID']['input'];
}>;

export type SetCustomerForDraftOrderMutation = {
  __typename?: 'Mutation';
  setCustomerForDraftOrder:
    | { __typename?: 'EmailAddressConflictError'; errorCode: ErrorCode; message: string }
    | {
        __typename?: 'Order';
        id: string;
        code: string;
        state: string;
        total: number;
        totalWithTax: number;
        customer?: {
          __typename?: 'Customer';
          id: string;
          firstName: string;
          lastName: string;
          emailAddress: string;
        } | null;
      };
};

export type SetDraftOrderShippingMethodMutationVariables = Exact<{
  orderId: Scalars['ID']['input'];
  shippingMethodId: Scalars['ID']['input'];
}>;

export type SetDraftOrderShippingMethodMutation = {
  __typename?: 'Mutation';
  setDraftOrderShippingMethod:
    | { __typename?: 'IneligibleShippingMethodError' }
    | { __typename?: 'NoActiveOrderError' }
    | {
        __typename?: 'Order';
        id: string;
        code: string;
        state: string;
        total: number;
        totalWithTax: number;
        shippingLines: Array<{
          __typename?: 'ShippingLine';
          id: string;
          shippingMethod: { __typename?: 'ShippingMethod'; id: string; name: string; code: string };
        }>;
      }
    | { __typename?: 'OrderModificationError'; errorCode: ErrorCode; message: string };
};

export type SetDraftOrderBillingAddressMutationVariables = Exact<{
  orderId: Scalars['ID']['input'];
  input: CreateAddressInput;
}>;

export type SetDraftOrderBillingAddressMutation = {
  __typename?: 'Mutation';
  setDraftOrderBillingAddress: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    total: number;
    totalWithTax: number;
    billingAddress?: {
      __typename?: 'OrderAddress';
      fullName?: string | null;
      streetLine1?: string | null;
      city?: string | null;
      postalCode?: string | null;
      country?: string | null;
    } | null;
  };
};

export type SetDraftOrderShippingAddressMutationVariables = Exact<{
  orderId: Scalars['ID']['input'];
  input: CreateAddressInput;
}>;

export type SetDraftOrderShippingAddressMutation = {
  __typename?: 'Mutation';
  setDraftOrderShippingAddress: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    total: number;
    totalWithTax: number;
    shippingAddress?: {
      __typename?: 'OrderAddress';
      fullName?: string | null;
      streetLine1?: string | null;
      city?: string | null;
      postalCode?: string | null;
      country?: string | null;
    } | null;
  };
};

export type TransitionOrderToStateMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  state: Scalars['String']['input'];
}>;

export type TransitionOrderToStateMutation = {
  __typename?: 'Mutation';
  transitionOrderToState?:
    | {
        __typename?: 'Order';
        id: string;
        code: string;
        state: string;
        total: number;
        totalWithTax: number;
        lines: Array<{
          __typename?: 'OrderLine';
          id: string;
          quantity: number;
          linePrice: number;
          productVariant: { __typename?: 'ProductVariant'; id: string; name: string };
        }>;
      }
    | {
        __typename?: 'OrderStateTransitionError';
        errorCode: ErrorCode;
        message: string;
        transitionError: string;
      }
    | null;
};

export type AddFulfillmentToOrderMutationVariables = Exact<{
  input: FulfillOrderInput;
}>;

export type AddFulfillmentToOrderMutation = {
  __typename?: 'Mutation';
  addFulfillmentToOrder:
    | {
        __typename?: 'CreateFulfillmentError';
        errorCode: ErrorCode;
        message: string;
        fulfillmentHandlerError: string;
      }
    | { __typename?: 'EmptyOrderLineSelectionError' }
    | {
        __typename?: 'Fulfillment';
        id: string;
        state: string;
        nextStates: Array<string>;
        createdAt: any;
        updatedAt: any;
        method: string;
        trackingCode?: string | null;
        lines: Array<{ __typename?: 'FulfillmentLine'; orderLineId: string; quantity: number }>;
      }
    | {
        __typename?: 'FulfillmentStateTransitionError';
        errorCode: ErrorCode;
        message: string;
        transitionError: string;
      }
    | { __typename?: 'InsufficientStockOnHandError' }
    | { __typename?: 'InvalidFulfillmentHandlerError' }
    | { __typename?: 'ItemsAlreadyFulfilledError' };
};

export type GetPaymentMethodsQueryVariables = Exact<{ [key: string]: never }>;

export type GetPaymentMethodsQuery = {
  __typename?: 'Query';
  paymentMethods: {
    __typename?: 'PaymentMethodList';
    items: Array<{
      __typename?: 'PaymentMethod';
      id: string;
      code: string;
      name: string;
      description: string;
      enabled: boolean;
      customFields?: {
        __typename?: 'PaymentMethodCustomFields';
        isActive?: boolean | null;
        imageAsset?: {
          __typename?: 'Asset';
          id: string;
          source: string;
          name: string;
          preview: string;
        } | null;
      } | null;
    }>;
  };
};

export type GetOrderDetailsQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetOrderDetailsQuery = {
  __typename?: 'Query';
  order?: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    lines: Array<{
      __typename?: 'OrderLine';
      id: string;
      quantity: number;
      productVariant: { __typename?: 'ProductVariant'; id: string; name: string; sku: string };
    }>;
  } | null;
};

export type GetOrderQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetOrderQuery = {
  __typename?: 'Query';
  order?: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    total: number;
    totalWithTax: number;
    lines: Array<{
      __typename?: 'OrderLine';
      id: string;
      quantity: number;
      linePrice: number;
      linePriceWithTax: number;
      productVariant: { __typename?: 'ProductVariant'; id: string; name: string };
    }>;
  } | null;
};

export type GetOrdersQueryVariables = Exact<{
  options?: InputMaybe<OrderListOptions>;
}>;

export type GetOrdersQuery = {
  __typename?: 'Query';
  orders: {
    __typename?: 'OrderList';
    totalItems: number;
    items: Array<{
      __typename?: 'Order';
      id: string;
      code: string;
      state: string;
      createdAt: any;
      updatedAt: any;
      orderPlacedAt?: any | null;
      total: number;
      totalWithTax: number;
      currencyCode: CurrencyCode;
      customer?: {
        __typename?: 'Customer';
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
      } | null;
      lines: Array<{
        __typename?: 'OrderLine';
        id: string;
        quantity: number;
        linePrice: number;
        linePriceWithTax: number;
        productVariant: { __typename?: 'ProductVariant'; id: string; name: string; sku: string };
      }>;
      payments?: Array<{
        __typename?: 'Payment';
        id: string;
        state: string;
        amount: number;
        method: string;
        createdAt: any;
      }> | null;
    }>;
  };
};

export type GetPaymentsQueryVariables = Exact<{
  options?: InputMaybe<OrderListOptions>;
}>;

export type GetPaymentsQuery = {
  __typename?: 'Query';
  orders: {
    __typename?: 'OrderList';
    totalItems: number;
    items: Array<{
      __typename?: 'Order';
      id: string;
      code: string;
      state: string;
      createdAt: any;
      orderPlacedAt?: any | null;
      payments?: Array<{
        __typename?: 'Payment';
        id: string;
        state: string;
        amount: number;
        method: string;
        transactionId?: string | null;
        createdAt: any;
        updatedAt: any;
        errorMessage?: string | null;
        metadata?: any | null;
      }> | null;
      customer?: {
        __typename?: 'Customer';
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
      } | null;
    }>;
  };
};

export type GetPaymentFullQueryVariables = Exact<{
  orderId: Scalars['ID']['input'];
}>;

export type GetPaymentFullQuery = {
  __typename?: 'Query';
  order?: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    createdAt: any;
    orderPlacedAt?: any | null;
    total: number;
    totalWithTax: number;
    currencyCode: CurrencyCode;
    customer?: {
      __typename?: 'Customer';
      id: string;
      firstName: string;
      lastName: string;
      emailAddress: string;
      phoneNumber?: string | null;
    } | null;
    payments?: Array<{
      __typename?: 'Payment';
      id: string;
      state: string;
      amount: number;
      method: string;
      transactionId?: string | null;
      createdAt: any;
      updatedAt: any;
      errorMessage?: string | null;
      metadata?: any | null;
      nextStates: Array<string>;
      refunds: Array<{
        __typename?: 'Refund';
        id: string;
        total: number;
        state: string;
        reason?: string | null;
        createdAt: any;
      }>;
    }> | null;
  } | null;
};

export type GetOrderFullQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetOrderFullQuery = {
  __typename?: 'Query';
  order?: {
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    createdAt: any;
    updatedAt: any;
    orderPlacedAt?: any | null;
    total: number;
    totalWithTax: number;
    currencyCode: CurrencyCode;
    customer?: {
      __typename?: 'Customer';
      id: string;
      firstName: string;
      lastName: string;
      emailAddress: string;
      phoneNumber?: string | null;
    } | null;
    lines: Array<{
      __typename?: 'OrderLine';
      id: string;
      quantity: number;
      linePrice: number;
      linePriceWithTax: number;
      productVariant: {
        __typename?: 'ProductVariant';
        id: string;
        name: string;
        product: { __typename?: 'Product'; id: string; name: string };
      };
    }>;
    payments?: Array<{
      __typename?: 'Payment';
      id: string;
      state: string;
      amount: number;
      method: string;
      createdAt: any;
      metadata?: any | null;
    }> | null;
    fulfillments?: Array<{
      __typename?: 'Fulfillment';
      id: string;
      state: string;
      method: string;
      trackingCode?: string | null;
      createdAt: any;
      updatedAt: any;
    }> | null;
    billingAddress?: {
      __typename?: 'OrderAddress';
      fullName?: string | null;
      streetLine1?: string | null;
      streetLine2?: string | null;
      city?: string | null;
      postalCode?: string | null;
      province?: string | null;
      country?: string | null;
      phoneNumber?: string | null;
    } | null;
    shippingAddress?: {
      __typename?: 'OrderAddress';
      fullName?: string | null;
      streetLine1?: string | null;
      streetLine2?: string | null;
      city?: string | null;
      postalCode?: string | null;
      province?: string | null;
      country?: string | null;
      phoneNumber?: string | null;
    } | null;
  } | null;
};

export type GetMlTrainingInfoQueryVariables = Exact<{
  channelId: Scalars['ID']['input'];
}>;

export type GetMlTrainingInfoQuery = {
  __typename?: 'Query';
  mlTrainingInfo: {
    __typename?: 'MlTrainingInfo';
    status: string;
    progress: number;
    startedAt?: any | null;
    error?: string | null;
    productCount: number;
    imageCount: number;
    hasActiveModel: boolean;
    lastTrainedAt?: any | null;
  };
};

export type GetMlTrainingManifestQueryVariables = Exact<{
  channelId: Scalars['ID']['input'];
}>;

export type GetMlTrainingManifestQuery = {
  __typename?: 'Query';
  mlTrainingManifest: {
    __typename?: 'MlTrainingManifest';
    channelId: string;
    version: string;
    extractedAt: any;
    products: Array<{
      __typename?: 'ProductManifestEntry';
      productId: string;
      productName: string;
      images: Array<{
        __typename?: 'ImageManifestEntry';
        assetId: string;
        url: string;
        filename: string;
      }>;
    }>;
  };
};

export type ExtractPhotosForTrainingMutationVariables = Exact<{
  channelId: Scalars['ID']['input'];
}>;

export type ExtractPhotosForTrainingMutation = {
  __typename?: 'Mutation';
  extractPhotosForTraining: boolean;
};

export type UpdateTrainingStatusMutationVariables = Exact<{
  channelId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
  progress?: InputMaybe<Scalars['Int']['input']>;
  error?: InputMaybe<Scalars['String']['input']>;
}>;

export type UpdateTrainingStatusMutation = {
  __typename?: 'Mutation';
  updateTrainingStatus: boolean;
};

export type StartTrainingMutationVariables = Exact<{
  channelId: Scalars['ID']['input'];
}>;

export type StartTrainingMutation = { __typename?: 'Mutation'; startTraining: boolean };

export type CompleteTrainingMutationVariables = Exact<{
  channelId: Scalars['ID']['input'];
  modelJson: Scalars['Upload']['input'];
  weightsFile: Scalars['Upload']['input'];
  metadata: Scalars['Upload']['input'];
}>;

export type CompleteTrainingMutation = { __typename?: 'Mutation'; completeTraining: boolean };

export type GetCustomersQueryVariables = Exact<{
  options?: InputMaybe<CustomerListOptions>;
}>;

export type GetCustomersQuery = {
  __typename?: 'Query';
  customers: {
    __typename?: 'CustomerList';
    totalItems: number;
    items: Array<{
      __typename?: 'Customer';
      id: string;
      firstName: string;
      lastName: string;
      emailAddress: string;
      phoneNumber?: string | null;
      createdAt: any;
      updatedAt: any;
      outstandingAmount: number;
      customFields?: {
        __typename?: 'CustomerCustomFields';
        isSupplier?: boolean | null;
        supplierType?: string | null;
        contactPerson?: string | null;
        taxId?: string | null;
        paymentTerms?: string | null;
        notes?: string | null;
        isCreditApproved?: boolean | null;
        creditLimit?: number | null;
        lastRepaymentDate?: any | null;
        lastRepaymentAmount?: number | null;
        creditDuration?: number | null;
      } | null;
      addresses?: Array<{
        __typename?: 'Address';
        id: string;
        fullName?: string | null;
        streetLine1: string;
        streetLine2?: string | null;
        city?: string | null;
        postalCode?: string | null;
        phoneNumber?: string | null;
        country: { __typename?: 'Country'; code: string; name: string };
      }> | null;
      user?: { __typename?: 'User'; id: string; identifier: string; verified: boolean } | null;
    }>;
  };
};

export type GetCountriesQueryVariables = Exact<{
  options?: InputMaybe<CountryListOptions>;
}>;

export type GetCountriesQuery = {
  __typename?: 'Query';
  countries: {
    __typename?: 'CountryList';
    totalItems: number;
    items: Array<{
      __typename?: 'Country';
      id: string;
      code: string;
      name: string;
      enabled: boolean;
    }>;
  };
};

export type GetCustomerQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetCustomerQuery = {
  __typename?: 'Query';
  customer?: {
    __typename?: 'Customer';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    phoneNumber?: string | null;
    createdAt: any;
    updatedAt: any;
    outstandingAmount: number;
    customFields?: {
      __typename?: 'CustomerCustomFields';
      isSupplier?: boolean | null;
      supplierType?: string | null;
      contactPerson?: string | null;
      taxId?: string | null;
      paymentTerms?: string | null;
      notes?: string | null;
      isCreditApproved?: boolean | null;
      creditLimit?: number | null;
      lastRepaymentDate?: any | null;
      lastRepaymentAmount?: number | null;
      creditDuration?: number | null;
    } | null;
    addresses?: Array<{
      __typename?: 'Address';
      id: string;
      fullName?: string | null;
      streetLine1: string;
      streetLine2?: string | null;
      city?: string | null;
      postalCode?: string | null;
      phoneNumber?: string | null;
      country: { __typename?: 'Country'; code: string; name: string };
    }> | null;
    user?: { __typename?: 'User'; id: string; identifier: string; verified: boolean } | null;
  } | null;
};

export type CreateCustomerMutationVariables = Exact<{
  input: CreateCustomerInput;
  isWalkIn?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type CreateCustomerMutation = {
  __typename?: 'Mutation';
  createCustomerSafe: {
    __typename?: 'Customer';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    phoneNumber?: string | null;
    createdAt: any;
    customFields?: {
      __typename?: 'CustomerCustomFields';
      isSupplier?: boolean | null;
      supplierType?: string | null;
      contactPerson?: string | null;
      taxId?: string | null;
      paymentTerms?: string | null;
      notes?: string | null;
      isCreditApproved?: boolean | null;
      creditLimit?: number | null;
    } | null;
  };
};

export type UpdateCustomerMutationVariables = Exact<{
  input: UpdateCustomerInput;
}>;

export type UpdateCustomerMutation = {
  __typename?: 'Mutation';
  updateCustomer:
    | {
        __typename?: 'Customer';
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
        phoneNumber?: string | null;
        updatedAt: any;
        customFields?: {
          __typename?: 'CustomerCustomFields';
          isSupplier?: boolean | null;
          supplierType?: string | null;
          contactPerson?: string | null;
          taxId?: string | null;
          paymentTerms?: string | null;
          notes?: string | null;
          isCreditApproved?: boolean | null;
          creditLimit?: number | null;
        } | null;
      }
    | { __typename?: 'EmailAddressConflictError'; errorCode: ErrorCode; message: string };
};

export type DeleteCustomerMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteCustomerMutation = {
  __typename?: 'Mutation';
  deleteCustomer: {
    __typename?: 'DeletionResponse';
    result: DeletionResult;
    message?: string | null;
  };
};

export type CreateCustomerAddressMutationVariables = Exact<{
  customerId: Scalars['ID']['input'];
  input: CreateAddressInput;
}>;

export type CreateCustomerAddressMutation = {
  __typename?: 'Mutation';
  createCustomerAddress: {
    __typename?: 'Address';
    id: string;
    fullName?: string | null;
    streetLine1: string;
    streetLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    phoneNumber?: string | null;
    country: { __typename?: 'Country'; code: string; name: string };
  };
};

export type UpdateCustomerAddressMutationVariables = Exact<{
  input: UpdateAddressInput;
}>;

export type UpdateCustomerAddressMutation = {
  __typename?: 'Mutation';
  updateCustomerAddress: {
    __typename?: 'Address';
    id: string;
    fullName?: string | null;
    streetLine1: string;
    streetLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    phoneNumber?: string | null;
    country: { __typename?: 'Country'; code: string; name: string };
  };
};

export type DeleteCustomerAddressMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteCustomerAddressMutation = {
  __typename?: 'Mutation';
  deleteCustomerAddress: { __typename?: 'Success'; success: boolean };
};

export type GetCreditSummaryQueryVariables = Exact<{
  customerId: Scalars['ID']['input'];
}>;

export type GetCreditSummaryQuery = {
  __typename?: 'Query';
  creditSummary: {
    __typename?: 'CreditSummary';
    customerId: string;
    isCreditApproved: boolean;
    creditFrozen: boolean;
    creditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    creditDuration: number;
  };
};

export type ValidateCreditQueryVariables = Exact<{
  input: ValidateCreditInput;
}>;

export type ValidateCreditQuery = {
  __typename?: 'Query';
  validateCredit: {
    __typename?: 'CreditValidationResult';
    isValid: boolean;
    error?: string | null;
    availableCredit: number;
    estimatedOrderTotal: number;
    wouldExceedLimit: boolean;
  };
};

export type ApproveCustomerCreditMutationVariables = Exact<{
  input: ApproveCustomerCreditInput;
}>;

export type ApproveCustomerCreditMutation = {
  __typename?: 'Mutation';
  approveCustomerCredit: {
    __typename?: 'CreditSummary';
    customerId: string;
    isCreditApproved: boolean;
    creditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    creditDuration: number;
  };
};

export type UpdateCustomerCreditLimitMutationVariables = Exact<{
  input: UpdateCustomerCreditLimitInput;
}>;

export type UpdateCustomerCreditLimitMutation = {
  __typename?: 'Mutation';
  updateCustomerCreditLimit: {
    __typename?: 'CreditSummary';
    customerId: string;
    isCreditApproved: boolean;
    creditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    creditDuration: number;
  };
};

export type UpdateCreditDurationMutationVariables = Exact<{
  input: UpdateCreditDurationInput;
}>;

export type UpdateCreditDurationMutation = {
  __typename?: 'Mutation';
  updateCreditDuration: {
    __typename?: 'CreditSummary';
    customerId: string;
    isCreditApproved: boolean;
    creditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    creditDuration: number;
  };
};

export type GetUnpaidOrdersForCustomerQueryVariables = Exact<{
  customerId: Scalars['ID']['input'];
}>;

export type GetUnpaidOrdersForCustomerQuery = {
  __typename?: 'Query';
  unpaidOrdersForCustomer: Array<{
    __typename?: 'Order';
    id: string;
    code: string;
    state: string;
    total: number;
    totalWithTax: number;
    createdAt: any;
    payments?: Array<{
      __typename?: 'Payment';
      id: string;
      state: string;
      amount: number;
      method: string;
    }> | null;
  }>;
};

export type AllocateBulkPaymentMutationVariables = Exact<{
  input: PaymentAllocationInput;
}>;

export type AllocateBulkPaymentMutation = {
  __typename?: 'Mutation';
  allocateBulkPayment: {
    __typename?: 'PaymentAllocationResult';
    remainingBalance: number;
    totalAllocated: number;
    ordersPaid: Array<{
      __typename?: 'OrderPayment';
      orderId: string;
      orderCode: string;
      amountPaid: number;
    }>;
  };
};

export type PaySingleOrderMutationVariables = Exact<{
  input: PaySingleOrderInput;
}>;

export type PaySingleOrderMutation = {
  __typename?: 'Mutation';
  paySingleOrder: {
    __typename?: 'PaymentAllocationResult';
    remainingBalance: number;
    totalAllocated: number;
    ordersPaid: Array<{
      __typename?: 'OrderPayment';
      orderId: string;
      orderCode: string;
      amountPaid: number;
    }>;
  };
};

export type PaySinglePurchaseMutationVariables = Exact<{
  input: PaySinglePurchaseInput;
}>;

export type PaySinglePurchaseMutation = {
  __typename?: 'Mutation';
  paySinglePurchase: {
    __typename?: 'SupplierPaymentAllocationResult';
    remainingBalance: number;
    totalAllocated: number;
    excessPayment: number;
    purchasesPaid: Array<{
      __typename?: 'SupplierPurchasePayment';
      purchaseId: string;
      purchaseReference: string;
      amountPaid: number;
    }>;
  };
};

export type GetSupplierCreditSummaryQueryVariables = Exact<{
  supplierId: Scalars['ID']['input'];
}>;

export type GetSupplierCreditSummaryQuery = {
  __typename?: 'Query';
  supplierCreditSummary: {
    __typename?: 'SupplierCreditSummary';
    supplierId: string;
    isSupplierCreditApproved: boolean;
    supplierCreditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    supplierCreditDuration: number;
  };
};

export type ApproveSupplierCreditMutationVariables = Exact<{
  input: ApproveSupplierCreditInput;
}>;

export type ApproveSupplierCreditMutation = {
  __typename?: 'Mutation';
  approveSupplierCredit: {
    __typename?: 'SupplierCreditSummary';
    supplierId: string;
    isSupplierCreditApproved: boolean;
    supplierCreditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    supplierCreditDuration: number;
  };
};

export type UpdateSupplierCreditLimitMutationVariables = Exact<{
  input: UpdateSupplierCreditLimitInput;
}>;

export type UpdateSupplierCreditLimitMutation = {
  __typename?: 'Mutation';
  updateSupplierCreditLimit: {
    __typename?: 'SupplierCreditSummary';
    supplierId: string;
    isSupplierCreditApproved: boolean;
    supplierCreditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    supplierCreditDuration: number;
  };
};

export type UpdateSupplierCreditDurationMutationVariables = Exact<{
  input: UpdateSupplierCreditDurationInput;
}>;

export type UpdateSupplierCreditDurationMutation = {
  __typename?: 'Mutation';
  updateSupplierCreditDuration: {
    __typename?: 'SupplierCreditSummary';
    supplierId: string;
    isSupplierCreditApproved: boolean;
    supplierCreditLimit: number;
    outstandingAmount: number;
    availableCredit: number;
    lastRepaymentDate?: any | null;
    lastRepaymentAmount: number;
    supplierCreditDuration: number;
  };
};

export type AllocateBulkSupplierPaymentMutationVariables = Exact<{
  input: SupplierPaymentAllocationInput;
}>;

export type AllocateBulkSupplierPaymentMutation = {
  __typename?: 'Mutation';
  allocateBulkSupplierPayment: {
    __typename?: 'SupplierPaymentAllocationResult';
    remainingBalance: number;
    totalAllocated: number;
    excessPayment: number;
    purchasesPaid: Array<{
      __typename?: 'SupplierPurchasePayment';
      purchaseId: string;
      purchaseReference: string;
      amountPaid: number;
    }>;
  };
};

export type SetOrderLineCustomPriceMutationVariables = Exact<{
  input: SetOrderLineCustomPriceInput;
}>;

export type SetOrderLineCustomPriceMutation = {
  __typename?: 'Mutation';
  setOrderLineCustomPrice:
    | { __typename?: 'Error'; errorCode: ErrorCode; message: string }
    | {
        __typename?: 'OrderLine';
        id: string;
        quantity: number;
        linePrice: number;
        linePriceWithTax: number;
        customFields?: {
          __typename?: 'OrderLineCustomFields';
          customLinePrice?: number | null;
          priceOverrideReason?: string | null;
        } | null;
        productVariant: { __typename?: 'ProductVariant'; id: string; name: string; price: number };
      };
};

export type GetSuppliersQueryVariables = Exact<{
  options?: InputMaybe<CustomerListOptions>;
}>;

export type GetSuppliersQuery = {
  __typename?: 'Query';
  customers: {
    __typename?: 'CustomerList';
    totalItems: number;
    items: Array<{
      __typename?: 'Customer';
      id: string;
      firstName: string;
      lastName: string;
      emailAddress: string;
      phoneNumber?: string | null;
      createdAt: any;
      updatedAt: any;
      supplierOutstandingAmount: number;
      customFields?: {
        __typename?: 'CustomerCustomFields';
        isSupplier?: boolean | null;
        supplierType?: string | null;
        contactPerson?: string | null;
        taxId?: string | null;
        paymentTerms?: string | null;
        notes?: string | null;
        isCreditApproved?: boolean | null;
        creditLimit?: number | null;
        creditDuration?: number | null;
        isSupplierCreditApproved?: boolean | null;
        supplierCreditLimit?: number | null;
      } | null;
      addresses?: Array<{
        __typename?: 'Address';
        id: string;
        fullName?: string | null;
        streetLine1: string;
        streetLine2?: string | null;
        city?: string | null;
        postalCode?: string | null;
        phoneNumber?: string | null;
        country: { __typename?: 'Country'; code: string; name: string };
      }> | null;
    }>;
  };
};

export type GetSupplierQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetSupplierQuery = {
  __typename?: 'Query';
  customer?: {
    __typename?: 'Customer';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    phoneNumber?: string | null;
    createdAt: any;
    updatedAt: any;
    customFields?: {
      __typename?: 'CustomerCustomFields';
      isSupplier?: boolean | null;
      supplierType?: string | null;
      contactPerson?: string | null;
      taxId?: string | null;
      paymentTerms?: string | null;
      notes?: string | null;
      isCreditApproved?: boolean | null;
      creditLimit?: number | null;
      lastRepaymentDate?: any | null;
      lastRepaymentAmount?: number | null;
      creditDuration?: number | null;
    } | null;
    addresses?: Array<{
      __typename?: 'Address';
      id: string;
      fullName?: string | null;
      streetLine1: string;
      streetLine2?: string | null;
      city?: string | null;
      postalCode?: string | null;
      phoneNumber?: string | null;
      country: { __typename?: 'Country'; code: string; name: string };
    }> | null;
  } | null;
};

export type CreateSupplierMutationVariables = Exact<{
  input: CreateCustomerInput;
  isWalkIn?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type CreateSupplierMutation = {
  __typename?: 'Mutation';
  createCustomerSafe: {
    __typename?: 'Customer';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    phoneNumber?: string | null;
    createdAt: any;
    customFields?: {
      __typename?: 'CustomerCustomFields';
      isSupplier?: boolean | null;
      supplierType?: string | null;
      contactPerson?: string | null;
      taxId?: string | null;
      paymentTerms?: string | null;
      notes?: string | null;
      isCreditApproved?: boolean | null;
      creditLimit?: number | null;
      creditDuration?: number | null;
    } | null;
  };
};

export type UpdateSupplierMutationVariables = Exact<{
  input: UpdateCustomerInput;
}>;

export type UpdateSupplierMutation = {
  __typename?: 'Mutation';
  updateCustomer:
    | {
        __typename?: 'Customer';
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
        phoneNumber?: string | null;
        updatedAt: any;
        customFields?: {
          __typename?: 'CustomerCustomFields';
          isSupplier?: boolean | null;
          supplierType?: string | null;
          contactPerson?: string | null;
          taxId?: string | null;
          paymentTerms?: string | null;
          notes?: string | null;
          isCreditApproved?: boolean | null;
          creditLimit?: number | null;
          creditDuration?: number | null;
        } | null;
      }
    | { __typename?: 'EmailAddressConflictError'; errorCode: ErrorCode; message: string };
};

export type DeleteSupplierMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteSupplierMutation = {
  __typename?: 'Mutation';
  deleteCustomer: {
    __typename?: 'DeletionResponse';
    result: DeletionResult;
    message?: string | null;
  };
};

export type UpdateChannelLogoMutationVariables = Exact<{
  logoAssetId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type UpdateChannelLogoMutation = {
  __typename?: 'Mutation';
  updateChannelLogo: {
    __typename?: 'ChannelSettings';
    cashierFlowEnabled: boolean;
    enablePrinter: boolean;
    companyLogoAsset?: { __typename?: 'Asset'; id: string; preview: string; source: string } | null;
  };
};

export type UpdateCashierSettingsMutationVariables = Exact<{
  cashierFlowEnabled?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type UpdateCashierSettingsMutation = {
  __typename?: 'Mutation';
  updateCashierSettings: {
    __typename?: 'ChannelSettings';
    cashierFlowEnabled: boolean;
    enablePrinter: boolean;
    companyLogoAsset?: { __typename?: 'Asset'; id: string; preview: string; source: string } | null;
  };
};

export type UpdatePrinterSettingsMutationVariables = Exact<{
  enablePrinter: Scalars['Boolean']['input'];
}>;

export type UpdatePrinterSettingsMutation = {
  __typename?: 'Mutation';
  updatePrinterSettings: {
    __typename?: 'ChannelSettings';
    cashierFlowEnabled: boolean;
    enablePrinter: boolean;
    companyLogoAsset?: { __typename?: 'Asset'; id: string; preview: string; source: string } | null;
  };
};

export type InviteChannelAdministratorMutationVariables = Exact<{
  input: InviteAdministratorInput;
}>;

export type InviteChannelAdministratorMutation = {
  __typename?: 'Mutation';
  inviteChannelAdministrator: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    user: {
      __typename?: 'User';
      id: string;
      identifier: string;
      roles: Array<{
        __typename?: 'Role';
        id: string;
        code: string;
        permissions: Array<Permission>;
      }>;
    };
  };
};

export type GetRoleTemplatesQueryVariables = Exact<{ [key: string]: never }>;

export type GetRoleTemplatesQuery = {
  __typename?: 'Query';
  roleTemplates: Array<{
    __typename?: 'RoleTemplate';
    code: string;
    name: string;
    description: string;
    permissions: Array<string>;
  }>;
};

export type CreateChannelAdminMutationVariables = Exact<{
  input: CreateChannelAdminInput;
}>;

export type CreateChannelAdminMutation = {
  __typename?: 'Mutation';
  createChannelAdmin: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    user: {
      __typename?: 'User';
      id: string;
      identifier: string;
      roles: Array<{
        __typename?: 'Role';
        id: string;
        code: string;
        permissions: Array<Permission>;
      }>;
    };
  };
};

export type UpdateChannelAdminMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  permissions: Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;

export type UpdateChannelAdminMutation = {
  __typename?: 'Mutation';
  updateChannelAdmin: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    user: {
      __typename?: 'User';
      id: string;
      identifier: string;
      roles: Array<{
        __typename?: 'Role';
        id: string;
        code: string;
        permissions: Array<Permission>;
      }>;
    };
  };
};

export type DisableChannelAdminMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DisableChannelAdminMutation = {
  __typename?: 'Mutation';
  disableChannelAdmin: {
    __typename?: 'DisableChannelAdminResponse';
    success: boolean;
    message: string;
  };
};

export type GetAdministratorsQueryVariables = Exact<{
  options?: InputMaybe<AdministratorListOptions>;
}>;

export type GetAdministratorsQuery = {
  __typename?: 'Query';
  administrators: {
    __typename?: 'AdministratorList';
    items: Array<{
      __typename?: 'Administrator';
      id: string;
      firstName: string;
      lastName: string;
      emailAddress: string;
      user: {
        __typename?: 'User';
        id: string;
        identifier: string;
        verified: boolean;
        roles: Array<{
          __typename?: 'Role';
          id: string;
          code: string;
          permissions: Array<Permission>;
          channels: Array<{ __typename?: 'Channel'; id: string }>;
        }>;
      };
    }>;
  };
};

export type GetAdministratorByIdQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetAdministratorByIdQuery = {
  __typename?: 'Query';
  administrator?: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    createdAt: any;
    updatedAt: any;
    user: {
      __typename?: 'User';
      id: string;
      identifier: string;
      verified: boolean;
      lastLogin?: any | null;
      roles: Array<{
        __typename?: 'Role';
        id: string;
        code: string;
        description: string;
        permissions: Array<Permission>;
        channels: Array<{ __typename?: 'Channel'; id: string; code: string; token: string }>;
      }>;
    };
  } | null;
};

export type GetAdministratorByUserIdQueryVariables = Exact<{
  userId: Scalars['ID']['input'];
}>;

export type GetAdministratorByUserIdQuery = {
  __typename?: 'Query';
  administratorByUserId?: {
    __typename?: 'Administrator';
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    createdAt: any;
    updatedAt: any;
    user: {
      __typename?: 'User';
      id: string;
      identifier: string;
      verified: boolean;
      lastLogin?: any | null;
      roles: Array<{
        __typename?: 'Role';
        id: string;
        code: string;
        description: string;
        permissions: Array<Permission>;
        channels: Array<{ __typename?: 'Channel'; id: string; code: string; token: string }>;
      }>;
    };
  } | null;
};

export type CreateChannelPaymentMethodMutationVariables = Exact<{
  input: CreatePaymentMethodInput;
}>;

export type CreateChannelPaymentMethodMutation = {
  __typename?: 'Mutation';
  createChannelPaymentMethod: {
    __typename?: 'PaymentMethod';
    id: string;
    code: string;
    name: string;
  };
};

export type UpdateChannelPaymentMethodMutationVariables = Exact<{
  input: UpdatePaymentMethodInput;
}>;

export type UpdateChannelPaymentMethodMutation = {
  __typename?: 'Mutation';
  updateChannelPaymentMethod: {
    __typename?: 'PaymentMethod';
    id: string;
    code: string;
    name: string;
    customFields?: {
      __typename?: 'PaymentMethodCustomFields';
      isActive?: boolean | null;
      imageAsset?: { __typename?: 'Asset'; id: string; preview: string } | null;
    } | null;
  };
};

export type GetAuditLogsQueryVariables = Exact<{
  options?: InputMaybe<AuditLogOptions>;
}>;

export type GetAuditLogsQuery = {
  __typename?: 'Query';
  auditLogs: Array<{
    __typename?: 'AuditLog';
    id: string;
    timestamp: any;
    channelId: string;
    eventType: string;
    entityType?: string | null;
    entityId?: string | null;
    userId?: string | null;
    data: any;
    source: string;
  }>;
};

export type GetUserNotificationsQueryVariables = Exact<{
  options?: InputMaybe<NotificationListOptions>;
}>;

export type GetUserNotificationsQuery = {
  __typename?: 'Query';
  getUserNotifications: {
    __typename?: 'NotificationList';
    totalItems: number;
    items: Array<{
      __typename?: 'Notification';
      id: string;
      userId: string;
      channelId: string;
      type: NotificationType;
      title: string;
      message: string;
      data?: any | null;
      read: boolean;
      createdAt: any;
    }>;
  };
};

export type GetUnreadCountQueryVariables = Exact<{ [key: string]: never }>;

export type GetUnreadCountQuery = { __typename?: 'Query'; getUnreadCount: number };

export type MarkNotificationAsReadMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type MarkNotificationAsReadMutation = {
  __typename?: 'Mutation';
  markNotificationAsRead: boolean;
};

export type MarkAllAsReadMutationVariables = Exact<{ [key: string]: never }>;

export type MarkAllAsReadMutation = { __typename?: 'Mutation'; markAllAsRead: number };

export type SubscribeToPushMutationVariables = Exact<{
  subscription: PushSubscriptionInput;
}>;

export type SubscribeToPushMutation = { __typename?: 'Mutation'; subscribeToPush: boolean };

export type UnsubscribeToPushMutationVariables = Exact<{ [key: string]: never }>;

export type UnsubscribeToPushMutation = { __typename?: 'Mutation'; unsubscribeToPush: boolean };

export type GetSubscriptionTiersQueryVariables = Exact<{ [key: string]: never }>;

export type GetSubscriptionTiersQuery = {
  __typename?: 'Query';
  getSubscriptionTiers: Array<{
    __typename?: 'SubscriptionTier';
    id: string;
    code: string;
    name: string;
    description?: string | null;
    priceMonthly: number;
    priceYearly: number;
    features?: any | null;
    isActive: boolean;
    createdAt: any;
    updatedAt: any;
  }>;
};

export type GetChannelSubscriptionQueryVariables = Exact<{
  channelId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type GetChannelSubscriptionQuery = {
  __typename?: 'Query';
  getChannelSubscription: {
    __typename?: 'ChannelSubscription';
    status: string;
    trialEndsAt?: any | null;
    subscriptionStartedAt?: any | null;
    subscriptionExpiresAt?: any | null;
    billingCycle?: string | null;
    lastPaymentDate?: any | null;
    lastPaymentAmount?: number | null;
    tier?: {
      __typename?: 'SubscriptionTier';
      id: string;
      code: string;
      name: string;
      description?: string | null;
      priceMonthly: number;
      priceYearly: number;
      features?: any | null;
    } | null;
  };
};

export type CheckSubscriptionStatusQueryVariables = Exact<{
  channelId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type CheckSubscriptionStatusQuery = {
  __typename?: 'Query';
  checkSubscriptionStatus: {
    __typename?: 'SubscriptionStatus';
    isValid: boolean;
    status: string;
    daysRemaining?: number | null;
    expiresAt?: any | null;
    trialEndsAt?: any | null;
    canPerformAction: boolean;
  };
};

export type InitiateSubscriptionPurchaseMutationVariables = Exact<{
  channelId: Scalars['ID']['input'];
  tierId: Scalars['String']['input'];
  billingCycle: Scalars['String']['input'];
  phoneNumber: Scalars['String']['input'];
  email: Scalars['String']['input'];
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
}>;

export type InitiateSubscriptionPurchaseMutation = {
  __typename?: 'Mutation';
  initiateSubscriptionPurchase: {
    __typename?: 'InitiatePurchaseResult';
    success: boolean;
    reference?: string | null;
    authorizationUrl?: string | null;
    message?: string | null;
  };
};

export type VerifySubscriptionPaymentMutationVariables = Exact<{
  channelId: Scalars['ID']['input'];
  reference: Scalars['String']['input'];
}>;

export type VerifySubscriptionPaymentMutation = {
  __typename?: 'Mutation';
  verifySubscriptionPayment: boolean;
};

export type CancelSubscriptionMutationVariables = Exact<{
  channelId: Scalars['ID']['input'];
}>;

export type CancelSubscriptionMutation = { __typename?: 'Mutation'; cancelSubscription: boolean };

export type RecordPurchaseMutationVariables = Exact<{
  input: RecordPurchaseInput;
}>;

export type RecordPurchaseMutation = {
  __typename?: 'Mutation';
  recordPurchase: {
    __typename?: 'StockPurchase';
    id: string;
    supplierId: string;
    purchaseDate: any;
    referenceNumber?: string | null;
    totalCost: number;
    paymentStatus: string;
    notes?: string | null;
    createdAt: any;
    updatedAt: any;
    lines: Array<{
      __typename?: 'StockPurchaseLine';
      id: string;
      variantId: string;
      quantity: number;
      unitCost: number;
      totalCost: number;
      stockLocationId: string;
    }>;
  };
};

export type GetPurchasesQueryVariables = Exact<{
  options?: InputMaybe<PurchaseListOptions>;
}>;

export type GetPurchasesQuery = {
  __typename?: 'Query';
  purchases: {
    __typename?: 'StockPurchaseList';
    totalItems: number;
    items: Array<{
      __typename?: 'StockPurchase';
      id: string;
      supplierId: string;
      purchaseDate: any;
      referenceNumber?: string | null;
      totalCost: number;
      paymentStatus: string;
      isCreditPurchase: boolean;
      notes?: string | null;
      createdAt: any;
      updatedAt: any;
      supplier?: {
        __typename?: 'Customer';
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
      } | null;
      lines: Array<{
        __typename?: 'StockPurchaseLine';
        id: string;
        variantId: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
        stockLocationId: string;
        variant?: {
          __typename?: 'ProductVariant';
          id: string;
          name: string;
          product: { __typename?: 'Product'; id: string; name: string };
        } | null;
        stockLocation?: { __typename?: 'StockLocation'; id: string; name: string } | null;
      }>;
    }>;
  };
};

export type RecordStockAdjustmentMutationVariables = Exact<{
  input: RecordStockAdjustmentInput;
}>;

export type RecordStockAdjustmentMutation = {
  __typename?: 'Mutation';
  recordStockAdjustment: {
    __typename?: 'InventoryStockAdjustment';
    id: string;
    reason: string;
    notes?: string | null;
    adjustedByUserId?: string | null;
    createdAt: any;
    updatedAt: any;
    lines: Array<{
      __typename?: 'InventoryStockAdjustmentLine';
      id: string;
      variantId: string;
      quantityChange: number;
      previousStock: number;
      newStock: number;
      stockLocationId: string;
    }>;
  };
};

export type GetStockAdjustmentsQueryVariables = Exact<{
  options?: InputMaybe<StockAdjustmentListOptions>;
}>;

export type GetStockAdjustmentsQuery = {
  __typename?: 'Query';
  stockAdjustments: {
    __typename?: 'InventoryStockAdjustmentList';
    totalItems: number;
    items: Array<{
      __typename?: 'InventoryStockAdjustment';
      id: string;
      reason: string;
      notes?: string | null;
      adjustedByUserId?: string | null;
      createdAt: any;
      updatedAt: any;
      lines: Array<{
        __typename?: 'InventoryStockAdjustmentLine';
        id: string;
        variantId: string;
        quantityChange: number;
        previousStock: number;
        newStock: number;
        stockLocationId: string;
        variant?: {
          __typename?: 'ProductVariant';
          id: string;
          name: string;
          sku: string;
          product: { __typename?: 'Product'; name: string };
        } | null;
        stockLocation?: { __typename?: 'StockLocation'; id: string; name: string } | null;
      }>;
    }>;
  };
};

export type GetLedgerAccountsQueryVariables = Exact<{ [key: string]: never }>;

export type GetLedgerAccountsQuery = {
  __typename?: 'Query';
  ledgerAccounts: {
    __typename?: 'LedgerAccountsResult';
    items: Array<{
      __typename?: 'LedgerAccount';
      id: string;
      code: string;
      name: string;
      type: string;
      isActive: boolean;
      balance: number;
      parentAccountId?: string | null;
      isParent: boolean;
    }>;
  };
};

export type GetEligibleDebitAccountsQueryVariables = Exact<{ [key: string]: never }>;

export type GetEligibleDebitAccountsQuery = {
  __typename?: 'Query';
  eligibleDebitAccounts: {
    __typename?: 'LedgerAccountsResult';
    items: Array<{
      __typename?: 'LedgerAccount';
      id: string;
      code: string;
      name: string;
      type: string;
      isActive: boolean;
      balance: number;
      parentAccountId?: string | null;
      isParent: boolean;
    }>;
  };
};

export type RecordExpenseMutationVariables = Exact<{
  input: RecordExpenseInput;
}>;

export type RecordExpenseMutation = {
  __typename?: 'Mutation';
  recordExpense: { __typename?: 'RecordExpenseResult'; sourceId: string };
};

export type CreateInterAccountTransferMutationVariables = Exact<{
  input: InterAccountTransferInput;
}>;

export type CreateInterAccountTransferMutation = {
  __typename?: 'Mutation';
  createInterAccountTransfer: {
    __typename?: 'JournalEntry';
    id: string;
    entryDate: string;
    postedAt: any;
    sourceType: string;
    sourceId: string;
    memo?: string | null;
    lines: Array<{
      __typename?: 'JournalLine';
      id: string;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      meta?: any | null;
    }>;
  };
};

export type GetJournalEntriesQueryVariables = Exact<{
  options?: InputMaybe<JournalEntriesOptions>;
}>;

export type GetJournalEntriesQuery = {
  __typename?: 'Query';
  journalEntries: {
    __typename?: 'JournalEntriesResult';
    totalItems: number;
    items: Array<{
      __typename?: 'JournalEntry';
      id: string;
      entryDate: string;
      postedAt: any;
      sourceType: string;
      sourceId: string;
      memo?: string | null;
      lines: Array<{
        __typename?: 'JournalLine';
        id: string;
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
        meta?: any | null;
      }>;
    }>;
  };
};

export type GetJournalEntryQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetJournalEntryQuery = {
  __typename?: 'Query';
  journalEntry?: {
    __typename?: 'JournalEntry';
    id: string;
    entryDate: string;
    postedAt: any;
    sourceType: string;
    sourceId: string;
    memo?: string | null;
    lines: Array<{
      __typename?: 'JournalLine';
      id: string;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      meta?: any | null;
    }>;
  } | null;
};

export type GetChannelReconciliationConfigQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
}>;

export type GetChannelReconciliationConfigQuery = {
  __typename?: 'Query';
  channelReconciliationConfig: Array<{
    __typename?: 'PaymentMethodReconciliationConfig';
    paymentMethodId: string;
    paymentMethodCode: string;
    reconciliationType: string;
    ledgerAccountCode: string;
    isCashierControlled: boolean;
    requiresReconciliation: boolean;
  }>;
};

export type GetShiftModalPrefillDataQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
}>;

export type GetShiftModalPrefillDataQuery = {
  __typename?: 'Query';
  shiftModalPrefillData: {
    __typename?: 'ShiftModalPrefillData';
    config: Array<{
      __typename?: 'PaymentMethodReconciliationConfig';
      paymentMethodId: string;
      paymentMethodCode: string;
      reconciliationType: string;
      ledgerAccountCode: string;
      isCashierControlled: boolean;
      requiresReconciliation: boolean;
    }>;
    balances: Array<{
      __typename?: 'LastClosingBalance';
      accountCode: string;
      accountName: string;
      balanceCents: string;
    }>;
  };
};

export type GetCurrentCashierSessionQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
}>;

export type GetCurrentCashierSessionQuery = {
  __typename?: 'Query';
  currentCashierSession?: {
    __typename?: 'CashierSession';
    id: string;
    channelId: number;
    cashierUserId: number;
    openedAt: any;
    closedAt?: any | null;
    closingDeclared: string;
    status: string;
  } | null;
};

export type GetCashierSessionQueryVariables = Exact<{
  sessionId: Scalars['ID']['input'];
}>;

export type GetCashierSessionQuery = {
  __typename?: 'Query';
  cashierSession?: {
    __typename?: 'CashierSessionSummary';
    sessionId: string;
    cashierUserId: number;
    openedAt: any;
    closedAt?: any | null;
    status: string;
    openingFloat: string;
    closingDeclared: string;
    variance: string;
    ledgerTotals: {
      __typename?: 'CashierSessionLedgerTotals';
      cashTotal: string;
      mpesaTotal: string;
      totalCollected: string;
    };
  } | null;
};

export type GetCashierSessionsQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
  options?: InputMaybe<CashierSessionListOptions>;
}>;

export type GetCashierSessionsQuery = {
  __typename?: 'Query';
  cashierSessions: {
    __typename?: 'CashierSessionList';
    totalItems: number;
    items: Array<{
      __typename?: 'CashierSession';
      id: string;
      channelId: number;
      cashierUserId: number;
      openedAt: any;
      closedAt?: any | null;
      closingDeclared: string;
      status: string;
    }>;
  };
};

export type OpenCashierSessionMutationVariables = Exact<{
  input: OpenCashierSessionInput;
}>;

export type OpenCashierSessionMutation = {
  __typename?: 'Mutation';
  openCashierSession: {
    __typename?: 'CashierSession';
    id: string;
    channelId: number;
    cashierUserId: number;
    openedAt: any;
    status: string;
  };
};

export type CloseCashierSessionMutationVariables = Exact<{
  input: CloseCashierSessionInput;
}>;

export type CloseCashierSessionMutation = {
  __typename?: 'Mutation';
  closeCashierSession: {
    __typename?: 'CashierSessionSummary';
    sessionId: string;
    cashierUserId: number;
    openedAt: any;
    closedAt?: any | null;
    status: string;
    openingFloat: string;
    closingDeclared: string;
    variance: string;
    ledgerTotals: {
      __typename?: 'CashierSessionLedgerTotals';
      cashTotal: string;
      mpesaTotal: string;
      totalCollected: string;
    };
  };
};

export type CreateCashierSessionReconciliationMutationVariables = Exact<{
  sessionId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
}>;

export type CreateCashierSessionReconciliationMutation = {
  __typename?: 'Mutation';
  createCashierSessionReconciliation: {
    __typename?: 'Reconciliation';
    id: string;
    channelId: number;
    scope: string;
    scopeRefId: string;
    rangeStart: any;
    rangeEnd: any;
    status: string;
    expectedBalance?: string | null;
    actualBalance?: string | null;
    varianceAmount: string;
    notes?: string | null;
    createdBy: number;
  };
};

export type CreateReconciliationMutationVariables = Exact<{
  input: CreateReconciliationInput;
}>;

export type CreateReconciliationMutation = {
  __typename?: 'Mutation';
  createReconciliation: {
    __typename?: 'Reconciliation';
    id: string;
    channelId: number;
    scope: string;
    scopeRefId: string;
    rangeStart: any;
    rangeEnd: any;
    status: string;
    expectedBalance?: string | null;
    actualBalance?: string | null;
    varianceAmount: string;
    notes?: string | null;
    createdBy: number;
  };
};

export type GetReconciliationsQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
  options?: InputMaybe<ReconciliationListOptions>;
}>;

export type GetReconciliationsQuery = {
  __typename?: 'Query';
  reconciliations: {
    __typename?: 'ReconciliationList';
    totalItems: number;
    items: Array<{
      __typename?: 'Reconciliation';
      id: string;
      channelId: number;
      scope: string;
      scopeRefId: string;
      rangeStart: any;
      rangeEnd: any;
      status: string;
      expectedBalance?: string | null;
      actualBalance?: string | null;
      varianceAmount: string;
      notes?: string | null;
      createdBy: number;
    }>;
  };
};

export type GetReconciliationDetailsQueryVariables = Exact<{
  reconciliationId: Scalars['ID']['input'];
}>;

export type GetReconciliationDetailsQuery = {
  __typename?: 'Query';
  reconciliationDetails: Array<{
    __typename?: 'ReconciliationAccountDetail';
    accountId: string;
    accountCode: string;
    accountName: string;
    declaredAmountCents?: string | null;
    expectedBalanceCents?: string | null;
    varianceCents?: string | null;
  }>;
};

export type GetSessionReconciliationDetailsQueryVariables = Exact<{
  sessionId: Scalars['ID']['input'];
  kind?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetSessionReconciliationDetailsQuery = {
  __typename?: 'Query';
  sessionReconciliationDetails: Array<{
    __typename?: 'ReconciliationAccountDetail';
    accountId: string;
    accountCode: string;
    accountName: string;
    declaredAmountCents?: string | null;
    expectedBalanceCents?: string | null;
    varianceCents?: string | null;
  }>;
};

export type GetAccountBalancesAsOfQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
  asOfDate: Scalars['String']['input'];
}>;

export type GetAccountBalancesAsOfQuery = {
  __typename?: 'Query';
  accountBalancesAsOf: Array<{
    __typename?: 'AccountBalanceAsOfItem';
    accountId: string;
    accountCode: string;
    accountName: string;
    balanceCents: string;
  }>;
};

export type GetLastClosedSessionClosingBalancesQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
}>;

export type GetLastClosedSessionClosingBalancesQuery = {
  __typename?: 'Query';
  lastClosedSessionClosingBalances: Array<{
    __typename?: 'LastClosingBalance';
    accountCode: string;
    accountName: string;
    balanceCents: string;
  }>;
};

export type GetExpectedSessionClosingBalancesQueryVariables = Exact<{
  sessionId: Scalars['ID']['input'];
}>;

export type GetExpectedSessionClosingBalancesQuery = {
  __typename?: 'Query';
  expectedSessionClosingBalances: Array<{
    __typename?: 'ExpectedClosingBalance';
    accountCode: string;
    accountName: string;
    expectedBalanceCents: string;
  }>;
};

export type GetSessionCashCountsQueryVariables = Exact<{
  sessionId: Scalars['ID']['input'];
}>;

export type GetSessionCashCountsQuery = {
  __typename?: 'Query';
  sessionCashCounts: Array<{
    __typename?: 'CashDrawerCount';
    id: string;
    channelId: number;
    sessionId: string;
    countType: string;
    takenAt: any;
    declaredCash: string;
    expectedCash?: string | null;
    variance?: string | null;
    varianceReason?: string | null;
    reviewedByUserId?: number | null;
    reviewedAt?: any | null;
    reviewNotes?: string | null;
    countedByUserId: number;
  }>;
};

export type GetPendingVarianceReviewsQueryVariables = Exact<{
  channelId: Scalars['Int']['input'];
}>;

export type GetPendingVarianceReviewsQuery = {
  __typename?: 'Query';
  pendingVarianceReviews: Array<{
    __typename?: 'CashDrawerCount';
    id: string;
    channelId: number;
    sessionId: string;
    countType: string;
    takenAt: any;
    declaredCash: string;
    expectedCash?: string | null;
    variance?: string | null;
    varianceReason?: string | null;
    reviewedByUserId?: number | null;
    reviewedAt?: any | null;
    countedByUserId: number;
  }>;
};

export type GetSessionMpesaVerificationsQueryVariables = Exact<{
  sessionId: Scalars['ID']['input'];
}>;

export type GetSessionMpesaVerificationsQuery = {
  __typename?: 'Query';
  sessionMpesaVerifications: Array<{
    __typename?: 'MpesaVerification';
    id: string;
    channelId: number;
    sessionId: string;
    verifiedAt: any;
    transactionCount: number;
    allConfirmed: boolean;
    flaggedTransactionIds?: Array<string> | null;
    notes?: string | null;
    verifiedByUserId: number;
  }>;
};

export type RecordCashCountMutationVariables = Exact<{
  input: RecordCashCountInput;
}>;

export type RecordCashCountMutation = {
  __typename?: 'Mutation';
  recordCashCount: {
    __typename?: 'CashCountResult';
    hasVariance: boolean;
    varianceHidden: boolean;
    count: {
      __typename?: 'CashDrawerCount';
      id: string;
      sessionId: string;
      countType: string;
      takenAt: any;
      declaredCash: string;
      varianceReason?: string | null;
      countedByUserId: number;
    };
  };
};

export type ExplainVarianceMutationVariables = Exact<{
  countId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
}>;

export type ExplainVarianceMutation = {
  __typename?: 'Mutation';
  explainVariance: { __typename?: 'CashDrawerCount'; id: string; varianceReason?: string | null };
};

export type ReviewCashCountMutationVariables = Exact<{
  countId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
}>;

export type ReviewCashCountMutation = {
  __typename?: 'Mutation';
  reviewCashCount: {
    __typename?: 'CashDrawerCount';
    id: string;
    declaredCash: string;
    expectedCash?: string | null;
    variance?: string | null;
    varianceReason?: string | null;
    reviewedByUserId?: number | null;
    reviewedAt?: any | null;
    reviewNotes?: string | null;
  };
};

export type VerifyMpesaTransactionsMutationVariables = Exact<{
  input: VerifyMpesaInput;
}>;

export type VerifyMpesaTransactionsMutation = {
  __typename?: 'Mutation';
  verifyMpesaTransactions: {
    __typename?: 'MpesaVerification';
    id: string;
    sessionId: string;
    verifiedAt: any;
    transactionCount: number;
    allConfirmed: boolean;
    flaggedTransactionIds?: Array<string> | null;
    notes?: string | null;
  };
};

export type GetApprovalRequestsQueryVariables = Exact<{
  options?: InputMaybe<ApprovalRequestListOptions>;
}>;

export type GetApprovalRequestsQuery = {
  __typename?: 'Query';
  getApprovalRequests: {
    __typename?: 'ApprovalRequestList';
    totalItems: number;
    items: Array<{
      __typename?: 'ApprovalRequest';
      id: string;
      channelId: string;
      type: string;
      status: string;
      requestedById: string;
      reviewedById?: string | null;
      reviewedAt?: any | null;
      message?: string | null;
      metadata?: any | null;
      entityType?: string | null;
      entityId?: string | null;
      createdAt: any;
      updatedAt: any;
    }>;
  };
};

export type GetApprovalRequestQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetApprovalRequestQuery = {
  __typename?: 'Query';
  getApprovalRequest?: {
    __typename?: 'ApprovalRequest';
    id: string;
    channelId: string;
    type: string;
    status: string;
    requestedById: string;
    reviewedById?: string | null;
    reviewedAt?: any | null;
    message?: string | null;
    metadata?: any | null;
    entityType?: string | null;
    entityId?: string | null;
    createdAt: any;
    updatedAt: any;
  } | null;
};

export type GetMyApprovalRequestsQueryVariables = Exact<{
  options?: InputMaybe<ApprovalRequestListOptions>;
}>;

export type GetMyApprovalRequestsQuery = {
  __typename?: 'Query';
  getMyApprovalRequests: {
    __typename?: 'ApprovalRequestList';
    totalItems: number;
    items: Array<{
      __typename?: 'ApprovalRequest';
      id: string;
      channelId: string;
      type: string;
      status: string;
      requestedById: string;
      reviewedById?: string | null;
      reviewedAt?: any | null;
      message?: string | null;
      metadata?: any | null;
      entityType?: string | null;
      entityId?: string | null;
      createdAt: any;
      updatedAt: any;
    }>;
  };
};

export type CreateApprovalRequestMutationVariables = Exact<{
  input: CreateApprovalRequestInput;
}>;

export type CreateApprovalRequestMutation = {
  __typename?: 'Mutation';
  createApprovalRequest: {
    __typename?: 'ApprovalRequest';
    id: string;
    type: string;
    status: string;
    createdAt: any;
  };
};

export type ReviewApprovalRequestMutationVariables = Exact<{
  input: ReviewApprovalRequestInput;
}>;

export type ReviewApprovalRequestMutation = {
  __typename?: 'Mutation';
  reviewApprovalRequest: {
    __typename?: 'ApprovalRequest';
    id: string;
    type: string;
    status: string;
    message?: string | null;
    reviewedAt?: any | null;
  };
};

export type UpdateProductBasicMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
  barcode?: InputMaybe<Scalars['String']['input']>;
}>;

export type UpdateProductBasicMutation = {
  __typename?: 'Mutation';
  updateProduct: {
    __typename?: 'Product';
    id: string;
    name: string;
    slug: string;
    customFields?: { __typename?: 'ProductCustomFields'; barcode?: string | null } | null;
  };
};

export type UpdateProductWithFacetsMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
  barcode?: InputMaybe<Scalars['String']['input']>;
  facetValueIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;

export type UpdateProductWithFacetsMutation = {
  __typename?: 'Mutation';
  updateProduct: {
    __typename?: 'Product';
    id: string;
    name: string;
    slug: string;
    customFields?: { __typename?: 'ProductCustomFields'; barcode?: string | null } | null;
  };
};

export const UpdateOrderLineQuantityDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateOrderLineQuantity' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderLineId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'quantity' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Float' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateOrderLineQuantity' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderLineId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderLineId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'quantity' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'quantity' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'productVariant' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'customFields' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'allowFractionalQuantity' },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ErrorResult' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateOrderLineQuantityMutation,
  UpdateOrderLineQuantityMutationVariables
>;
export const GetActiveAdministratorDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetActiveAdministrator' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'activeAdministrator' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'roles' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'profilePicture' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetActiveAdministratorQuery, GetActiveAdministratorQueryVariables>;
export const LoginDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Login' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'username' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'rememberMe' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'login' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'username' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'username' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'rememberMe' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'rememberMe' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'CurrentUser' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'channels' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'InvalidCredentialsError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'NativeAuthStrategyError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const RequestRegistrationOtpDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestRegistrationOTP' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'registrationData' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'RegistrationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'requestRegistrationOTP' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phoneNumber' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'registrationData' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'registrationData' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expiresAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RequestRegistrationOtpMutation,
  RequestRegistrationOtpMutationVariables
>;
export const VerifyRegistrationOtpDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'VerifyRegistrationOTP' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'otp' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verifyRegistrationOTP' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phoneNumber' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'otp' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'otp' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sessionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'userId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<VerifyRegistrationOtpMutation, VerifyRegistrationOtpMutationVariables>;
export const RequestLoginOtpDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestLoginOTP' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'requestLoginOTP' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phoneNumber' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expiresAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RequestLoginOtpMutation, RequestLoginOtpMutationVariables>;
export const VerifyLoginOtpDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'VerifyLoginOTP' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'otp' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verifyLoginOTP' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phoneNumber' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'otp' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'otp' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<VerifyLoginOtpMutation, VerifyLoginOtpMutationVariables>;
export const CheckAuthorizationStatusDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CheckAuthorizationStatus' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'identifier' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'checkAuthorizationStatus' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'identifier' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'identifier' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CheckAuthorizationStatusQuery, CheckAuthorizationStatusQueryVariables>;
export const CheckCompanyCodeAvailabilityDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CheckCompanyCodeAvailability' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'companyCode' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'checkCompanyCodeAvailability' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'companyCode' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'companyCode' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CheckCompanyCodeAvailabilityQuery,
  CheckCompanyCodeAvailabilityQueryVariables
>;
export const LogoutDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Logout' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'logout' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'success' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const UpdateAdministratorDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateAdministrator' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateActiveAdministratorInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateActiveAdministrator' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'profilePicture' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateAdministratorMutation, UpdateAdministratorMutationVariables>;
export const UpdateAdminProfileDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateAdminProfile' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateAdminProfileInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateAdminProfile' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateAdminProfileMutation, UpdateAdminProfileMutationVariables>;
export const GetUserChannelsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetUserChannels' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'me' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'channels' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetUserChannelsQuery, GetUserChannelsQueryVariables>;
export const GetActiveChannelDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetActiveChannel' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'activeChannel' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                { kind: 'Field', name: { kind: 'Name', value: 'defaultCurrencyCode' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'mlModelJsonAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'mlModelBinAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'mlMetadataAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'companyLogoAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'cashierFlowEnabled' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'enablePrinter' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'subscriptionStatus' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'trialEndsAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'subscriptionExpiresAt' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetActiveChannelQuery, GetActiveChannelQueryVariables>;
export const GetStockLocationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetStockLocations' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'stockLocations' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '100' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetStockLocationsQuery, GetStockLocationsQueryVariables>;
export const CheckSkuExistsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CheckSkuExists' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sku' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'productVariants' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'sku' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'eq' },
                                  value: { kind: 'Variable', name: { kind: 'Name', value: 'sku' } },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '1' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'product' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CheckSkuExistsQuery, CheckSkuExistsQueryVariables>;
export const CheckBarcodeExistsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CheckBarcodeExists' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'barcode' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'barcode' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'eq' },
                                  value: {
                                    kind: 'Variable',
                                    name: { kind: 'Name', value: 'barcode' },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '1' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'barcode' } }],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CheckBarcodeExistsQuery, CheckBarcodeExistsQueryVariables>;
export const CreateProductDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateProduct' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateProductInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enabled' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'variants' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'wholesalePrice' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'allowFractionalQuantity' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateProductMutation, CreateProductMutationVariables>;
export const CreateProductVariantsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateProductVariants' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: {
                  kind: 'NamedType',
                  name: { kind: 'Name', value: 'CreateProductVariantInput' },
                },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createProductVariants' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'product' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateProductVariantsMutation, CreateProductVariantsMutationVariables>;
export const DeleteProductVariantsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteProductVariants' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteProductVariants' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'ids' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'result' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteProductVariantsMutation, DeleteProductVariantsMutationVariables>;
export const CreateAssetsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateAssets' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateAssetInput' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createAssets' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Asset' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateAssetsMutation, CreateAssetsMutationVariables>;
export const AssignAssetsToProductDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AssignAssetsToProduct' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'assetIds' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'featuredAssetId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'id' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'assetIds' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'assetIds' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'featuredAssetId' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'featuredAssetId' } },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'assets' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AssignAssetsToProductMutation, AssignAssetsToProductMutationVariables>;
export const AssignAssetsToChannelDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AssignAssetsToChannel' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'assetIds' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignAssetsToChannel' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'assetIds' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'assetIds' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'channelId' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AssignAssetsToChannelMutation, AssignAssetsToChannelMutationVariables>;
export const DeleteAssetDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteAsset' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'DeleteAssetInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteAsset' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'result' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteAssetMutation, DeleteAssetMutationVariables>;
export const UpdateProductAssetsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateProductAssets' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'assetIds' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'featuredAssetId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'id' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'assetIds' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'assetIds' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'featuredAssetId' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'featuredAssetId' } },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'assets' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateProductAssetsMutation, UpdateProductAssetsMutationVariables>;
export const GetProductDetailDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetProductDetail' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'product' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enabled' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'barcode' } }],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'facetValues' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'facet' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'assets' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'variants' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'trackInventory' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'wholesalePrice' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'allowFractionalQuantity' },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'prices' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'stockLevels' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'stockLocation' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetProductDetailQuery, GetProductDetailQueryVariables>;
export const GetProductsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetProducts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ProductListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'enabled' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'featuredAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'facetValues' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'facet' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'variants' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'trackInventory' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'customFields' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'wholesalePrice' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'allowFractionalQuantity' },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'prices' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetProductsQuery, GetProductsQueryVariables>;
export const DeleteProductDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteProduct' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'result' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteProductMutation, DeleteProductMutationVariables>;
export const CreateProductOptionGroupDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateProductOptionGroup' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateProductOptionGroupInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createProductOptionGroup' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'options' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateProductOptionGroupMutation,
  CreateProductOptionGroupMutationVariables
>;
export const CreateProductOptionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateProductOption' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateProductOptionInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createProductOption' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'group' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateProductOptionMutation, CreateProductOptionMutationVariables>;
export const AddOptionGroupToProductDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AddOptionGroupToProduct' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'optionGroupId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'addOptionGroupToProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'productId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'optionGroupId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'optionGroupId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'optionGroups' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'options' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AddOptionGroupToProductMutation,
  AddOptionGroupToProductMutationVariables
>;
export const UpdateProductVariantDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateProductVariant' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateProductVariantInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProductVariant' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'product' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateProductVariantMutation, UpdateProductVariantMutationVariables>;
export const SearchProductsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SearchProducts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'term' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'name' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'contains' },
                                  value: {
                                    kind: 'Variable',
                                    name: { kind: 'Name', value: 'term' },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '5' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'featuredAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'facetValues' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'facet' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'variants' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'trackInventory' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'customFields' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'wholesalePrice' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'allowFractionalQuantity' },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'prices' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SearchProductsQuery, SearchProductsQueryVariables>;
export const GetProductDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetProduct' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'product' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'featuredAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'facetValues' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'facet' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'code' } }],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'variants' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'trackInventory' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'prices' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'stockLevels' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'stockLocationId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'wholesalePrice' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'allowFractionalQuantity' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetProductQuery, GetProductQueryVariables>;
export const GetVariantStockLevelDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetVariantStockLevel' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'variantId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'productVariant' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'variantId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'stockLevels' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'stockLocation' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetVariantStockLevelQuery, GetVariantStockLevelQueryVariables>;
export const SearchByBarcodeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SearchByBarcode' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'barcode' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'barcode' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'eq' },
                                  value: {
                                    kind: 'Variable',
                                    name: { kind: 'Name', value: 'barcode' },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '1' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'barcode' } }],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'featuredAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'facetValues' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'facet' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'variants' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'trackInventory' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'customFields' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'wholesalePrice' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'allowFractionalQuantity' },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SearchByBarcodeQuery, SearchByBarcodeQueryVariables>;
export const PrefetchProductsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'PrefetchProducts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'take' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'take' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'skip' },
                      value: { kind: 'IntValue', value: '0' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'featuredAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [{ kind: 'Field', name: { kind: 'Name', value: 'preview' } }],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'facetValues' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'facet' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'variants' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'priceWithTax' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockOnHand' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'customFields' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'wholesalePrice' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'allowFractionalQuantity' },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'prices' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PrefetchProductsQuery, PrefetchProductsQueryVariables>;
export const GetFacetsByCodesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetFacetsByCodes' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'codes' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'facets' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'code' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'in' },
                                  value: {
                                    kind: 'Variable',
                                    name: { kind: 'Name', value: 'codes' },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '10' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetFacetsByCodesQuery, GetFacetsByCodesQueryVariables>;
export const GetFacetValuesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetFacetValues' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'facetId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'term' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'facetValues' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'facetId' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'eq' },
                                  value: {
                                    kind: 'Variable',
                                    name: { kind: 'Name', value: 'facetId' },
                                  },
                                },
                              ],
                            },
                          },
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'name' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'contains' },
                                  value: {
                                    kind: 'Variable',
                                    name: { kind: 'Name', value: 'term' },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '20' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetFacetValuesQuery, GetFacetValuesQueryVariables>;
export const CreateFacetDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateFacet' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateFacetInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createFacet' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateFacetMutation, CreateFacetMutationVariables>;
export const CreateFacetValueDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateFacetValue' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateFacetValueInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createFacetValue' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateFacetValueMutation, CreateFacetValueMutationVariables>;
export const GetOrdersForPeriodDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetOrdersForPeriod' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'startDate' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'DateTime' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'orders' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'orderPlacedAt' },
                            value: {
                              kind: 'ObjectValue',
                              fields: [
                                {
                                  kind: 'ObjectField',
                                  name: { kind: 'Name', value: 'after' },
                                  value: {
                                    kind: 'Variable',
                                    name: { kind: 'Name', value: 'startDate' },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '100' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'orderPlacedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'payments' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetOrdersForPeriodQuery, GetOrdersForPeriodQueryVariables>;
export const GetDashboardStatsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetDashboardStats' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'startDate' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'DateTime' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'endDate' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'DateTime' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'dashboardStats' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'startDate' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'startDate' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'endDate' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'endDate' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'sales' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'today' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'week' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'month' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'accounts' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'value' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'icon' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'purchases' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'today' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'week' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'month' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'accounts' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'value' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'icon' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'expenses' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'today' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'week' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'month' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'accounts' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'value' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'icon' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetDashboardStatsQuery, GetDashboardStatsQueryVariables>;
export const GetProductStatsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetProductStats' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '1' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'totalItems' } }],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'productVariants' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '1' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'totalItems' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetProductStatsQuery, GetProductStatsQueryVariables>;
export const GetRecentOrdersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetRecentOrders' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'orders' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '10' },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'sort' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'createdAt' },
                            value: { kind: 'EnumValue', value: 'DESC' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customer' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'productVariant' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'product' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                        { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetRecentOrdersQuery, GetRecentOrdersQueryVariables>;
export const CreateDraftOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateDraftOrder' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createDraftOrder' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateDraftOrderMutation, CreateDraftOrderMutationVariables>;
export const CreateOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateOrderInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customer' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePrice' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'productVariant' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'payments' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateOrderMutation, CreateOrderMutationVariables>;
export const AddItemToDraftOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AddItemToDraftOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'AddItemToDraftOrderInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'addItemToDraftOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'linePrice' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'productVariant' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddItemToDraftOrderMutation, AddItemToDraftOrderMutationVariables>;
export const AddManualPaymentToOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AddManualPaymentToOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ManualPaymentInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'addManualPaymentToOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'payments' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'ManualPaymentStateError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AddManualPaymentToOrderMutation,
  AddManualPaymentToOrderMutationVariables
>;
export const SetCustomerForDraftOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetCustomerForDraftOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setCustomerForDraftOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'customerId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customer' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'EmailAddressConflictError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetCustomerForDraftOrderMutation,
  SetCustomerForDraftOrderMutationVariables
>;
export const SetDraftOrderShippingMethodDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetDraftOrderShippingMethod' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'shippingMethodId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setDraftOrderShippingMethod' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'shippingMethodId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'shippingMethodId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'shippingLines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'shippingMethod' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'OrderModificationError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetDraftOrderShippingMethodMutation,
  SetDraftOrderShippingMethodMutationVariables
>;
export const SetDraftOrderBillingAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetDraftOrderBillingAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateAddressInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setDraftOrderBillingAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'billingAddress' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'country' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetDraftOrderBillingAddressMutation,
  SetDraftOrderBillingAddressMutationVariables
>;
export const SetDraftOrderShippingAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetDraftOrderShippingAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateAddressInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setDraftOrderShippingAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingAddress' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'country' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetDraftOrderShippingAddressMutation,
  SetDraftOrderShippingAddressMutationVariables
>;
export const TransitionOrderToStateDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'TransitionOrderToState' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'state' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'transitionOrderToState' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'state' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'state' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Order' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'linePrice' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'productVariant' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'OrderStateTransitionError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'transitionError' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  TransitionOrderToStateMutation,
  TransitionOrderToStateMutationVariables
>;
export const AddFulfillmentToOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AddFulfillmentToOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'FulfillOrderInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'addFulfillmentToOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Fulfillment' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'nextStates' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'orderLineId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'trackingCode' } },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'CreateFulfillmentError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'fulfillmentHandlerError' } },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'FulfillmentStateTransitionError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'transitionError' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddFulfillmentToOrderMutation, AddFulfillmentToOrderMutationVariables>;
export const GetPaymentMethodsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetPaymentMethods' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'paymentMethods' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'take' },
                      value: { kind: 'IntValue', value: '100' },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'enabled' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'imageAsset' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                                ],
                              },
                            },
                            { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetPaymentMethodsQuery, GetPaymentMethodsQueryVariables>;
export const GetOrderDetailsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetOrderDetails' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'order' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'productVariant' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetOrderDetailsQuery, GetOrderDetailsQueryVariables>;
export const GetOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'order' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePrice' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'productVariant' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetOrderQuery, GetOrderQueryVariables>;
export const GetOrdersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetOrders' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'OrderListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'orders' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'orderPlacedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customer' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'linePrice' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'productVariant' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'payments' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetOrdersQuery, GetOrdersQueryVariables>;
export const GetPaymentsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetPayments' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'OrderListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'orders' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'orderPlacedAt' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'payments' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'errorMessage' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customer' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetPaymentsQuery, GetPaymentsQueryVariables>;
export const GetPaymentFullDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetPaymentFull' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'order' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'orderPlacedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customer' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'payments' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'transactionId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'errorMessage' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'nextStates' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'refunds' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'reason' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetPaymentFullQuery, GetPaymentFullQueryVariables>;
export const GetOrderFullDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetOrderFull' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'order' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'orderPlacedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currencyCode' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customer' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePrice' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'productVariant' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'product' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'payments' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fulfillments' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'trackingCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'billingAddress' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'country' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'shippingAddress' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'province' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'country' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetOrderFullQuery, GetOrderFullQueryVariables>;
export const GetMlTrainingInfoDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetMlTrainingInfo' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'mlTrainingInfo' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'progress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'error' } },
                { kind: 'Field', name: { kind: 'Name', value: 'productCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'imageCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hasActiveModel' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastTrainedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetMlTrainingInfoQuery, GetMlTrainingInfoQueryVariables>;
export const GetMlTrainingManifestDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetMlTrainingManifest' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'mlTrainingManifest' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'version' } },
                { kind: 'Field', name: { kind: 'Name', value: 'extractedAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'products' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'productId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'productName' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'images' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'assetId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'filename' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetMlTrainingManifestQuery, GetMlTrainingManifestQueryVariables>;
export const ExtractPhotosForTrainingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ExtractPhotosForTraining' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'extractPhotosForTraining' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ExtractPhotosForTrainingMutation,
  ExtractPhotosForTrainingMutationVariables
>;
export const UpdateTrainingStatusDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateTrainingStatus' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'progress' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'error' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateTrainingStatus' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'progress' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'progress' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'error' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'error' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateTrainingStatusMutation, UpdateTrainingStatusMutationVariables>;
export const StartTrainingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'StartTraining' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'startTraining' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StartTrainingMutation, StartTrainingMutationVariables>;
export const CompleteTrainingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CompleteTraining' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'modelJson' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Upload' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'weightsFile' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Upload' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'metadata' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Upload' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'completeTraining' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'modelJson' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'modelJson' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'weightsFile' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'weightsFile' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'metadata' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'metadata' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CompleteTrainingMutation, CompleteTrainingMutationVariables>;
export const GetCustomersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetCustomers' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'CustomerListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customers' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'addresses' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'country' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                            { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'user' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'verified' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetCustomersQuery, GetCustomersQueryVariables>;
export const GetCountriesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetCountries' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'CountryListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'countries' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'enabled' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetCountriesQuery, GetCountriesQueryVariables>;
export const GetCustomerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetCustomer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'addresses' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'country' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'verified' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetCustomerQuery, GetCustomerQueryVariables>;
export const CreateCustomerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateCustomer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateCustomerInput' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'isWalkIn' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createCustomerSafe' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'isWalkIn' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'isWalkIn' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateCustomerMutation, CreateCustomerMutationVariables>;
export const UpdateCustomerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateCustomer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateCustomerInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateCustomer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Customer' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'EmailAddressConflictError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateCustomerMutation, UpdateCustomerMutationVariables>;
export const DeleteCustomerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteCustomer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteCustomer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'result' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteCustomerMutation, DeleteCustomerMutationVariables>;
export const CreateCustomerAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateCustomerAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateAddressInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createCustomerAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'customerId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'country' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateCustomerAddressMutation, CreateCustomerAddressMutationVariables>;
export const UpdateCustomerAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateCustomerAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateAddressInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateCustomerAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'country' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateCustomerAddressMutation, UpdateCustomerAddressMutationVariables>;
export const DeleteCustomerAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteCustomerAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteCustomerAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'success' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteCustomerAddressMutation, DeleteCustomerAddressMutationVariables>;
export const GetCreditSummaryDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetCreditSummary' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'creditSummary' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'customerId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'customerId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditFrozen' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetCreditSummaryQuery, GetCreditSummaryQueryVariables>;
export const ValidateCreditDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ValidateCredit' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ValidateCreditInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'validateCredit' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'isValid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'error' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'estimatedOrderTotal' } },
                { kind: 'Field', name: { kind: 'Name', value: 'wouldExceedLimit' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ValidateCreditQuery, ValidateCreditQueryVariables>;
export const ApproveCustomerCreditDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ApproveCustomerCredit' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'ApproveCustomerCreditInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'approveCustomerCredit' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'customerId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApproveCustomerCreditMutation, ApproveCustomerCreditMutationVariables>;
export const UpdateCustomerCreditLimitDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateCustomerCreditLimit' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateCustomerCreditLimitInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateCustomerCreditLimit' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'customerId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateCustomerCreditLimitMutation,
  UpdateCustomerCreditLimitMutationVariables
>;
export const UpdateCreditDurationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateCreditDuration' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateCreditDurationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateCreditDuration' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'customerId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateCreditDurationMutation, UpdateCreditDurationMutationVariables>;
export const GetUnpaidOrdersForCustomerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetUnpaidOrdersForCustomer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'unpaidOrdersForCustomer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'customerId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'customerId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'total' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalWithTax' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'payments' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amount' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'method' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetUnpaidOrdersForCustomerQuery,
  GetUnpaidOrdersForCustomerQueryVariables
>;
export const AllocateBulkPaymentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AllocateBulkPayment' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'PaymentAllocationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'allocateBulkPayment' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'ordersPaid' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'orderId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'orderCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amountPaid' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'remainingBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalAllocated' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AllocateBulkPaymentMutation, AllocateBulkPaymentMutationVariables>;
export const PaySingleOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'PaySingleOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'PaySingleOrderInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'paySingleOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'ordersPaid' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'orderId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'orderCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amountPaid' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'remainingBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalAllocated' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PaySingleOrderMutation, PaySingleOrderMutationVariables>;
export const PaySinglePurchaseDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'PaySinglePurchase' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'PaySinglePurchaseInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'paySinglePurchase' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'purchasesPaid' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'purchaseId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'purchaseReference' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amountPaid' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'remainingBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalAllocated' } },
                { kind: 'Field', name: { kind: 'Name', value: 'excessPayment' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PaySinglePurchaseMutation, PaySinglePurchaseMutationVariables>;
export const GetSupplierCreditSummaryDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSupplierCreditSummary' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'supplierId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'supplierCreditSummary' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'supplierId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'supplierId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'supplierId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isSupplierCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSupplierCreditSummaryQuery, GetSupplierCreditSummaryQueryVariables>;
export const ApproveSupplierCreditDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ApproveSupplierCredit' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'ApproveSupplierCreditInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'approveSupplierCredit' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'supplierId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isSupplierCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApproveSupplierCreditMutation, ApproveSupplierCreditMutationVariables>;
export const UpdateSupplierCreditLimitDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateSupplierCreditLimit' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateSupplierCreditLimitInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateSupplierCreditLimit' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'supplierId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isSupplierCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateSupplierCreditLimitMutation,
  UpdateSupplierCreditLimitMutationVariables
>;
export const UpdateSupplierCreditDurationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateSupplierCreditDuration' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateSupplierCreditDurationInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateSupplierCreditDuration' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'supplierId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isSupplierCreditApproved' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outstandingAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'availableCredit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditDuration' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateSupplierCreditDurationMutation,
  UpdateSupplierCreditDurationMutationVariables
>;
export const AllocateBulkSupplierPaymentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AllocateBulkSupplierPayment' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'SupplierPaymentAllocationInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'allocateBulkSupplierPayment' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'purchasesPaid' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'purchaseId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'purchaseReference' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'amountPaid' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'remainingBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalAllocated' } },
                { kind: 'Field', name: { kind: 'Name', value: 'excessPayment' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AllocateBulkSupplierPaymentMutation,
  AllocateBulkSupplierPaymentMutationVariables
>;
export const SetOrderLineCustomPriceDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetOrderLineCustomPrice' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'SetOrderLineCustomPriceInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setOrderLineCustomPrice' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'OrderLine' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePrice' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'linePriceWithTax' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'customLinePrice' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'priceOverrideReason' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'productVariant' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'price' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Error' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetOrderLineCustomPriceMutation,
  SetOrderLineCustomPriceMutationVariables
>;
export const GetSuppliersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSuppliers' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'CustomerListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customers' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'supplierOutstandingAmount' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'isSupplierCreditApproved' },
                            },
                            { kind: 'Field', name: { kind: 'Name', value: 'supplierCreditLimit' } },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'addresses' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'country' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                            { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSuppliersQuery, GetSuppliersQueryVariables>;
export const GetSupplierDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSupplier' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'customer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentDate' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastRepaymentAmount' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'addresses' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'fullName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine1' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'streetLine2' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'postalCode' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'country' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSupplierQuery, GetSupplierQueryVariables>;
export const CreateSupplierDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateSupplier' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateCustomerInput' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'isWalkIn' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createCustomerSafe' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'isWalkIn' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'isWalkIn' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateSupplierMutation, CreateSupplierMutationVariables>;
export const UpdateSupplierDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateSupplier' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateCustomerInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateCustomer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'Customer' } },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'phoneNumber' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'customFields' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'isSupplier' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'supplierType' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'contactPerson' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'taxId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'paymentTerms' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'isCreditApproved' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'creditLimit' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'creditDuration' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'EmailAddressConflictError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'errorCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateSupplierMutation, UpdateSupplierMutationVariables>;
export const DeleteSupplierDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteSupplier' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteCustomer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'result' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteSupplierMutation, DeleteSupplierMutationVariables>;
export const UpdateChannelLogoDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateChannelLogo' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'logoAssetId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateChannelLogo' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'logoAssetId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'logoAssetId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'cashierFlowEnabled' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enablePrinter' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'companyLogoAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateChannelLogoMutation, UpdateChannelLogoMutationVariables>;
export const UpdateCashierSettingsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateCashierSettings' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'cashierFlowEnabled' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateCashierSettings' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'cashierFlowEnabled' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'cashierFlowEnabled' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'cashierFlowEnabled' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enablePrinter' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'companyLogoAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateCashierSettingsMutation, UpdateCashierSettingsMutationVariables>;
export const UpdatePrinterSettingsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdatePrinterSettings' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'enablePrinter' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updatePrinterSettings' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'enablePrinter' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'enablePrinter' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'cashierFlowEnabled' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enablePrinter' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'companyLogoAsset' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdatePrinterSettingsMutation, UpdatePrinterSettingsMutationVariables>;
export const InviteChannelAdministratorDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'InviteChannelAdministrator' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'InviteAdministratorInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'inviteChannelAdministrator' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'roles' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  InviteChannelAdministratorMutation,
  InviteChannelAdministratorMutationVariables
>;
export const GetRoleTemplatesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetRoleTemplates' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'roleTemplates' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetRoleTemplatesQuery, GetRoleTemplatesQueryVariables>;
export const CreateChannelAdminDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateChannelAdmin' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateChannelAdminInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createChannelAdmin' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'roles' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateChannelAdminMutation, CreateChannelAdminMutationVariables>;
export const UpdateChannelAdminDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateChannelAdmin' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'permissions' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateChannelAdmin' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'permissions' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'permissions' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'roles' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateChannelAdminMutation, UpdateChannelAdminMutationVariables>;
export const DisableChannelAdminDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DisableChannelAdmin' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'disableChannelAdmin' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DisableChannelAdminMutation, DisableChannelAdminMutationVariables>;
export const GetAdministratorsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetAdministrators' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'AdministratorListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'administrators' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'user' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'verified' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'roles' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'channels' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetAdministratorsQuery, GetAdministratorsQueryVariables>;
export const GetAdministratorByIdDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetAdministratorById' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'administrator' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'verified' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastLogin' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'roles' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'channels' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetAdministratorByIdQuery, GetAdministratorByIdQueryVariables>;
export const GetAdministratorByUserIdDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetAdministratorByUserId' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'userId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'administratorByUserId' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'userId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'userId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'identifier' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'verified' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lastLogin' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'roles' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'permissions' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'channels' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetAdministratorByUserIdQuery, GetAdministratorByUserIdQueryVariables>;
export const CreateChannelPaymentMethodDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateChannelPaymentMethod' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreatePaymentMethodInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createChannelPaymentMethod' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateChannelPaymentMethodMutation,
  CreateChannelPaymentMethodMutationVariables
>;
export const UpdateChannelPaymentMethodDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateChannelPaymentMethod' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdatePaymentMethodInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateChannelPaymentMethod' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'imageAsset' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'preview' } },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateChannelPaymentMethodMutation,
  UpdateChannelPaymentMethodMutationVariables
>;
export const GetAuditLogsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetAuditLogs' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'AuditLogOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'auditLogs' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'timestamp' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'eventType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'entityType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'entityId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'userId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'data' } },
                { kind: 'Field', name: { kind: 'Name', value: 'source' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetAuditLogsQuery, GetAuditLogsQueryVariables>;
export const GetUserNotificationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetUserNotifications' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'NotificationListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'getUserNotifications' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'userId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'data' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'read' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetUserNotificationsQuery, GetUserNotificationsQueryVariables>;
export const GetUnreadCountDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetUnreadCount' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'getUnreadCount' } }],
      },
    },
  ],
} as unknown as DocumentNode<GetUnreadCountQuery, GetUnreadCountQueryVariables>;
export const MarkNotificationAsReadDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'MarkNotificationAsRead' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'markNotificationAsRead' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  MarkNotificationAsReadMutation,
  MarkNotificationAsReadMutationVariables
>;
export const MarkAllAsReadDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'MarkAllAsRead' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'markAllAsRead' } }],
      },
    },
  ],
} as unknown as DocumentNode<MarkAllAsReadMutation, MarkAllAsReadMutationVariables>;
export const SubscribeToPushDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SubscribeToPush' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'subscription' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'PushSubscriptionInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'subscribeToPush' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'subscription' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'subscription' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SubscribeToPushMutation, SubscribeToPushMutationVariables>;
export const UnsubscribeToPushDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UnsubscribeToPush' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'unsubscribeToPush' } }],
      },
    },
  ],
} as unknown as DocumentNode<UnsubscribeToPushMutation, UnsubscribeToPushMutationVariables>;
export const GetSubscriptionTiersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSubscriptionTiers' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'getSubscriptionTiers' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceMonthly' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceYearly' } },
                { kind: 'Field', name: { kind: 'Name', value: 'features' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSubscriptionTiersQuery, GetSubscriptionTiersQueryVariables>;
export const GetChannelSubscriptionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetChannelSubscription' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'getChannelSubscription' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'tier' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'priceMonthly' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'priceYearly' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'features' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'trialEndsAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'subscriptionStartedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'subscriptionExpiresAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'billingCycle' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastPaymentDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastPaymentAmount' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetChannelSubscriptionQuery, GetChannelSubscriptionQueryVariables>;
export const CheckSubscriptionStatusDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CheckSubscriptionStatus' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'checkSubscriptionStatus' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'isValid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'daysRemaining' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expiresAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'trialEndsAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'canPerformAction' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CheckSubscriptionStatusQuery, CheckSubscriptionStatusQueryVariables>;
export const InitiateSubscriptionPurchaseDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'InitiateSubscriptionPurchase' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'tierId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'billingCycle' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'paymentMethod' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'initiateSubscriptionPurchase' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'tierId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'tierId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'billingCycle' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'billingCycle' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phoneNumber' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phoneNumber' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'paymentMethod' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'paymentMethod' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reference' } },
                { kind: 'Field', name: { kind: 'Name', value: 'authorizationUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  InitiateSubscriptionPurchaseMutation,
  InitiateSubscriptionPurchaseMutationVariables
>;
export const VerifySubscriptionPaymentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'VerifySubscriptionPayment' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'reference' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verifySubscriptionPayment' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'reference' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'reference' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  VerifySubscriptionPaymentMutation,
  VerifySubscriptionPaymentMutationVariables
>;
export const CancelSubscriptionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CancelSubscription' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'cancelSubscription' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CancelSubscriptionMutation, CancelSubscriptionMutationVariables>;
export const RecordPurchaseDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RecordPurchase' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'RecordPurchaseInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'recordPurchase' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'supplierId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'purchaseDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'referenceNumber' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalCost' } },
                { kind: 'Field', name: { kind: 'Name', value: 'paymentStatus' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'variantId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'unitCost' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalCost' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'stockLocationId' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RecordPurchaseMutation, RecordPurchaseMutationVariables>;
export const GetPurchasesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetPurchases' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'PurchaseListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'purchases' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'supplierId' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'supplier' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'firstName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'lastName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'emailAddress' } },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'purchaseDate' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'referenceNumber' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalCost' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'paymentStatus' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isCreditPurchase' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'variantId' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'variant' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'product' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                        { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'unitCost' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'totalCost' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockLocationId' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'stockLocation' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetPurchasesQuery, GetPurchasesQueryVariables>;
export const RecordStockAdjustmentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RecordStockAdjustment' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'RecordStockAdjustmentInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'recordStockAdjustment' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reason' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'adjustedByUserId' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'variantId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantityChange' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'previousStock' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'newStock' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'stockLocationId' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RecordStockAdjustmentMutation, RecordStockAdjustmentMutationVariables>;
export const GetStockAdjustmentsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetStockAdjustments' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'StockAdjustmentListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'stockAdjustments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reason' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'adjustedByUserId' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'variantId' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'quantityChange' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'previousStock' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'newStock' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'stockLocationId' } },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'variant' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'sku' } },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'product' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'stockLocation' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                                  { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetStockAdjustmentsQuery, GetStockAdjustmentsQueryVariables>;
export const GetLedgerAccountsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetLedgerAccounts' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ledgerAccounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'balance' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'parentAccountId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isParent' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetLedgerAccountsQuery, GetLedgerAccountsQueryVariables>;
export const GetEligibleDebitAccountsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetEligibleDebitAccounts' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'eligibleDebitAccounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'balance' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'parentAccountId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isParent' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetEligibleDebitAccountsQuery, GetEligibleDebitAccountsQueryVariables>;
export const RecordExpenseDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RecordExpense' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'RecordExpenseInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'recordExpense' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'sourceId' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RecordExpenseMutation, RecordExpenseMutationVariables>;
export const CreateInterAccountTransferDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateInterAccountTransfer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'InterAccountTransferInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createInterAccountTransfer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'entryDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sourceType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sourceId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'memo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'debit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'credit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'meta' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateInterAccountTransferMutation,
  CreateInterAccountTransferMutationVariables
>;
export const GetJournalEntriesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetJournalEntries' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'JournalEntriesOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'journalEntries' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'entryDate' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'postedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sourceType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sourceId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'memo' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'lines' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'debit' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'credit' } },
                            { kind: 'Field', name: { kind: 'Name', value: 'meta' } },
                          ],
                        },
                      },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetJournalEntriesQuery, GetJournalEntriesQueryVariables>;
export const GetJournalEntryDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetJournalEntry' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'journalEntry' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'entryDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sourceType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sourceId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'memo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'debit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'credit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'meta' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetJournalEntryQuery, GetJournalEntryQueryVariables>;
export const GetChannelReconciliationConfigDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetChannelReconciliationConfig' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'channelReconciliationConfig' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'paymentMethodId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'paymentMethodCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reconciliationType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'ledgerAccountCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isCashierControlled' } },
                { kind: 'Field', name: { kind: 'Name', value: 'requiresReconciliation' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetChannelReconciliationConfigQuery,
  GetChannelReconciliationConfigQueryVariables
>;
export const GetShiftModalPrefillDataDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetShiftModalPrefillData' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shiftModalPrefillData' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'config' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'paymentMethodId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'paymentMethodCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reconciliationType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'ledgerAccountCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'isCashierControlled' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'requiresReconciliation' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'balances' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'balanceCents' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetShiftModalPrefillDataQuery, GetShiftModalPrefillDataQueryVariables>;
export const GetCurrentCashierSessionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetCurrentCashierSession' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'currentCashierSession' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'cashierUserId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'openedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'closedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'closingDeclared' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetCurrentCashierSessionQuery, GetCurrentCashierSessionQueryVariables>;
export const GetCashierSessionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetCashierSession' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'cashierSession' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sessionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'cashierUserId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'openedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'closedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'openingFloat' } },
                { kind: 'Field', name: { kind: 'Name', value: 'closingDeclared' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'ledgerTotals' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'cashTotal' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'mpesaTotal' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalCollected' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'variance' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetCashierSessionQuery, GetCashierSessionQueryVariables>;
export const GetCashierSessionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetCashierSessions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'CashierSessionListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'cashierSessions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'cashierUserId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'openedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'closedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'closingDeclared' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetCashierSessionsQuery, GetCashierSessionsQueryVariables>;
export const OpenCashierSessionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'OpenCashierSession' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'OpenCashierSessionInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'openCashierSession' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'cashierUserId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'openedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OpenCashierSessionMutation, OpenCashierSessionMutationVariables>;
export const CloseCashierSessionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CloseCashierSession' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CloseCashierSessionInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'closeCashierSession' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'cashierUserId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'openedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'closedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'openingFloat' } },
                { kind: 'Field', name: { kind: 'Name', value: 'closingDeclared' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'ledgerTotals' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'cashTotal' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'mpesaTotal' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'totalCollected' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'variance' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CloseCashierSessionMutation, CloseCashierSessionMutationVariables>;
export const CreateCashierSessionReconciliationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateCashierSessionReconciliation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createCashierSessionReconciliation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sessionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'notes' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scope' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scopeRefId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'rangeStart' } },
                { kind: 'Field', name: { kind: 'Name', value: 'rangeEnd' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actualBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateCashierSessionReconciliationMutation,
  CreateCashierSessionReconciliationMutationVariables
>;
export const CreateReconciliationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateReconciliation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateReconciliationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createReconciliation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scope' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scopeRefId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'rangeStart' } },
                { kind: 'Field', name: { kind: 'Name', value: 'rangeEnd' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actualBalance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceAmount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateReconciliationMutation, CreateReconciliationMutationVariables>;
export const GetReconciliationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetReconciliations' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ReconciliationListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reconciliations' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'scope' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'scopeRefId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'rangeStart' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'rangeEnd' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'expectedBalance' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'actualBalance' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'varianceAmount' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetReconciliationsQuery, GetReconciliationsQueryVariables>;
export const GetReconciliationDetailsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetReconciliationDetails' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'reconciliationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reconciliationDetails' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'reconciliationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'reconciliationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accountId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'declaredAmountCents' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedBalanceCents' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceCents' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetReconciliationDetailsQuery, GetReconciliationDetailsQueryVariables>;
export const GetSessionReconciliationDetailsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSessionReconciliationDetails' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'kind' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'sessionReconciliationDetails' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sessionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'kind' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'kind' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accountId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'declaredAmountCents' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedBalanceCents' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceCents' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetSessionReconciliationDetailsQuery,
  GetSessionReconciliationDetailsQueryVariables
>;
export const GetAccountBalancesAsOfDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetAccountBalancesAsOf' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'asOfDate' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'accountBalancesAsOf' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'asOfDate' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'asOfDate' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accountId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'balanceCents' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetAccountBalancesAsOfQuery, GetAccountBalancesAsOfQueryVariables>;
export const GetLastClosedSessionClosingBalancesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetLastClosedSessionClosingBalances' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'lastClosedSessionClosingBalances' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'balanceCents' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetLastClosedSessionClosingBalancesQuery,
  GetLastClosedSessionClosingBalancesQueryVariables
>;
export const GetExpectedSessionClosingBalancesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetExpectedSessionClosingBalances' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'expectedSessionClosingBalances' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sessionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accountCode' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accountName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedBalanceCents' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetExpectedSessionClosingBalancesQuery,
  GetExpectedSessionClosingBalancesQueryVariables
>;
export const GetSessionCashCountsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSessionCashCounts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'sessionCashCounts' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sessionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'takenAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'declaredCash' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedCash' } },
                { kind: 'Field', name: { kind: 'Name', value: 'variance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceReason' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedByUserId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewNotes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countedByUserId' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSessionCashCountsQuery, GetSessionCashCountsQueryVariables>;
export const GetPendingVarianceReviewsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetPendingVarianceReviews' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'pendingVarianceReviews' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'channelId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'channelId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'takenAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'declaredCash' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedCash' } },
                { kind: 'Field', name: { kind: 'Name', value: 'variance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceReason' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedByUserId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'countedByUserId' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetPendingVarianceReviewsQuery,
  GetPendingVarianceReviewsQueryVariables
>;
export const GetSessionMpesaVerificationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSessionMpesaVerifications' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'sessionMpesaVerifications' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sessionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sessionId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'verifiedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'allConfirmed' } },
                { kind: 'Field', name: { kind: 'Name', value: 'flaggedTransactionIds' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'verifiedByUserId' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetSessionMpesaVerificationsQuery,
  GetSessionMpesaVerificationsQueryVariables
>;
export const RecordCashCountDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RecordCashCount' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'RecordCashCountInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'recordCashCount' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'count' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'countType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'takenAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'declaredCash' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'varianceReason' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'countedByUserId' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'hasVariance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceHidden' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RecordCashCountMutation, RecordCashCountMutationVariables>;
export const ExplainVarianceDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ExplainVariance' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'countId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'reason' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'explainVariance' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'countId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'countId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'reason' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'reason' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceReason' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ExplainVarianceMutation, ExplainVarianceMutationVariables>;
export const ReviewCashCountDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ReviewCashCount' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'countId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reviewCashCount' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'countId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'countId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'notes' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'declaredCash' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expectedCash' } },
                { kind: 'Field', name: { kind: 'Name', value: 'variance' } },
                { kind: 'Field', name: { kind: 'Name', value: 'varianceReason' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedByUserId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewNotes' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReviewCashCountMutation, ReviewCashCountMutationVariables>;
export const VerifyMpesaTransactionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'VerifyMpesaTransactions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'VerifyMpesaInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verifyMpesaTransactions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sessionId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'verifiedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'transactionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'allConfirmed' } },
                { kind: 'Field', name: { kind: 'Name', value: 'flaggedTransactionIds' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  VerifyMpesaTransactionsMutation,
  VerifyMpesaTransactionsMutationVariables
>;
export const GetApprovalRequestsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetApprovalRequests' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ApprovalRequestListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'getApprovalRequests' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'requestedById' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reviewedById' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reviewedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'entityType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'entityId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetApprovalRequestsQuery, GetApprovalRequestsQueryVariables>;
export const GetApprovalRequestDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetApprovalRequest' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'getApprovalRequest' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'requestedById' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedById' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                { kind: 'Field', name: { kind: 'Name', value: 'entityType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'entityId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetApprovalRequestQuery, GetApprovalRequestQueryVariables>;
export const GetMyApprovalRequestsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetMyApprovalRequests' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ApprovalRequestListOptions' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'getMyApprovalRequests' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'options' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'options' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'channelId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'requestedById' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reviewedById' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reviewedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'metadata' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'entityType' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'entityId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetMyApprovalRequestsQuery, GetMyApprovalRequestsQueryVariables>;
export const CreateApprovalRequestDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateApprovalRequest' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateApprovalRequestInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createApprovalRequest' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateApprovalRequestMutation, CreateApprovalRequestMutationVariables>;
export const ReviewApprovalRequestDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ReviewApprovalRequest' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'ReviewApprovalRequestInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reviewApprovalRequest' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'message' } },
                { kind: 'Field', name: { kind: 'Name', value: 'reviewedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReviewApprovalRequestMutation, ReviewApprovalRequestMutationVariables>;
export const UpdateProductBasicDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateProductBasic' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'barcode' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'id' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'translations' },
                      value: {
                        kind: 'ListValue',
                        values: [
                          {
                            kind: 'ObjectValue',
                            fields: [
                              {
                                kind: 'ObjectField',
                                name: { kind: 'Name', value: 'languageCode' },
                                value: { kind: 'EnumValue', value: 'en' },
                              },
                              {
                                kind: 'ObjectField',
                                name: { kind: 'Name', value: 'name' },
                                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
                              },
                              {
                                kind: 'ObjectField',
                                name: { kind: 'Name', value: 'slug' },
                                value: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
                              },
                            ],
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'customFields' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'barcode' },
                            value: { kind: 'Variable', name: { kind: 'Name', value: 'barcode' } },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'barcode' } }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateProductBasicMutation, UpdateProductBasicMutationVariables>;
export const UpdateProductWithFacetsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateProductWithFacets' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'barcode' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'facetValueIds' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'id' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'translations' },
                      value: {
                        kind: 'ListValue',
                        values: [
                          {
                            kind: 'ObjectValue',
                            fields: [
                              {
                                kind: 'ObjectField',
                                name: { kind: 'Name', value: 'languageCode' },
                                value: { kind: 'EnumValue', value: 'en' },
                              },
                              {
                                kind: 'ObjectField',
                                name: { kind: 'Name', value: 'name' },
                                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
                              },
                              {
                                kind: 'ObjectField',
                                name: { kind: 'Name', value: 'slug' },
                                value: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
                              },
                            ],
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'customFields' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'barcode' },
                            value: { kind: 'Variable', name: { kind: 'Name', value: 'barcode' } },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'facetValueIds' },
                      value: { kind: 'Variable', name: { kind: 'Name', value: 'facetValueIds' } },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'customFields' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [{ kind: 'Field', name: { kind: 'Name', value: 'barcode' } }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateProductWithFacetsMutation,
  UpdateProductWithFacetsMutationVariables
>;
